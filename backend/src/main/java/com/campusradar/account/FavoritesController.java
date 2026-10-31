package com.campusradar.account;

import com.campusradar.application.ApplicationService;
import com.campusradar.common.*;
import com.campusradar.security.CurrentUser;
import jakarta.servlet.http.HttpServletRequest;
import java.sql.Timestamp;
import java.util.*;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/favorites")
@Transactional
public class FavoritesController {
    private static final Set<String> TYPES=Set.of("JOB","COMPANY","EXPERIENCE","QUESTION");
    private final NamedParameterJdbcTemplate db; private final CurrentUser current;
    public FavoritesController(NamedParameterJdbcTemplate db,CurrentUser current){this.db=db;this.current=current;}
    private List<Map<String,Object>> rows(String sql,Map<String,?> p){return db.query(sql,p,(r,n)->{var m=new LinkedHashMap<String,Object>();for(int i=1;i<=r.getMetaData().getColumnCount();i++)m.put(r.getMetaData().getColumnLabel(i).toLowerCase(Locale.ROOT),r.getObject(i));return m;});}
    private void validate(String type,String id){if(!TYPES.contains(type))throw new ApiProblem(422,"VALIDATION_ERROR","收藏类型无效。");ApplicationService.uuid(id);}
    private void owner(String owner,boolean write){var users=rows("SELECT status,data_operation FROM users WHERE id=:u FOR UPDATE",Map.of("u",owner));if(users.isEmpty())throw new ApiProblem(401,"UNAUTHENTICATED","请先登录。");var u=users.getFirst();if(!"ACTIVE".equals(u.get("status")))throw new ApiProblem(403,"ACCOUNT_INACTIVE","账号当前不可用。");if(write&&!"IDLE".equals(u.get("data_operation")))throw new ApiProblem(409,"DATA_OPERATION_IN_PROGRESS","账号正在处理数据，请稍后重试。");}
    private Map<String,Object> target(String type,String id){String sql=switch(type){case "JOB"->"SELECT j.title FROM jobs j JOIN sources s ON s.id=j.source_id WHERE j.id=:id AND j.publication_status='PUBLISHED' AND s.enabled=1";case "COMPANY"->"SELECT name title FROM companies WHERE id=:id";case "EXPERIENCE"->"SELECT title FROM experiences WHERE id=:id AND status='PUBLISHED'";case "QUESTION"->"SELECT title FROM questions WHERE id=:id AND status='PUBLISHED'";default->throw new ApiProblem(422,"VALIDATION_ERROR","收藏类型无效。");};var targets=rows(sql,Map.of("id",id));return targets.isEmpty()?null:targets.getFirst();}
    private static String iso(Object v){return v instanceof Timestamp t?t.toInstant().toString():v==null?null:v.toString();}
    private Map<String,Object> dto(Map<String,Object> row){String type=(String)row.get("target_type"),id=(String)row.get("target_id");var found=target(type,id);String href=switch(type){case "JOB"->"/jobs/"+id;case "COMPANY"->"/companies/"+id;case "EXPERIENCE"->"/experiences/"+id;default->"/questions/"+id;};return ApplicationService.map("id",row.get("id"),"version",row.get("version"),"createdAt",iso(row.get("created_at")),"updatedAt",iso(row.get("updated_at")),"type",type,"targetId",id,"title",found==null?"内容已不可用":found.get("title"),"href",href,"unavailable",found==null);}
    public Map<String,Object> favorite(String owner,String type,String id){validate(type,id);owner(owner,true);var p=Map.of("u",owner,"type",type,"target",id);var existing=rows("SELECT * FROM favorites WHERE user_id=:u AND target_type=:type AND target_id=:target",p);if(!existing.isEmpty())return dto(existing.getFirst());if(target(type,id)==null)throw new ApiProblem(404,"NOT_FOUND","收藏目标不存在或不可用。");var insert=new HashMap<String,Object>(p);insert.put("id",UUID.randomUUID().toString());db.update("INSERT INTO favorites(id,user_id,target_type,target_id) VALUES(:id,:u,:type,:target)",insert);db.update("UPDATE users SET data_revision=data_revision+1 WHERE id=:u",p);return dto(rows("SELECT * FROM favorites WHERE user_id=:u AND target_type=:type AND target_id=:target",p).getFirst());}
    public void remove(String owner,String type,String id){validate(type,id);owner(owner,true);var p=Map.of("u",owner,"type",type,"target",id);if(db.update("DELETE FROM favorites WHERE user_id=:u AND target_type=:type AND target_id=:target",p)>0)db.update("UPDATE users SET data_revision=data_revision+1 WHERE id=:u",p);}
    public Map<String,Object> listFor(String owner,int page,int size,String type){ApplicationService.page(page,size);if(type!=null&&!TYPES.contains(type))throw new ApiProblem(422,"VALIDATION_ERROR","收藏类型无效。");owner(owner,false);var p=ApplicationService.map("u",owner,"limit",size,"offset",(page-1)*size);String where=" WHERE user_id=:u";if(type!=null){where+=" AND target_type=:type";p.put("type",type);}Long total=db.queryForObject("SELECT COUNT(*) FROM favorites"+where,p,Long.class);return ApplicationService.map("items",rows("SELECT * FROM favorites"+where+" ORDER BY created_at DESC,id LIMIT :limit OFFSET :offset",p).stream().map(this::dto).toList(),"total",total);}
    @GetMapping public ResponseEntity<?> list(HttpServletRequest r,@RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int size,@RequestParam(required=false) String type){var result=listFor(current.requireId(r),page,size,type);return ApiSupport.page(result.get("items"),page,size,((Number)result.get("total")).longValue());}
    @PutMapping("/{type}/{id}") public ResponseEntity<?> put(HttpServletRequest r,@PathVariable String type,@PathVariable String id){return ApiSupport.response(favorite(current.requireId(r),type,id),200);}
    @DeleteMapping("/{type}/{id}") public ResponseEntity<?> delete(HttpServletRequest r,@PathVariable String type,@PathVariable String id){remove(current.requireId(r),type,id);return ResponseEntity.noContent().header("X-Request-Id",UUID.randomUUID().toString()).build();}
}
