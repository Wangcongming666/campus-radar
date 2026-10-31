package com.campusradar.moderation;

import com.campusradar.common.*;
import com.campusradar.social.SocialService;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import tools.jackson.databind.json.JsonMapper;
import java.util.*;
import java.time.Clock;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import static org.junit.jupiter.api.Assertions.*;

class ModerationSyncTest {
    JdbcTemplate db;AdminContentService service;
    final String admin="11111111-1111-1111-1111-111111111111",reviewer="22222222-2222-2222-2222-222222222222",user="33333333-3333-3333-3333-333333333333";
    @BeforeEach void setup(){
        var ds=new DriverManagerDataSource("jdbc:h2:mem:admin;MODE=MySQL;DB_CLOSE_DELAY=-1","sa","");db=new JdbcTemplate(ds);db.execute("DROP ALL OBJECTS");
        db.execute("CREATE TABLE users(id VARCHAR(36) PRIMARY KEY,status VARCHAR(20),role VARCHAR(20),data_operation VARCHAR(20),data_revision INT DEFAULT 0,version INT DEFAULT 1,auth_version INT DEFAULT 1,email VARCHAR(254),display_name VARCHAR(40),school VARCHAR(100),education VARCHAR(32),graduation_year INT,email_verified_at TIMESTAMP,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,password_hash VARCHAR(255),provider_verified BOOLEAN DEFAULT FALSE,provider_verified_until TIMESTAMP)");db.update("INSERT INTO users(id,status,role,data_operation) VALUES(?,'ACTIVE','ADMIN','IDLE'),(?,'ACTIVE','REVIEWER','IDLE'),(?,'ACTIVE','USER','IDLE')",admin,reviewer,user);
        db.execute("CREATE TABLE idempotency_records(id VARCHAR(36),user_id VARCHAR(36),method VARCHAR(8),route_hash VARCHAR(64),idem_key VARCHAR(80),request_hash VARCHAR(64),http_status INT,response_body VARCHAR(200000),expires_at TIMESTAMP)");
        db.execute("CREATE TABLE audit_logs(id VARCHAR(36),actor_id VARCHAR(36),action VARCHAR(80),target_type VARCHAR(40),target_id VARCHAR(36),reason VARCHAR(1000),request_id VARCHAR(64),change_summary VARCHAR(10000),created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
        db.execute("CREATE TABLE sources(id VARCHAR(36) PRIMARY KEY,name VARCHAR(120),base_url VARCHAR(2000),content_mode VARCHAR(32),permission_note VARCHAR(2000),enabled BOOLEAN DEFAULT FALSE,verified_at TIMESTAMP,version INT DEFAULT 1,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
        db.execute("CREATE TABLE companies(id VARCHAR(36) PRIMARY KEY,slug VARCHAR(80) UNIQUE,name VARCHAR(120),logo_url VARCHAR(2000),industry VARCHAR(80),size_band VARCHAR(40),cities VARCHAR(3000),tags VARCHAR(3000),description_md VARCHAR(20000),verified_at TIMESTAMP,version INT DEFAULT 1,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
        db.execute("CREATE TABLE questions(id VARCHAR(36) PRIMARY KEY,title VARCHAR(200),prompt_md VARCHAR(20000),answer_md VARCHAR(20000),role VARCHAR(40),difficulty VARCHAR(16),tags VARCHAR(3000),chapter_id VARCHAR(36),status VARCHAR(32),version INT DEFAULT 1,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");db.execute("CREATE TABLE question_companies(id VARCHAR(36),question_id VARCHAR(36),company_id VARCHAR(36),evidence_note VARCHAR(1000),observed_at TIMESTAMP)");
        db.execute("CREATE TABLE chapters(id VARCHAR(36) PRIMARY KEY,parent_id VARCHAR(36),slug VARCHAR(100),title VARCHAR(200),direction VARCHAR(40),sort_order INT,body_md VARCHAR(100000),content_version INT DEFAULT 1,status VARCHAR(32),version INT DEFAULT 1,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
        db.execute("CREATE TABLE content_reports(id VARCHAR(36) PRIMARY KEY,user_id VARCHAR(36),target_type VARCHAR(32),target_id VARCHAR(36),reason VARCHAR(1000),state VARCHAR(16),reviewer_id VARCHAR(36),decision_note VARCHAR(1000),version INT DEFAULT 1,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
        db.execute("CREATE TABLE jobs(id VARCHAR(36) PRIMARY KEY,company_id VARCHAR(36),source_id VARCHAR(36),version INT DEFAULT 1)");
        db.execute("CREATE TABLE radar_signals(id VARCHAR(36) PRIMARY KEY,company_id VARCHAR(36),version INT DEFAULT 1)");
        db.execute("CREATE TABLE experiences(id VARCHAR(36) PRIMARY KEY,author_id VARCHAR(36),company_id VARCHAR(36),title VARCHAR(200),summary VARCHAR(1000),body_md VARCHAR(100000),role VARCHAR(40),round_type VARCHAR(40),occurred_on DATE,tags VARCHAR(3000),content_mode VARCHAR(32),source_url VARCHAR(2000),license_note VARCHAR(1000),status VARCHAR(32),published_at TIMESTAMP,version INT DEFAULT 1,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
        db.execute("CREATE TABLE comments(id VARCHAR(36),experience_id VARCHAR(36))");
        for(String table:List.of("mock_sessions","salary_reports"))db.execute("CREATE TABLE "+table+"(id VARCHAR(36) PRIMARY KEY,company_id VARCHAR(36))");
        db.execute("CREATE TABLE referrals(id VARCHAR(36) PRIMARY KEY,company_id VARCHAR(36),job_id VARCHAR(36))");
        for(String table:List.of("applications","subscription_hits","job_cities","job_graduation_years"))db.execute("CREATE TABLE "+table+"(id VARCHAR(36),job_id VARCHAR(36),notes VARCHAR(1000))");
        for(String table:List.of("question_progress","mock_answers","buddy_tasks"))db.execute("CREATE TABLE "+table+"(id VARCHAR(36),question_id VARCHAR(36),note VARCHAR(1000))");
        db.execute("CREATE TABLE chapter_progress(id VARCHAR(36),chapter_id VARCHAR(36),note VARCHAR(1000))");
        db.execute("CREATE TABLE favorites(id VARCHAR(36),target_type VARCHAR(32),target_id VARCHAR(36))");
        var json=JsonMapper.builder().build();var rows=new SqlRows(new NamedParameterJdbcTemplate(ds),json);service=new AdminContentService(rows,new OwnerTransactions(rows,new DataSourceTransactionManager(ds)),new ContractInputs(json),Clock.systemUTC(),null);
        moderationSchema();
    }

    SocialService social;
    void moderationSchema() {
        String extra=",status VARCHAR(32),version INT DEFAULT 1,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP";
        db.execute("DROP TABLE comments");
        db.execute("CREATE TABLE comments(id VARCHAR(36) PRIMARY KEY,author_id VARCHAR(36),post_id VARCHAR(36),experience_id VARCHAR(36),parent_id VARCHAR(36),body VARCHAR(2000)"+extra+")");
        db.execute("CREATE TABLE posts(id VARCHAR(36) PRIMARY KEY,author_id VARCHAR(36),body_md VARCHAR(20000),tags VARCHAR(3000),published_at TIMESTAMP"+extra+")");
        db.execute("CREATE TABLE post_likes(post_id VARCHAR(36),user_id VARCHAR(36))");
        for(String table:List.of("jobs","radar_signals","salary_reports","referrals")) {
            String status=table.equals("jobs")?"publication_status":"status";
            String title=table.equals("salary_reports")?"role":"title";
            db.execute("ALTER TABLE "+table+" ADD "+status+" VARCHAR(32)");db.execute("ALTER TABLE "+table+" ADD "+title+" VARCHAR(200)");
            db.execute("ALTER TABLE "+table+" ADD updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
            if(List.of("salary_reports","referrals").contains(table))db.execute("ALTER TABLE "+table+" ADD version INT DEFAULT 1");
        }
        social=new SocialService(new SqlRows(new NamedParameterJdbcTemplate(db.getDataSource()),JsonMapper.builder().build()));
    }
    @Test void commentsPublishDirectlyWithdrawAndAdminRemovalAreVersionedAndScoped() {
        String post=social.createPost(user,Map.of("bodyMd","社区动态仍需审核","tags",List.of())).get("id").toString();
        assertEquals(1,service.moderationCount(admin));
        service.decide(reviewer,"POST",post,Map.of("version",1,"decision","APPROVE","reason","动态通过"),UUID.randomUUID().toString());
        var first=social.comment(user,"posts",post,Map.of("body","直接发布的评论"));String id=first.get("id").toString();
        assertEquals("PUBLISHED",first.get("status"));assertEquals(0,service.moderationCount(admin));
        assertNotNull(social.report(user,Map.of("targetType","POST_COMMENT","targetId",id,"reason","评论举报仍可提交")));
        var reply=social.comment(user,"posts",post,Map.of("body","直接发布的回复","parentId",id));assertEquals("PUBLISHED",reply.get("status"));
        assertEquals(404,assertThrows(ApiProblem.class,()->social.deleteComment(reviewer,"posts",post,id,1)).status());
        social.deleteComment(user,"posts",post,id,1);assertEquals("",db.queryForObject("SELECT body FROM comments WHERE id=?",String.class,id));assertEquals("HIDDEN",db.queryForObject("SELECT status FROM comments WHERE id=?",String.class,id));
        assertEquals("PUBLISHED",db.queryForObject("SELECT status FROM comments WHERE id=?",String.class,reply.get("id")));assertEquals(id,db.queryForObject("SELECT parent_id FROM comments WHERE id=?",String.class,reply.get("id")));
        assertEquals(2,service.comments(admin,1,20).size());
        assertEquals(403,assertThrows(ApiProblem.class,()->service.removeComment(reviewer,reply.get("id").toString(),Map.of("version",1,"reason","违规"))).status());
        assertEquals(409,assertThrows(ApiProblem.class,()->service.removeComment(admin,reply.get("id").toString(),Map.of("version",99,"reason","版本错误"))).status());
        service.decide(reviewer,"POST_COMMENT",reply.get("id").toString(),Map.of("version",1,"decision","HIDE","reason","举报核对后下架"),UUID.randomUUID().toString());
        assertEquals("HIDDEN",db.queryForObject("SELECT status FROM comments WHERE id=?",String.class,reply.get("id")));
        service.removeComment(admin,reply.get("id").toString(),Map.of("version",2,"reason","删除违规评论"));assertEquals("",db.queryForObject("SELECT body FROM comments WHERE id=?",String.class,reply.get("id")));
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM audit_logs WHERE action='COMMENT_DELETE'",Integer.class));
        String experience=UUID.randomUUID().toString();db.update("INSERT INTO experiences(id,title,status) VALUES(?,'公开面经','PUBLISHED')",experience);
        assertEquals("PUBLISHED",social.comment(user,"experiences",experience,Map.of("body","面经评论也直接发布")).get("status"));
        assertEquals(422,assertThrows(ApiProblem.class,()->service.decide(admin,"POST_COMMENT",id,Map.of("version",2,"decision","APPROVE","reason","不应审核"),UUID.randomUUID().toString())).status());
        assertEquals(403,assertThrows(ApiProblem.class,()->service.comments(user,1,20)).status());
    }
    @SuppressWarnings("unchecked") @Test void legacyPendingIdempotencySnapshotReturnsCurrentPublishedCommentWithoutDuplicating() {
        String post=UUID.randomUUID().toString();db.update("INSERT INTO posts(id,author_id,body_md,tags,status) VALUES(?,?,?,?,'PUBLISHED')",post,user,"公开原帖","[]");
        var json=JsonMapper.builder().build();var rows=new SqlRows(new NamedParameterJdbcTemplate(db.getDataSource()),json);var transactions=new OwnerTransactions(rows,new DataSourceTransactionManager(db.getDataSource()));
        var body=Map.<String,Object>of("body","重试之前的评论");String key=UUID.randomUUID().toString();
        transactions.write(user,"POST","/posts/"+post+"/comments",key,body,201,false,()->{var actual=social.comment(user,"posts",post,body);var legacy=new LinkedHashMap<>(actual);legacy.put("status","PENDING");return legacy;});
        var controller=new com.campusradar.social.SocialController(social,new com.campusradar.security.CurrentUser(db),transactions,new ContractInputs(json));
        var request=new org.springframework.mock.web.MockHttpServletRequest("POST","/api/v1/posts/"+post+"/comments");request.getSession().setAttribute(com.campusradar.security.CurrentUser.USER_ID,user);request.getSession().setAttribute(com.campusradar.security.CurrentUser.AUTH_VERSION,1);
        var result=(Map<String,Object>)controller.comment(request,post,key,body).getBody();
        assertEquals("PUBLISHED",((Map<String,Object>)result.get("data")).get("status"));assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM comments",Integer.class));
    }
    @Test void onlyEightReviewedSourcesRemainCommentsAreExcluded() {
        db.update("INSERT INTO jobs(id,title,publication_status) VALUES('job','岗位','PENDING')");
        db.update("INSERT INTO experiences(id,title,status) VALUES('experience','面经','PENDING'),('draft','草稿','DRAFT')");
        db.update("INSERT INTO questions(id,title,status) VALUES('question','题目','PENDING')");
        db.update("INSERT INTO chapters(id,title,status) VALUES('chapter','章节','PENDING')");
        db.update("INSERT INTO posts(id,body_md,status) VALUES('post','社区动态','PENDING')");
        db.update("INSERT INTO comments(id,body,post_id,status) VALUES('pc','社区评论','post','PENDING')");
        db.update("INSERT INTO comments(id,body,experience_id,status) VALUES('ec','面经评论','experience','PENDING')");
        db.update("INSERT INTO referrals(id,title,status) VALUES('referral','内推','PENDING')");
        db.update("INSERT INTO salary_reports(id,role,status) VALUES('salary','后端','PENDING')");
        db.update("INSERT INTO radar_signals(id,title,status) VALUES('signal','情报','PENDING')");
        assertEquals(8,service.moderationCount(admin));
        assertEquals(Set.of("JOB","EXPERIENCE","QUESTION","CHAPTER","POST","REFERRAL","SALARY","SIGNAL"),new HashSet<>(service.moderation(admin,1,20).stream().map(r->r.get("type")).toList()));
        assertThrows(ApiProblem.class,()->service.moderationCount(admin,"POST_COMMENT"));
        for(String kind:List.of("JOB","EXPERIENCE","QUESTION","CHAPTER","POST","REFERRAL","SALARY","SIGNAL")) {assertEquals(1,service.moderationCount(reviewer,kind));assertEquals(1,service.moderation(reviewer,kind,1,1).size());assertTrue(service.moderation(reviewer,kind,2,1).isEmpty());}
    }
}
