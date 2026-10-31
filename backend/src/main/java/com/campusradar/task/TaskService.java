package com.campusradar.task;

import com.campusradar.common.*;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;
import java.time.*;
import java.sql.Timestamp;
import static com.campusradar.common.SqlRows.map;

@Service
public class TaskService {
    public static final String FIELDS="id,type,state,progress,attempt,result_file_id,error_code,created_at,updated_at";
    private final SqlRows rows;private final Clock clock;
    public TaskService(SqlRows rows,Clock clock){this.rows=rows;this.clock=clock;}
    @Transactional
    public Map<String,Object> enqueue(String user,String type,Map<String,Object> payload,String dedupKey){
        if(!Set.of("SUBSCRIPTION_SCAN","SEND_MAIL","DATA_EXPORT","DATA_IMPORT","USER_ERASURE","FILE_ERASURE").contains(type))throw new ApiProblem(422,"VALIDATION_ERROR","任务类型无效。");
        if(payload.containsKey("taskId")||payload.containsKey("leaseToken"))throw new IllegalArgumentException("Reserved payload field");
        var params=map("id",UUID.randomUUID().toString(),"user",user,"type",type,"payload",rows.json.writeValueAsString(payload),"dedup",dedupKey,"now",Timestamp.from(clock.instant()));
        var old=rows.query("SELECT "+FIELDS+" FROM tasks WHERE dedup_key=:dedup AND user_id=:user",params);
        if(!old.isEmpty())return old.getFirst();
        rows.db.update("INSERT INTO tasks(id,user_id,type,state,payload,dedup_key,next_attempt_at) VALUES(:id,:user,:type,'QUEUED',:payload,:dedup,:now)",params);
        dispatch(params.get("id").toString());return get(user,params.get("id").toString());
    }
    public void dispatch(String taskId){dispatch(taskId,clock.instant());}
    public void dispatch(String taskId,Instant available){var p=map("id",UUID.randomUUID().toString(),"task",taskId,"payload",rows.json.writeValueAsString(Map.of("taskId",taskId)),"now",Timestamp.from(available));rows.db.update("INSERT INTO outbox_events(id,event_type,aggregate_id,routing_key,payload,state,available_at) VALUES(:id,'TASK_DISPATCH',:task,'task.execute',:payload,'PENDING',:now)",p);}
    public Map<String,Object> get(String user,String id){return rows.one("SELECT "+FIELDS+" FROM tasks WHERE id=:id AND user_id=:user",map("id",id,"user",user),Set.of(),Set.of());}
    public List<Map<String,Object>> admin(int page,int size){validatePage(page,size);return rows.query("SELECT "+FIELDS+" FROM tasks ORDER BY created_at DESC,id LIMIT :size OFFSET :offset",map("size",size,"offset",(page-1)*size));}
    public long count(){return rows.db.queryForObject("SELECT COUNT(*) FROM tasks",Map.of(),Long.class);}
    public static void validatePage(int page,int size){if(page<1||page>500||size<1||size>100)throw new ApiProblem(422,"VALIDATION_ERROR","分页参数无效。");}
    @Transactional public Map<String,Object> retry(String id){var p=map("id",id);var tasks=rows.db.queryForList("SELECT * FROM tasks WHERE id=:id FOR UPDATE",p);if(tasks.isEmpty())throw new ApiProblem(404,"NOT_FOUND","任务不存在。");var task=tasks.getFirst();if(!Set.of("FAILED","CANCELLED").contains(task.get("state")))throw new ApiProblem(409,"INVALID_STATE","只有失败或取消的任务可以重试。");String user=Objects.toString(task.get("user_id"),null);if(user==null)throw new ApiProblem(409,"INVALID_STATE","匿名回执任务无法重试。");rows.db.update("UPDATE tasks SET state='QUEUED',attempt=0,progress=0,error_code=NULL,lease_token=NULL,lease_until=NULL,next_attempt_at=CURRENT_TIMESTAMP,version=version+1 WHERE id=:id",p);dispatch(id);return get(user,id);}
}
