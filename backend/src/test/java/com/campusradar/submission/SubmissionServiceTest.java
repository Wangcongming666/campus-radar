package com.campusradar.submission;

import com.campusradar.common.*;
import com.campusradar.security.CurrentUser;
import org.springframework.mock.web.MockHttpServletRequest;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import tools.jackson.databind.json.JsonMapper;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class SubmissionServiceTest {
    JdbcTemplate db; SubmissionService service;
    @BeforeEach void setup() {
        var ds=new DriverManagerDataSource("jdbc:h2:mem:submissions;MODE=MySQL;DB_CLOSE_DELAY=-1;NON_KEYWORDS=YEAR","sa","");db=new JdbcTemplate(ds);db.execute("DROP ALL OBJECTS");
        String base=",status VARCHAR,version INT DEFAULT 1,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP";
        db.execute("CREATE TABLE posts(id VARCHAR PRIMARY KEY,author_id VARCHAR,body_md VARCHAR"+base+")");
        db.execute("CREATE TABLE experiences(id VARCHAR PRIMARY KEY,author_id VARCHAR,title VARCHAR,summary VARCHAR"+base+")");
        db.execute("CREATE TABLE companies(id VARCHAR PRIMARY KEY,name VARCHAR)");db.update("INSERT INTO companies VALUES('co','Company')");
        db.execute("CREATE TABLE salary_reports(id VARCHAR PRIMARY KEY,author_id VARCHAR,company_id VARCHAR,role VARCHAR,city VARCHAR,year INT,base_monthly_minor BIGINT,salary_months DECIMAL(4,2),bonus_minor BIGINT,source_note VARCHAR"+base+")");
        db.execute("CREATE TABLE users(id VARCHAR PRIMARY KEY,status VARCHAR,provider_verified BOOLEAN,provider_verified_until TIMESTAMP,role VARCHAR DEFAULT 'USER',auth_version INT DEFAULT 1)");db.update("INSERT INTO users(id,status,provider_verified,provider_verified_until) VALUES('u','ACTIVE',true,DATEADD('DAY',1,CURRENT_TIMESTAMP))");
        db.execute("CREATE TABLE referrals(id VARCHAR PRIMARY KEY,provider_id VARCHAR,title VARCHAR,description VARCHAR,expires_at TIMESTAMP"+base+")");
        db.execute("CREATE TABLE comments(id VARCHAR PRIMARY KEY,author_id VARCHAR,post_id VARCHAR,experience_id VARCHAR,parent_id VARCHAR,body VARCHAR"+base+")");
        db.update("INSERT INTO posts(id,author_id,body_md,status) VALUES('p','u','Own post','PUBLISHED'),('other','v','PRIVATE SECRET','PENDING')");
        db.update("INSERT INTO experiences(id,author_id,title,summary,status) VALUES('e','u','Own experience','Summary','DRAFT'),('curated',NULL,'Curated','Not mine','PUBLISHED')");
        db.update("INSERT INTO salary_reports(id,author_id,company_id,role,city,year,base_monthly_minor,salary_months,bonus_minor,source_note,status) VALUES('s','u','co','backend','北京',2026,1200000,13,NULL,'本人录用通知','PENDING'),('foreign-s','v','co','SECRET','北京',2026,9999999,12,1000,'PRIVATE SECRET','PENDING')");
        db.update("INSERT INTO referrals(id,provider_id,title,description,expires_at,status) VALUES('r','u','Referral','Own referral',DATEADD('DAY',1,CURRENT_TIMESTAMP),'REJECTED')");
        db.update("INSERT INTO comments(id,author_id,post_id,experience_id,body,status) VALUES('pc','u','p',NULL,'Own post comment','PENDING'),('ec','u',NULL,'e','Own experience comment','PUBLISHED'),('foreign-c','v','p',NULL,'PRIVATE SECRET','PENDING')");
        service=new SubmissionService(new SqlRows(new NamedParameterJdbcTemplate(ds),JsonMapper.builder().build()));
    }
    @Test void aggregatesOnlyOwnedRecordsAcrossEveryKindAndWhitelistsProjection() {
        var result=service.list("u",null,null,1,20);assertEquals(6,result.total());
        assertEquals(Set.of("POST","EXPERIENCE","SALARY","REFERRAL","POST_COMMENT","EXPERIENCE_COMMENT"),new HashSet<>(result.data().stream().map(r->r.get("kind")).toList()));
        for(var row:result.data()) {assertFalse(row.containsKey("authorId"));assertFalse(row.containsKey("providerId"));assertFalse(row.toString().contains("PRIVATE SECRET"));assertTrue(row.keySet().containsAll(Set.of("id","kind","status","title","summary","version","createdAt","updatedAt","publicPath")));}
        assertEquals(3,service.list("v",null,null,1,20).total());assertEquals(0,service.list("nobody",null,null,1,20).total());
    }
    @Test void filtersAndPaginatesActualTotalsWithStableTieOrder() {
        var pending=service.list("u",null,"PENDING",1,1);assertEquals(2,pending.total());assertEquals(1,pending.data().size());
        var next=service.list("u",null,"PENDING",2,1);assertNotEquals(pending.data().getFirst().get("id"),next.data().getFirst().get("id"));
        assertEquals(pending.data(),service.list("u",null,"PENDING",1,1).data());
        assertEquals("s",service.list("u","SALARY","PENDING",1,20).data().getFirst().get("id"));
        assertEquals(0,service.list("u","SALARY","PUBLISHED",1,20).total());assertEquals(0,service.list("u",null,null,500,20).data().size());
    }
    @Test void textProjectionPreservesUnicodeLengthNullAndUnpaddedIdentifiers() {
        String text="社区🧭".repeat(180);
        db.update("UPDATE posts SET body_md=? WHERE id='p'",text);
        db.update("UPDATE experiences SET title=? WHERE id='e'","中文面经🧭");
        var post=service.list("u","POST",null,1,20).data().getFirst();
        assertEquals("p",post.get("id"));assertEquals("POST",post.get("kind"));
        assertEquals("PUBLISHED",post.get("status"));
        assertEquals("/community#post-p",post.get("publicPath"));
        assertEquals(text.substring(0,60),post.get("title"));
        assertEquals(text.substring(0,500),post.get("summary"));
        var experience=service.list("u","EXPERIENCE",null,1,20).data().getFirst();
        assertEquals("中文面经🧭",experience.get("title"));assertNull(experience.get("publicPath"));
        assertEquals(6,service.list("u",null,null,1,20).total());
    }
    @Test void publicLinksRespectParentVisibilityAndSalaryDetailsKeepUnknownDifferentFromZero() {
        var rows=service.list("u",null,null,1,20).data();
        assertNotNull(rows.stream().filter(r->r.get("id").equals("p")).findFirst().orElseThrow().get("publicPath"));
        assertNull(rows.stream().filter(r->r.get("id").equals("ec")).findFirst().orElseThrow().get("publicPath"));
        var salary=service.list("u","SALARY",null,1,20).data().getFirst();assertNull(salary.get("publicPath"));assertTrue(salary.get("details").toString().contains("未知"));
        db.update("UPDATE salary_reports SET bonus_minor=0 WHERE id='s'");assertTrue(service.list("u","SALARY",null,1,20).data().getFirst().get("details").toString().contains("0 元"));
        db.update("UPDATE experiences SET status='PUBLISHED' WHERE id='e'");assertNotNull(service.list("u","EXPERIENCE_COMMENT",null,1,20).data().getFirst().get("publicPath"));
    }
    @SuppressWarnings("unchecked") @Test void controllerUsesSessionOwnerAndReturnsAccurateNoStorePagination() {
        var controller=new SubmissionController(service,new CurrentUser(db));
        var anonymous=new MockHttpServletRequest("GET","/api/v1/me/submissions");
        assertEquals(401,assertThrows(ApiProblem.class,()->controller.list(anonymous,null,null,1,20)).status());
        var request=new MockHttpServletRequest("GET","/api/v1/me/submissions");request.getSession().setAttribute(CurrentUser.USER_ID,"u");request.getSession().setAttribute(CurrentUser.AUTH_VERSION,1);
        request.setParameter("userId","v");
        var response=controller.list(request,null,"PENDING",1,1);assertEquals("no-store",response.getHeaders().getCacheControl());
        var body=(Map<String,Object>)response.getBody();var page=(Map<String,Object>)body.get("page");
        assertEquals(2L,page.get("total"));assertEquals(true,page.get("hasMore"));assertEquals(1,((List<?>)body.get("data")).size());
        assertFalse(body.toString().contains("PRIVATE SECRET"));
        db.update("UPDATE users SET auth_version=2 WHERE id='u'");assertEquals(401,assertThrows(ApiProblem.class,()->controller.list(request,null,null,1,20)).status());
    }
    @Test void expiredOrUnverifiedReferralCannotLinkToInvisiblePublicContent() {
        db.update("UPDATE referrals SET status='PUBLISHED' WHERE id='r'");assertNotNull(service.list("u","REFERRAL",null,1,20).data().getFirst().get("publicPath"));
        db.update("UPDATE users SET provider_verified=false WHERE id='u'");assertNull(service.list("u","REFERRAL",null,1,20).data().getFirst().get("publicPath"));
        db.update("UPDATE users SET provider_verified=true WHERE id='u'");db.update("UPDATE referrals SET expires_at=DATEADD('DAY',-1,CURRENT_TIMESTAMP) WHERE id='r'");assertNull(service.list("u","REFERRAL",null,1,20).data().getFirst().get("publicPath"));
    }
    @SuppressWarnings("unchecked") @Test void communityCommentContextKeepsFullOwnBodyAndHidesPrivateForeignContext() {
        String longBody="我的完整评论".repeat(180);
        db.update("UPDATE comments SET body=? WHERE id='pc'",longBody);
        var context=(Map<String,Object>)service.list("u","POST_COMMENT",null,1,20).data().getFirst().get("commentContext");
        assertNotNull(context);assertEquals(longBody,context.get("body"));assertEquals("Own post",context.get("postSummary"));
        assertEquals(true,context.get("postAvailable"));assertEquals("/community#post-p",context.get("postPath"));assertNull(context.get("parentId"));
        db.update("INSERT INTO comments(id,author_id,post_id,parent_id,body,status) VALUES('reply','u','other','foreign-c','My pending reply','PENDING')");
        var reply=service.list("u","POST_COMMENT",null,1,20).data().stream().filter(r->r.get("id").equals("reply")).findFirst().orElseThrow();
        context=(Map<String,Object>)reply.get("commentContext");
        assertEquals("My pending reply",context.get("body"));assertEquals(false,context.get("postAvailable"));assertNull(context.get("postSummary"));assertNull(context.get("postPath"));assertNull(context.get("parentBody"));
        assertFalse(reply.toString().contains("PRIVATE SECRET"));
        db.update("UPDATE posts SET status='PUBLISHED' WHERE id='other'");
        db.update("UPDATE comments SET post_id='other',status='PUBLISHED',body='Public parent' WHERE id='foreign-c'");
        context=(Map<String,Object>)service.list("u","POST_COMMENT",null,1,20).data().stream().filter(r->r.get("id").equals("reply")).findFirst().orElseThrow().get("commentContext");
        assertEquals("Public parent",context.get("parentBody"));assertNotNull(context.get("postPath"));
        db.update("UPDATE comments SET status='HIDDEN',body='HIDDEN PARENT SECRET' WHERE id='foreign-c'");
        context=(Map<String,Object>)service.list("u","POST_COMMENT",null,1,20).data().stream().filter(r->r.get("id").equals("reply")).findFirst().orElseThrow().get("commentContext");assertNull(context.get("parentBody"));
        assertFalse(service.list("v","POST_COMMENT",null,1,20).toString().contains("My pending reply"));
    }
    @Test void rejectsUnknownFiltersAndUnboundedQueries() {
        for(String type:List.of("UNKNOWN","POST' OR 1=1 --"))assertThrows(ApiProblem.class,()->service.list("u",type,null,1,20));
        assertThrows(ApiProblem.class,()->service.list("u",null,"UNKNOWN",1,20));
        for(int page:List.of(0,501))assertThrows(ApiProblem.class,()->service.list("u",null,null,page,20));
        for(int size:List.of(0,101))assertThrows(ApiProblem.class,()->service.list("u",null,null,1,size));
        assertThrows(ApiProblem.class,()->service.list(null,null,null,1,20));
    }
}
