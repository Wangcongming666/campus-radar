package com.campusradar.security;

import com.campusradar.account.AuthRateLimits;
import com.campusradar.common.ApiProblem;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.ResponseCookie;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.AuthorizationFilter;
import org.springframework.web.filter.OncePerRequestFilter;

@Configuration
public class AuthSecurity {
    public static final String CSRF = "campus.csrf";
    public static String issueCsrf(HttpServletRequest request, HttpServletResponse response) {
        var session = request.getSession(true);
        String token = (String) session.getAttribute(CSRF);
        if (token == null) { byte[] bytes = new byte[32]; new SecureRandom().nextBytes(bytes); token=Base64.getUrlEncoder().withoutPadding().encodeToString(bytes); session.setAttribute(CSRF,token); }
        response.addHeader("Set-Cookie", ResponseCookie.from("XSRF-TOKEN",token).httpOnly(false).secure(request.isSecure()).sameSite("Strict").path("/").build().toString());
        return token;
    }
    @Bean SecurityFilterChain apiSecurity(HttpSecurity http,
            @Value("${campus.allowed-origins:http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5179,http://localhost:5179,http://127.0.0.1:8080,http://localhost:8080}") String origins,AuthRateLimits limits,CurrentUser current,tools.jackson.databind.json.JsonMapper json) throws Exception {
        return http.csrf(c->c.disable()).cors(c->c.disable()).formLogin(c->c.disable()).httpBasic(c->c.disable())
                .logout(c->c.disable()).requestCache(c->c.disable())
                .authorizeHttpRequests(c->c.anyRequest().permitAll())
                .addFilterBefore(new WriteBoundary(Set.of(origins.split(",")),limits),AuthorizationFilter.class)
                .addFilterAfter(new RoleBoundary(current,json),WriteBoundary.class).build();
    }
    public static class WriteBoundary extends OncePerRequestFilter {
        private final Set<String> origins;
        private final AuthRateLimits limits;
        public WriteBoundary(Set<String> origins) { this(origins,null); }
        public WriteBoundary(Set<String> origins,AuthRateLimits limits) { this.origins = origins;this.limits=limits; }
        @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain) throws ServletException,IOException {
            if (request.getRequestURI().startsWith("/api/") && !Set.of("GET","HEAD","OPTIONS").contains(request.getMethod())) {
                String origin=request.getHeader("Origin");
                if (origin==null || !origins.contains(origin)) { reject(response,"ORIGIN_FORBIDDEN","请求来源未获允许。"); return; }
                var session=request.getSession(false);
                String expected=session==null?null:(String)session.getAttribute(CSRF);
                String supplied=request.getHeader("X-CSRF-TOKEN");
                if(expected==null || supplied==null || !MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8),supplied.getBytes(StandardCharsets.UTF_8))) { reject(response,"CSRF_INVALID","安全令牌已过期，请刷新后重试。"); return; }
            }
            if(limits!=null&&request.getRequestURI().startsWith("/api/")&&!request.getMethod().equals("OPTIONS")){
                try{
                    var session=request.getSession(false);Object user=session==null?null:session.getAttribute(CurrentUser.USER_ID);
                    if(user instanceof String id){if(!Set.of("GET","HEAD").contains(request.getMethod()))limits.authenticatedWrite(id);}
                    else if(Set.of("GET","HEAD").contains(request.getMethod()))limits.anonymousRead(request);
                }catch(ApiProblem failure){if(failure instanceof AuthRateLimits.Exceeded exceeded)response.setHeader("Retry-After",Integer.toString(exceeded.retryAfter()));reject(response,failure.status(),failure.code(),failure.getMessage());return;}
                catch(org.springframework.dao.DataAccessException failure){reject(response,503,"DEPENDENCY_UNAVAILABLE","限流服务暂时不可用，请稍后重试。");return;}
            }
            chain.doFilter(request,response);
        }
        private void reject(HttpServletResponse response,String code,String message) throws IOException {
            reject(response,403,code,message);
        }
        private void reject(HttpServletResponse response,int status,String code,String message) throws IOException {
            String requestId=UUID.randomUUID().toString();
            response.setStatus(status); response.setContentType("application/json;charset=UTF-8"); response.setHeader("Cache-Control","no-store"); response.setHeader("X-Request-Id",requestId);
            response.getWriter().write("{\"error\":{\"code\":\""+code+"\",\"message\":\""+message+"\",\"requestId\":\""+requestId+"\"}}");
        }
    }
}
