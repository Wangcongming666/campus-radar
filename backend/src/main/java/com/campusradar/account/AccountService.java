package com.campusradar.account;

import com.campusradar.common.ApiProblem;
import com.campusradar.common.ContractInputs;
import com.campusradar.security.CurrentUser;
import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.ZoneId;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

@Service
public class AccountService {
    private final JdbcTemplate db;
    private final AuthMail mail;
    private final ObjectMapper json;
    private final ContractInputs inputs;
    private final Argon2PasswordEncoder passwords = new Argon2PasswordEncoder(16,32,1,19456,2);
    private final String dummyHash;
    public AccountService(JdbcTemplate db,AuthMail mail,ObjectMapper json,ContractInputs inputs) { this.db=db; this.mail=mail; this.json=json; this.inputs=inputs; this.dummyHash=passwords.encode("dummy-password-not-used"); }
    public Map<String,Object> find(String id) { var rows=db.queryForList("SELECT * FROM users WHERE id=?",id); if(rows.isEmpty())throw new ApiProblem(401,"UNAUTHENTICATED","请重新登录。"); return rows.getFirst(); }
    public Map<String,Object> byEmail(String email) { var rows=db.queryForList("SELECT * FROM users WHERE email=?",email.trim().toLowerCase(Locale.ROOT)); return rows.isEmpty()?null:rows.getFirst(); }
    @Transactional public void register(String email,String password,String name) {
        var existing=byEmail(email); if(existing!=null) { passwords.encode(password); return; }
        String id=UUID.randomUUID().toString();
        try { db.update("INSERT INTO users(id,email,password_hash,display_name,preferences,timezone,status) VALUES(?,?,?,?,?,?,'ACTIVE')",id,email.trim().toLowerCase(Locale.ROOT),passwords.encode(password),name.trim(),"{\"roles\":[],\"cities\":[],\"recruitmentTypes\":[],\"graduationYear\":null}","Asia/Shanghai"); }
        catch(org.springframework.dao.DuplicateKeyException e) { return; }
    }
    @Transactional public void email(String email,String purpose) {
        if(!"RESET_PASSWORD".equals(purpose))throw invalidToken();
        var user=byEmail(email);
        if(user==null) return;
        if(purpose.equals("RESET_PASSWORD")&&!"ACTIVE".equals(user.get("status")))return;
        queue(user.get("id").toString(),email,purpose);
    }
    private void queue(String id,String email,String purpose) {
        mail.ensureConfigured();
        byte[] entropy=new byte[32]; new SecureRandom().nextBytes(entropy);
        String token=Base64.getUrlEncoder().withoutPadding().encodeToString(entropy);
        db.update("UPDATE auth_tokens SET consumed_at=CURRENT_TIMESTAMP(3) WHERE user_id=? AND purpose=? AND consumed_at IS NULL",id,purpose);
        Instant expires=Instant.now().plusSeconds(1800);
        db.update("INSERT INTO auth_tokens(id,user_id,purpose,token_hash,expires_at) VALUES(?,?,?,?,?)",UUID.randomUUID().toString(),id,purpose,hash(token),Timestamp.from(expires));
        mail.queue(id,email,purpose,token,expires);
    }
    @Transactional public void consume(String token,String purpose,String password) {
        if(!"RESET_PASSWORD".equals(purpose))throw invalidToken();
        var rows=db.queryForList("SELECT * FROM auth_tokens WHERE token_hash=? AND purpose=? FOR UPDATE",hash(token),purpose);
        if(rows.isEmpty())throw invalidToken(); var row=rows.getFirst();
        if(row.get("consumed_at")!=null || instant(row.get("expires_at")).isBefore(Instant.now()))throw invalidToken();
        var user=find(row.get("user_id").toString());
        if(!"ACTIVE".equals(user.get("status")))throw invalidToken();
        db.update("UPDATE users SET password_hash=?,auth_version=auth_version+1,version=version+1 WHERE id=?",passwords.encode(password),user.get("id"));
        db.update("UPDATE auth_tokens SET consumed_at=CURRENT_TIMESTAMP(3),version=version+1 WHERE user_id=? AND purpose=? AND consumed_at IS NULL",user.get("id"),purpose);
    }
    public Map<String,Object> login(String email,String password,HttpServletRequest request) {
        var user=byEmail(email);
        boolean matches=passwords.matches(password,user==null?dummyHash:user.get("password_hash").toString());
        if(user==null||!matches)throw new ApiProblem(401,"INVALID_CREDENTIALS","邮箱或密码不正确。");
        if(!"ACTIVE".equals(user.get("status")))throw new ApiProblem(403,"ACCOUNT_INACTIVE","账号当前不可用，请联系管理员处理账号状态。");
        if(request.getSession(false)!=null)request.getSession(false).invalidate();
        var session=request.getSession(true); session.setAttribute(CurrentUser.USER_ID,user.get("id").toString()); session.setAttribute(CurrentUser.AUTH_VERSION,((Number)user.get("auth_version")).intValue());
        session.setAttribute(CurrentUser.REAUTH_UNTIL,Instant.now().plusSeconds(600).toEpochMilli());
        return view(user);
    }
    public void checkPassword(String id,String password) { if(!passwords.matches(password,find(id).get("password_hash").toString()))throw new ApiProblem(401,"INVALID_CREDENTIALS","密码不正确。"); }
    @Transactional public void password(String id,String current,String replacement) { checkPassword(id,current); db.update("UPDATE users SET password_hash=?,auth_version=auth_version+1,version=version+1 WHERE id=?",passwords.encode(replacement),id); }
    public Map<String,Object> view(Map<String,Object> row) {
        var out=new LinkedHashMap<String,Object>();
        for(String key:List.of("id","version","display_name","avatar_file_id","school","education","graduation_year","theme","timezone","onboarding_step","role"))out.put(camel(key),row.get(key));
        String email=row.get("email").toString(); int at=email.indexOf('@');
        out.put("emailMasked",email.substring(0,1)+"***"+email.substring(at));
        out.put("emailVerified",row.get("email_verified_at")!=null); out.put("providerVerified",truth(row.get("provider_verified")) && row.get("provider_verified_until")!=null && instant(row.get("provider_verified_until")).isAfter(Instant.now())); out.put("buddyDiscoverable",truth(row.get("buddy_discoverable")));
        out.put("createdAt",instant(row.get("created_at")));out.put("updatedAt",instant(row.get("updated_at")));
        try { out.put("preferences",json.readValue(row.get("preferences").toString(),Map.class)); } catch(Exception e) {throw new IllegalStateException("Invalid stored preferences",e);}
        return out;
    }
    @Transactional public Map<String,Object> patch(String id,Map<String,Object> input) {
        inputs.validate("UserPatch",input);
        if(!"USER".equals(find(id).get("role"))&&!Set.of("version","displayName","school","education","graduationYear","theme","timezone").containsAll(input.keySet()))throw new ApiProblem(403,"ROLE_FORBIDDEN","管理账号仅可修改基本资料和界面设置。");
        Set<String> allowed=Set.of("version","displayName","school","education","graduationYear","preferences","theme","timezone","onboardingStep","avatarFileId","buddyDiscoverable");
        if(input.size()<2||!allowed.containsAll(input.keySet())||!(input.get("version") instanceof Number version)||version.intValue()<1)throw invalid();
        var assignments=new ArrayList<String>();var args=new ArrayList<Object>();
        for(var entry:input.entrySet()) {
            String key=entry.getKey(); Object value=entry.getValue(); if(key.equals("version"))continue;
            switch(key) {
                case "displayName" -> { if(!(value instanceof String s)||s.isBlank()||s.length()>40)throw invalid(); }
                case "school" -> {if(value!=null&&(!(value instanceof String s)||s.length()>100))throw invalid();}
                case "education" -> {if(value!=null&&!Set.of("ASSOCIATE","BACHELOR","MASTER","DOCTORATE").contains(value))throw invalid();}
                case "graduationYear" -> {if(value!=null&&(!(value instanceof Number n)||n.intValue()<2000||n.intValue()>2100))throw invalid();}
                case "theme" -> {if(!Set.of("DARK","LIGHT","SYSTEM").contains(value))throw invalid();}
                case "timezone" -> {try{if(!(value instanceof String s)||s.length()>64)throw invalid();ZoneId.of(value.toString());}catch(Exception e){throw invalid();}}
                case "onboardingStep" -> {if(!(value instanceof Number n)||n.intValue()<0||n.intValue()>4)throw invalid();}
                case "buddyDiscoverable" -> {if(!(value instanceof Boolean))throw invalid();}
                case "avatarFileId" -> {if(value!=null&&(db.queryForObject("SELECT COUNT(*) FROM files WHERE id=? AND user_id=? AND purpose='AVATAR' AND state='READY'",Integer.class,value,id)==0))throw new ApiProblem(404,"NOT_FOUND","头像文件不存在。");}
                case "preferences" -> {validatePreferences(value);value=json.writeValueAsString(value);}
                default -> throw invalid();
            }
            assignments.add(snake(key)+"=?");args.add(value);
        }
        args.add(id);args.add(((Number)input.get("version")).intValue());
        if(db.update("UPDATE users SET "+String.join(",",assignments)+",version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE id=? AND version=?",args.toArray())!=1)throw new ApiProblem(409,"VERSION_CONFLICT","资料已更新，请刷新后重试。");
        return view(find(id));
    }
    public Map<String,Object> overview(String id) {
        var result=new LinkedHashMap<String,Object>();
        result.put("applications",count("SELECT COUNT(*) FROM applications WHERE user_id=? AND archived_at IS NULL",id));
        result.put("interviews",count("SELECT COUNT(*) FROM applications WHERE user_id=? AND archived_at IS NULL AND stage IN ('INTERVIEW_1','INTERVIEW_2','HR')",id));
        result.put("offers",count("SELECT COUNT(*) FROM offers WHERE user_id=?",id));
        result.put("favorites",count("SELECT COUNT(*) FROM favorites WHERE user_id=?",id));
        result.put("unreadNotifications",count("SELECT COUNT(*) FROM notifications WHERE user_id=? AND read_at IS NULL",id));
        result.put("recentEvents",db.queryForList("SELECT * FROM application_stage_events WHERE user_id=? ORDER BY occurred_at DESC,id DESC LIMIT 20",id).stream().map(row->{
            var event=new LinkedHashMap<String,Object>();
            for(String key:List.of("id","version","application_id","from_stage","to_stage","operation_id"))event.put(camel(key),row.get(key));
            for(String key:List.of("created_at","updated_at","occurred_at"))event.put(camel(key),instant(row.get(key)));
            event.put("actorId",id);return event;
        }).toList());
        result.put("achievements",List.of());return result;
    }
    private int count(String sql,String id){return db.queryForObject(sql,Integer.class,id);}
    private void validatePreferences(Object value) {
        if(!(value instanceof Map<?,?> map)||!map.keySet().equals(Set.of("roles","cities","recruitmentTypes","graduationYear")))throw invalid();
        for(String key:List.of("roles","cities","recruitmentTypes")) {
            if(!(map.get(key) instanceof List<?> list)||list.size()>(key.equals("roles")?10:key.equals("cities")?20:2))throw invalid();
            for(Object item:list)if(!(item instanceof String s)||s.length()>(key.equals("cities")?64:32)||(key.equals("recruitmentTypes")&&!Set.of("CAMPUS","INTERNSHIP").contains(s)))throw invalid();
        }
        Object year=map.get("graduationYear");if(year!=null&&(!(year instanceof Number n)||n.intValue()<2000||n.intValue()>2100))throw invalid();
    }
    private static String camel(String s){var b=new StringBuilder();boolean upper=false;for(char c:s.toCharArray()){if(c=='_'){upper=true;continue;}b.append(upper?Character.toUpperCase(c):c);upper=false;}return b.toString();}
    private static String snake(String s){return s.replaceAll("([A-Z])","_$1").toLowerCase(Locale.ROOT);}
    private static boolean truth(Object value){return Boolean.TRUE.equals(value)||value instanceof Number n&&n.intValue()!=0;}
    public static Instant instant(Object value){if(value instanceof Timestamp t)return t.toInstant();if(value instanceof java.time.LocalDateTime t)return t.toInstant(java.time.ZoneOffset.UTC);return Instant.parse(value.toString());}
    public static String hash(String value){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);}}
    private static ApiProblem invalidToken(){return new ApiProblem(422,"TOKEN_INVALID","链接已失效，请重新申请邮件。");}
    private static ApiProblem invalid(){return new ApiProblem(422,"VALIDATION_FAILED","资料字段不符合要求。");}
}
