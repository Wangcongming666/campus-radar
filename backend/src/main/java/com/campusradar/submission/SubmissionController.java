package com.campusradar.submission;

import com.campusradar.common.ApiSupport;
import com.campusradar.security.CurrentUser;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/me/submissions")
public class SubmissionController {
    private final SubmissionService service;
    private final CurrentUser auth;
    public SubmissionController(SubmissionService service,CurrentUser auth) {this.service=service;this.auth=auth;}
    @GetMapping
    public ResponseEntity<?> list(HttpServletRequest request,@RequestParam(required=false) String type,@RequestParam(required=false) String status,@RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int size) {
        var result=service.list(auth.requireId(request),type,status,page,size);
        return ApiSupport.page(result.data(),page,size,result.total());
    }
}
