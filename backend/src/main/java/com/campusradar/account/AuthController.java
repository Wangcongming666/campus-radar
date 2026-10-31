package com.campusradar.account;

import com.campusradar.common.ApiSupport;
import com.campusradar.common.ApiProblem;
import com.campusradar.security.AuthSecurity;
import com.campusradar.security.CurrentUser;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.time.Instant;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class AuthController {
    private final AccountService accounts;private final CurrentUser users;private final AuthRateLimits limits;
    public AuthController(AccountService accounts,CurrentUser users,AuthRateLimits limits){this.accounts=accounts;this.users=users;this.limits=limits;}
    public record Register(@NotBlank @Email @Size(max=254) String email,@NotBlank @Size(min=12,max=128) String password,@NotBlank @Size(max=40) String displayName){}
    public record EmailInput(@NotBlank @Email @Size(max=254) String email){}
    public record TokenInput(@NotBlank @Size(min=32,max=128) String token){}
    public record ResetInput(@NotBlank @Size(min=32,max=128) String token,@NotBlank @Size(min=12,max=128) String newPassword){}
    public record Login(@NotBlank @Email @Size(max=254) String email,@NotBlank @Size(max=128) String password){}
    public record Reauth(@NotBlank @Size(max=128) String password){}
    public record Password(@NotBlank @Size(max=128) String currentPassword,@NotBlank @Size(min=12,max=128) String newPassword){}
    private void limit(HttpServletRequest request,String operation,int max){limits.operation(request,operation,max);}
    @GetMapping("/auth/csrf") ResponseEntity<?> csrf(HttpServletRequest request,HttpServletResponse response){return ApiSupport.response(Map.of("token",AuthSecurity.issueCsrf(request,response),"headerName","X-CSRF-TOKEN"),200);}
    @PostMapping("/auth/register") ResponseEntity<?> register(@Valid @RequestBody Register input,HttpServletRequest request){limit(request,"mail",10);accounts.register(input.email(),input.password(),input.displayName());return accepted();}
    @PostMapping("/auth/forgot-password") ResponseEntity<?> forgot(@Valid @RequestBody EmailInput input,HttpServletRequest request){limits.forgot(request,input.email());accounts.email(input.email(),"RESET_PASSWORD");return accepted();}
    @PostMapping("/auth/reset-password") ResponseEntity<?> reset(@Valid @RequestBody ResetInput input,HttpServletRequest request){limit(request,"token",15);accounts.consume(input.token(),"RESET_PASSWORD",input.newPassword());if(request.getSession(false)!=null)request.getSession(false).invalidate();return ack();}
    @PostMapping("/auth/login") ResponseEntity<?> login(@Valid @RequestBody Login input,HttpServletRequest request){limits.beforeLogin(request,input.email());try{return ApiSupport.response(accounts.login(input.email(),input.password(),request),200);}catch(ApiProblem failure){if(failure.code().equals("INVALID_CREDENTIALS"))limits.failedLogin(request,input.email());throw failure;}}
    @PostMapping("/auth/logout") ResponseEntity<?> logout(HttpServletRequest request){users.requireId(request);request.getSession(false).invalidate();return ApiSupport.response(null,204);}
    @PostMapping("/auth/reauth") ResponseEntity<?> reauth(@Valid @RequestBody Reauth input,HttpServletRequest request){limit(request,"reauth",10);String id=users.requireId(request);accounts.checkPassword(id,input.password());Instant until=Instant.now().plusSeconds(600);request.getSession().setAttribute(CurrentUser.REAUTH_UNTIL,until.toEpochMilli());return ApiSupport.response(Map.of("validUntil",until),200);}
    @PutMapping("/auth/password") ResponseEntity<?> password(@Valid @RequestBody Password input,HttpServletRequest request){limit(request,"password",10);accounts.password(users.requireId(request),input.currentPassword(),input.newPassword());request.getSession().invalidate();return ack();}
    @GetMapping("/me") ResponseEntity<?> me(HttpServletRequest request){return ApiSupport.response(accounts.view(accounts.find(users.requireId(request))),200);}
    @GetMapping("/me/overview") ResponseEntity<?> overview(HttpServletRequest request){return ApiSupport.response(accounts.overview(users.requireId(request)),200);}
    @PatchMapping("/me") ResponseEntity<?> patch(@RequestBody Map<String,Object> input,HttpServletRequest request){return ApiSupport.response(accounts.patch(users.requireId(request),input),200);}
    private ResponseEntity<?> accepted(){return ApiSupport.response(Map.of("accepted",true,"verificationRequired",false),202);}
    private ResponseEntity<?> ack(){return ApiSupport.response(Map.of("accepted",true),200);}
}
