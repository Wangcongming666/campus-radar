package com.campusradar.notification;

import com.campusradar.common.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;
import javax.crypto.Cipher;
import javax.crypto.spec.*;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;

/** Encrypted subscription delivery outbox; only SMTP success marks the delivery SENT. */
@Component
public class SubscriptionMail {
    private final JdbcTemplate db;private final JavaMailSender sender;private final TransactionTemplate tx;private final JsonMapper json;private final String key,host,from,url;
    public SubscriptionMail(JdbcTemplate db,JavaMailSender sender,PlatformTransactionManager manager,JsonMapper json,@Value("${campus.mail-key:}")String key,@Value("${spring.mail.host:}")String host,@Value("${campus.mail-from:no-reply@campus-radar.local}")String from,@Value("${campus.public-url:http://127.0.0.1:5173}")String url){this.db=db;this.sender=sender;this.tx=new TransactionTemplate(manager);this.json=json;this.key=key;this.host=host;this.from=from;this.url=url;}
    public void ensureConfigured(){try{if(host.isBlank()||Base64.getDecoder().decode(key).length!=32)throw new IllegalArgumentException();}catch(Exception e){throw new ApiProblem(503,"MAIL_UNAVAILABLE","邮件服务未配置，请先使用站内通知。");}}
    public void queue(String user,String recipient,String dedup,String subject,String body,String path){ensureConfigured();if(db.queryForObject("SELECT COUNT(*) FROM mail_deliveries WHERE dedup_key=?",Integer.class,dedup)>0)return;String id=UUID.randomUUID().toString();String clear=json.writeValueAsString(Map.of("subject",subject.replace('\r',' ').replace('\n',' '),"body",body+"\n"+url+path));db.update("INSERT INTO mail_deliveries(id,user_id,recipient,template,encrypted_payload,dedup_key,state,expires_at) VALUES(?,?,?,'SUBSCRIPTION_MATCH',?,?,'PENDING',?)",id,user,recipient,encrypt(clear),dedup,Timestamp.from(Instant.now().plusSeconds(7*86400)));db.update("INSERT INTO outbox_events(id,event_type,aggregate_id,routing_key,payload,state,available_at) VALUES(?,'SUBSCRIPTION_MAIL',?,'mail.subscription',?,'PENDING',CURRENT_TIMESTAMP)",UUID.randomUUID().toString(),id,json.writeValueAsString(Map.of("deliveryId",id)));}
    @Scheduled(fixedDelayString="${campus.schedule.subscription-mail-ms:3000}") public void dispatch(){try{String lease=UUID.randomUUID().toString();var event=tx.execute(s->{var rows=db.queryForList("SELECT * FROM outbox_events WHERE event_type='SUBSCRIPTION_MAIL' AND (state='PENDING' OR (state='SENDING' AND lease_until<CURRENT_TIMESTAMP)) AND available_at<=CURRENT_TIMESTAMP ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED");if(rows.isEmpty())return null;var row=rows.getFirst();db.update("UPDATE outbox_events SET state='SENDING',lease_token=?,lease_until=?,attempt=attempt+1 WHERE id=?",lease,Timestamp.from(Instant.now().plusSeconds(120)),row.get("id"));return row;});if(event==null)return;try{var delivery=db.queryForMap("SELECT * FROM mail_deliveries WHERE id=?",event.get("aggregate_id"));if(!"SENT".equals(delivery.get("state"))){if(!instant(delivery.get("expires_at")).isAfter(Instant.now())){db.update("UPDATE mail_deliveries SET state='FAILED',encrypted_payload='',version=version+1 WHERE id=?",delivery.get("id"));db.update("UPDATE outbox_events SET state='FAILED',lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?",event.get("id"),lease);return;}var payload=json.readValue(decrypt(delivery.get("encrypted_payload").toString()),Map.class);var message=new SimpleMailMessage();message.setFrom(from);message.setTo(delivery.get("recipient").toString());message.setSubject(payload.get("subject").toString());message.setText(payload.get("body").toString());sender.send(message);db.update("UPDATE mail_deliveries SET state='SENT',encrypted_payload='',attempt=attempt+1,version=version+1 WHERE id=?",delivery.get("id"));}db.update("UPDATE outbox_events SET state='PUBLISHED',published_at=CURRENT_TIMESTAMP,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?",event.get("id"),lease);}catch(Exception e){int attempt=((Number)event.get("attempt")).intValue()+1;String state=attempt>=5?"FAILED":"PENDING";db.update("UPDATE outbox_events SET state=?,available_at=?,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?",state,Timestamp.from(Instant.now().plusSeconds(Math.min(3600,30L*attempt*attempt))),event.get("id"),lease);db.update("UPDATE mail_deliveries SET state=?,attempt=attempt+1,version=version+1 WHERE id=? AND state<>'SENT'",state,event.get("aggregate_id"));}}catch(org.springframework.dao.DataAccessException ignored){}}
    private static Instant instant(Object value){if(value instanceof Timestamp t)return t.toInstant();if(value instanceof LocalDateTime t)return t.toInstant(ZoneOffset.UTC);return Instant.parse(value.toString());}
    private String encrypt(String clear){ensureConfigured();try{byte[] nonce=new byte[12];new SecureRandom().nextBytes(nonce);Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,new SecretKeySpec(Base64.getDecoder().decode(key),"AES"),new GCMParameterSpec(128,nonce));return Base64.getEncoder().encodeToString(nonce)+"."+Base64.getEncoder().encodeToString(cipher.doFinal(clear.getBytes(StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);}}
    private String decrypt(String value){try{String[] parts=value.split("\\.");Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,new SecretKeySpec(Base64.getDecoder().decode(key),"AES"),new GCMParameterSpec(128,Base64.getDecoder().decode(parts[0])));return new String(cipher.doFinal(Base64.getDecoder().decode(parts[1])),StandardCharsets.UTF_8);}catch(Exception e){throw new IllegalStateException(e);}}
}
