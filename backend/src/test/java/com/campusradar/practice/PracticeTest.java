package com.campusradar.practice;

import com.campusradar.common.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.*;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;

class PracticeTest {
    JdbcTemplate db; PracticeService service; MutableClock clock=new MutableClock();
    String owner="11111111-1111-4111-8111-111111111111",other="22222222-2222-4222-8222-222222222222",question="33333333-3333-4333-8333-333333333333";
    static class MutableClock extends Clock {Instant now=Instant.parse("2026-10-28T08:00:00Z");public ZoneId getZone(){return ZoneOffset.UTC;}public Clock withZone(ZoneId zone){return this;}public Instant instant(){return now;}void advance(int seconds){now=now.plusSeconds(seconds);}}
    @BeforeEach void setup(){var source=new DriverManagerDataSource("jdbc:h2:mem:practice;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1","sa","");db=new JdbcTemplate(source);db.execute("DROP ALL OBJECTS");
        db.execute("CREATE TABLE users(id VARCHAR PRIMARY KEY,status VARCHAR,data_operation VARCHAR,data_revision INT)");db.update("INSERT INTO users VALUES(?,'ACTIVE','IDLE',0),(?,'ACTIVE','IDLE',0)",owner,other);
        db.execute("CREATE TABLE companies(id VARCHAR PRIMARY KEY)");db.execute("CREATE TABLE questions(id VARCHAR PRIMARY KEY,title VARCHAR,prompt_md VARCHAR,answer_md VARCHAR,role VARCHAR,status VARCHAR)");db.update("INSERT INTO questions VALUES(?,'问题','描述 HTTP 缓存','区分强缓存与协商缓存','backend','PUBLISHED')",question);
        db.execute("CREATE TABLE question_companies(question_id VARCHAR,company_id VARCHAR)");
        db.execute("CREATE TABLE mock_sessions(id VARCHAR PRIMARY KEY,user_id VARCHAR,role VARCHAR,company_id VARCHAR,duration_seconds INT,remaining_seconds INT,state VARCHAR,timer_started_at TIMESTAMP,report VARCHAR,version INT DEFAULT 1,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
        db.execute("CREATE TABLE mock_answers(id VARCHAR PRIMARY KEY,user_id VARCHAR,session_id VARCHAR,question_id VARCHAR,sequence INT,prompt_snapshot VARCHAR,reference_snapshot VARCHAR,answer_text VARCHAR,self_score DECIMAL(5,2),version INT DEFAULT 1,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
        db.execute("CREATE TABLE idempotency_records(id VARCHAR PRIMARY KEY,user_id VARCHAR,method VARCHAR,route_hash VARCHAR,idem_key VARCHAR,request_hash VARCHAR,http_status INT,response_body VARCHAR,expires_at TIMESTAMP,UNIQUE(user_id,method,route_hash,idem_key))");
        var json=JsonMapper.builder().build();var rows=new SqlRows(new NamedParameterJdbcTemplate(source),json);service=new PracticeService(rows,new OwnerTransactions(rows,new DataSourceTransactionManager(source)),new ContractInputs(json),clock);
    }
    @SuppressWarnings("unchecked") Map<String,Object> create(){return (Map<String,Object>)service.create(owner,Map.of("role","backend","questionIds",List.of(question),"durationSeconds",300),"practice-create-session");}
    @SuppressWarnings("unchecked") Map<String,Object> answer(Map<String,Object> session){return ((List<Map<String,Object>>)session.get("answers")).getFirst();}
    @SuppressWarnings("unchecked") Map<String,Object> action(String id,int version,String action){return (Map<String,Object>)service.action(owner,id,Map.of("version",version,"action",action),"practice-"+action+"-session");}
    @Test void snapshotsPublishedQuestionsAndRejectsHiddenOrForeignTargets(){var session=create();db.update("UPDATE questions SET prompt_md='changed',status='HIDDEN'");assertEquals("描述 HTTP 缓存",answer(service.detail(owner,(String)session.get("id"))).get("promptSnapshot"));assertThrows(ApiProblem.class,()->service.detail(other,(String)session.get("id")));assertThrows(ApiProblem.class,()->service.create(owner,Map.of("role","backend","questionIds",List.of(question),"durationSeconds",300),"practice-hidden-question"));}
    @Test void timerUsesServerClockAndPauseDoesNotConsumeTime(){var s=create();String id=(String)s.get("id");clock.advance(31);assertEquals(269,service.detail(owner,id).get("remainingSeconds"));var paused=action(id,1,"PAUSE");assertEquals("PAUSED",paused.get("state"));clock.advance(80);assertEquals(269,service.detail(owner,id).get("remainingSeconds"));action(id,2,"RESUME");clock.advance(9);assertEquals(260,service.detail(owner,id).get("remainingSeconds"));}
    @Test void answerVersionsAndSubmissionAreScopedAndImmutable(){var s=create();String id=(String)s.get("id"),aid=(String)answer(s).get("id");var body=Map.<String,Object>of("version",1,"answerText","浏览器缓存分为强缓存与协商缓存，命中缓存减少网络请求。","selfScore",80);service.saveAnswer(owner,id,aid,body);assertThrows(ApiProblem.class,()->service.saveAnswer(owner,id,aid,body));var done=action(id,1,"SUBMIT");assertEquals("COMPLETED",done.get("state"));assertNotNull(done.get("report"));assertThrows(ApiProblem.class,()->service.saveAnswer(owner,id,aid,Map.of("version",2,"answerText","edit","selfScore",90)));}
    @Test void exhaustedTimerRejectsNewAnswersButAllowsFinalReport(){var s=create();clock.advance(301);String id=(String)s.get("id"),aid=(String)answer(s).get("id");assertEquals(0,service.detail(owner,id).get("remainingSeconds"));assertThrows(ApiProblem.class,()->service.saveAnswer(owner,id,aid,Map.of("version",1,"answerText","late","selfScore",10)));var done=action(id,1,"SUBMIT");assertEquals("COMPLETED",done.get("state"));}
    @Test void invalidQuestionSelectionRollsBackSessionAndRevision(){db.update("UPDATE questions SET status='HIDDEN'");assertThrows(ApiProblem.class,this::create);assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM mock_sessions",Integer.class));assertEquals(0,db.queryForObject("SELECT data_revision FROM users WHERE id=?",Integer.class,owner));}
}
