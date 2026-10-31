package com.campusradar.catalog;
import com.campusradar.common.ApiSupport;
import com.campusradar.security.CurrentUser;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;
@RestController
public class JobMatchController {
    private final JobMatchService service;private final CurrentUser users;
    public JobMatchController(JobMatchService service,CurrentUser users){this.service=service;this.users=users;}
    @GetMapping("/api/v1/jobs/{id}/match")ResponseEntity<?> get(HttpServletRequest request,@PathVariable String id){return ApiSupport.response(service.match(users.requireId(request),id),200);}
}
