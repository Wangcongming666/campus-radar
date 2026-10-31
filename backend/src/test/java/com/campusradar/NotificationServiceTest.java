package com.campusradar;

import com.campusradar.common.*;
import com.campusradar.notification.*;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.*;
import tools.jackson.databind.json.JsonMapper;
import java.time.Instant;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static com.campusradar.common.SqlRows.map;

class NotificationServiceTest {
    JdbcTemplate db;NotificationService service;OwnerTransactions tx;
    @BeforeEach void setup(){var ds=new DriverManagerDataSource("jdbc:h2:mem:notification;MODE=MySQL;DB_CLOSE_DELAY=-1","sa","");db=new JdbcTemplate(ds);db.execute("DROP ALL OBJECTS");String base=",version INT DEFAULT 1,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP";
        db.execute("CREATE TABLE users(id VARCHAR PRIMARY KEY,status VARCHAR,data_operation VARCHAR,data_revision INT DEFAULT 0,email VARCHAR,email_verified_at TIMESTAMP)");db.update("INSERT INTO users(id,status,data_operation,email) VALUES('u1','ACTIVE','IDLE','a@example.test'),('u2','ACTIVE','IDLE','b@example.test')");
        db.execute("CREATE TABLE subscriptions(id VARCHAR PRIMARY KEY,user_id VARCHAR,name VARCHAR,conditions VARCHAR,in_app BOOLEAN,email_enabled BOOLEAN,enabled BOOLEAN,last_scanned_at TIMESTAMP"+base+")");db.execute("CREATE TABLE notifications(id VARCHAR PRIMARY KEY,user_id VARCHAR,type VARCHAR,title VARCHAR,body VARCHAR,target_path VARCHAR,read_at TIMESTAMP,dedup_key VARCHAR"+base+",UNIQUE(user_id,dedup_key))");db.execute("CREATE TABLE subscription_hits(id VARCHAR PRIMARY KEY,user_id VARCHAR,subscription_id VARCHAR,job_id VARCHAR,job_version INT,notification_id VARCHAR"+base+",UNIQUE(subscription_id,job_id,job_version))");
        db.execute("CREATE TABLE sources(id VARCHAR PRIMARY KEY,enabled BOOLEAN)");db.update("INSERT INTO sources VALUES('s1',true),('s2',false)");db.execute("CREATE TABLE jobs(id VARCHAR PRIMARY KEY,source_id VARCHAR,title VARCHAR,role VARCHAR,recruitment_type VARCHAR,status VARCHAR,publication_status VARCHAR,version INT)");db.update("INSERT INTO jobs VALUES('j1','s1','Backend','backend','CAMPUS','OPEN','PUBLISHED',1),('hidden','s2','Backend','backend','CAMPUS','OPEN','PUBLISHED',1),('draft','s1','Backend','backend','CAMPUS','OPEN','DRAFT',1),('other','s1','Design','design','CAMPUS','OPEN','PUBLISHED',1)");db.execute("CREATE TABLE job_cities(job_id VARCHAR,city VARCHAR)");db.execute("CREATE TABLE job_graduation_years(job_id VARCHAR,graduation_year INT)");db.update("INSERT INTO job_cities VALUES('j1','上海')");db.update("INSERT INTO job_graduation_years VALUES('j1',2027)");
        var sql=new SqlRows(new NamedParameterJdbcTemplate(ds),JsonMapper.builder().build());tx=new OwnerTransactions(sql,new DataSourceTransactionManager(ds));service=new NotificationService(sql,null);
    }
    Object write(java.util.function.Supplier<Object>action){return tx.write("u1","POST","",null,Map.of(),200,false,action);}
    Map<String,Object> subscription(){return map("name","Backend","conditions",map("roles",List.of("backend"),"cities",List.of("上海"),"recruitmentTypes",List.of("CAMPUS"),"graduationYear",2027),"inApp",true,"email",false,"enabled",true);}
    @Test void activeAccountCanEnableEmailWithoutVerification() {
        var mail=org.mockito.Mockito.mock(SubscriptionMail.class);
        service=new NotificationService(new SqlRows(new NamedParameterJdbcTemplate(db.getDataSource()),JsonMapper.builder().build()),mail);
        var input=subscription();input.put("email",true);
        assertDoesNotThrow(()->write(()->service.create("u1",input)));
        org.mockito.Mockito.verify(mail).ensureConfigured();
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM subscriptions WHERE email_enabled=true",Integer.class));
    }
    @SuppressWarnings("unchecked") @Test void scanMatchesAllConditionsAndDeduplicatesJobVersions(){var s=(Map<String,Object>)write(()->service.create("u1",subscription()));String id=s.get("id").toString();write(()->service.scan("u1",id));write(()->service.scan("u1",id));assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM subscription_hits",Integer.class));assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM notifications",Integer.class));db.update("UPDATE jobs SET version=2 WHERE id='j1'");write(()->service.scan("u1",id));assertEquals(2,db.queryForObject("SELECT COUNT(*) FROM notifications",Integer.class));assertThrows(ApiProblem.class,()->service.one("u2",id));}
    @Test void markingReadCannotAffectAnotherOwnerAndReadAllHasCutoff(){db.update("INSERT INTO notifications(id,user_id,type,title,body,dedup_key,created_at) VALUES('n1','u1','SYSTEM','One','','one',TIMESTAMP '2026-01-01 00:00:00'),('n2','u2','SYSTEM','Other','','two',TIMESTAMP '2026-01-01 00:00:00'),('future','u1','SYSTEM','New','','future',TIMESTAMP '2027-01-01 00:00:00')");assertThrows(ApiProblem.class,()->write(()->service.notificationPatch("u1","n2",1,true)));write(()->service.readAll("u1",Instant.parse("2026-06-01T00:00:00Z")));assertNotNull(db.queryForObject("SELECT read_at FROM notifications WHERE id='n1'",Object.class));assertNull(db.queryForObject("SELECT read_at FROM notifications WHERE id='n2'",Object.class));assertNull(db.queryForObject("SELECT read_at FROM notifications WHERE id='future'",Object.class));}
    @SuppressWarnings("unchecked") @Test void deletingNotificationKeepsHitDedupWithoutDanglingReference(){var s=(Map<String,Object>)write(()->service.create("u1",subscription()));String id=s.get("id").toString();write(()->service.scan("u1",id));String notification=db.queryForObject("SELECT id FROM notifications",String.class);write(()->service.notificationDelete("u1",notification,1));assertNull(db.queryForObject("SELECT notification_id FROM subscription_hits",String.class));write(()->service.scan("u1",id));assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM notifications",Integer.class));}
}
