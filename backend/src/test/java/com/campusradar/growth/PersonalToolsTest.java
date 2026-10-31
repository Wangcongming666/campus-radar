package com.campusradar.growth;

import com.campusradar.common.ApiProblem;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import tools.jackson.databind.json.JsonMapper;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class PersonalToolsTest {
    JdbcTemplate db; PersonalStore store;
    final String u="11111111-1111-1111-1111-111111111111", other="22222222-2222-2222-2222-222222222222";
    @BeforeEach void setup() {
        var ds=new DriverManagerDataSource("jdbc:h2:mem:personal;MODE=MySQL;DB_CLOSE_DELAY=-1","sa",""); db=new JdbcTemplate(ds); db.execute("DROP ALL OBJECTS");
        db.execute("CREATE TABLE users(id VARCHAR(36) PRIMARY KEY,status VARCHAR(20),data_operation VARCHAR(20),data_revision BIGINT DEFAULT 0)");
        db.update("INSERT INTO users(id,status,data_operation) VALUES (?,'ACTIVE','IDLE'),(?,'ACTIVE','IDLE')",u,other);
        db.execute("CREATE TABLE plan_tasks(id VARCHAR(36) PRIMARY KEY,user_id VARCHAR(36),title VARCHAR(200),status VARCHAR(16),due_at TIMESTAMP,notes VARCHAR(10000),milestone VARCHAR(100),sort_order INT,generation_key VARCHAR(100),version INT DEFAULT 1,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,UNIQUE(user_id,generation_key))");
        db.execute("CREATE TABLE idempotency_records(id VARCHAR(36),user_id VARCHAR(36),method VARCHAR(8),route_hash VARCHAR(64),idem_key VARCHAR(80),request_hash VARCHAR(64),http_status INT,response_body VARCHAR(30000),expires_at TIMESTAMP,version INT DEFAULT 1,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
        store=new PersonalStore(new NamedParameterJdbcTemplate(ds),JsonMapper.builder().build(),new DataSourceTransactionManager(ds));
    }
    Map<String,Object> task() {var m=new LinkedHashMap<String,Object>();m.put("title","Prepare Java");m.put("status","TODO");m.put("dueAt",null);m.put("notes","");m.put("milestone","");m.put("sortOrder",0);return m;}
    @SuppressWarnings("unchecked") @Test void idempotentCreateReplaysWithoutIncreasingRevisionAndRejectsOtherBody() {
        var first=(Map<String,Object>)store.write(u,"abcdefghijklmnop","/planner/tasks",task(),201,()->store.insert("plan_tasks",u,task()));
        var replay=store.write(u,"abcdefghijklmnop","/planner/tasks",task(),201,()->{throw new AssertionError("must replay");});
        assertEquals(first,replay);assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM plan_tasks",Integer.class));assertEquals(1L,db.queryForObject("SELECT data_revision FROM users WHERE id=?",Long.class,u));
        var changed=task();changed.put("title","Different");assertThrows(ApiProblem.class,()->store.write(u,"abcdefghijklmnop","/planner/tasks",changed,201,()->null));
    }
    @SuppressWarnings("unchecked") @Test void ownerIsolationVersionConflictsAndFrozenWrites() {
        var first=(Map<String,Object>)store.write(u,null,"",task(),201,()->store.insert("plan_tasks",u,task()));String id=first.get("id").toString();
        assertThrows(ApiProblem.class,()->store.one("plan_tasks",other,id));
        var patch=Map.<String,Object>of("version",7,"status","DONE");assertThrows(ApiProblem.class,()->store.write(u,null,"",patch,200,()->store.patch("plan_tasks",u,id,patch)));
        db.update("UPDATE users SET data_operation='IMPORTING' WHERE id=?",u);assertThrows(ApiProblem.class,()->store.write(u,null,"",task(),201,()->store.insert("plan_tasks",u,task())));
        assertEquals("TODO",store.one("plan_tasks",u,id).get("status"));
    }
    @Test void strictContractRejectsUnknownKeysAndInvalidValues() {
        var value=task();value.put("admin",true);assertThrows(ApiProblem.class,()->PersonalContract.validate("PlanTaskInput",value));
        value.remove("admin");value.put("status","INVENTED");assertThrows(ApiProblem.class,()->PersonalContract.validate("PlanTaskInput",value));
        value.put("status","TODO");value.put("dueAt","tomorrow");assertThrows(ApiProblem.class,()->PersonalContract.validate("PlanTaskInput",value));
    }
    @Test void personalReferencesRequireCanonicalUuidShape() {
        var review=new LinkedHashMap<String,Object>();
        review.put("version",0);review.put("transcript","");review.put("notes","");review.put("selfScore",null);review.put("recordingFileId","1-1-1-1-1");
        assertEquals(422,assertThrows(ApiProblem.class,()->PersonalContract.validate("ReviewPut",review)).status());
    }
    @Test void personalMeetingLinksRequireHttpHost() {
        var event=PersonalStore.map("title","Interview","applicationId",null,"roundId",null,"startsAt","2027-01-01T02:00:00Z","endsAt","2027-01-01T03:00:00Z","timezone","Asia/Shanghai","kind","PERSONAL","location",null,"meetingUrl","https:missing-host","notes","","status","SCHEDULED");
        assertEquals(422,assertThrows(ApiProblem.class,()->PersonalContract.validate("EventInput",event)).status());
    }
    @Test void personalTextLimitsCountUnicodeCodePointsAsTheContractRequires() {
        var input=task();input.put("title","🚀".repeat(150));
        assertDoesNotThrow(()->PersonalContract.validate("PlanTaskInput",input));
        input.put("title","🚀".repeat(201));
        assertThrows(ApiProblem.class,()->PersonalContract.validate("PlanTaskInput",input));
    }

    @Test void malformedVersionsAreValidationErrorsWhileStaleVersionsAreConflicts() {
        var row=PersonalStore.map("version",1);
        assertEquals(422,assertThrows(ApiProblem.class,()->PersonalStore.version(row,0)).status());
        assertEquals(422,assertThrows(ApiProblem.class,()->PersonalStore.version(row,-1)).status());
        assertEquals(422,assertThrows(ApiProblem.class,()->PersonalStore.version(row,1.5)).status());
        assertEquals(409,assertThrows(ApiProblem.class,()->PersonalStore.version(row,2)).status());
    }

    @Test void frozenAccountsCanReplayAnExistingResultButCannotCreateAnotherRecord() {
        var first=store.write(u,"replay-while-locked-key","/planner/tasks",task(),201,()->store.insert("plan_tasks",u,task()));
        db.update("UPDATE users SET data_operation='EXPORTING' WHERE id=?",u);
        assertEquals(first,store.write(u,"replay-while-locked-key","/planner/tasks",task(),201,()->{throw new AssertionError("must replay");}));
        assertEquals(409,assertThrows(ApiProblem.class,()->store.write(u,"fresh-while-locked-key","/planner/tasks",task(),201,()->store.insert("plan_tasks",u,task()))).status());
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM plan_tasks",Integer.class));
    }

}
