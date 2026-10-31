package com.campusradar.practice;

import com.campusradar.common.ApiSupport;
import com.campusradar.security.CurrentUser;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/mock-sessions")
public class PracticeController {
    private final PracticeService service;private final CurrentUser user;
    public PracticeController(PracticeService service,CurrentUser user){this.service=service;this.user=user;}
    @GetMapping public ResponseEntity<?> list(HttpServletRequest request,@RequestParam(defaultValue="1")int page,@RequestParam(defaultValue="20")int size){var result=service.list(user.requireId(request),page,size);return ApiSupport.page(result.data(),page,size,result.total());}
    @PostMapping public ResponseEntity<?> create(HttpServletRequest request,@RequestHeader("Idempotency-Key")String key,@RequestBody Map<String,Object> body){return ApiSupport.response(service.create(user.requireId(request),body,key),201);}
    @GetMapping("/{id}") public ResponseEntity<?> detail(HttpServletRequest request,@PathVariable String id){return ApiSupport.response(service.detail(user.requireId(request),id),200);}
    @PatchMapping("/{id}") public ResponseEntity<?> action(HttpServletRequest request,@PathVariable String id,@RequestHeader("Idempotency-Key")String key,@RequestBody Map<String,Object> body){return ApiSupport.response(service.action(user.requireId(request),id,body,key),200);}
    @PutMapping("/{id}/answers/{answerId}") public ResponseEntity<?> saveAnswer(HttpServletRequest request,@PathVariable String id,@PathVariable String answerId,@RequestBody Map<String,Object> body){return ApiSupport.response(service.saveAnswer(user.requireId(request),id,answerId,body),200);}
}
