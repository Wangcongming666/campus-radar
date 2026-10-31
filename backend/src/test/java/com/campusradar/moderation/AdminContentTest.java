package com.campusradar.moderation;

import com.campusradar.common.*;
import java.time.Clock;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.*;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;

class AdminContentTest {
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
    }
    Map<String,Object> source(){return Map.of("name","官方站点","baseUrl","https://example.com/jobs","contentMode","METADATA_LINK","permissionNote","仅收录元信息与链接","enabled",true);}
    Map<String,Object> question(){var map=new LinkedHashMap<String,Object>();map.put("title","事务隔离");map.put("promptMd","解释隔离级别");map.put("answerMd","描述常见异常");map.put("role","后端");map.put("difficulty","MEDIUM");map.put("tags",List.of("MySQL"));map.put("companyIds",List.of());map.put("chapterId",null);return map;}
    @Test void roleBoundaryAndIdempotencyAreEnforcedWithinService(){
        assertThrows(ApiProblem.class,()->service.create(user,"sources",source(),UUID.randomUUID().toString()));assertThrows(ApiProblem.class,()->service.create(reviewer,"sources",source(),UUID.randomUUID().toString()));
        String key=UUID.randomUUID().toString();service.create(admin,"sources",source(),key);service.create(admin,"sources",source(),key);assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM sources",Integer.class));assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM audit_logs",Integer.class));
        assertThrows(ApiProblem.class,()->service.list(reviewer,"sources",1,20));assertEquals(1,service.list(admin,"sources",1,20).size());
    }
    @SuppressWarnings("unchecked") @Test void pendingContentRequiresReviewAndChangesReturnToPending(){
        var q=(Map<String,Object>)service.create(admin,"questions",question(),UUID.randomUUID().toString());String id=q.get("id").toString();assertEquals("PENDING",q.get("status"));
        String key=UUID.randomUUID().toString();var decision=Map.<String,Object>of("version",1,"decision","APPROVE","reason","题目和答案已核对");
        service.decide(reviewer,"QUESTION",id,decision,key);service.decide(reviewer,"QUESTION",id,decision,key);assertEquals("PUBLISHED",db.queryForObject("SELECT status FROM questions WHERE id=?",String.class,id));assertEquals(2,db.queryForObject("SELECT COUNT(*) FROM audit_logs",Integer.class));
        assertThrows(ApiProblem.class,()->service.decide(reviewer,"QUESTION",id,Map.of("version",1,"decision","HIDE","reason","过时版本"),UUID.randomUUID().toString()));
        service.patch(admin,"questions",id,Map.of("version",2,"answerMd","更完整的说明"));assertEquals("PENDING",db.queryForObject("SELECT status FROM questions WHERE id=?",String.class,id));
        assertThrows(ApiProblem.class,()->service.patch(reviewer,"questions",id,Map.of("version",3,"title","越权修改")));
    }
    @Test void reportDecisionsAreConditionalAndAudited(){
        String id=UUID.randomUUID().toString();db.update("INSERT INTO content_reports(id,user_id,target_type,target_id,reason,state) VALUES(?,?,'QUESTION',?,'内容有误','OPEN')",id,user,UUID.randomUUID().toString());
        service.reportDecision(reviewer,id,Map.of("version",1,"state","RESOLVED","reason","已核查并修订内容"));assertEquals("RESOLVED",db.queryForObject("SELECT state FROM content_reports WHERE id=?",String.class,id));assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM audit_logs",Integer.class));
        assertThrows(ApiProblem.class,()->service.reportDecision(reviewer,id,Map.of("version",1,"state","DISMISSED","reason","旧版本")));
        assertThrows(ApiProblem.class,()->service.auditLogs(reviewer,1,20));
    }
    @SuppressWarnings("unchecked") @Test void reviewDetailIncludesSafeContentAndUsesLiveVersion() {
        var question=(Map<String,Object>)service.create(admin,"questions",question(),UUID.randomUUID().toString());String id=question.get("id").toString();
        var detail=service.detail(reviewer,"QUESTION",id);var content=(Map<String,Object>)detail.get("content");var item=(Map<String,Object>)detail.get("item");
        assertEquals("解释隔离级别",content.get("promptMd"));assertEquals(question.get("version"),item.get("version"));assertFalse(content.containsKey("passwordHash"));assertFalse(content.containsKey("email"));
        assertThrows(ApiProblem.class,()->service.detail(user,"QUESTION",id));
    }
    @Test void unknownFieldsCannotPublishOrGrantRoles(){var body=question();body.put("status","PUBLISHED");assertThrows(ApiProblem.class,()->service.create(admin,"questions",body,UUID.randomUUID().toString()));assertThrows(ApiProblem.class,()->service.certify(reviewer,user,Map.of("version",1,"verified",true,"validUntil","2027-01-01T00:00:00Z","evidenceNote","已核查")));}
    @Test void catalogDeletionRequiresAdminAndCurrentPositiveVersion(){
        String id=UUID.randomUUID().toString();db.update("INSERT INTO sources(id,name) VALUES(?,'待删除来源')",id);
        assertEquals(403,assertThrows(ApiProblem.class,()->service.delete(user,"sources",id,1)).status());
        assertEquals(403,assertThrows(ApiProblem.class,()->service.delete(reviewer,"sources",id,1)).status());
        assertEquals(422,assertThrows(ApiProblem.class,()->service.delete(admin,"sources",id,0)).status());
        assertEquals("VERSION_CONFLICT",assertThrows(ApiProblem.class,()->service.delete(admin,"sources",id,2)).code());
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM sources",Integer.class));
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM audit_logs",Integer.class));
    }
    @Test void unreferencedCatalogRowsCanBeDeletedAndEachDeletionIsAudited(){
        for(String kind:List.of("companies","jobs","questions","chapters","signals","sources")){
            String table=kind.equals("signals")?"radar_signals":kind;String id=UUID.randomUUID().toString();
            db.update("INSERT INTO "+table+"(id) VALUES(?)",id);service.delete(admin,kind,id,1);
            assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM "+table+" WHERE id=?",Integer.class,id));
            assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM audit_logs WHERE action='CONTENT_DELETE' AND target_id=?",Integer.class,id));
            assertEquals(404,assertThrows(ApiProblem.class,()->service.delete(admin,kind,id,1)).status());
        }
    }
    @Test void deletionCleansOnlyOwnedCatalogRelations(){
        String job=UUID.randomUUID().toString(),question=UUID.randomUUID().toString();
        db.update("INSERT INTO jobs(id) VALUES(?)",job);db.update("INSERT INTO job_cities(job_id) VALUES(?)",job);db.update("INSERT INTO job_graduation_years(job_id) VALUES(?)",job);
        db.update("INSERT INTO questions(id) VALUES(?)",question);db.update("INSERT INTO question_companies(question_id,company_id) VALUES(?,?)",question,UUID.randomUUID().toString());
        service.delete(admin,"jobs",job,1);service.delete(admin,"questions",question,1);
        for(String table:List.of("job_cities","job_graduation_years","question_companies"))assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM "+table,Integer.class));
    }
    @Test void applicationsAndStudyNotesBlockDeletionWithoutAnyPrivateDataLoss(){
        String job=UUID.randomUUID().toString(),question=UUID.randomUUID().toString(),chapter=UUID.randomUUID().toString();
        db.update("INSERT INTO jobs(id) VALUES(?)",job);db.update("INSERT INTO applications(job_id,notes) VALUES(?,'我的投递笔记')",job);
        db.update("INSERT INTO questions(id) VALUES(?)",question);db.update("INSERT INTO question_progress(question_id,note) VALUES(?,'我的错题笔记')",question);
        db.update("INSERT INTO chapters(id) VALUES(?)",chapter);db.update("INSERT INTO chapter_progress(chapter_id,note) VALUES(?,'我的学习笔记')",chapter);
        for(var target:List.of(Map.entry("jobs",job),Map.entry("questions",question),Map.entry("chapters",chapter)))assertEquals("CONTENT_REFERENCED",assertThrows(ApiProblem.class,()->service.delete(admin,target.getKey(),target.getValue(),1)).code());
        assertEquals("我的投递笔记",db.queryForObject("SELECT notes FROM applications",String.class));
        assertEquals("我的错题笔记",db.queryForObject("SELECT note FROM question_progress",String.class));
        assertEquals("我的学习笔记",db.queryForObject("SELECT note FROM chapter_progress",String.class));
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM audit_logs",Integer.class));
    }
    @Test void catalogReferencesAndLogicalFavoritesAndReportsBlockDeletion(){
        String company=UUID.randomUUID().toString(),source=UUID.randomUUID().toString(),chapter=UUID.randomUUID().toString(),signal=UUID.randomUUID().toString();
        db.update("INSERT INTO companies(id) VALUES(?)",company);db.update("INSERT INTO sources(id) VALUES(?)",source);db.update("INSERT INTO jobs(id,company_id,source_id) VALUES(?,?,?)",UUID.randomUUID().toString(),company,source);
        db.update("INSERT INTO chapters(id) VALUES(?)",chapter);db.update("INSERT INTO chapters(id,parent_id) VALUES(?,?)",UUID.randomUUID().toString(),chapter);
        db.update("INSERT INTO radar_signals(id) VALUES(?)",signal);db.update("INSERT INTO favorites(target_type,target_id) VALUES('SIGNAL',?)",signal);
        for(var target:List.of(Map.entry("companies",company),Map.entry("sources",source),Map.entry("chapters",chapter),Map.entry("signals",signal)))assertEquals("CONTENT_REFERENCED",assertThrows(ApiProblem.class,()->service.delete(admin,target.getKey(),target.getValue(),1)).code());
        db.update("DELETE FROM favorites");db.update("INSERT INTO content_reports(id,target_type,target_id) VALUES(?,'SIGNAL',?)",UUID.randomUUID().toString(),signal);
        assertEquals("CONTENT_REFERENCED",assertThrows(ApiProblem.class,()->service.delete(admin,"signals",signal,1)).code());
    }
    @Test void failedAuditRollsBackCatalogAndOwnedRelationDeletion(){
        String job=UUID.randomUUID().toString();db.update("INSERT INTO jobs(id) VALUES(?)",job);db.update("INSERT INTO job_cities(job_id) VALUES(?)",job);db.execute("DROP TABLE audit_logs");
        assertThrows(RuntimeException.class,()->service.delete(admin,"jobs",job,1));
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM jobs",Integer.class));
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM job_cities",Integer.class));
    }

    @Test void adminUserListProjectsOnlyBasicFieldsAndSupportsSearchAndStatus(){
        db.update("UPDATE users SET email='student@example.test',display_name='测试学生',password_hash='secret-password-hash' WHERE id=?",user);
        var result=service.users(admin,"student","ACTIVE",1,20);assertEquals(1,result.size());assertEquals("student@example.test",result.getFirst().get("email"));
        assertEquals(Set.of("id","version","email","displayName","role","status","school","education","graduationYear","emailVerified","createdAt"),result.getFirst().keySet());
        assertEquals(1,service.userCount(admin,"student","ACTIVE"));assertEquals(0,service.users(admin,"missing",null,1,20).size());
        assertEquals(403,assertThrows(ApiProblem.class,()->service.users(reviewer,null,null,1,20)).status());
    }
    @Test void basicUserUpdateIsVersionedAuditedAndStatusChangesRevokeSessions(){
        service.patchUser(admin,user,Map.of("version",1,"displayName","新名字","school","测试大学","status","FROZEN"));
        assertEquals("FROZEN",db.queryForObject("SELECT status FROM users WHERE id=?",String.class,user));assertEquals(2,db.queryForObject("SELECT auth_version FROM users WHERE id=?",Integer.class,user));
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM audit_logs WHERE action='USER_EDIT'",Integer.class));
        assertEquals(409,assertThrows(ApiProblem.class,()->service.patchUser(admin,user,Map.of("version",1,"status","ACTIVE"))).status());
        service.patchUser(admin,user,Map.of("version",2,"status","ACTIVE"));assertEquals(3,db.queryForObject("SELECT auth_version FROM users WHERE id=?",Integer.class,user));
        service.patchUser(admin,user,Map.of("version",3,"school","另一学校"));assertEquals(3,db.queryForObject("SELECT auth_version FROM users WHERE id=?",Integer.class,user));
    }
    @Test void userAdministrationCannotAssignRolesOrAlterManagementAccounts(){
        for(String target:List.of(admin,reviewer))assertEquals(403,assertThrows(ApiProblem.class,()->service.patchUser(admin,target,Map.of("version",1,"status","FROZEN"))).status());
        assertEquals(403,assertThrows(ApiProblem.class,()->service.patchUser(user,user,Map.of("version",1,"displayName","越权"))).status());
        for(String field:List.of("role","email","passwordHash","authVersion"))assertEquals(422,assertThrows(ApiProblem.class,()->service.patchUser(admin,user,Map.of("version",1,field,"ADMIN"))).status());
        db.update("UPDATE users SET status='PENDING' WHERE id=?",user);assertEquals(409,assertThrows(ApiProblem.class,()->service.patchUser(admin,user,Map.of("version",1,"status","ACTIVE"))).status());
    }
    @SuppressWarnings("unchecked") @Test void curatedExperiencesHaveNoImpersonatedAuthorAndRespectPrivateOwnership(){
        var body=new LinkedHashMap<String,Object>();body.put("companyId",null);body.put("title","管理员整理面经");body.put("summary","摘要");body.put("bodyMd","正文");body.put("role","后端");body.put("roundType","技术面");body.put("occurredOn",null);body.put("tags",List.of());body.put("contentMode","ORIGINAL");body.put("sourceUrl",null);body.put("licenseNote","管理员原创整理");
        var created=(Map<String,Object>)service.create(admin,"experiences",body,UUID.randomUUID().toString());String id=created.get("id").toString();assertNull(created.get("authorId"));assertEquals("PENDING",created.get("status"));
        service.patch(admin,"experiences",id,Map.of("version",1,"title","修订面经"));assertEquals(2,db.queryForObject("SELECT version FROM experiences WHERE id=?",Integer.class,id));
        String privateId=UUID.randomUUID().toString();db.update("INSERT INTO experiences(id,author_id,title,status) VALUES(?,?,?,'DRAFT')",privateId,user,"私人草稿");
        assertEquals(1,service.list(admin,"experiences",1,20).size());assertEquals(404,assertThrows(ApiProblem.class,()->service.detail(reviewer,"EXPERIENCE",privateId)).status());assertEquals(404,assertThrows(ApiProblem.class,()->service.patch(admin,"experiences",privateId,Map.of("version",1,"title","禁止修改"))).status());
        assertEquals(404,assertThrows(ApiProblem.class,()->service.delete(admin,"experiences",privateId,1)).status());
        body.put("authorId",user);assertEquals(422,assertThrows(ApiProblem.class,()->service.create(admin,"experiences",body,UUID.randomUUID().toString())).status());
        service.delete(admin,"experiences",id,2);assertEquals("私人草稿",db.queryForObject("SELECT title FROM experiences",String.class));
    }

    @Test void experienceCatalogIncludesSubmittedUserContentButKeepsPrivateDraftsAndMutationsSeparate(){
        String curated=UUID.randomUUID().toString();db.update("INSERT INTO experiences(id,title,status) VALUES(?,'策展面经','PENDING')",curated);
        var publicIds=new ArrayList<String>();
        for(String status:List.of("PENDING","PUBLISHED","HIDDEN","DRAFT","REJECTED")){
            String id=UUID.randomUUID().toString();db.update("INSERT INTO experiences(id,author_id,title,status) VALUES(?,?,?,?)",id,user,status+"用户面经",status);
            if(List.of("PENDING","PUBLISHED","HIDDEN").contains(status))publicIds.add(id);
            assertEquals(404,assertThrows(ApiProblem.class,()->service.patch(admin,"experiences",id,Map.of("version",1,"title","禁止改写用户正文"))).status());
            assertEquals(404,assertThrows(ApiProblem.class,()->service.delete(admin,"experiences",id,1)).status());
        }
        var listed=service.list(admin,"experiences",1,20);assertEquals(4,listed.size());assertEquals(4,service.count(admin,"experiences"));
        assertTrue(listed.stream().anyMatch(row->row.get("id").equals(curated)));
        for(String id:publicIds)assertTrue(listed.stream().anyMatch(row->row.get("id").equals(id)&&user.equals(row.get("authorId"))));
        assertFalse(listed.stream().anyMatch(row->List.of("DRAFT","REJECTED").contains(row.get("status"))));
        assertEquals(6,db.queryForObject("SELECT COUNT(*) FROM experiences",Integer.class));
    }

}
