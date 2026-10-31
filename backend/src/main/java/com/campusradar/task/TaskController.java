package com.campusradar.task;
import com.campusradar.common.*;
import com.campusradar.security.CurrentUser;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import java.time.Instant;
import java.util.*;

@RestController @RequestMapping("/api/v1")
public class TaskController {
    private final OwnerTransactions tx;private final TaskService tasks;private final CurrentUser users;private final JdbcTemplate db;private final StringRedisTemplate redis;private final ConnectionFactory rabbit;
    public TaskController(TaskService tasks,CurrentUser users,JdbcTemplate db,StringRedisTemplate redis,ConnectionFactory rabbit,OwnerTransactions tx){this.tx=tx;this.tasks=tasks;this.users=users;this.db=db;this.redis=redis;this.rabbit=rabbit;}
    @GetMapping("/tasks/{id}") ResponseEntity<?> get(HttpServletRequest req,@PathVariable String id){return ApiSupport.response(tasks.get(users.requireId(req),id),200);}
    @GetMapping("/admin/tasks") ResponseEntity<?> list(HttpServletRequest req,@RequestParam(defaultValue="1")int page,@RequestParam(defaultValue="20")int size){users.requireRole(req,"ADMIN");return ApiSupport.page(tasks.admin(page,size),page,size,tasks.count());}
    @PostMapping("/admin/tasks/{id}/retry") ResponseEntity<?> retry(HttpServletRequest req,@PathVariable String id,@RequestHeader("Idempotency-Key")String key){String actor=users.requireRole(req,"ADMIN");return ApiSupport.response(tx.write(actor,"POST","/admin/tasks/"+id+"/retry",key,Map.of(),200,false,()->tasks.retry(id)),200);}
    @GetMapping("/admin/services") ResponseEntity<?> health(HttpServletRequest req){
        users.requireRole(req,"ADMIN");String mysql=check(()->db.queryForObject("SELECT 1",Integer.class));
        String cache=check(()->{try(var c=redis.getConnectionFactory().getConnection()){return c.ping();}});
        String mq=check(()->{try(var c=rabbit.createConnection()){if(!c.isOpen())throw new IllegalStateException();return true;}});
        long pending=0,age=0;try{pending=db.queryForObject("SELECT COUNT(*) FROM outbox_events WHERE state IN ('PENDING','SENDING')",Long.class);Long oldest=db.queryForObject("SELECT TIMESTAMPDIFF(SECOND,MIN(created_at),UTC_TIMESTAMP()) FROM outbox_events WHERE state IN ('PENDING','SENDING')",Long.class);age=oldest==null?0:Math.max(0,oldest);}catch(org.springframework.dao.DataAccessException ignored){}
        String status=mysql.equals("DOWN")?"DOWN":cache.equals("DOWN")||mq.equals("DOWN")?"DEGRADED":"UP";
        return ApiSupport.response(Map.of("status",status,"mysql",mysql,"redis",cache,"rabbitmq",mq,"outboxPending",pending,"oldestOutboxAgeSeconds",age),200);
    }
    private String check(java.util.concurrent.Callable<?> action){try{action.call();return "UP";}catch(Exception e){return "DOWN";}}
}
