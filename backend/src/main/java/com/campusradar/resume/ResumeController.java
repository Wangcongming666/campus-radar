package com.campusradar.resume;

import com.campusradar.common.*;
import com.campusradar.account.AuthRateLimits;
import com.campusradar.security.CurrentUser;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.constraints.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.springframework.http.*;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1")
@Validated
public class ResumeController {
    private final ResumeService service;private final CurrentUser user;private final AuthRateLimits limits;
    public ResumeController(ResumeService service,CurrentUser user,AuthRateLimits limits){this.service=service;this.user=user;this.limits=limits;}
    @GetMapping("/files") ResponseEntity<?> files(@RequestParam(defaultValue="1") @Min(1) @Max(500) int page,@RequestParam(defaultValue="20") @Min(1) @Max(100) int size,HttpServletRequest request){String id=user.requireId(request);return ApiSupport.page(service.files(id,page,size),page,size,service.fileCount(id));}
    @PostMapping(value="/files",consumes=MediaType.MULTIPART_FORM_DATA_VALUE) ResponseEntity<?> upload(@RequestPart MultipartFile file,@RequestParam String purpose,@RequestHeader("Idempotency-Key") @Size(min=16,max=80) String key,HttpServletRequest request) throws java.io.IOException {
        String id=user.requireId(request);long limit=FilePolicy.limit(purpose);if(file.getSize()>limit)throw new ApiProblem(413,"PAYLOAD_TOO_LARGE","文件超过该用途的大小限制。");
        limits.upload(id);
        return ApiSupport.response(service.upload(id,purpose,file.getOriginalFilename(),file.getContentType(),file.getBytes(),key),201);
    }
    @GetMapping("/files/{id}/download") ResponseEntity<byte[]> download(@PathVariable @Pattern(regexp="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}") String id,HttpServletRequest request){var file=service.download(user.requireId(request),id);return ResponseEntity.ok().contentType(MediaType.parseMediaType(file.mime())).contentLength(file.bytes().length).cacheControl(CacheControl.noStore()).header("X-Content-Type-Options","nosniff").header("X-Request-Id",UUID.randomUUID().toString()).header("X-Content-SHA256",file.sha()).header(HttpHeaders.CONTENT_DISPOSITION,ContentDisposition.attachment().filename(file.name(),StandardCharsets.UTF_8).build().toString()).body(file.bytes());}
    @DeleteMapping("/files/{id}") ResponseEntity<?> deleteFile(@PathVariable @Pattern(regexp="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}") String id,@RequestParam @Min(1) int version,HttpServletRequest request){service.deleteFile(user.requireId(request),id,version);return ApiSupport.response(null,204);}
    @GetMapping("/resumes") ResponseEntity<?> list(@RequestParam(defaultValue="1") @Min(1) @Max(500) int page,@RequestParam(defaultValue="20") @Min(1) @Max(100) int size,HttpServletRequest request){String id=user.requireId(request);return ApiSupport.page(service.resumes(id,page,size),page,size,service.resumeCount(id));}
    @PostMapping("/resumes") ResponseEntity<?> create(@RequestBody Map<String,Object> body,@RequestHeader("Idempotency-Key") @Size(min=16,max=80) String key,HttpServletRequest request){return ApiSupport.response(service.create(user.requireId(request),body,key),201);}
    @PatchMapping("/resumes/{id}") ResponseEntity<?> patch(@PathVariable @Pattern(regexp="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}") String id,@RequestBody Map<String,Object> body,HttpServletRequest request){return ApiSupport.response(service.patch(user.requireId(request),id,body),200);}
    @DeleteMapping("/resumes/{id}") ResponseEntity<?> remove(@PathVariable @Pattern(regexp="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}") String id,@RequestParam @Min(1) int version,HttpServletRequest request){service.deleteResume(user.requireId(request),id,version);return ApiSupport.response(null,204);}
    @GetMapping("/resumes/diff") ResponseEntity<?> diff(@RequestParam @Pattern(regexp="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}") String baseId,@RequestParam @Pattern(regexp="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}") String compareId,HttpServletRequest request){return ApiSupport.response(service.diff(user.requireId(request),baseId,compareId),200);}
    @PostMapping("/resume-diagnoses") ResponseEntity<?> diagnose(@RequestBody Map<String,Object> body,HttpServletRequest request){return ApiSupport.response(service.diagnose(user.requireId(request),body),200);}
}
