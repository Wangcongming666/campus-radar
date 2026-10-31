package com.campusradar.accountdata;
import com.campusradar.common.ApiSupport;
import com.campusradar.security.CurrentUser;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/api/v1")
public class AccountDataController {
    private final AccountDataService service;private final CurrentUser user;
    public AccountDataController(AccountDataService service,CurrentUser user){this.service=service;this.user=user;}
    private Long recent(HttpServletRequest request){var session=request.getSession(false);return session!=null&&session.getAttribute(CurrentUser.REAUTH_UNTIL) instanceof Number n?n.longValue():null;}
    @GetMapping("/account/data-revision") public ResponseEntity<?> revision(HttpServletRequest request){return ApiSupport.response(service.revision(user.requireId(request)),200);}
    @PostMapping("/account/exports") public ResponseEntity<?> export(HttpServletRequest request,@RequestHeader("Idempotency-Key")String key,@RequestBody Map<String,Object> body){return ApiSupport.response(service.export(user.requireId(request),body,key),202);}
    @PostMapping("/account/import-previews") public ResponseEntity<?> preview(HttpServletRequest request,@RequestHeader("Idempotency-Key")String key,@RequestBody Map<String,Object> body){return ApiSupport.response(service.preview(user.requireId(request),body,key),201);}
    @PostMapping("/account/import-previews/{id}/apply") public ResponseEntity<?> apply(HttpServletRequest request,@PathVariable String id,@RequestHeader("Idempotency-Key")String key,@RequestBody Map<String,Object> body){return ApiSupport.response(service.apply(user.requireId(request),id,body,key,recent(request)),202);}
    @PostMapping("/account/reset") public ResponseEntity<?> reset(HttpServletRequest request,@RequestHeader("Idempotency-Key")String key,@RequestBody Map<String,Object> body){return ApiSupport.response(service.reset(user.requireId(request),body,key,recent(request)),202);}
    @DeleteMapping("/me") public ResponseEntity<?> erase(HttpServletRequest request,@RequestHeader("Idempotency-Key")String key,@RequestBody Map<String,Object> body){var result=service.erase(user.requireId(request),body,key,recent(request));request.getSession(false).invalidate();return ApiSupport.response(result,202);}
}
