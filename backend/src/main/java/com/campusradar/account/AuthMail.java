package com.campusradar.account;

import com.campusradar.common.ApiProblem;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;

/** Auth links are encrypted at rest. Outbox only contains an opaque delivery id. */
@Component
@EnableScheduling
public class AuthMail {
    private final JdbcTemplate db; private final JavaMailSender sender; private final TransactionTemplate tx;
    private final String key; private final String publicUrl; private final String from;
    public AuthMail(JdbcTemplate db,JavaMailSender sender,PlatformTransactionManager transactionManager,
            @Value("${campus.mail-key:}") String key,@Value("${campus.public-url:http://127.0.0.1:5173}") String publicUrl,
            @Value("${campus.mail-from:no-reply@campus-radar.local}") String from) { this.db=db;this.sender=sender;this.tx=new TransactionTemplate(transactionManager);this.key=key;this.publicUrl=publicUrl;this.from=from; }
    public void ensureConfigured() { try { if(Base64.getDecoder().decode(key).length!=32)throw new IllegalArgumentException(); }catch(Exception e){throw new ApiProblem(503,"MAIL_UNAVAILABLE","邮件服务未配置，请联系管理员。");} }
    public void queue(String userId,String recipient,String purpose,String token,Instant expires) {
        if(!"RESET_PASSWORD".equals(purpose))throw new IllegalArgumentException("Unsupported authentication mail purpose");
        String id=UUID.randomUUID().toString();
        String path="/reset-password";
        String body="请重置密码："+publicUrl+path+"#token="+token+"\n链接有效期至 "+expires+"。如非本人操作，请忽略。";
        db.update("INSERT INTO mail_deliveries(id,user_id,recipient,template,encrypted_payload,dedup_key,state,expires_at) VALUES(?,?,?,?,?,?,'PENDING',?)",id,userId,recipient,purpose,encrypt(body),"auth:"+id,Timestamp.from(expires));
        db.update("INSERT INTO outbox_events(id,event_type,aggregate_id,routing_key,payload,state,available_at) VALUES(?,?,?,?,?,'PENDING',CURRENT_TIMESTAMP(3))",UUID.randomUUID().toString(),"AUTH_MAIL",id,"mail.auth","{\"deliveryId\":\""+id+"\"}");
    }
    @Scheduled(fixedDelayString="${campus.schedule.auth-mail-ms:3000}") public void dispatch() {
        // Rows are leased before SMTP. A crash after SMTP can redeliver; the same link remains idempotent.
        try {
            Map<String,Object> event=tx.execute(status->{
                var rows=db.queryForList("SELECT * FROM outbox_events WHERE event_type='AUTH_MAIL' AND (state='PENDING' OR (state='SENDING' AND lease_until<CURRENT_TIMESTAMP(3))) AND available_at<=CURRENT_TIMESTAMP(3) ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED");
                if(rows.isEmpty())return null;var row=rows.getFirst();
                db.update("UPDATE outbox_events SET state='SENDING',lease_until=?,attempt=attempt+1 WHERE id=?",Timestamp.from(Instant.now().plusSeconds(120)),row.get("id"));return row;
            });
            if(event==null)return;
            try {
                var delivery=db.queryForMap("SELECT * FROM mail_deliveries WHERE id=?",event.get("aggregate_id"));
                if(!"RESET_PASSWORD".equals(delivery.get("template"))) {
                    db.update("UPDATE mail_deliveries SET state='FAILED',encrypted_payload='',version=version+1 WHERE id=?",delivery.get("id"));
                } else if(AccountService.instant(delivery.get("expires_at")).isAfter(Instant.now())&&!"SENT".equals(delivery.get("state"))) {
                    var message=new SimpleMailMessage();message.setFrom(from);message.setTo(delivery.get("recipient").toString());message.setSubject("校招雷达 · 重置密码");message.setText(decrypt(delivery.get("encrypted_payload").toString()));
                    sender.send(message);
                    db.update("UPDATE mail_deliveries SET state='SENT',encrypted_payload='',attempt=attempt+1,version=version+1 WHERE id=?",delivery.get("id"));
                }
                db.update("UPDATE outbox_events SET state='PUBLISHED',published_at=CURRENT_TIMESTAMP(3),lease_until=NULL WHERE id=?",event.get("id"));
            } catch(Exception failure) {
                int attempts=((Number)event.get("attempt")).intValue()+1;
                db.update("UPDATE outbox_events SET state=?,available_at=?,lease_until=NULL WHERE id=?",attempts>=5?"FAILED":"PENDING",Timestamp.from(Instant.now().plusSeconds(Math.min(3600,30L*attempts*attempts))),event.get("id"));
                db.update("UPDATE mail_deliveries SET attempt=attempt+1,state=? WHERE id=?",attempts>=5?"FAILED":"PENDING",event.get("aggregate_id"));
            }
        } catch(org.springframework.dao.DataAccessException ignored) { /* Dependencies may be starting; next poll retries. */ }
    }
    private String encrypt(String clear) {ensureConfigured();try{byte[] nonce=new byte[12];new SecureRandom().nextBytes(nonce);Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,new SecretKeySpec(Base64.getDecoder().decode(key),"AES"),new GCMParameterSpec(128,nonce));return Base64.getEncoder().encodeToString(nonce)+"."+Base64.getEncoder().encodeToString(cipher.doFinal(clear.getBytes(StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);} }
    private String decrypt(String encrypted) {try{String[] parts=encrypted.split("\\.");Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,new SecretKeySpec(Base64.getDecoder().decode(key),"AES"),new GCMParameterSpec(128,Base64.getDecoder().decode(parts[0])));return new String(cipher.doFinal(Base64.getDecoder().decode(parts[1])),StandardCharsets.UTF_8);}catch(Exception e){throw new IllegalStateException(e);} }
}
