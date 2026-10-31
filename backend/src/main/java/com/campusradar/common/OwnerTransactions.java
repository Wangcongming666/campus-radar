package com.campusradar.common;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import java.util.function.Supplier;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Component
public class OwnerTransactions {
    private final SqlRows rows;
    private final TransactionTemplate tx;
    public OwnerTransactions(SqlRows rows,PlatformTransactionManager manager){this.rows=rows;this.tx=new TransactionTemplate(manager);}
    private Object canonical(Object v){if(v instanceof Map<?,?> m){var sorted=new TreeMap<String,Object>();m.forEach((k,x)->sorted.put(k.toString(),canonical(x)));return sorted;}if(v instanceof List<?> l)return l.stream().map(this::canonical).toList();return v;}
    public String hash(Object v){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(rows.json.writeValueAsString(canonical(v)).getBytes(StandardCharsets.UTF_8)));}catch(java.security.NoSuchAlgorithmException e){throw new IllegalStateException(e);}}
    public Object write(String user,String method,String route,String key,Object body,int status,boolean revision,Supplier<Object> action) {
        return tx.execute(state->{
            var owners=rows.db.queryForList("SELECT status,data_operation FROM users WHERE id=:u FOR UPDATE",Map.of("u",user));
            if(owners.isEmpty()||!"ACTIVE".equals(owners.getFirst().get("status")))throw new ApiProblem(401,"AUTH_REQUIRED","请重新登录。");
            var p=SqlRows.map("u",user,"method",method,"route",hash(route),"key",key,"hash",hash(body));
            if(key!=null){
                if(key.length()<16||key.length()>80)throw new ApiProblem(422,"VALIDATION_ERROR","幂等键长度须为16至80。");
                rows.db.update("DELETE FROM idempotency_records WHERE user_id=:u AND expires_at<=CURRENT_TIMESTAMP",p);
                var saved=rows.db.queryForList("SELECT request_hash,response_body FROM idempotency_records WHERE user_id=:u AND method=:method AND route_hash=:route AND idem_key=:key",p);
                if(!saved.isEmpty()){if(!p.get("hash").equals(saved.getFirst().get("request_hash")))throw new ApiProblem(409,"IDEMPOTENCY_CONFLICT","同一幂等键对应不同内容。");Object raw=saved.getFirst().get("response_body");return rows.parse(raw instanceof byte[] b?new String(b,StandardCharsets.UTF_8):raw.toString());}
            }
            if(!"IDLE".equals(owners.getFirst().get("data_operation")))throw new ApiProblem(409,"DATA_LOCKED","数据操作正在进行，请稍后重试。");
            Object result=action.get();
            if(revision)rows.db.update("UPDATE users SET data_revision=data_revision+1 WHERE id=:u",p);
            if(key!=null){p.put("id",UUID.randomUUID().toString());p.put("status",status);p.put("response",rows.json.writeValueAsString(result));p.put("expiry",Timestamp.from(Instant.now().plusSeconds(86400)));rows.db.update("INSERT INTO idempotency_records(id,user_id,method,route_hash,idem_key,request_hash,http_status,response_body,expires_at) VALUES(:id,:u,:method,:route,:key,:hash,:status,:response,:expiry)",p);}
            return result;
        });
    }
}
