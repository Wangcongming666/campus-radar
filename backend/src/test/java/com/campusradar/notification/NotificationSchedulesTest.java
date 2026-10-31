package com.campusradar.notification;

import com.campusradar.common.*;
import com.campusradar.task.TaskService;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.*;
import tools.jackson.databind.json.JsonMapper;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import java.util.function.Supplier;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

class NotificationSchedulesTest {
    JdbcTemplate db; SqlRows rows; OwnerTransactions owners; TaskService tasks; NotificationSchedules schedules;
    MutableClock clock = new MutableClock(Instant.parse("2026-10-29T06:00:00Z"));
    DriverManagerDataSource ds;
    @BeforeEach void setup() {
        ds = new DriverManagerDataSource("jdbc:h2:mem:schedules;MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", "");
        db = new JdbcTemplate(ds); db.execute("DROP ALL OBJECTS");
        db.execute("CREATE TABLE users(id VARCHAR PRIMARY KEY,status VARCHAR,data_operation VARCHAR,data_revision INT DEFAULT 0)");
        db.update("INSERT INTO users(id,status,data_operation) VALUES('u1','ACTIVE','IDLE'),('u2','ACTIVE','EXPORTING'),('u3','DISABLED','IDLE'),('u4','ACTIVE','IDLE')");
        String base = ",version INT DEFAULT 1,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP";
        db.execute("CREATE TABLE plan_tasks(id VARCHAR PRIMARY KEY,user_id VARCHAR,title VARCHAR,status VARCHAR,due_at TIMESTAMP" + base + ")");
        db.execute("CREATE TABLE calendar_events(id VARCHAR PRIMARY KEY,user_id VARCHAR,title VARCHAR,status VARCHAR,kind VARCHAR,starts_at TIMESTAMP" + base + ")");
        db.execute("CREATE TABLE notifications(id VARCHAR PRIMARY KEY,user_id VARCHAR,type VARCHAR,title VARCHAR,body VARCHAR,target_path VARCHAR,read_at TIMESTAMP,dedup_key VARCHAR" + base + ",UNIQUE(user_id,dedup_key))");
        db.execute("CREATE TABLE consumer_inbox(id VARCHAR PRIMARY KEY,consumer VARCHAR,event_id VARCHAR,state VARCHAR" + base + ",UNIQUE(consumer,event_id))");
        db.execute("CREATE TABLE subscriptions(id VARCHAR PRIMARY KEY,user_id VARCHAR,enabled BOOLEAN,last_scanned_at TIMESTAMP" + base + ")");
        db.execute("CREATE TABLE tasks(id VARCHAR PRIMARY KEY,user_id VARCHAR,type VARCHAR,state VARCHAR,payload VARCHAR,dedup_key VARCHAR UNIQUE,next_attempt_at TIMESTAMP,progress INT DEFAULT 0,attempt INT DEFAULT 0,result_file_id VARCHAR,error_code VARCHAR" + base + ")");
        db.execute("CREATE TABLE outbox_events(id VARCHAR PRIMARY KEY,event_type VARCHAR,aggregate_id VARCHAR,routing_key VARCHAR,payload VARCHAR,state VARCHAR,available_at TIMESTAMP)");
        rows = new SqlRows(new NamedParameterJdbcTemplate(ds), JsonMapper.builder().build());
        owners = new OwnerTransactions(rows, new DataSourceTransactionManager(ds)); tasks = new TaskService(rows, clock);
        schedules = new NotificationSchedules(rows, owners, tasks, clock, 900000);
    }
    void plan(String id,String user,String status,Instant due) { db.update("INSERT INTO plan_tasks(id,user_id,title,status,due_at) VALUES(?,?,?,?,?)", id,user,"准备任务",status,Timestamp.from(due)); }
    void calendar(String id,String user,String status,Instant due) { db.update("INSERT INTO calendar_events(id,user_id,title,status,kind,starts_at) VALUES(?,?,?,?,'INTERVIEW',?)",id,user,"技术面试",status,Timestamp.from(due)); }
    int count(String table) { return db.queryForObject("SELECT COUNT(*) FROM " + table,Integer.class); }

    @Test void remindersPersistOnceAndDeletingNotificationDoesNotReplayReceipt() {
        plan("plan","u1","TODO",clock.instant()); calendar("event","u1","SCHEDULED",clock.instant().plusSeconds(30));
        schedules.poll(); schedules.poll();
        assertEquals(2,count("notifications")); assertEquals(2,count("consumer_inbox"));
        assertEquals(Set.of("PLANNER","INTERVIEW"),new HashSet<>(db.queryForList("SELECT type FROM notifications",String.class)));
        assertEquals(Set.of("/planner","/calendar"),new HashSet<>(db.queryForList("SELECT target_path FROM notifications",String.class)));
        assertEquals(2,db.queryForObject("SELECT data_revision FROM users WHERE id='u1'",Integer.class));
        db.update("DELETE FROM notifications"); schedules.poll(); assertEquals(0,count("notifications"));
        db.update("UPDATE plan_tasks SET version=2,title='修改后的任务' WHERE id='plan'"); schedules.poll();
        assertEquals(1,count("notifications")); assertEquals(3,count("consumer_inbox"));
        assertTrue(db.queryForObject("SELECT title FROM notifications",String.class).contains("修改后的任务"));
    }
    @Test void completedCancelledExpiredFutureAndFrozenOwnersAreSkipped() {
        plan("done","u1","DONE",clock.instant()); plan("frozen","u2","TODO",clock.instant()); plan("inactive","u3","TODO",clock.instant());
        plan("old","u1","TODO",clock.instant().minusSeconds(301)); plan("later","u1","TODO",clock.instant().plusSeconds(61));
        calendar("cancelled","u1","CANCELLED",clock.instant()); calendar("completed","u1","COMPLETED",clock.instant());
        schedules.poll(); assertEquals(0,count("notifications")); assertEquals(0,count("consumer_inbox"));
    }
    @Test void currentResourceIsRecheckedAfterOwnerLockAndRacingFreezeDoesNotAbortOtherUsers() {
        plan("stale","u1","TODO",clock.instant()); plan("valid","u4","DOING",clock.instant());
        var racing = new OwnerTransactions(rows,new DataSourceTransactionManager(ds)) {
            @Override public Object write(String user,String method,String route,String key,Object body,int status,boolean revision,Supplier<Object> action) {
                if(user.equals("u1")) db.update("UPDATE plan_tasks SET status='DONE',version=2 WHERE id='stale'");
                return super.write(user,method,route,key,body,status,revision,action);
            }
        };
        new NotificationSchedules(rows,racing,tasks,clock,900000).poll();
        assertEquals(1,count("notifications")); assertEquals("u4",db.queryForObject("SELECT user_id FROM notifications",String.class));
        db.update("DELETE FROM notifications"); db.update("DELETE FROM consumer_inbox"); db.update("UPDATE plan_tasks SET status='TODO',version=3 WHERE id='stale'");
        var freezing = new OwnerTransactions(rows,new DataSourceTransactionManager(ds)) {
            @Override public Object write(String user,String method,String route,String key,Object body,int status,boolean revision,Supplier<Object> action) {
                if(user.equals("u1")) db.update("UPDATE users SET data_operation='IMPORTING' WHERE id='u1'");
                return super.write(user,method,route,key,body,status,revision,action);
            }
        };
        assertDoesNotThrow(()->new NotificationSchedules(rows,freezing,tasks,clock,900000).poll());
        assertEquals(1,count("notifications")); assertEquals("u4",db.queryForObject("SELECT user_id FROM notifications",String.class));
    }
    @Test void automaticSubscriptionsEnqueueOnceRespectWatermarkAndNeverDuplicateInflightWork() {
        db.update("INSERT INTO subscriptions(id,user_id,enabled) VALUES('s1','u1',true),('disabled','u1',false),('locked','u2',true),('inactive','u3',true)");
        schedules.poll(); schedules.poll(); assertEquals(1,count("tasks")); assertEquals(1,count("outbox_events"));
        assertEquals("SUBSCRIPTION_SCAN",db.queryForObject("SELECT type FROM tasks",String.class));
        for(String state:List.of("QUEUED","RUNNING","RETRY_WAIT")) { db.update("UPDATE tasks SET state=?",state); clock.advance(Duration.ofMinutes(16)); schedules.poll(); assertEquals(1,count("tasks")); }
        db.update("UPDATE tasks SET state='SUCCEEDED'"); db.update("UPDATE subscriptions SET last_scanned_at=? WHERE id='s1'",Timestamp.from(clock.instant()));
        schedules.poll(); assertEquals(1,count("tasks")); clock.advance(Duration.ofMinutes(16)); schedules.poll(); assertEquals(2,count("tasks"));
    }
    @Test void reminderReceiptRollsBackWithNotificationAndNextPollRetries() {
        plan("retry","u1","TODO",clock.instant());
        db.execute("ALTER TABLE notifications ADD CONSTRAINT reject_notice CHECK (type='SYSTEM')");
        assertDoesNotThrow(schedules::poll); assertEquals(0,count("consumer_inbox")); assertEquals(0,count("notifications"));
        db.execute("ALTER TABLE notifications DROP CONSTRAINT reject_notice"); schedules.poll();
        assertEquals(1,count("consumer_inbox")); assertEquals(1,count("notifications"));
    }
    @Test void boundedPagesResumeNextPollInsteadOfStarvingLaterResources() {
        for(int i=0;i<501;i++)plan(String.format("plan-%04d",i),"u1","TODO",clock.instant());
        schedules.poll(); assertEquals(500,count("notifications"));
        schedules.poll(); assertEquals(501,count("notifications"));
    }
    @Test void reminderThatExpiresWhileWaitingForOwnerLockIsNotDeliveredLate() {
        plan("late","u1","TODO",clock.instant());
        var waiting = new OwnerTransactions(rows,new DataSourceTransactionManager(ds)) {
            @Override public Object write(String user,String method,String route,String key,Object body,int status,boolean revision,Supplier<Object> action) {
                clock.advance(Duration.ofMinutes(6));
                return super.write(user,method,route,key,body,status,revision,action);
            }
        };
        new NotificationSchedules(rows,waiting,tasks,clock,900000).poll(); assertEquals(0,count("notifications"));
    }
    @Test void subscriptionPagesRemainBoundedAndResumeBeyondAlreadyQueuedWork() {
        for(int i=0;i<501;i++)db.update("INSERT INTO subscriptions(id,user_id,enabled) VALUES(?,'u1',true)",String.format("subscription-%04d",i));
        schedules.poll(); assertEquals(500,count("tasks"));
        schedules.poll(); assertEquals(501,count("tasks")); assertEquals(501,count("outbox_events"));
    }
    @Test void twoSchedulersShareOwnerLocksAndDeduplicateBothReminderAndSubscription() throws Exception {
        plan("shared","u1","TODO",clock.instant());
        db.update("INSERT INTO subscriptions(id,user_id,enabled) VALUES('shared','u1',true)");
        var second=new NotificationSchedules(rows,owners,tasks,clock,900000);
        try(var pool=Executors.newFixedThreadPool(2)) {
            var firstRun=pool.submit(schedules::poll); var secondRun=pool.submit(second::poll);
            firstRun.get(10,TimeUnit.SECONDS); secondRun.get(10,TimeUnit.SECONDS);
        }
        assertEquals(1,count("notifications")); assertEquals(1,count("consumer_inbox"));
        assertEquals(1,count("tasks")); assertEquals(1,count("outbox_events"));
    }
    static class MutableClock extends Clock {
        private Instant now; MutableClock(Instant now){this.now=now;} void advance(Duration by){now=now.plus(by);}
        public ZoneId getZone(){return ZoneOffset.UTC;} public Clock withZone(ZoneId zone){return this;} public Instant instant(){return now;}
    }
}
