package com.campusradar.account;

import com.campusradar.common.ApiProblem;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Locale;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Component;

/** Counters and expiry are one Redis operation; keys contain only email digests. */
@Component
public class AuthRateLimits {
    private static final DefaultRedisScript<Long> INCREMENT=new DefaultRedisScript<>("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[2]) end; if n>tonumber(ARGV[1]) then return -math.max(1,redis.call('TTL',KEYS[1])) end; return n",Long.class);
    private static final DefaultRedisScript<Long> CHECK=new DefaultRedisScript<>("local n=tonumber(redis.call('GET',KEYS[1]) or '0'); if n>=tonumber(ARGV[1]) then return -math.max(1,redis.call('TTL',KEYS[1])) end; return 0",Long.class);
    private final StringRedisTemplate redis;private final int multiplier;private final String namespace;
    public AuthRateLimits(StringRedisTemplate redis,int multiplier){this(redis,multiplier,"campus:session");}
    @org.springframework.beans.factory.annotation.Autowired
    public AuthRateLimits(StringRedisTemplate redis,@Value("${campus.rate-limit-multiplier:1}") int multiplier,@Value("${spring.session.redis.namespace:campus:session}")String namespace){if(multiplier<1||multiplier>100)throw new IllegalArgumentException("campus.rate-limit-multiplier must be 1..100");this.redis=redis;this.multiplier=multiplier;this.namespace=namespace;}
    public static class Exceeded extends ApiProblem {
        private final int retryAfter;
        public Exceeded(int retryAfter){super(429,"RATE_LIMITED","操作频繁，请稍后重试。");this.retryAfter=retryAfter;}
        public int retryAfter(){return retryAfter;}
    }
    private void counter(String key,int max,int seconds){evaluate(INCREMENT,key,max,seconds);}
    private void evaluate(DefaultRedisScript<Long> script,String key,int max,int seconds){Long result=redis.execute(script,List.of(namespace+":rate:v2:"+key),Integer.toString(max*multiplier),Integer.toString(seconds));if(result==null)throw new ApiProblem(503,"DEPENDENCY_UNAVAILABLE","限流服务暂时不可用，请稍后重试。");if(result<0)throw new Exceeded((int)Math.min(Integer.MAX_VALUE,-result));}
    private static String address(HttpServletRequest request){return request.getRemoteAddr();}
    private static String digest(String email){return AccountService.hash(email.trim().toLowerCase(Locale.ROOT));}
    private static String loginKey(HttpServletRequest request,String email){return "login-failed:"+address(request)+":"+digest(email);}
    public void anonymousRead(HttpServletRequest request){counter("read:"+address(request),60,60);}
    public void authenticatedWrite(String user){counter("write:"+user,60,60);}
    public void upload(String user){counter("upload:"+user,20,3600);}
    public void operation(HttpServletRequest request,String operation,int max){counter(operation+":"+address(request),max,60);}
    public void forgot(HttpServletRequest request,String email){operation(request,"mail",10);counter("forgot:"+digest(email),5,3600);}
    public void beforeLogin(HttpServletRequest request,String email){evaluate(CHECK,loginKey(request,email),5,900);}
    public void failedLogin(HttpServletRequest request,String email){counter(loginKey(request,email),5,900);}
}
