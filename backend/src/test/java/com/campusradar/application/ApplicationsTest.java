package com.campusradar.application;

import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;

class ApplicationsTest {
    JdbcTemplate db; ApplicationService service;
    final String owner="11111111-1111-4111-8111-111111111111", other="22222222-2222-4222-8222-222222222222";
    @BeforeEach void setup() {
        var source=new DriverManagerDataSource("jdbc:h2:mem:applications;MODE=MySQL;DB_CLOSE_DELAY=-1","sa","");
        db=new JdbcTemplate(source); db.execute("DROP ALL OBJECTS");
        db.execute("CREATE TABLE users(id VARCHAR PRIMARY KEY,status VARCHAR,data_operation VARCHAR,board_version INT,data_revision INT)");
        db.execute("INSERT INTO users VALUES('"+owner+"','ACTIVE','IDLE',1,0),('"+other+"','ACTIVE','IDLE',1,0)");
        db.execute("CREATE TABLE companies(id VARCHAR PRIMARY KEY,slug VARCHAR,name VARCHAR,logo_url VARCHAR,industry VARCHAR,size_band VARCHAR,cities VARCHAR,tags VARCHAR,description_md VARCHAR,verified_at TIMESTAMP,version INT,created_at TIMESTAMP,updated_at TIMESTAMP)");
        db.execute("CREATE TABLE sources(id VARCHAR PRIMARY KEY,name VARCHAR,base_url VARCHAR,content_mode VARCHAR,enabled BOOLEAN,verified_at TIMESTAMP)");
        db.execute("CREATE TABLE jobs(id VARCHAR PRIMARY KEY,company_id VARCHAR,source_id VARCHAR,title VARCHAR,role VARCHAR,education VARCHAR,recruitment_type VARCHAR,skills VARCHAR,salary VARCHAR,description_md VARCHAR,canonical_url VARCHAR,deadline_at TIMESTAMP,deadline_date DATE,deadline_precision VARCHAR,source_timezone VARCHAR,status VARCHAR,publication_status VARCHAR,published_at TIMESTAMP,collected_at TIMESTAMP,version INT,created_at TIMESTAMP,updated_at TIMESTAMP)");
        db.execute("CREATE TABLE job_cities(job_id VARCHAR,city VARCHAR)"); db.execute("CREATE TABLE job_graduation_years(job_id VARCHAR,graduation_year INT)");
        db.execute("INSERT INTO companies VALUES('c','company','公司',NULL,NULL,NULL,'[]','[]','',NULL,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)"); db.execute("INSERT INTO sources VALUES('s','来源','https://example.com','ORIGINAL',TRUE,NULL)");
        for(int n=1;n<=3;n++) db.update("INSERT INTO jobs VALUES(?,'c','s',?,'backend','BACHELOR','CAMPUS','[]',NULL,'','https://example.com',NULL,NULL,'UNKNOWN','UTC','OPEN','PUBLISHED',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",job(n),"岗位"+n);
        db.execute("CREATE TABLE applications(id VARCHAR PRIMARY KEY,user_id VARCHAR,job_id VARCHAR,resume_id VARCHAR,stage VARCHAR,sort_key DECIMAL(30,10),notes VARCHAR,applied_at TIMESTAMP,closed_reason VARCHAR,closed_at TIMESTAMP,archived_at TIMESTAMP,version INT DEFAULT 1,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,UNIQUE(user_id,job_id))");
        db.execute("CREATE TABLE application_stage_events(id VARCHAR PRIMARY KEY,user_id VARCHAR,application_id VARCHAR,operation_id VARCHAR UNIQUE,from_stage VARCHAR,to_stage VARCHAR,old_sort_key DECIMAL(30,10),new_sort_key DECIMAL(30,10),old_before_id VARCHAR,old_after_id VARCHAR,result_version INT,result_board_version INT,occurred_at TIMESTAMP,undone BOOLEAN DEFAULT FALSE,old_closed_reason VARCHAR,old_closed_at TIMESTAMP,old_applied_at TIMESTAMP,version INT DEFAULT 1,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
        db.execute("CREATE TABLE idempotency_records(id VARCHAR PRIMARY KEY,user_id VARCHAR,method VARCHAR,route_hash VARCHAR,idem_key VARCHAR,request_hash VARCHAR,http_status INT,response_body VARCHAR,expires_at TIMESTAMP,UNIQUE(user_id,method,route_hash,idem_key))");
        service=new ApplicationService(new NamedParameterJdbcTemplate(source),JsonMapper.builder().build(),new com.campusradar.catalog.JobsController(new NamedParameterJdbcTemplate(source),JsonMapper.builder().build()),java.time.Clock.systemUTC());
        var proxy = new org.springframework.transaction.interceptor.TransactionProxyFactoryBean();
        proxy.setTarget(service); proxy.setProxyTargetClass(true);
        proxy.setTransactionManager(new org.springframework.jdbc.datasource.DataSourceTransactionManager(source));
        var attributes = new java.util.Properties(); attributes.setProperty("*", "PROPAGATION_REQUIRED");
        proxy.setTransactionAttributes(attributes); proxy.afterPropertiesSet(); service=(ApplicationService)proxy.getObject();
    }
    String job(int n){return "33333333-3333-4333-8333-33333333333"+n;}
    Map<String,Object> create(int n){return service.create(owner,Map.of("jobId",job(n)),"create-application-"+n);}
    @SuppressWarnings("unchecked") Map<String,Object> app(Map<String,Object> m){return (Map<String,Object>)m.get("application");}
    @Test void createIsIdempotentAndScoped() {
        var first=create(1); var replay=create(1); assertEquals(first,replay);
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM applications",Integer.class));
        assertEquals(1,db.queryForObject("SELECT data_revision FROM users WHERE id=?",Integer.class,owner));
        assertThrows(RuntimeException.class,()->service.detail(other,(String)app(first).get("id")));
        assertThrows(RuntimeException.class,()->service.create(owner,Map.of("jobId",job(2)),"create-application-1"));
    }
    @Test void moveProtectsVersionsAndUndoRestoresOrder() {
        var one=create(1); var two=create(2); var id=(String)app(one).get("id");
        var moved=service.move(owner,id,Map.of("version",1,"boardVersion",3,"stage","APPLIED"),"move-application-1");
        assertEquals("APPLIED",app(moved).get("stage"));
        assertThrows(RuntimeException.class,()->service.move(owner,id,Map.of("version",2,"boardVersion",3,"stage","HR"),"move-application-2"));
        var undone=service.undo(owner,id,Map.of("version",2,"boardVersion",4,"operationId",moved.get("operationId")),"undo-application-1");
        assertEquals("PENDING",app(undone).get("stage"));
        @SuppressWarnings("unchecked") var items=(List<Map<String,Object>>)service.board(owner,null,null).get("items");
        assertEquals(id,items.getFirst().get("id")); assertEquals(app(two).get("id"),items.get(1).get("id"));
    }
    @Test void rejectsForeignNeighborsAndOldUndo() {
        var one=create(1); var id=(String)app(one).get("id");
        assertThrows(RuntimeException.class,()->service.move(owner,id,Map.of("version",1,"boardVersion",2,"stage","HR","beforeId",other),"move-application-3"));
        var moved=service.move(owner,id,Map.of("version",1,"boardVersion",2,"stage","HR"),"move-application-4");
        db.update("UPDATE application_stage_events SET occurred_at=DATEADD('MINUTE',-11,CURRENT_TIMESTAMP)");
        assertThrows(RuntimeException.class,()->service.undo(owner,id,Map.of("version",2,"boardVersion",3,"operationId",moved.get("operationId")),"undo-application-2"));
    }
    @Test void noteSaveDoesNotChangeBoardAndArchiveDoes() {
        var one=create(1); var id=(String)app(one).get("id");
        var saved=service.patch(owner,id,Map.of("version",1,"notes","草稿")); assertEquals(2,saved.get("boardVersion"));
        assertEquals("草稿",app(saved).get("notes"));
        var archived=service.patch(owner,id,Map.of("version",2,"archived",true)); assertEquals(3,archived.get("boardVersion"));
        assertEquals(List.of(),service.board(owner,null,null).get("items"));
        assertEquals(app(archived).get("archivedAt"),app(service.create(owner,Map.of("jobId",job(1)),"create-application-again")).get("archivedAt"));
    }
    @Test void failedEventWriteRollsBackCardAndOwnerRevision() {
        var one=create(1); var id=(String)app(one).get("id");
        db.execute("ALTER TABLE application_stage_events ADD CONSTRAINT fail_hr CHECK(to_stage <> 'HR')");
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class,()->service.move(owner,id,Map.of("version",1,"boardVersion",2,"stage","HR"),"rollback-move-application"));
        assertEquals("PENDING",service.detail(owner,id).get("stage"));
        assertEquals(1,service.detail(owner,id).get("version"));
        assertEquals(2,db.queryForObject("SELECT board_version FROM users WHERE id=?",Integer.class,owner));
        assertEquals(1,db.queryForObject("SELECT data_revision FROM users WHERE id=?",Integer.class,owner));
    }
    @Test void idempotencyIgnoresJsonObjectKeyOrderAndPreservesNull() {
        var first=new LinkedHashMap<String,Object>(); first.put("jobId",job(1)); first.put("resumeId",null);
        var reversed=new LinkedHashMap<String,Object>(); reversed.put("resumeId",null); reversed.put("jobId",job(1));
        assertEquals(service.create(owner,first,"canonical-create-application"),service.create(owner,reversed,"canonical-create-application"));
        assertEquals(1,db.queryForObject("SELECT data_revision FROM users WHERE id=?",Integer.class,owner));
    }
}
