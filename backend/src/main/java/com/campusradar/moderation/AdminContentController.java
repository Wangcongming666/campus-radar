package com.campusradar.moderation;

import com.campusradar.common.ApiSupport;
import com.campusradar.security.CurrentUser;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.constraints.*;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin")
@Validated
public class AdminContentController {
    private final AdminContentService service;private final CurrentUser user;
    private static final String RESOURCE="/{resource:companies|jobs|questions|chapters|signals|sources|experiences}";
    private static final String UUID="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
    public AdminContentController(AdminContentService service,CurrentUser user){this.service=service;this.user=user;}
    @GetMapping(RESOURCE) ResponseEntity<?> list(@PathVariable String resource,@RequestParam(defaultValue="1") @Min(1) @Max(500) int page,@RequestParam(defaultValue="20") @Min(1) @Max(100) int size,HttpServletRequest request){String actor=user.requireId(request);return ApiSupport.page(service.list(actor,resource,page,size),page,size,service.count(actor,resource));}
    @PostMapping(RESOURCE) ResponseEntity<?> create(@PathVariable String resource,@RequestBody Map<String,Object> body,@RequestHeader("Idempotency-Key") @Size(min=16,max=80) String key,HttpServletRequest request){return ApiSupport.response(service.create(user.requireId(request),resource,body,key),201);}
    @PatchMapping(RESOURCE+"/{id}") ResponseEntity<?> patch(@PathVariable String resource,@PathVariable @Pattern(regexp=UUID) String id,@RequestBody Map<String,Object> body,HttpServletRequest request){return ApiSupport.response(service.patch(user.requireId(request),resource,id,body),200);}
    @DeleteMapping(RESOURCE+"/{id}") ResponseEntity<?> delete(@PathVariable String resource,@PathVariable @Pattern(regexp=UUID) String id,@RequestParam @Min(1) int version,HttpServletRequest request){service.delete(user.requireId(request),resource,id,version);return ApiSupport.response(null,204);}
    @GetMapping("/users") ResponseEntity<?> users(@RequestParam(required=false) @Size(max=200) String q,@RequestParam(required=false) String status,@RequestParam(defaultValue="1") @Min(1) @Max(500) int page,@RequestParam(defaultValue="20") @Min(1) @Max(100) int size,HttpServletRequest request){String actor=user.requireId(request);return ApiSupport.page(service.users(actor,q,status,page,size),page,size,service.userCount(actor,q,status));}
    @PatchMapping("/users/{id}") ResponseEntity<?> patchUser(@PathVariable @Pattern(regexp=UUID) String id,@RequestBody Map<String,Object> body,HttpServletRequest request){return ApiSupport.response(service.patchUser(user.requireId(request),id,body),200);}
    @GetMapping("/moderation") ResponseEntity<?> moderation(@RequestParam(required=false) String type,@RequestParam(defaultValue="1") @Min(1) @Max(500) int page,@RequestParam(defaultValue="20") @Min(1) @Max(100) int size,HttpServletRequest request){String actor=user.requireId(request);return ApiSupport.page(service.moderation(actor,type,page,size),page,size,service.moderationCount(actor,type));}
    @GetMapping("/moderation/{type}/{id}") ResponseEntity<?> detail(@PathVariable String type,@PathVariable @Pattern(regexp=UUID) String id,HttpServletRequest request){return ApiSupport.response(service.detail(user.requireId(request),type,id),200);}
    @PostMapping("/moderation/{type}/{id}/decisions") ResponseEntity<?> decide(@PathVariable String type,@PathVariable @Pattern(regexp=UUID) String id,@RequestBody Map<String,Object> body,@RequestHeader("Idempotency-Key") @Size(min=16,max=80) String key,HttpServletRequest request){return ApiSupport.response(service.decide(user.requireId(request),type,id,body,key),200);}
    @GetMapping("/comments") ResponseEntity<?> comments(@RequestParam(defaultValue="1") @Min(1) @Max(500) int page,@RequestParam(defaultValue="20") @Min(1) @Max(100) int size,HttpServletRequest request){String actor=user.requireId(request);return ApiSupport.page(service.comments(actor,page,size),page,size,service.commentCount(actor));}
    @DeleteMapping("/comments/{id}") ResponseEntity<?> removeComment(@PathVariable @Pattern(regexp=UUID) String id,@RequestBody Map<String,Object> body,HttpServletRequest request){service.removeComment(user.requireId(request),id,body);return ApiSupport.response(null,204);}
    @GetMapping("/reports") ResponseEntity<?> reports(@RequestParam(defaultValue="1") @Min(1) @Max(500) int page,@RequestParam(defaultValue="20") @Min(1) @Max(100) int size,HttpServletRequest request){String actor=user.requireId(request);return ApiSupport.page(service.reports(actor,page,size),page,size,service.reportCount(actor));}
    @PatchMapping("/reports/{id}") ResponseEntity<?> report(@PathVariable @Pattern(regexp=UUID) String id,@RequestBody Map<String,Object> body,HttpServletRequest request){return ApiSupport.response(service.reportDecision(user.requireId(request),id,body),200);}
    @GetMapping("/audit-logs") ResponseEntity<?> audit(@RequestParam(defaultValue="1") @Min(1) @Max(500) int page,@RequestParam(defaultValue="20") @Min(1) @Max(100) int size,HttpServletRequest request){String actor=user.requireId(request);return ApiSupport.page(service.auditLogs(actor,page,size),page,size,service.auditCount(actor));}
    @PutMapping("/users/{id}/provider-certification") ResponseEntity<?> certify(@PathVariable @Pattern(regexp=UUID) String id,@RequestBody Map<String,Object> body,HttpServletRequest request){return ApiSupport.response(service.certify(user.requireId(request),id,body),200);}
}
