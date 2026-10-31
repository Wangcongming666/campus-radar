package com.campusradar.moderation;

import com.campusradar.account.AccountService;
import com.campusradar.common.*;
import java.net.URI;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.dao.DataIntegrityViolationException;
import static com.campusradar.common.SqlRows.map;

@Service
public class AdminContentService {
    private final SqlRows r;private final OwnerTransactions tx;private final ContractInputs inputs;private final Clock clock;private final AccountService accounts;
    public AdminContentService(SqlRows r,OwnerTransactions tx,ContractInputs inputs,Clock clock,AccountService accounts){this.r=r;this.tx=tx;this.inputs=inputs;this.clock=clock;this.accounts=accounts;}
    record Resource(String table,String schema,String fields,Set<String> json,Set<String> bools){}
    private static final String BASE="id,version,created_at,updated_at,";
    private static final Map<String,Resource> RESOURCES=Map.of(
        "experiences",new Resource("experiences","AdminExperience",BASE+"author_id,company_id,title,summary,body_md,role,round_type,occurred_on,tags,content_mode,source_url,license_note,status",Set.of("tags"),Set.of()),
        "companies",new Resource("companies","Company",BASE+"slug,name,logo_url,industry,size_band,cities,tags,description_md,verified_at",Set.of("cities","tags"),Set.of()),
        "sources",new Resource("sources","Source",BASE+"name,base_url,content_mode,permission_note,enabled,verified_at",Set.of(),Set.of("enabled")),
        "questions",new Resource("questions","Question",BASE+"title,prompt_md,answer_md,role,difficulty,tags,chapter_id,status",Set.of("tags"),Set.of()),
        "chapters",new Resource("chapters","Chapter",BASE+"parent_id,slug,title,direction,sort_order,body_md,content_version,status",Set.of(),Set.of()),
        "signals",new Resource("radar_signals","Signal",BASE+"company_id,title,body,kind,source_url,occurred_at,verified_at,confidence,status",Set.of(),Set.of()),
        "jobs",new Resource("jobs","Job",BASE+"company_id,title,role,education,recruitment_type,skills,salary,description_md,canonical_url,deadline_at,deadline_date,deadline_precision,source_timezone,status,source_id,collected_at,published_at",Set.of("skills","salary"),Set.of()));
    private Resource resource(String kind){var value=RESOURCES.get(kind);if(value==null)throw new ApiProblem(404,"NOT_FOUND","管理模块不存在。");return value;}
    private static String catalogCondition(String kind){return kind.equals("experiences")?" AND (author_id IS NULL OR status IN ('PENDING','PUBLISHED','HIDDEN'))":"";}
    private void role(String actor,boolean admin){var users=r.db.queryForList("SELECT role FROM users WHERE id=:u AND status='ACTIVE'",Map.of("u",actor));if(users.isEmpty())throw new ApiProblem(401,"AUTH_REQUIRED","请重新登录。");String role=users.getFirst().get("role").toString();if(!(role.equals("ADMIN")||!admin&&role.equals("REVIEWER")))throw new ApiProblem(403,"FORBIDDEN","此操作需要相应管理权限。");}
    private static void paging(int page,int size){if(page<1||page>500||size<1||size>100)throw new ApiProblem(422,"VALIDATION_ERROR","分页参数无效。");}
    public List<Map<String,Object>> list(String actor,String kind,int page,int size){resource(kind);role(actor,kind.equals("sources"));paging(page,size);var ids=r.db.queryForList("SELECT id FROM "+resource(kind).table()+" WHERE 1=1"+catalogCondition(kind)+" ORDER BY updated_at DESC,id LIMIT :size OFFSET :offset",map("size",size,"offset",(page-1)*size),String.class);return ids.stream().map(id->read(kind,id)).toList();}
    public long count(String actor,String kind){role(actor,kind.equals("sources"));return r.db.queryForObject("SELECT COUNT(*) FROM "+resource(kind).table()+" WHERE 1=1"+catalogCondition(kind),Map.of(),Long.class);}
    private Map<String,Object> read(String kind,String id){var spec=resource(kind);var value=r.one("SELECT "+spec.fields()+" FROM "+spec.table()+" WHERE id=:id"+catalogCondition(kind),map("id",id),spec.json(),spec.bools());
        if(kind.equals("questions"))value.put("companyIds",r.db.queryForList("SELECT company_id FROM question_companies WHERE question_id=:id ORDER BY company_id",map("id",id),String.class));
        if(kind.equals("jobs")){
            value.put("cities",r.db.queryForList("SELECT city FROM job_cities WHERE job_id=:id ORDER BY city",map("id",id),String.class));value.put("graduationYears",r.db.queryForList("SELECT graduation_year FROM job_graduation_years WHERE job_id=:id ORDER BY graduation_year",map("id",id),Integer.class));
            value.put("company",read("companies",value.get("companyId").toString()));var source=read("sources",value.remove("sourceId").toString());value.put("source",map("id",source.get("id"),"name",source.get("name"),"url",source.get("baseUrl"),"verifiedAt",source.get("verifiedAt"),"contentMode",source.get("contentMode")));
        }return value;
    }
    public Object create(String actor,String kind,Map<String,Object> body,String key){var spec=resource(kind);role(actor,true);inputs.validate(spec.schema()+"Input",body);return tx.write(actor,"POST","/api/v1/admin/"+kind,key,body,201,false,()->{
        role(actor,true);String id=UUID.randomUUID().toString();validateRelations(kind,id,body);var data=new LinkedHashMap<String,Object>(body);data.put("id",id);
        if(Set.of("questions","chapters","signals","experiences").contains(kind))data.put("status","PENDING");
        if(kind.equals("signals"))data.put("confidence","UNVERIFIED");
        if(kind.equals("jobs")){validateJob(body);data.put("publicationStatus","PENDING");data.put("collectedAt",clock.instant().toString());data.put("canonicalUrlHash",urlHash(body.get("canonicalUrl").toString()));data.put("searchText",searchText(body));}
        insert(spec,data,kind);relations(kind,id,body);audit(actor,"CONTENT_CREATE",type(kind),id,"管理员录入内容。",map("fields",body.keySet()));return read(kind,id);
    });}
    public Object patch(String actor,String kind,String id,Map<String,Object> body){var spec=resource(kind);role(actor,true);inputs.validate(spec.schema()+"Patch",body);return tx.write(actor,"PATCH","/api/v1/admin/"+kind+"/"+id,null,body,200,false,()->{
        role(actor,true);if(kind.equals("experiences"))r.one("SELECT id FROM experiences WHERE id=:id AND author_id IS NULL FOR UPDATE",map("id",id),Set.of(),Set.of());var old=read(kind,id);version(old.get("version"),body.get("version"));validateRelations(kind,id,body);var data=new LinkedHashMap<String,Object>(body);data.remove("version");
        if(Set.of("questions","chapters","signals","experiences").contains(kind))data.put("status","PENDING");
        if(kind.equals("signals")){data.put("confidence","UNVERIFIED");data.put("verifiedAt",null);}
        if(kind.equals("chapters")&&body.containsKey("bodyMd"))data.put("contentVersion",((Number)old.get("contentVersion")).intValue()+1);
        if(kind.equals("jobs")){
            var merged=new LinkedHashMap<String,Object>();for(String field:List.of("companyId","title","role","cities","education","recruitmentType","graduationYears","skills","salary","descriptionMd","canonicalUrl","deadlineAt","deadlineDate","deadlinePrecision","sourceTimezone","status"))merged.put(field,old.get(field));merged.put("sourceId",((Map<?,?>)old.get("source")).get("id"));merged.putAll(body);merged.remove("version");inputs.validate("JobInput",merged);validateJob(merged);data.put("publicationStatus","PENDING");data.put("canonicalUrlHash",urlHash(merged.get("canonicalUrl").toString()));data.put("searchText",searchText(merged));
        }
        update(spec,kind,id,data,body.get("version"));relations(kind,id,body);audit(actor,"CONTENT_EDIT",type(kind),id,"管理员条件编辑内容。",map("fields",body.keySet(),"oldVersion",old.get("version")));return read(kind,id);
    });}
    public void delete(String actor,String kind,String id,int expectedVersion){
        var spec=resource(kind);role(actor,true);inputs.validate("VersionInput",map("version",expectedVersion));
        try{tx.write(actor,"DELETE","/api/v1/admin/"+kind+"/"+id,null,map("version",expectedVersion),204,false,()->{
            role(actor,true);
            var old=r.one("SELECT version FROM "+spec.table()+" WHERE id=:id"+(kind.equals("experiences")?" AND author_id IS NULL":"")+" FOR UPDATE",map("id",id),Set.of(),Set.of());
            version(old.get("version"),expectedVersion);checkDeleteReferences(kind,id);
            if(kind.equals("jobs"))for(String table:List.of("job_cities","job_graduation_years"))r.db.update("DELETE FROM "+table+" WHERE job_id=:id",map("id",id));
            if(kind.equals("questions"))r.db.update("DELETE FROM question_companies WHERE question_id=:id",map("id",id));
            if(r.db.update("DELETE FROM "+spec.table()+" WHERE id=:id AND version=:version",map("id",id,"version",expectedVersion))!=1)throw conflict();
            audit(actor,"CONTENT_DELETE",type(kind),id,"管理员删除未被引用的目录内容。",map("oldVersion",expectedVersion));return null;
        });}catch(DataIntegrityViolationException exception){throw referenced("存在关联记录，请先处理关联内容后重试。");}
    }
    private void checkDeleteReferences(String kind,String id){
        List<String> references=switch(kind){
            case "companies"->List.of("jobs:company_id","experiences:company_id","mock_sessions:company_id","salary_reports:company_id","radar_signals:company_id","question_companies:company_id","referrals:company_id");
            case "sources"->List.of("jobs:source_id");
            case "jobs"->List.of("applications:job_id","subscription_hits:job_id","referrals:job_id");
            case "questions"->List.of("question_progress:question_id","mock_answers:question_id","buddy_tasks:question_id");
            case "chapters"->List.of("chapters:parent_id","questions:chapter_id","chapter_progress:chapter_id");
            case "experiences"->List.of("comments:experience_id");
            default->List.of();
        };
        for(String reference:references){var parts=reference.split(":");if(r.db.queryForObject("SELECT COUNT(*) FROM "+parts[0]+" WHERE "+parts[1]+"=:id",map("id",id),Long.class)>0)throw referenced("该记录被其他内容或用户数据引用，请先处理关联内容；用户投递和学习笔记不会被删除。");}
        for(String table:List.of("favorites","content_reports"))if(r.db.queryForObject("SELECT COUNT(*) FROM "+table+" WHERE target_type=:type AND target_id=:id",map("type",type(kind),"id",id),Long.class)>0)throw referenced("该记录仍有关联收藏或举报，请先处理关联记录后重试。");
    }
    private static ApiProblem referenced(String message){return new ApiProblem(409,"CONTENT_REFERENCED",message);}
    private static final String USER_FIELDS="id,version,email,display_name,role,status,school,education,graduation_year,CASE WHEN email_verified_at IS NOT NULL THEN 1 ELSE 0 END AS email_verified,created_at";
    private Map<String,Object> userFilters(String actor,String q,String status){
        role(actor,true);if(q!=null&&q.length()>200||status!=null&&!Set.of("PENDING","ACTIVE","FROZEN","DELETING","DISABLED").contains(status))throw new ApiProblem(422,"VALIDATION_ERROR","用户筛选条件无效。");return map("q",q==null?null:"%"+q.trim()+"%","status",status);
    }
    private static final String USER_WHERE=" WHERE (:q IS NULL OR email LIKE :q OR display_name LIKE :q) AND (:status IS NULL OR status=:status)";
    public List<Map<String,Object>> users(String actor,String q,String status,int page,int size){
        paging(page,size);var params=userFilters(actor,q,status);params.put("size",size);params.put("offset",(page-1)*size);return r.query("SELECT "+USER_FIELDS+" FROM users"+USER_WHERE+" ORDER BY created_at DESC,id LIMIT :size OFFSET :offset",params,Set.of(),Set.of("email_verified"));
    }
    public long userCount(String actor,String q,String status){return r.db.queryForObject("SELECT COUNT(*) FROM users"+USER_WHERE,userFilters(actor,q,status),Long.class);}
    public Object patchUser(String actor,String id,Map<String,Object> body){
        role(actor,true);inputs.validate("AdminUserPatch",body);return tx.write(actor,"PATCH","/api/v1/admin/users/"+id,null,body,200,false,()->{
            role(actor,true);var old=r.one("SELECT role,status,version FROM users WHERE id=:id FOR UPDATE",map("id",id),Set.of(),Set.of());
            if(actor.equals(id)||!old.get("role").equals("USER"))throw new ApiProblem(403,"FORBIDDEN","只能管理普通用户账号，不能更改自己或其他管理账号。");
            version(old.get("version"),body.get("version"));boolean statusChanged=body.containsKey("status")&&!body.get("status").equals(old.get("status"));
            if(statusChanged&&!Set.of("ACTIVE","FROZEN","DISABLED").contains(old.get("status")))throw new ApiProblem(409,"INVALID_STATE","待启用或注销中的账号不能通过此入口更改状态。");
            var params=map("id",id,"expected",body.get("version"));var assignments=new ArrayList<String>();
            for(var field:body.entrySet())if(!field.getKey().equals("version")){assignments.add(SqlRows.snake(field.getKey())+"=:"+field.getKey());params.put(field.getKey(),field.getValue());}
            assignments.add("version=version+1");assignments.add("updated_at=CURRENT_TIMESTAMP(3)");if(statusChanged)assignments.add("auth_version=auth_version+1");
            if(r.db.update("UPDATE users SET "+String.join(",",assignments)+" WHERE id=:id AND version=:expected AND role='USER'",params)!=1)throw conflict();
            audit(actor,"USER_EDIT","USER",id,"管理员更新普通用户基本资料。",map("fields",body.keySet(),"oldVersion",old.get("version"),"statusChanged",statusChanged,"fromStatus",old.get("status"),"toStatus",body.getOrDefault("status",old.get("status"))));
            return r.one("SELECT "+USER_FIELDS+" FROM users WHERE id=:id",map("id",id),Set.of(),Set.of("email_verified"));
        });
    }
    private void insert(Resource spec,Map<String,Object> data,String kind){var fields=new ArrayList<String>();var values=new ArrayList<String>();var params=new LinkedHashMap<String,Object>();for(var entry:data.entrySet()){String field=entry.getKey();if(relationField(kind,field))continue;String column=SqlRows.snake(field);fields.add(column);values.add(":"+field);params.put(field,convert(column,entry.getValue(),spec));}r.db.update("INSERT INTO "+spec.table()+"("+String.join(",",fields)+") VALUES("+String.join(",",values)+")",params);}
    private void update(Resource spec,String kind,String id,Map<String,Object> data,Object version){var assignments=new ArrayList<String>();var params=map("id",id,"expected",version);for(var entry:data.entrySet()){if(relationField(kind,entry.getKey()))continue;String column=SqlRows.snake(entry.getKey());assignments.add(column+"=:"+entry.getKey());params.put(entry.getKey(),convert(column,entry.getValue(),spec));}assignments.add("version=version+1");assignments.add("updated_at=CURRENT_TIMESTAMP(3)");if(r.db.update("UPDATE "+spec.table()+" SET "+String.join(",",assignments)+" WHERE id=:id AND version=:expected",params)!=1)throw conflict();}
    private Object convert(String column,Object value,Resource spec){return r.value(column,value,spec.json());}
    private static boolean relationField(String kind,String field){return kind.equals("jobs")&&Set.of("cities","graduationYears").contains(field)||kind.equals("questions")&&field.equals("companyIds");}
    private void validateRelations(String kind,String id,Map<String,Object> body){
        if(body.get("companyId")!=null)exists("companies",body.get("companyId"));if(body.get("sourceId")!=null)exists("sources",body.get("sourceId"));if(body.get("chapterId")!=null)exists("chapters",body.get("chapterId"));
        if(body.get("companyIds") instanceof List<?> companies)for(Object company:companies)exists("companies",company);
        if(kind.equals("chapters")&&body.get("parentId")!=null){String parent=body.get("parentId").toString();Set<String> visited=new HashSet<>();while(parent!=null){if(parent.equals(id)||!visited.add(parent))throw new ApiProblem(422,"VALIDATION_ERROR","章节父级不能形成循环。");var row=r.one("SELECT parent_id FROM chapters WHERE id=:id",map("id",parent),Set.of(),Set.of());parent=(String)row.get("parentId");}}
    }
    private void exists(String table,Object id){if(r.db.queryForObject("SELECT COUNT(*) FROM "+table+" WHERE id=:id",map("id",id),Integer.class)!=1)throw new ApiProblem(404,"NOT_FOUND","引用内容不存在。");}
    private void relations(String kind,String id,Map<String,Object> body){
        if(kind.equals("jobs")){for(String field:List.of("cities","graduationYears"))if(body.get(field) instanceof List<?> values){String table=field.equals("cities")?"job_cities":"job_graduation_years";String column=field.equals("cities")?"city":"graduation_year";r.db.update("DELETE FROM "+table+" WHERE job_id=:id",map("id",id));for(Object value:new LinkedHashSet<>(values))r.db.update("INSERT INTO "+table+"(job_id,"+column+") VALUES(:id,:value)",map("id",id,"value",value));}}
        if(kind.equals("questions")&&body.get("companyIds") instanceof List<?> companies){r.db.update("DELETE FROM question_companies WHERE question_id=:id",map("id",id));for(Object company:new LinkedHashSet<>(companies))r.db.update("INSERT INTO question_companies(id,question_id,company_id,evidence_note,observed_at) VALUES(:id,:question,:company,'管理员人工登记',:now)",map("id",UUID.randomUUID().toString(),"question",id,"company",company,"now",Timestamp.from(clock.instant())));}
    }
    private void validateJob(Map<String,Object> body){try{ZoneId.of(body.get("sourceTimezone").toString());}catch(Exception e){throw new ApiProblem(422,"VALIDATION_ERROR","来源时区无效。");}if(body.get("salary") instanceof Map<?,?> salary&&salary.get("minMinor") instanceof Number min&&salary.get("maxMinor") instanceof Number max&&min.longValue()>max.longValue())throw new ApiProblem(422,"VALIDATION_ERROR","薪资下限不能大于上限。");}
    private static String searchText(Map<String,Object> body){return body.get("title")+" "+body.get("role")+" "+body.get("descriptionMd")+" "+body.get("skills")+" "+body.get("cities");}
    private static String urlHash(String value){try{var uri=URI.create(value.trim()).normalize();if(uri.getUserInfo()!=null)throw new IllegalArgumentException();String scheme=uri.getScheme().toLowerCase(Locale.ROOT);int port=uri.getPort();if(scheme.equals("https")&&port==443||scheme.equals("http")&&port==80)port=-1;String path=uri.getPath();String normalized=new URI(scheme,null,uri.getHost().toLowerCase(Locale.ROOT),port,path==null||path.isEmpty()?"/":path,uri.getQuery(),null).toASCIIString();return AccountService.hash(normalized);}catch(Exception e){throw new ApiProblem(422,"VALIDATION_ERROR","岗位来源链接无效。");}}
    private static String type(String kind){return switch(kind){case "experiences"->"EXPERIENCE";case "companies"->"COMPANY";case "sources"->"SOURCE";case "questions"->"QUESTION";case "chapters"->"CHAPTER";case "signals"->"SIGNAL";case "jobs"->"JOB";default->throw new IllegalArgumentException();};}
    record Target(String table,String status,String title,String condition,boolean publishedAt){}
    private static final Map<String,Target> TARGETS=Map.ofEntries(
        Map.entry("JOB",new Target("jobs","publication_status","title","1=1",true)),Map.entry("EXPERIENCE",new Target("experiences","status","title","(author_id IS NULL OR status IN ('PENDING','PUBLISHED','HIDDEN','REJECTED'))",true)),Map.entry("QUESTION",new Target("questions","status","title","1=1",false)),Map.entry("CHAPTER",new Target("chapters","status","title","1=1",false)),Map.entry("POST",new Target("posts","status","body_md","1=1",true)),Map.entry("EXPERIENCE_COMMENT",new Target("comments","status","body","experience_id IS NOT NULL",false)),Map.entry("POST_COMMENT",new Target("comments","status","body","post_id IS NOT NULL",false)),Map.entry("REFERRAL",new Target("referrals","status","title","1=1",false)),Map.entry("SALARY",new Target("salary_reports","status","role","1=1",false)),Map.entry("SIGNAL",new Target("radar_signals","status","title","1=1",false)));
    private Target target(String type){var target=TARGETS.get(type);if(target==null)throw new ApiProblem(422,"VALIDATION_ERROR","审核目标类型无效。");return target;}
    private Map<String,Object> item(String type,String id){var target=target(type);return r.one("SELECT id,:type AS type,LEFT("+target.title()+",200) AS title,"+target.status()+" AS status,version,updated_at AS submitted_at FROM "+target.table()+" WHERE id=:id AND "+target.condition(),map("id",id,"type",type),Set.of(),Set.of());}
    public Map<String,Object> detail(String actor,String type,String id){
        role(actor,false);var item=item(type,id);Map<String,Object> content=switch(type){
            case "JOB"->read("jobs",id);case "QUESTION"->read("questions",id);case "CHAPTER"->read("chapters",id);case "SIGNAL"->read("signals",id);
            case "EXPERIENCE"->r.one("SELECT "+BASE+"company_id,title,summary,body_md,role,round_type,occurred_on,tags,author_id,status,source_url,content_mode,license_note FROM experiences WHERE id=:id",map("id",id),Set.of("tags"),Set.of());
            case "POST"->{var post=r.one("SELECT "+BASE+"body_md,tags,author_id,status FROM posts WHERE id=:id",map("id",id),Set.of("tags"),Set.of());post.put("likeCount",r.db.queryForObject("SELECT COUNT(*) FROM post_likes WHERE post_id=:id",map("id",id),Integer.class));post.put("commentCount",r.db.queryForObject("SELECT COUNT(*) FROM comments WHERE post_id=:id AND status='PUBLISHED'",map("id",id),Integer.class));post.put("likedByMe",r.db.queryForObject("SELECT COUNT(*) FROM post_likes WHERE post_id=:id AND user_id=:u",map("id",id,"u",actor),Integer.class)>0);yield post;}
            case "EXPERIENCE_COMMENT","POST_COMMENT"->r.one("SELECT "+BASE+"author_id,body,status,parent_id FROM comments WHERE id=:id AND "+target(type).condition(),map("id",id),Set.of(),Set.of());
            case "REFERRAL"->r.one("SELECT f.id,f.version,f.created_at,f.updated_at,f.company_id,f.job_id,f.title,f.description,f.expires_at,f.provider_id,f.status,CASE WHEN u.status='ACTIVE' AND u.provider_verified=1 AND u.provider_verified_until>:now THEN 1 ELSE 0 END AS provider_verified FROM referrals f JOIN users u ON u.id=f.provider_id WHERE f.id=:id",map("id",id,"now",Timestamp.from(clock.instant())),Set.of(),Set.of("provider_verified"));
            case "SALARY"->r.one("SELECT "+BASE+"company_id,role,city,year,base_monthly_minor,salary_months,bonus_minor,source_note,verification,status FROM salary_reports WHERE id=:id",map("id",id),Set.of(),Set.of());
            default->throw new ApiProblem(422,"VALIDATION_ERROR","审核目标类型无效。");
        };return map("item",item,"content",content);
    }
    private void reviewTarget(String type){target(type);if(type.endsWith("_COMMENT"))throw new ApiProblem(422,"VALIDATION_ERROR","评论直接发布，无需审核；请在评论管理中处理。");}
    public List<Map<String,Object>> comments(String actor,int page,int size){
        role(actor,true);paging(page,size);
        return r.query("SELECT "+BASE+"author_id,post_id,experience_id,parent_id,body,status,CASE WHEN post_id IS NOT NULL THEN 'POST_COMMENT' ELSE 'EXPERIENCE_COMMENT' END type,CASE WHEN body='' THEN '已撤回或删除的评论' ELSE LEFT(body,200) END title FROM comments WHERE status IN ('PUBLISHED','HIDDEN') ORDER BY updated_at DESC,id LIMIT :size OFFSET :offset",map("size",size,"offset",(page-1)*size));
    }
    public long commentCount(String actor){role(actor,true);return r.db.queryForObject("SELECT COUNT(*) FROM comments WHERE status IN ('PUBLISHED','HIDDEN')",Map.of(),Long.class);}
    public void removeComment(String actor,String id,Map<String,Object> body){
        role(actor,true);inputs.validate("CommentRemoval",body);String reason=body.get("reason").toString().trim();if(reason.isEmpty())throw new ApiProblem(422,"VALIDATION_ERROR","请填写删除原因。");
        tx.write(actor,"DELETE","/api/v1/admin/comments/"+id,null,body,204,false,()->{
            role(actor,true);var old=r.one("SELECT id,version,status,body,post_id FROM comments WHERE id=:id FOR UPDATE",map("id",id),Set.of(),Set.of());version(old.get("version"),body.get("version"));
            if("HIDDEN".equals(old.get("status"))&&"".equals(old.get("body")))throw new ApiProblem(409,"INVALID_STATE","评论已撤回或删除。");
            if(r.db.update("UPDATE comments SET body='',status='HIDDEN',version=version+1,updated_at=:now WHERE id=:id AND version=:version",map("id",id,"version",body.get("version"),"now",Timestamp.from(clock.instant())))!=1)throw conflict();
            audit(actor,"COMMENT_DELETE",old.get("postId")!=null?"POST_COMMENT":"EXPERIENCE_COMMENT",id,reason,map("from",old.get("status"),"to","HIDDEN","bodyErased",true));return null;
        });
    }
    private String queueSql(){var branches=new ArrayList<String>();for(var entry:TARGETS.entrySet()){if(entry.getKey().endsWith("_COMMENT"))continue;var target=entry.getValue();branches.add("SELECT id,'"+entry.getKey()+"' AS type,LEFT("+target.title()+",200) AS title,"+target.status()+" AS status,version,updated_at AS submitted_at FROM "+target.table()+" WHERE "+target.status()+"='PENDING' AND "+target.condition());}return String.join(" UNION ALL ",branches);}
    public List<Map<String,Object>> moderation(String actor,int page,int size){return moderation(actor,null,page,size);}
    public List<Map<String,Object>> moderation(String actor,String type,int page,int size){
        role(actor,false);paging(page,size);if(type!=null)reviewTarget(type);
        return r.query("SELECT * FROM ("+queueSql()+") pending"+(type==null?"":" WHERE type=:type")+" ORDER BY submitted_at,id,type LIMIT :size OFFSET :offset",map("type",type,"size",size,"offset",(page-1)*size));
    }
    public long moderationCount(String actor){return moderationCount(actor,null);}
    public long moderationCount(String actor,String type){role(actor,false);if(type!=null)reviewTarget(type);return r.db.queryForObject("SELECT COUNT(*) FROM ("+queueSql()+") pending"+(type==null?"":" WHERE type=:type"),map("type",type),Long.class);}
    public Object decide(String actor,String type,String id,Map<String,Object> body,String key){role(actor,false);inputs.validate("ModerationDecision",body);var target=target(type);return tx.write(actor,"POST","/api/v1/admin/moderation/"+type+"/"+id+"/decisions",key,body,200,false,()->{
        role(actor,false);var old=item(type,id);version(old.get("version"),body.get("version"));String decision=body.get("decision").toString();if(type.endsWith("_COMMENT")&&!decision.equals("HIDE"))throw new ApiProblem(422,"VALIDATION_ERROR","评论直接发布，无需审核。");String expected=decision.equals("HIDE")?"PUBLISHED":"PENDING";if(!expected.equals(old.get("status")))throw new ApiProblem(409,"INVALID_STATE","当前状态不能执行该审核动作。");String status=switch(decision){case "APPROVE"->"PUBLISHED";case "REJECT"->type.endsWith("_COMMENT")?"HIDDEN":"REJECTED";case "HIDE"->"HIDDEN";default->throw new IllegalArgumentException();};
        String extra=target.publishedAt()&&status.equals("PUBLISHED")?",published_at=:now":"";if(type.equals("SIGNAL"))extra+=status.equals("PUBLISHED")?",confidence='VERIFIED',verified_at=:now":",confidence='UNVERIFIED',verified_at=NULL";
        if(r.db.update("UPDATE "+target.table()+" SET "+target.status()+"=:status,version=version+1,updated_at=:now"+extra+" WHERE id=:id AND version=:v AND "+target.condition(),map("id",id,"v",body.get("version"),"status",status,"now",Timestamp.from(clock.instant())))!=1)throw conflict();
        audit(actor,"MODERATION_"+decision,type,id,body.get("reason").toString(),map("from",old.get("status"),"to",status,"version",body.get("version")));return item(type,id);
    });}
    public List<Map<String,Object>> reports(String actor,int page,int size){role(actor,false);paging(page,size);return r.query("SELECT "+BASE+"target_type,target_id,reason,state FROM content_reports ORDER BY CASE WHEN state='OPEN' THEN 0 ELSE 1 END,created_at,id LIMIT :size OFFSET :offset",map("size",size,"offset",(page-1)*size));}
    public long reportCount(String actor){role(actor,false);return r.db.queryForObject("SELECT COUNT(*) FROM content_reports",Map.of(),Long.class);}
    public Object reportDecision(String actor,String id,Map<String,Object> body){role(actor,false);inputs.validate("ReportDecision",body);return tx.write(actor,"PATCH","/api/v1/admin/reports/"+id,null,body,200,false,()->{
        role(actor,false);var old=r.one("SELECT "+BASE+"target_type,target_id,reason,state FROM content_reports WHERE id=:id",map("id",id),Set.of(),Set.of());version(old.get("version"),body.get("version"));if(!old.get("state").equals("OPEN"))throw new ApiProblem(409,"INVALID_STATE","举报已处理。");if(r.db.update("UPDATE content_reports SET state=:state,reviewer_id=:actor,decision_note=:note,version=version+1,updated_at=:now WHERE id=:id AND version=:v",map("id",id,"v",body.get("version"),"state",body.get("state"),"actor",actor,"note",body.get("reason"),"now",Timestamp.from(clock.instant())))!=1)throw conflict();audit(actor,"REPORT_DECISION","REPORT",id,body.get("reason").toString(),map("state",body.get("state")));return r.one("SELECT "+BASE+"target_type,target_id,reason,state FROM content_reports WHERE id=:id",map("id",id),Set.of(),Set.of());
    });}
    public List<Map<String,Object>> auditLogs(String actor,int page,int size){role(actor,true);paging(page,size);return r.query("SELECT id,1 AS version,created_at,updated_at,actor_id,action,target_type,target_id,reason,request_id FROM audit_logs ORDER BY created_at DESC,id DESC LIMIT :size OFFSET :offset",map("size",size,"offset",(page-1)*size));}
    public long auditCount(String actor){role(actor,true);return r.db.queryForObject("SELECT COUNT(*) FROM audit_logs",Map.of(),Long.class);}
    public Object certify(String actor,String id,Map<String,Object> body){role(actor,true);inputs.validate("ProviderDecision",body);boolean verified=Boolean.TRUE.equals(body.get("verified"));Instant until=body.get("validUntil")==null?null:OffsetDateTime.parse(body.get("validUntil").toString()).toInstant();if(verified&&(until==null||!until.isAfter(clock.instant())))throw new ApiProblem(422,"VALIDATION_ERROR","认证有效期须为未来时间。");return tx.write(actor,"PUT","/api/v1/admin/users/"+id+"/provider-certification",null,body,200,false,()->{
        role(actor,true);var target=r.one("SELECT version,status FROM users WHERE id=:id FOR UPDATE",map("id",id),Set.of(),Set.of());version(target.get("version"),body.get("version"));if(!target.get("status").equals("ACTIVE"))throw new ApiProblem(409,"INVALID_STATE","只能核验有效账号。");r.db.update("UPDATE users SET provider_verified=:verified,provider_verified_until=:until,version=version+1 WHERE id=:id AND version=:v",map("id",id,"v",body.get("version"),"verified",verified,"until",verified?Timestamp.from(until):null));String note=body.get("evidenceNote").toString();audit(actor,verified?"PROVIDER_VERIFY":"PROVIDER_REVOKE","USER",id,note.substring(0,Math.min(1000,note.length())),map("verified",verified,"validUntil",verified?until.toString():null));return accounts.view(accounts.find(id));
    });}
    private void audit(String actor,String action,String target,String id,String reason,Map<String,Object> summary){r.db.update("INSERT INTO audit_logs(id,actor_id,action,target_type,target_id,reason,request_id,change_summary) VALUES(:id,:actor,:action,:type,:target,:reason,:request,:summary)",map("id",UUID.randomUUID().toString(),"actor",actor,"action",action,"type",target,"target",id,"reason",reason,"request",UUID.randomUUID().toString(),"summary",r.json.writeValueAsString(summary)));}
    private static void version(Object actual,Object expected){if(((Number)actual).intValue()!=((Number)expected).intValue())throw conflict();}
    private static ApiProblem conflict(){return new ApiProblem(409,"VERSION_CONFLICT","内容已更新，请重新加载后重试。");}
}
