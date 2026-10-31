package com.campusradar.task;

import com.campusradar.common.*;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import java.util.*;
import java.time.*;
import java.sql.Timestamp;
import static com.campusradar.common.SqlRows.map;

@Component
public class TaskExecutor {
    private final SqlRows r;private final TaskService tasks;private final List<TaskHandler> handlers;private final TransactionTemplate tx;private final Clock clock;
    public TaskExecutor(SqlRows r,TaskService tasks,List<TaskHandler> handlers,PlatformTransactionManager manager,Clock clock){this.r=r;this.tasks=tasks;this.handlers=handlers;tx=new TransactionTemplate(manager);this.clock=clock;}
    public void accept(String eventId,String taskId){
        Map<String,Object> task=tx.execute(state->{
            var p=map("id",taskId,"event",eventId,"now",Timestamp.from(clock.instant()));var matches=r.db.queryForList("SELECT * FROM tasks WHERE id=:id FOR UPDATE",p);if(matches.isEmpty())return null;var row=matches.getFirst();String status=row.get("state").toString();if(Set.of("SUCCEEDED","FAILED","CANCELLED").contains(status))return null;
            if(status.equals("RUNNING")&&instant(row.get("lease_until")).isAfter(clock.instant()))return null;
            if(status.equals("RETRY_WAIT")&&instant(row.get("next_attempt_at")).isAfter(clock.instant()))return null;
            if(((Number)row.get("attempt")).intValue()>=((Number)row.get("max_attempts")).intValue())return null;
            var inbox=r.db.queryForList("SELECT state FROM consumer_inbox WHERE consumer='campus.tasks' AND event_id=:event",p);if(!inbox.isEmpty()&&"DONE".equals(inbox.getFirst().get("state")))return null;
            String lease=UUID.randomUUID().toString();p.put("lease",lease);p.put("until",Timestamp.from(clock.instant().plusSeconds(300)));
            r.db.update("UPDATE tasks SET state='RUNNING',attempt=attempt+1,progress=10,lease_token=:lease,lease_until=:until,version=version+1 WHERE id=:id",p);
            if(inbox.isEmpty()){p.put("inbox",UUID.randomUUID().toString());r.db.update("INSERT INTO consumer_inbox(id,consumer,event_id,state,lease_token,lease_until) VALUES(:inbox,'campus.tasks',:event,'RUNNING',:lease,:until)",p);}else r.db.update("UPDATE consumer_inbox SET state='RUNNING',lease_token=:lease,lease_until=:until,version=version+1 WHERE consumer='campus.tasks' AND event_id=:event",p);
            row.put("lease_token",lease);row.put("attempt",((Number)row.get("attempt")).intValue()+1);return row;
        });
        if(task==null)return;
        String lease=task.get("lease_token").toString(),type=task.get("type").toString(),user=Objects.toString(task.get("user_id"),null);String file=null,error=null;
        var payload=new LinkedHashMap<String,Object>();
        try {
            @SuppressWarnings("unchecked") var saved=(Map<String,Object>)r.parse(task.get("payload").toString());payload.putAll(saved);payload.put("taskId",taskId);payload.put("leaseToken",lease);
            TaskHandler handler=handlers.stream().filter(h->h.supports(type)).findFirst().orElseThrow(()->new ApiProblem(503,"HANDLER_UNAVAILABLE","任务处理器暂不可用。"));
            file=handler.execute(type,user,payload);
        } catch(Exception e){error=e instanceof ApiProblem p?p.code():"TASK_FAILED";}
        final String result=file,failure=error;
        tx.executeWithoutResult(state->{if(user!=null)r.db.queryForList("SELECT id FROM users WHERE id=:u FOR UPDATE",Map.of("u",user));var p=map("id",taskId,"lease",lease,"event",eventId,"file",result,"error",failure);var current=r.db.queryForList("SELECT lease_token FROM tasks WHERE id=:id FOR UPDATE",p);if(current.isEmpty()||!lease.equals(current.getFirst().get("lease_token")))return;
            if(failure==null)r.db.update("UPDATE tasks SET state='SUCCEEDED',progress=100,result_file_id=:file,error_code=NULL,lease_token=NULL,lease_until=NULL,version=version+1 WHERE id=:id AND lease_token=:lease",p);
            else {int attempt=((Number)task.get("attempt")).intValue();boolean exhausted=attempt>=((Number)task.get("max_attempts")).intValue();if(exhausted)terminalFailure(type,user,payload);Instant due=clock.instant().plusSeconds(Math.min(3600,5L*(1L<<Math.min(attempt,8))));p.put("state",exhausted?"FAILED":"RETRY_WAIT");p.put("due",Timestamp.from(due));r.db.update("UPDATE tasks SET state=:state,error_code=:error,next_attempt_at=:due,lease_token=NULL,lease_until=NULL,version=version+1 WHERE id=:id AND lease_token=:lease",p);if(!exhausted)tasks.dispatch(taskId,due);else if(user!=null)r.db.update("UPDATE users SET data_operation='IDLE' WHERE id=:u AND status='ACTIVE'",Map.of("u",user));}
            r.db.update("UPDATE consumer_inbox SET state='DONE',lease_token=NULL,lease_until=NULL,version=version+1 WHERE consumer='campus.tasks' AND event_id=:event AND lease_token=:lease",p);
        });
    }
    private void terminalFailure(String type,String user,Map<String,Object> payload){handlers.stream().filter(h->h.supports(type)).findFirst().ifPresent(h->h.onTerminalFailure(type,user,payload));}
    @Scheduled(fixedDelayString="${campus.schedule.task-recovery-ms:15000}") public void recover(){
        try {
            var candidates=r.db.queryForList("SELECT id,user_id FROM tasks WHERE (state='RUNNING' AND lease_until<:now) OR (state IN ('QUEUED','RETRY_WAIT') AND next_attempt_at<=:now AND updated_at<:cutoff) ORDER BY updated_at LIMIT 20",map("now",Timestamp.from(clock.instant()),"cutoff",Timestamp.from(clock.instant().minusSeconds(60))));
            for(var candidate:candidates)tx.executeWithoutResult(state->{
                String user=Objects.toString(candidate.get("user_id"),null);if(user!=null)r.db.queryForList("SELECT id FROM users WHERE id=:u FOR UPDATE",Map.of("u",user));
                var rows=r.db.queryForList("SELECT * FROM tasks WHERE id=:id FOR UPDATE",map("id",candidate.get("id")));if(rows.isEmpty())return;var task=rows.getFirst();String status=task.get("state").toString();boolean expired=status.equals("RUNNING")&&instant(task.get("lease_until")).isBefore(clock.instant());boolean lost=Set.of("QUEUED","RETRY_WAIT").contains(status)&&instant(task.get("updated_at")).isBefore(clock.instant().minusSeconds(60))&&!instant(task.get("next_attempt_at")).isAfter(clock.instant());if(!expired&&!lost)return;
                if(lost&&r.db.queryForObject("SELECT COUNT(*) FROM outbox_events WHERE aggregate_id=:id AND event_type='TASK_DISPATCH' AND state IN ('PENDING','SENDING')",map("id",task.get("id")),Long.class)>0)return;
                if(((Number)task.get("attempt")).intValue()>=((Number)task.get("max_attempts")).intValue()){
                    @SuppressWarnings("unchecked") var payload=new LinkedHashMap<String,Object>((Map<String,Object>)r.parse(task.get("payload").toString()));payload.put("taskId",task.get("id"));payload.put("leaseToken",task.get("lease_token"));
                    terminalFailure(task.get("type").toString(),user,payload);
                    r.db.update("UPDATE tasks SET state='FAILED',error_code='LEASE_EXHAUSTED',lease_token=NULL,lease_until=NULL,version=version+1 WHERE id=:id",map("id",task.get("id")));
                    if(user!=null)r.db.update("UPDATE users SET data_operation='IDLE' WHERE id=:u AND status='ACTIVE'",Map.of("u",user));
                }else {r.db.update("UPDATE tasks SET state='QUEUED',lease_token=NULL,lease_until=NULL,updated_at=:now WHERE id=:id",map("id",task.get("id"),"now",Timestamp.from(clock.instant())));tasks.dispatch(task.get("id").toString());}
            });
        }catch(org.springframework.dao.DataAccessException ignored){}
    }
    static Instant instant(Object value){if(value==null)return Instant.EPOCH;if(value instanceof Timestamp t)return t.toInstant();if(value instanceof LocalDateTime t)return t.toInstant(ZoneOffset.UTC);return Instant.parse(value.toString());}
}
