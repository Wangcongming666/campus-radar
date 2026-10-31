package com.campusradar.knowledge;
import com.campusradar.common.*;
import com.campusradar.security.CurrentUser;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;
import java.util.*;
import static com.campusradar.common.ApiSupport.*;

@RestController @RequestMapping("/api/v1")
public class KnowledgeController {
    private final KnowledgeService service;private final CurrentUser user;
    public KnowledgeController(KnowledgeService s,CurrentUser u){service=s;user=u;}
    private String optional(HttpServletRequest req){try{return user.requireId(req);}catch(ApiProblem e){if(e.status()==401)return null;throw e;}}
    @GetMapping("/companies") ResponseEntity<?> companies(@RequestParam(required=false)String q,@RequestParam(defaultValue="1")int page,@RequestParam(defaultValue="20")int size){var p=service.companies(q,page,size);return page(p.data(),page,size,p.total());}
    @GetMapping("/companies/{id}") ResponseEntity<?> company(@PathVariable String id){return response(service.company(id),200);}
    @GetMapping("/handbook/chapters") ResponseEntity<?> chapters(@RequestParam(required=false)String direction,@RequestParam(required=false)String q){return response(service.chapters(direction,q),200);}
    @GetMapping("/handbook/chapters/{slug}") ResponseEntity<?> chapter(@PathVariable String slug){return response(service.chapter(slug),200);}
    @GetMapping("/handbook/progress/{id}") ResponseEntity<?> chapterProgress(HttpServletRequest req,@PathVariable String id){return response(service.chapterProgress(user.requireId(req),id),200);}
    @PutMapping("/handbook/progress/{id}") ResponseEntity<?> saveChapter(HttpServletRequest req,@PathVariable String id,@RequestBody Map<String,Object> body){return response(service.putChapterProgress(user.requireId(req),id,body),200);}
    @GetMapping("/questions") ResponseEntity<?> questions(@RequestParam(required=false)String q,@RequestParam(required=false)String role,@RequestParam(required=false)String difficulty,@RequestParam(required=false)String companyId,@RequestParam(defaultValue="1")int page,@RequestParam(defaultValue="20")int size){var p=service.questions(q,role,difficulty,companyId,page,size);return page(p.data(),page,size,p.total());}
    @GetMapping("/questions/{id}") ResponseEntity<?> question(@PathVariable String id){return response(service.question(id),200);}
    @GetMapping("/questions/{id}/progress") ResponseEntity<?> progress(HttpServletRequest req,@PathVariable String id){return response(service.questionProgress(user.requireId(req),id),200);}
    @PutMapping("/questions/{id}/progress") ResponseEntity<?> saveProgress(HttpServletRequest req,@PathVariable String id,@RequestBody Map<String,Object> body){return response(service.putQuestionProgress(user.requireId(req),id,body),200);}
    @GetMapping("/experiences") ResponseEntity<?> experiences(@RequestParam(required=false)String q,@RequestParam(required=false)String companyId,@RequestParam(required=false)String role,@RequestParam(required=false)String roundType,@RequestParam(defaultValue="1")int page,@RequestParam(defaultValue="20")int size){var p=service.experiences(null,false,q,companyId,role,roundType,page,size);return page(p.data(),page,size,p.total());}
    @GetMapping("/me/experiences") ResponseEntity<?> mine(HttpServletRequest req,@RequestParam(defaultValue="1")int page,@RequestParam(defaultValue="20")int size){var p=service.experiences(user.requireId(req),true,null,null,null,null,page,size);return page(p.data(),page,size,p.total());}
    @GetMapping("/experiences/{id}") ResponseEntity<?> experience(HttpServletRequest req,@PathVariable String id){return response(service.experience(optional(req),id),200);}
    @PostMapping("/experiences") ResponseEntity<?> create(HttpServletRequest req,@RequestHeader("Idempotency-Key")String key,@RequestBody Map<String,Object> body){return response(service.createExperience(user.requireId(req),key,body),201);}
    @PatchMapping("/experiences/{id}") ResponseEntity<?> patch(HttpServletRequest req,@PathVariable String id,@RequestBody Map<String,Object> body){return response(service.patchExperience(user.requireId(req),id,body),200);}
    @PostMapping("/experiences/{id}/submit") ResponseEntity<?> submit(HttpServletRequest req,@PathVariable String id,@RequestBody Map<String,Object> body){return response(service.submitExperience(user.requireId(req),id,body),200);}
    @DeleteMapping("/experiences/{id}") ResponseEntity<?> delete(HttpServletRequest req,@PathVariable String id,@RequestParam int version){service.deleteExperience(user.requireId(req),id,version);return response(null,204);}
    @GetMapping("/companies/by-slug/{companySlug}/pack") ResponseEntity<?> pack(@PathVariable String companySlug){return response(service.pack(companySlug),200);}
    @GetMapping("/companies/by-slug/{companySlug}/style") ResponseEntity<?> style(@PathVariable String companySlug){return response(service.style(companySlug),200);}
}
