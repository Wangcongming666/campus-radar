package com.campusradar.security;

import com.campusradar.common.ApiProblem;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.*;
import org.springframework.http.server.PathContainer;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.pattern.PathPattern;
import org.springframework.web.util.pattern.PathPatternParser;
import tools.jackson.databind.json.JsonMapper;

/** The checked-in contract is the role allowlist. Unregistered API operations fail closed. */
public final class RoleBoundary extends OncePerRequestFilter {
    private record Operation(String method,PathPattern path,String access) {}
    private final List<Operation> operations;
    private final CurrentUser current;
    private final JsonMapper json;
    public RoleBoundary(CurrentUser current,JsonMapper json){
        this.current=current;this.json=json;var loaded=new ArrayList<Operation>();
        try(var input=getClass().getResourceAsStream("/contracts/openapi.json")){
            if(input==null)throw new IllegalStateException("OpenAPI resource missing");
            var document=json.readTree(input);
            for(var path:document.path("paths").properties())for(var entry:path.getValue().properties()){
                String method=entry.getKey().toUpperCase(Locale.ROOT);
                if(Set.of("GET","POST","PUT","PATCH","DELETE","HEAD").contains(method))loaded.add(new Operation(method,PathPatternParser.defaultInstance.parse(path.getKey()),entry.getValue().path("x-access").asText("DENY")));
            }
        }catch(IOException exception){throw new IllegalStateException("Role policy unreadable",exception);}
        operations=List.copyOf(loaded);
    }
    @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain) throws ServletException,IOException {
        String uri=request.getRequestURI();
        if(!uri.startsWith("/api/")||request.getMethod().equals("OPTIONS")){chain.doFilter(request,response);return;}
        try{
            String method=request.getMethod().equals("HEAD")?"GET":request.getMethod();
            var path=PathContainer.parsePath(uri);
            var matches=operations.stream().filter(op->op.method().equals(method)&&op.path().matches(path)).sorted((a,b)->PathPattern.SPECIFICITY_COMPARATOR.compare(a.path(),b.path())).toList();
            String access=matches.isEmpty()?"DENY":matches.getFirst().access();
            if(!access.equals("PUBLIC")){
                String role=current.role(request);
                boolean allowed=switch(access){
                    case "ACCOUNT"->Set.of("USER","ADMIN","REVIEWER").contains(role);
                    case "USER"->role.equals("USER");
                    case "ADMIN"->role.equals("ADMIN");
                    case "REVIEWER"->Set.of("ADMIN","REVIEWER").contains(role);
                    default->false;
                };
                if(!allowed)throw new ApiProblem(403,"ROLE_FORBIDDEN","当前账号角色不能使用此功能。");
            }
        }catch(ApiProblem failure){reject(response,failure.status(),failure.code(),failure.getMessage());return;}
        catch(org.springframework.dao.DataAccessException failure){reject(response,503,"DEPENDENCY_UNAVAILABLE","账号权限服务暂时不可用，请稍后重试。");return;}
        chain.doFilter(request,response);
    }
    private void reject(HttpServletResponse response,int status,String code,String message) throws IOException {
        String requestId=UUID.randomUUID().toString();response.setStatus(status);response.setContentType("application/json;charset=UTF-8");response.setHeader("Cache-Control","no-store");response.setHeader("X-Request-Id",requestId);
        response.getWriter().write(json.writeValueAsString(Map.of("error",Map.of("code",code,"message",message,"requestId",requestId))));
    }
}
