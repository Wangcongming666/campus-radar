package com.campusradar.notification;

import com.campusradar.common.*;
import com.campusradar.task.TaskService;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import java.util.function.Consumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import static com.campusradar.common.SqlRows.map;

/** Bounded polling only discovers work; mutations retain the same owner locks as API writes. */
@Component
public class NotificationSchedules {
    private static final Logger log=LoggerFactory.getLogger(NotificationSchedules.class);
    private static final String REMINDER_CONSUMER="campus.reminders";
    private static final int BATCH_SIZE=100,MAX_BATCHES=5;
    private final SqlRows rows;private final OwnerTransactions owners;private final TaskService tasks;private final Clock clock;private final long scanInterval;
    private final Map<String,String> cursors=new HashMap<>();
    public NotificationSchedules(SqlRows rows,OwnerTransactions owners,TaskService tasks,Clock clock,@Value("${campus.schedule.subscription-interval-ms:900000}")long scanInterval) {
        if(scanInterval<1000)throw new IllegalArgumentException("Subscription interval must be at least one second");
        this.rows=rows;this.owners=owners;this.tasks=tasks;this.clock=clock;this.scanInterval=scanInterval;
    }
    @Scheduled(fixedDelayString="${campus.schedule.notification-poll-ms:60000}",initialDelayString="${campus.schedule.notification-initial-delay-ms:5000}") public synchronized void poll() {
        Instant now=clock.instant();
        try { reminders("plan_tasks","due_at","PLANNER",now); } catch(org.springframework.dao.DataAccessException e) { deferred(e); }
        try { reminders("calendar_events","starts_at","INTERVIEW",now); } catch(org.springframework.dao.DataAccessException e) { deferred(e); }
        try { subscriptions(now); } catch(org.springframework.dao.DataAccessException e) { deferred(e); }
    }
    private void page(String stream,String query,Map<String,Object> parameters,Consumer<Map<String,Object>> action) {
        String cursor=cursors.getOrDefault(stream,"");
        for(int batch=0;batch<MAX_BATCHES;batch++) {
            parameters.put("cursor",cursor);parameters.put("limit",BATCH_SIZE);
            var candidates=rows.query(query,parameters);
            for(var candidate:candidates) {
                cursor=candidate.get("id").toString();
                try { action.accept(candidate); }
                catch(ApiProblem e) { if(e.status()!=401&&e.status()!=409)deferred(e); }
                catch(RuntimeException e) { deferred(e); }
            }
            if(candidates.size()<BATCH_SIZE){cursors.remove(stream);return;}
        }
        // Resume the next bounded sweep after this batch so already-delivered reminders cannot starve later IDs.
        cursors.put(stream,cursor);
    }
    private void reminders(String table,String dueColumn,String type,Instant now) {
        String statuses=type.equals("PLANNER")?"('TODO','DOING')":"('SCHEDULED')";
        var parameters=map("earliest",Timestamp.from(now.minusSeconds(300)),"latest",Timestamp.from(now.plusSeconds(60)));
        String predicate="r.status IN "+statuses+" AND r."+dueColumn+">=:earliest AND r."+dueColumn+"<=:latest";
        page(table,"SELECT r.id,r.user_id,r.version,r."+dueColumn+" AS reminder_at FROM "+table+" r JOIN users u ON u.id=r.user_id WHERE u.status='ACTIVE' AND u.data_operation='IDLE' AND "+predicate+" AND r.id>:cursor ORDER BY r.id LIMIT :limit",parameters,candidate->{
            String user=candidate.get("userId").toString();
            owners.write(user,"POST","/scheduler/reminders",null,Map.of(),200,false,()->{
                Instant checkNow=clock.instant();
                var current=rows.query("SELECT r.id,r.version,r.title,r."+dueColumn+" AS reminder_at FROM "+table+" r WHERE r.user_id=:u AND r.id=:id AND "+predicate,map("u",user,"id",candidate.get("id"),"earliest",Timestamp.from(checkNow.minusSeconds(300)),"latest",Timestamp.from(checkNow.plusSeconds(60))));
                if(current.isEmpty())return null;
                var resource=current.getFirst();
                if(!candidate.get("version").equals(resource.get("version"))||!candidate.get("reminderAt").equals(resource.get("reminderAt")))return null;
                String dedup="reminder:"+type+":"+resource.get("id")+":"+resource.get("version")+":"+resource.get("reminderAt");
                String event=UUID.nameUUIDFromBytes(dedup.getBytes(StandardCharsets.UTF_8)).toString();
                var p=map("consumer",REMINDER_CONSUMER,"event",event,"u",user,"dedup",dedup);
                if(rows.db.queryForObject("SELECT COUNT(*) FROM consumer_inbox WHERE consumer=:consumer AND event_id=:event",p,Integer.class)>0)return null;
                p.put("receipt",UUID.randomUUID().toString());
                rows.db.update("INSERT INTO consumer_inbox(id,consumer,event_id,state) VALUES(:receipt,:consumer,:event,'DONE')",p);
                if(rows.db.queryForObject("SELECT COUNT(*) FROM notifications WHERE user_id=:u AND dedup_key=:dedup",p,Integer.class)>0)return null;
                p.put("id",UUID.randomUUID().toString());p.put("type",type);
                p.put("title",truncate((type.equals("PLANNER")?"任务到期 · ":"日程提醒 · ")+resource.get("title"),200));
                p.put("body","「"+resource.get("title")+"」的提醒时间为 "+resource.get("reminderAt")+"。");
                p.put("path",type.equals("PLANNER")?"/planner":"/calendar");
                rows.db.update("INSERT INTO notifications(id,user_id,type,title,body,target_path,dedup_key) VALUES(:id,:u,:type,:title,:body,:path,:dedup)",p);
                rows.db.update("UPDATE users SET data_revision=data_revision+1 WHERE id=:u",p);
                return null;
            });
        });
    }
    private void subscriptions(Instant now) {
        Instant cutoff=now.minusMillis(scanInterval);
        page("subscriptions","SELECT s.id,s.user_id FROM subscriptions s JOIN users u ON u.id=s.user_id WHERE u.status='ACTIVE' AND u.data_operation='IDLE' AND s.enabled=1 AND (s.last_scanned_at IS NULL OR s.last_scanned_at<=:cutoff) AND s.id>:cursor ORDER BY s.id LIMIT :limit",map("cutoff",Timestamp.from(cutoff)),candidate->{
            String user=candidate.get("userId").toString(),id=candidate.get("id").toString();
            owners.write(user,"POST","/scheduler/subscriptions",null,Map.of(),202,false,()->{
                Instant checkNow=clock.instant();
                var current=rows.query("SELECT id FROM subscriptions WHERE user_id=:u AND id=:id AND enabled=1 AND (last_scanned_at IS NULL OR last_scanned_at<=:cutoff)",map("u",user,"id",id,"cutoff",Timestamp.from(checkNow.minusMillis(scanInterval))));
                if(current.isEmpty())return null;
                var pending=rows.query("SELECT payload FROM tasks WHERE user_id=:u AND type='SUBSCRIPTION_SCAN' AND state IN ('QUEUED','RUNNING','RETRY_WAIT')",map("u",user),Set.of("payload"),Set.of());
                if(pending.stream().anyMatch(task->task.get("payload") instanceof Map<?,?> payload&&id.equals(payload.get("subscriptionId"))))return null;
                String key="scheduled-scan:"+id+":"+Math.floorDiv(checkNow.toEpochMilli(),scanInterval);
                return tasks.enqueue(user,"SUBSCRIPTION_SCAN",map("subscriptionId",id),key);
            });
        });
    }
    private static String truncate(String text,int length) { return new String(text.codePoints().limit(length).toArray(),0,Math.min(length,text.codePointCount(0,text.length()))); }
    private static void deferred(RuntimeException e) { log.warn("Background notification work deferred ({})",e.getClass().getSimpleName()); }
}
