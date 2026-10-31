package com.campusradar.application;

import com.campusradar.common.ApiSupport;
import com.campusradar.security.CurrentUser;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/applications")
public class ApplicationsController {
    private final ApplicationService service; private final CurrentUser current;
    public ApplicationsController(ApplicationService service,CurrentUser current){this.service=service;this.current=current;}
    @GetMapping("/board") public ResponseEntity<?> board(HttpServletRequest r,@RequestParam(required=false) String stage,@RequestParam(required=false) String companyId){return ApiSupport.response(service.board(current.requireId(r),stage,companyId),200);}
    @GetMapping public ResponseEntity<?> list(HttpServletRequest r,@RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int size,@RequestParam(required=false) String stage,@RequestParam(required=false) String companyId,@RequestParam(required=false) Boolean archived){var result=service.list(current.requireId(r),page,size,stage,companyId,archived);return ApiSupport.page(result.get("items"),page,size,((Number)result.get("total")).longValue());}
    @PostMapping public ResponseEntity<?> create(HttpServletRequest r,@RequestHeader("Idempotency-Key") String key,@RequestBody Map<String,Object> body){return ApiSupport.response(service.create(current.requireId(r),body,key),200);}
    @GetMapping("/{id}") public ResponseEntity<?> detail(HttpServletRequest r,@PathVariable String id){return ApiSupport.response(service.detail(current.requireId(r),id),200);}
    @PatchMapping("/{id}") public ResponseEntity<?> patch(HttpServletRequest r,@PathVariable String id,@RequestBody Map<String,Object> body){return ApiSupport.response(service.patch(current.requireId(r),id,body),200);}
    @PostMapping("/{id}/move") public ResponseEntity<?> move(HttpServletRequest r,@PathVariable String id,@RequestHeader("Idempotency-Key") String key,@RequestBody Map<String,Object> body){return ApiSupport.response(service.move(current.requireId(r),id,body,key),200);}
    @PostMapping("/{id}/undo") public ResponseEntity<?> undo(HttpServletRequest r,@PathVariable String id,@RequestHeader("Idempotency-Key") String key,@RequestBody Map<String,Object> body){return ApiSupport.response(service.undo(current.requireId(r),id,body,key),200);}
    @GetMapping("/{id}/history") public ResponseEntity<?> history(HttpServletRequest r,@PathVariable String id,@RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int size){var result=service.history(current.requireId(r),id,page,size);return ApiSupport.page(result.get("items"),page,size,((Number)result.get("total")).longValue());}
}
