package com.campusradar.notification;

import com.campusradar.common.*;
import com.campusradar.security.CurrentUser;
import com.campusradar.task.TaskService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.time.Instant;
import java.util.*;
import static com.campusradar.common.SqlRows.map;

@RestController
@RequestMapping("/api/v1")
public class NotificationController {
    private final NotificationService service;private final CurrentUser auth;private final OwnerTransactions tx;private final ContractInputs inputs;private final TaskService tasks;
    public NotificationController(NotificationService service,CurrentUser auth,OwnerTransactions tx,ContractInputs inputs,TaskService tasks){this.service=service;this.auth=auth;this.tx=tx;this.inputs=inputs;this.tasks=tasks;}
    private ResponseEntity<?> list(String table,String columns,String where,Map<String,Object>p,int page,int size,Set<String>json,Set<String>bool){NotificationService.page(page,size);long total=service.sql.db.queryForObject("SELECT COUNT(*) FROM "+table+" WHERE "+where,p,Long.class);p.put("limit",size);p.put("offset",(page-1)*size);return ApiSupport.page(service.sql.query("SELECT "+columns+" FROM "+table+" WHERE "+where+" ORDER BY created_at DESC,id LIMIT :limit OFFSET :offset",p,json,bool),page,size,total);}
    @GetMapping("/subscriptions")public ResponseEntity<?> subscriptions(HttpServletRequest r,@RequestParam(defaultValue="1")int page,@RequestParam(defaultValue="20")int size){return list("subscriptions",NotificationService.SUB,"user_id=:u",map("u",auth.requireId(r)),page,size,Set.of("conditions"),Set.of("in_app","email","enabled"));}
    @PostMapping("/subscriptions")public ResponseEntity<?> create(HttpServletRequest r,@RequestHeader("Idempotency-Key")String key,@RequestBody Map<String,Object>b){String u=auth.requireId(r);inputs.validate("SubscriptionInput",b);return ApiSupport.response(tx.write(u,"POST","/subscriptions",key,b,201,true,()->service.create(u,b)),201);}
    @PatchMapping("/subscriptions/{id}")public ResponseEntity<?> patch(HttpServletRequest r,@PathVariable String id,@RequestBody Map<String,Object>b){String u=auth.requireId(r);inputs.validate("SubscriptionPatch",b);return ApiSupport.response(tx.write(u,"PATCH","/subscriptions/"+id,null,b,200,true,()->service.patch(u,id,b)),200);}
    @DeleteMapping("/subscriptions/{id}")public ResponseEntity<?> delete(HttpServletRequest r,@PathVariable String id,@RequestParam int version){String u=auth.requireId(r);inputs.validate("VersionInput",map("version",version));tx.write(u,"DELETE","/subscriptions/"+id,null,map("version",version),204,true,()->service.delete(u,id,version));return ApiSupport.response(null,204);}
    @PostMapping("/subscriptions/{id}/scan")public ResponseEntity<?> scan(HttpServletRequest r,@PathVariable String id,@RequestHeader("Idempotency-Key")String key){String u=auth.requireId(r);return ApiSupport.response(tx.write(u,"POST","/subscriptions/"+id+"/scan",key,Map.of(),202,false,()->{var sub=service.one(u,id);if(!Boolean.TRUE.equals(sub.get("enabled")))throw new ApiProblem(409,"SUBSCRIPTION_DISABLED","请先启用此订阅。");return tasks.enqueue(u,"SUBSCRIPTION_SCAN",map("subscriptionId",id),"scan:"+u+":"+id+":"+key);}),202);}
    @GetMapping("/subscriptions/{id}/hits")public ResponseEntity<?> hits(HttpServletRequest r,@PathVariable String id,@RequestParam(defaultValue="1")int page,@RequestParam(defaultValue="20")int size){String u=auth.requireId(r);service.one(u,id);return list("subscription_hits",NotificationService.HIT,"user_id=:u AND subscription_id=:id",map("u",u,"id",id),page,size,Set.of(),Set.of());}
    @GetMapping("/notifications")public ResponseEntity<?> notifications(HttpServletRequest r,@RequestParam(defaultValue="1")int page,@RequestParam(defaultValue="20")int size,@RequestParam(required=false)Boolean unread){String where="user_id=:u"+(unread==null?"":unread?" AND read_at IS NULL":" AND read_at IS NOT NULL");return list("notifications",NotificationService.NOTICE,where,map("u",auth.requireId(r)),page,size,Set.of(),Set.of());}
    @PatchMapping("/notifications/{id}")public ResponseEntity<?> notificationPatch(HttpServletRequest r,@PathVariable String id,@RequestBody Map<String,Object>b){String u=auth.requireId(r);inputs.validate("NotificationPatch",b);return ApiSupport.response(tx.write(u,"PATCH","/notifications/"+id,null,b,200,true,()->service.notificationPatch(u,id,((Number)b.get("version")).intValue(),(Boolean)b.get("read"))),200);}
    @DeleteMapping("/notifications/{id}")public ResponseEntity<?> notificationDelete(HttpServletRequest r,@PathVariable String id,@RequestParam int version){String u=auth.requireId(r);inputs.validate("VersionInput",map("version",version));tx.write(u,"DELETE","/notifications/"+id,null,map("version",version),204,true,()->service.notificationDelete(u,id,version));return ApiSupport.response(null,204);}
    @PostMapping("/notifications/read-all")public ResponseEntity<?> readAll(HttpServletRequest r,@RequestHeader("Idempotency-Key")String key){Instant cutoff=Instant.now();String u=auth.requireId(r);return ApiSupport.response(tx.write(u,"POST","/notifications/read-all",key,Map.of(),200,true,()->service.readAll(u,cutoff)),200);}
}
