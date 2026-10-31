package com.campusradar;
import com.campusradar.common.*;
import com.campusradar.task.*;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.*;
import tools.jackson.databind.json.JsonMapper;
import java.time.*;
import java.sql.Timestamp;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.jupiter.api.Assertions.*;

class TaskExecutorTest {
    NamedParameterJdbcTemplate db;TaskService tasks;TaskExecutor executor;MutableClock clock;AtomicInteger calls;boolean fail;
    static class MutableClock extends Clock {Instant now=Instant.parse("2026-10-29T00:00:00Z");public ZoneId getZone(){return ZoneOffset.UTC;}public Clock withZone(ZoneId zone){return this;}public Instant instant(){return now;}}
    @BeforeEach void setup(){var ds=new DriverManagerDataSource("jdbc:h2:mem:taskexecutor;MODE=MySQL;DB_CLOSE_DELAY=-1","sa","");db=new NamedParameterJdbcTemplate(ds);var sql=db.getJdbcTemplate();sql.execute("DROP ALL OBJECTS");sql.execute("CREATE TABLE users(id VARCHAR PRIMARY KEY,status VARCHAR,data_operation VARCHAR)");sql.execute("INSERT INTO users VALUES('owner','ACTIVE','IDLE')");sql.execute("CREATE TABLE tasks(id VARCHAR PRIMARY KEY,user_id VARCHAR,type VARCHAR,state VARCHAR,payload VARCHAR,result_file_id VARCHAR,progress INT DEFAULT 0,attempt INT DEFAULT 0,max_attempts INT DEFAULT 5,dedup_key VARCHAR UNIQUE,next_attempt_at TIMESTAMP,lease_token VARCHAR,lease_until TIMESTAMP,error_code VARCHAR,version INT DEFAULT 1,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");sql.execute("CREATE TABLE outbox_events(id VARCHAR PRIMARY KEY,event_type VARCHAR,aggregate_id VARCHAR,routing_key VARCHAR,payload VARCHAR,state VARCHAR,attempt INT DEFAULT 0,available_at TIMESTAMP,lease_token VARCHAR,lease_until TIMESTAMP,published_at TIMESTAMP,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");sql.execute("CREATE TABLE consumer_inbox(id VARCHAR PRIMARY KEY,consumer VARCHAR,event_id VARCHAR,state VARCHAR,lease_token VARCHAR,lease_until TIMESTAMP,version INT DEFAULT 1,UNIQUE(consumer,event_id))");clock=new MutableClock();calls=new AtomicInteger();var rows=new SqlRows(db,JsonMapper.builder().build());tasks=new TaskService(rows,clock);TaskHandler handler=new TaskHandler(){public boolean supports(String type){return type.equals("DATA_EXPORT");}public String execute(String type,String user,Map<String,Object>payload){calls.incrementAndGet();if(fail)throw new ApiProblem(503,"TEST_FAILURE","retry");return null;}};executor=new TaskExecutor(rows,tasks,List.of(handler),new DataSourceTransactionManager(ds),clock);}
    String queued(){return tasks.enqueue("owner","DATA_EXPORT",Map.of(),UUID.randomUUID().toString()).get("id").toString();}
    String event(String task){return db.queryForObject("SELECT id FROM outbox_events WHERE aggregate_id=:t ORDER BY available_at DESC,id DESC LIMIT 1",Map.of("t",task),String.class);}
    String state(String id){return tasks.get("owner",id).get("state").toString();}
    @Test void duplicateMessageDoesNotExecuteCompletedTaskAgain(){String id=queued(),event=event(id);executor.accept(event,id);executor.accept(event,id);assertEquals(1,calls.get());assertEquals("SUCCEEDED",state(id));}
    @Test void retryIsDurableAndBacksOff(){String id=queued();fail=true;executor.accept(event(id),id);assertEquals("RETRY_WAIT",state(id));assertEquals(2,db.queryForObject("SELECT COUNT(*) FROM outbox_events",Map.of(),Integer.class));String retry=event(id);executor.accept(retry,id);assertEquals(1,calls.get());clock.now=clock.now.plusSeconds(20);fail=false;executor.accept(retry,id);assertEquals("SUCCEEDED",state(id));assertEquals(2,calls.get());}
    @Test void lostQueuedDeliveryGetsRedispatched(){String id=queued();db.update("UPDATE tasks SET updated_at=:old WHERE id=:id",Map.of("id",id,"old",Timestamp.from(clock.instant().minusSeconds(120))));db.update("UPDATE outbox_events SET state='PUBLISHED'",Map.of());executor.recover();assertEquals(2,db.queryForObject("SELECT COUNT(*) FROM outbox_events",Map.of(),Integer.class));}
    @Test void brokerOutageDoesNotDiscardAcceptedTaskOrConsumeBusinessAttempts(){
        String id=queued();db.update("UPDATE outbox_events SET attempt=9",Map.of());
        var rabbit=org.mockito.Mockito.mock(org.springframework.amqp.rabbit.core.RabbitTemplate.class);
        org.mockito.Mockito.doThrow(new org.springframework.amqp.AmqpConnectException(new java.net.ConnectException("offline"))).when(rabbit).convertAndSend(org.mockito.ArgumentMatchers.anyString(),org.mockito.ArgumentMatchers.anyString(),org.mockito.ArgumentMatchers.any(Object.class),org.mockito.ArgumentMatchers.any(org.springframework.amqp.rabbit.connection.CorrelationData.class));
        var broker=new TaskBroker(new SqlRows(db,JsonMapper.builder().build()),rabbit,executor,new DataSourceTransactionManager(db.getJdbcTemplate().getDataSource()),clock,"test.queue","test.exchange");
        broker.publish();assertEquals("PENDING",db.queryForObject("SELECT state FROM outbox_events",Map.of(),String.class));assertEquals("QUEUED",state(id));assertEquals(0,tasks.get("owner",id).get("attempt"));
    }
}
