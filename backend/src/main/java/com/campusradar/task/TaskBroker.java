package com.campusradar.task;

import com.campusradar.common.SqlRows;
import org.springframework.amqp.core.*;
import org.springframework.amqp.rabbit.annotation.*;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.rabbit.connection.CorrelationData;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.*;
import java.time.*;
import java.sql.Timestamp;
import java.util.concurrent.TimeUnit;
import static com.campusradar.common.SqlRows.map;

@Configuration @EnableRabbit
public class TaskBroker {
    private final SqlRows r;private final RabbitTemplate rabbit;private final TaskExecutor executor;private final TransactionTemplate tx;private final Clock clock;private final String queueName,exchangeName;
    public TaskBroker(SqlRows r,RabbitTemplate rabbit,TaskExecutor executor,PlatformTransactionManager manager,Clock clock,@org.springframework.beans.factory.annotation.Value("${campus.task.queue:campus.tasks}")String queueName,@org.springframework.beans.factory.annotation.Value("${campus.task.exchange:campus.events}")String exchangeName){this.queueName=queueName;this.exchangeName=exchangeName;this.r=r;this.rabbit=rabbit;this.executor=executor;tx=new TransactionTemplate(manager);this.clock=clock;}
    @Bean org.springframework.amqp.core.Queue taskQueue(){return QueueBuilder.durable(queueName).build();}
    @Bean DirectExchange taskExchange(){return new DirectExchange(exchangeName,true,false);}
    @Bean Binding taskBinding(org.springframework.amqp.core.Queue taskQueue,DirectExchange taskExchange){return BindingBuilder.bind(taskQueue).to(taskExchange).with("task.execute");}
    @Scheduled(fixedDelayString="${campus.schedule.task-outbox-ms:1000}") public void publish(){
        Map<String,Object> event;
        try{event=tx.execute(s->{var events=r.db.queryForList("SELECT * FROM outbox_events WHERE event_type='TASK_DISPATCH' AND (state='PENDING' OR (state='SENDING' AND lease_until<:now)) AND available_at<=:now ORDER BY available_at,id LIMIT 1 FOR UPDATE SKIP LOCKED",map("now",Timestamp.from(clock.instant())));if(events.isEmpty())return null;var e=events.getFirst();String lease=UUID.randomUUID().toString();r.db.update("UPDATE outbox_events SET state='SENDING',attempt=attempt+1,lease_token=:lease,lease_until=:until WHERE id=:id",map("lease",lease,"until",Timestamp.from(clock.instant().plusSeconds(60)),"id",e.get("id")));e.put("lease",lease);return e;});}catch(org.springframework.dao.DataAccessException unavailable){return;}
        if(event==null)return;
        var p=map("id",event.get("id"),"lease",event.get("lease"));
        try{var correlation=new CorrelationData(event.get("id").toString());String body=r.json.writeValueAsString(Map.of("eventId",event.get("id"),"taskId",event.get("aggregate_id")));rabbit.convertAndSend(exchangeName,"task.execute",body,correlation);var confirm=correlation.getFuture().get(10,TimeUnit.SECONDS);if(!confirm.isAck()||correlation.getReturned()!=null)throw new IllegalStateException("Broker did not confirm delivery");r.db.update("UPDATE outbox_events SET state='PUBLISHED',published_at=CURRENT_TIMESTAMP,lease_token=NULL,lease_until=NULL WHERE id=:id AND lease_token=:lease",p);
        }catch(Exception error){int attempt=((Number)event.get("attempt")).intValue()+1;p.put("state","PENDING");p.put("due",Timestamp.from(clock.instant().plusSeconds(Math.min(300,attempt*5L))));r.db.update("UPDATE outbox_events SET state=:state,available_at=:due,lease_token=NULL,lease_until=NULL WHERE id=:id AND lease_token=:lease",p);}
    }
    @RabbitListener(queues="${campus.task.queue:campus.tasks}",concurrency="2") public void consume(String message){try{@SuppressWarnings("unchecked")Map<String,Object> body=r.json.readValue(message,Map.class);String event=Objects.toString(body.get("eventId"),""),task=Objects.toString(body.get("taskId"),"");UUID.fromString(event);UUID.fromString(task);executor.accept(event,task);}catch(IllegalArgumentException malformed){/* Reject malformed internal messages; no private data is logged. */}}
}
