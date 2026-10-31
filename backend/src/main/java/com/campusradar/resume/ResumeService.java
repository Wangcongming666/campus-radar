package com.campusradar.resume;

import com.campusradar.common.*;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.time.Clock;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
public class ResumeService {
    private final SqlRows rows;private final OwnerTransactions owners;private final ContractInputs inputs;private final PrivateFileStorage storage;private final Clock clock;
    private static final String FILE_SELECT="SELECT id,version,created_at,updated_at,original_name AS name,purpose,mime_type,size_bytes,sha256,state FROM files";
    private static final String RESUME_SELECT="SELECT id,version,created_at,updated_at,name,file_id,sequence,is_default,text_content AS text,extraction_state FROM resumes";
    public ResumeService(SqlRows rows,OwnerTransactions owners,ContractInputs inputs,PrivateFileStorage storage,Clock clock){this.rows=rows;this.owners=owners;this.inputs=inputs;this.storage=storage;this.clock=clock;}
    public List<Map<String,Object>> files(String user,int page,int size){return rows.query(FILE_SELECT+" WHERE user_id=:u ORDER BY created_at DESC,id DESC LIMIT :size OFFSET :offset",SqlRows.map("u",user,"size",size,"offset",(page-1)*size));}
    public long fileCount(String user){return rows.db.queryForObject("SELECT COUNT(*) FROM files WHERE user_id=:u",Map.of("u",user),Long.class);}
    public List<Map<String,Object>> resumes(String user,int page,int size){return rows.query(RESUME_SELECT+" WHERE user_id=:u ORDER BY sequence DESC LIMIT :size OFFSET :offset",SqlRows.map("u",user,"size",size,"offset",(page-1)*size),Set.of(),Set.of("is_default"));}
    public long resumeCount(String user){return rows.db.queryForObject("SELECT COUNT(*) FROM resumes WHERE user_id=:u",Map.of("u",user),Long.class);}
    public Map<String,Object> resume(String user,String id){return rows.one(RESUME_SELECT+" WHERE user_id=:u AND id=:id",Map.of("u",user,"id",id),Set.of(),Set.of("is_default"));}
    public Object upload(String user,String purpose,String name,String mime,byte[] bytes,String key){
        String verified=FilePolicy.validate(purpose,name,mime,bytes);String sha=PrivateFileStorage.hash(bytes);Path stage=storage.stage(bytes);var created=new AtomicReference<String>();
        try{return owners.write(user,"POST","/api/v1/files",key,SqlRows.map("purpose",purpose,"name",name,"mimeType",verified,"size",bytes.length,"sha256",sha),201,!purpose.equals("BACKUP"),()->{
            String id=UUID.randomUUID().toString();String storageKey=user+"/"+id+".bin";storage.move(stage,storageKey);created.set(storageKey);
            rows.db.update("INSERT INTO files(id,user_id,purpose,original_name,storage_key,mime_type,size_bytes,sha256) VALUES(:id,:u,:purpose,:name,:key,:mime,:size,:hash)",SqlRows.map("id",id,"u",user,"purpose",purpose,"name",name,"key",storageKey,"mime",verified,"size",bytes.length,"hash",sha));
            return rows.one(FILE_SELECT+" WHERE user_id=:u AND id=:id",Map.of("u",user,"id",id),Set.of(),Set.of());
        });}catch(RuntimeException failure){if(created.get()!=null)storage.remove(created.get());throw failure;}finally{storage.discard(stage);}
    }
    public record Download(String name,String mime,String sha,byte[] bytes){}
    public Download download(String user,String id){var file=rows.one("SELECT original_name,mime_type,size_bytes,sha256,storage_key FROM files WHERE user_id=:u AND id=:id AND state='READY' AND (purpose<>'BACKUP' OR expires_at IS NULL OR expires_at>:now)",SqlRows.map("u",user,"id",id,"now",Timestamp.from(clock.instant())),Set.of(),Set.of());return new Download(file.get("originalName").toString(),file.get("mimeType").toString(),file.get("sha256").toString(),storage.read(file.get("storageKey").toString(),((Number)file.get("sizeBytes")).longValue(),file.get("sha256").toString()));}
    public void deleteFile(String user,String id,int version){var metadata=rows.one(FILE_SELECT+" WHERE user_id=:u AND id=:id",Map.of("u",user,"id",id),Set.of(),Set.of());owners.write(user,"DELETE","/api/v1/files/"+id,null,Map.of("version",version),204,!"BACKUP".equals(metadata.get("purpose")),()->{
        var p=SqlRows.map("u",user,"id",id,"v",version);rows.one(FILE_SELECT+" WHERE user_id=:u AND id=:id",p,Set.of(),Set.of());
        int references=0;for(String sql:List.of("SELECT COUNT(*) FROM resumes WHERE user_id=:u AND file_id=:id","SELECT COUNT(*) FROM users WHERE id=:u AND avatar_file_id=:id","SELECT COUNT(*) FROM interview_reviews WHERE user_id=:u AND recording_file_id=:id","SELECT COUNT(*) FROM tasks WHERE user_id=:u AND result_file_id=:id","SELECT COUNT(*) FROM import_previews WHERE user_id=:u AND backup_file_id=:id AND (state='APPLYING' OR (state='VALID' AND expires_at>CURRENT_TIMESTAMP))"))references+=rows.db.queryForObject(sql,p,Integer.class);
        if(references>0)throw new ApiProblem(409,"FILE_IN_USE","文件正在被简历、复盘或任务引用，请先解除关联。");
        if(rows.db.update("UPDATE files SET state='PENDING_DELETE',version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE user_id=:u AND id=:id AND version=:v AND state='READY'",p)!=1)throw conflict();return null;
    });}
    public Object create(String user,Map<String,Object> body,String key){inputs.validate("ResumeInput",body);return owners.write(user,"POST","/api/v1/resumes",key,body,201,true,()->{
        var p=SqlRows.map("u",user,"file",body.get("fileId"));
        rows.one("SELECT id FROM files WHERE user_id=:u AND id=:file AND purpose='RESUME' AND state='READY'",p,Set.of(),Set.of());
        int sequence=rows.db.queryForObject("SELECT COALESCE(MAX(sequence),0)+1 FROM resumes WHERE user_id=:u",p,Integer.class);
        int count=rows.db.queryForObject("SELECT COUNT(*) FROM resumes WHERE user_id=:u",p,Integer.class);
        p.put("id",UUID.randomUUID().toString());p.put("name",body.get("name"));p.put("text",body.get("text"));p.put("extraction",body.get("extractionState"));p.put("sequence",sequence);p.put("default",count==0);
        rows.db.update("INSERT INTO resumes(id,user_id,file_id,name,sequence,is_default,text_content,extraction_state) VALUES(:id,:u,:file,:name,:sequence,:default,:text,:extraction)",p);return resume(user,p.get("id").toString());
    });}
    public Object patch(String user,String id,Map<String,Object> body){inputs.validate("ResumePatch",body);return owners.write(user,"PATCH","/api/v1/resumes/"+id,null,body,200,true,()->{
        var existing=resume(user,id);if(((Number)existing.get("version")).intValue()!=((Number)body.get("version")).intValue())throw conflict();
        var p=SqlRows.map("u",user,"id",id,"v",body.get("version"));
        if(Boolean.TRUE.equals(body.get("isDefault")))rows.db.update("UPDATE resumes SET is_default=0,version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE user_id=:u AND is_default=1 AND id<>:id",p);
        var assignments=new ArrayList<String>();for(String field:List.of("name","text","isDefault"))if(body.containsKey(field)){String column=field.equals("text")?"text_content":SqlRows.snake(field);assignments.add(column+"=:"+field);p.put(field,body.get(field));}
        if(body.containsKey("text")){assignments.add("extraction_state=:extraction");p.put("extraction",body.get("text").toString().isBlank()?"NO_TEXT":"TEXT_READY");}
        if(rows.db.update("UPDATE resumes SET "+String.join(",",assignments)+",version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE user_id=:u AND id=:id AND version=:v",p)!=1)throw conflict();return resume(user,id);
    });}
    public void deleteResume(String user,String id,int version){owners.write(user,"DELETE","/api/v1/resumes/"+id,null,Map.of("version",version),204,true,()->{
        resume(user,id);var p=SqlRows.map("u",user,"id",id,"v",version);
        if(rows.db.queryForObject("SELECT COUNT(*) FROM applications WHERE user_id=:u AND resume_id=:id",p,Integer.class)>0)throw new ApiProblem(409,"FILE_IN_USE","该简历已关联投递，请先解除关联。");
        if(rows.db.update("DELETE FROM resumes WHERE user_id=:u AND id=:id AND version=:v",p)!=1)throw conflict();return null;
    });}
    public Map<String,Object> diff(String user,String base,String compare){var a=resume(user,base);var b=resume(user,compare);var diff=ResumeRules.diff(a.get("text").toString(),b.get("text").toString());return SqlRows.map("baseResumeId",base,"compareResumeId",compare,"addedLines",diff.get("addedLines"),"removedLines",diff.get("removedLines"));}
    public Map<String,Object> diagnose(String user,Map<String,Object> body){inputs.validate("DiagnosisInput",body);var resume=resume(user,body.get("resumeId").toString());List<String> skills=List.of();if(body.get("jobId")!=null){var job=rows.one("SELECT j.skills FROM jobs j JOIN sources s ON s.id=j.source_id WHERE j.id=:id AND j.publication_status='PUBLISHED' AND s.enabled=1",Map.of("id",body.get("jobId")),Set.of("skills"),Set.of());skills=((List<?>)job.get("skills")).stream().map(Object::toString).toList();}return ResumeRules.diagnose(resume.get("text").toString(),skills);}
    @Scheduled(fixedDelayString="${campus.schedule.file-erase-ms:5000}") public void erasePending(){
        var now=Timestamp.from(clock.instant());
        try{for(var file:rows.query("SELECT id,user_id FROM files WHERE state='PENDING_DELETE' OR (purpose='BACKUP' AND state='READY' AND expires_at<=:now) ORDER BY updated_at LIMIT 20",Map.of("now",now))){
            try{owners.write(file.get("userId").toString(),"ERASE","/internal/files/"+file.get("id"),null,Map.of(),204,false,()->{
                var p=SqlRows.map("u",file.get("userId"),"id",file.get("id"),"now",now);
                if(rows.db.queryForObject("SELECT COUNT(*) FROM tasks WHERE user_id=:u AND state IN ('QUEUED','RUNNING','RETRY_WAIT') AND (type='DATA_EXPORT' OR result_file_id=:id)",p,Integer.class)>0)return null;
                if(rows.db.queryForObject("SELECT COUNT(*) FROM import_previews WHERE user_id=:u AND backup_file_id=:id AND (state='APPLYING' OR (state='VALID' AND expires_at>:now))",p,Integer.class)>0)return null;
                rows.db.update("UPDATE files SET state='PENDING_DELETE',version=version+1,updated_at=:now WHERE user_id=:u AND id=:id AND purpose='BACKUP' AND state='READY' AND expires_at<=:now",p);
                var current=rows.query("SELECT storage_key FROM files WHERE user_id=:u AND id=:id AND state='PENDING_DELETE'",p);
                if(!current.isEmpty()){
                    rows.db.update("DELETE FROM import_previews WHERE user_id=:u AND backup_file_id=:id AND state<>'APPLYING' AND (state<>'VALID' OR expires_at<=:now)",p);
                    storage.remove(current.getFirst().get("storageKey").toString());
                    rows.db.update("DELETE FROM files WHERE user_id=:u AND id=:id AND state='PENDING_DELETE'",p);
                }return null;
            });}catch(ApiProblem ignored){/* Keep pending metadata on volume failure or owner data lock. */}
        }}catch(org.springframework.dao.DataAccessException ignored){/* Migration or database may be starting; retry next poll. */}
    }
    private static ApiProblem conflict(){return new ApiProblem(409,"VERSION_CONFLICT","记录已变更，请刷新后重试。");}
}
