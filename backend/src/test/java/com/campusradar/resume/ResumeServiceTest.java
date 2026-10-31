package com.campusradar.resume;

import com.campusradar.common.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.*;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;

class ResumeServiceTest {
    @TempDir Path directory;JdbcTemplate db;ResumeService service;
    final String user="11111111-1111-1111-1111-111111111111",other="22222222-2222-2222-2222-222222222222";
    @BeforeEach void setup(){
        var ds=new DriverManagerDataSource("jdbc:h2:mem:resumes;MODE=MySQL;DB_CLOSE_DELAY=-1","sa","");db=new JdbcTemplate(ds);db.execute("DROP ALL OBJECTS");
        db.execute("CREATE TABLE users(id VARCHAR(36) PRIMARY KEY,status VARCHAR(20),data_operation VARCHAR(20),data_revision INT DEFAULT 0,avatar_file_id VARCHAR(36))");db.update("INSERT INTO users(id,status,data_operation) VALUES(?,'ACTIVE','IDLE'),(?,'ACTIVE','IDLE')",user,other);
        db.execute("CREATE TABLE files(id VARCHAR(36) PRIMARY KEY,user_id VARCHAR(36),purpose VARCHAR(32),original_name VARCHAR(255),storage_key VARCHAR(255),mime_type VARCHAR(100),size_bytes BIGINT,sha256 VARCHAR(64),expires_at TIMESTAMP,state VARCHAR(32) DEFAULT 'READY',version INT DEFAULT 1,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
        db.execute("CREATE TABLE resumes(id VARCHAR(36) PRIMARY KEY,user_id VARCHAR(36),file_id VARCHAR(36),name VARCHAR(120),sequence INT,is_default BOOLEAN DEFAULT FALSE,default_owner VARCHAR(36) AS (CASE WHEN is_default THEN user_id ELSE NULL END),text_content VARCHAR(100000),extraction_state VARCHAR(32),version INT DEFAULT 1,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,UNIQUE(default_owner),UNIQUE(user_id,sequence))");
        db.execute("CREATE TABLE applications(id VARCHAR(36),user_id VARCHAR(36),resume_id VARCHAR(36))");db.execute("CREATE TABLE interview_reviews(id VARCHAR(36),user_id VARCHAR(36),recording_file_id VARCHAR(36))");db.execute("CREATE TABLE tasks(id VARCHAR(36),user_id VARCHAR(36),result_file_id VARCHAR(36),type VARCHAR(32),state VARCHAR(32))");
        db.execute("CREATE TABLE import_previews(id VARCHAR(36),user_id VARCHAR(36),backup_file_id VARCHAR(36),state VARCHAR(32),expires_at TIMESTAMP,FOREIGN KEY(backup_file_id) REFERENCES files(id))");
        db.execute("CREATE TABLE idempotency_records(id VARCHAR(36),user_id VARCHAR(36),method VARCHAR(8),route_hash VARCHAR(64),idem_key VARCHAR(80),request_hash VARCHAR(64),http_status INT,response_body VARCHAR(200000),expires_at TIMESTAMP)");
        var json=JsonMapper.builder().build();var rows=new SqlRows(new NamedParameterJdbcTemplate(ds),json);service=new ResumeService(rows,new OwnerTransactions(rows,new DataSourceTransactionManager(ds)),new ContractInputs(json),new PrivateFileStorage(directory.toString()),Clock.systemUTC());
    }
    @SuppressWarnings("unchecked") Map<String,Object> file(String owner,String name){return (Map<String,Object>)service.upload(owner,"RESUME",name,"text/plain","教育背景\n项目经历\n技能 Java".getBytes(StandardCharsets.UTF_8),UUID.randomUUID().toString());}
    @SuppressWarnings("unchecked") Map<String,Object> resume(String owner,String file,String name){return (Map<String,Object>)service.create(owner,Map.of("fileId",file,"name",name,"text","教育背景\n项目经历\n技能 Java","extractionState","TEXT_READY"),UUID.randomUUID().toString());}
    @Test void originalBytesArePrivateAndIntegrityChecked() throws Exception {
        var metadata=file(user,"cv.txt");String id=metadata.get("id").toString();byte[] bytes=service.download(user,id).bytes();assertEquals("教育背景\n项目经历\n技能 Java",new String(bytes,StandardCharsets.UTF_8));assertEquals(metadata.get("sha256"),PrivateFileStorage.hash(bytes));
        assertFalse(metadata.containsKey("storageKey"));assertThrows(ApiProblem.class,()->service.download(other,id));
        Files.writeString(directory.resolve(user).resolve(id+".bin"),"corrupted");assertThrows(ApiProblem.class,()->service.download(user,id));
    }
    @Test void uploadIdempotencyReplaysAndRejectsDifferentBytesWithoutOrphans() throws Exception {
        String key=UUID.randomUUID().toString();byte[] bytes="same bytes".getBytes(StandardCharsets.UTF_8);
        service.upload(user,"RESUME","cv.txt","text/plain",bytes,key);service.upload(user,"RESUME","cv.txt","text/plain",bytes,key);
        assertEquals(1,service.fileCount(user));assertEquals(1,db.queryForObject("SELECT data_revision FROM users WHERE id=?",Integer.class,user));
        assertThrows(ApiProblem.class,()->service.upload(user,"RESUME","cv.txt","text/plain","different".getBytes(StandardCharsets.UTF_8),key));
        try(var paths=Files.list(directory)){assertEquals(0,paths.filter(p->p.getFileName().toString().endsWith(".tmp")).count());}
    }
    @Test void referencesOwnershipDefaultUniquenessAndVersionAreEnforced(){
        var f=file(user,"cv.txt");String fileId=f.get("id").toString();var first=resume(user,fileId,"one");var second=resume(user,fileId,"two");String a=first.get("id").toString(),b=second.get("id").toString();
        assertEquals(true,first.get("isDefault"));assertEquals(false,second.get("isDefault"));
        assertThrows(ApiProblem.class,()->resume(other,fileId,"intrusion"));assertThrows(ApiProblem.class,()->service.resume(other,a));assertThrows(ApiProblem.class,()->service.deleteFile(user,fileId,1));
        service.patch(user,b,Map.of("version",1,"isDefault",true));assertEquals(false,service.resume(user,a).get("isDefault"));assertEquals(true,service.resume(user,b).get("isDefault"));
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM resumes WHERE user_id=? AND is_default=TRUE",Integer.class,user));
        assertThrows(ApiProblem.class,()->service.patch(user,b,Map.of("version",1,"name","stale")));
        assertThrows(ApiProblem.class,()->service.patch(user,b,Map.of("version",2,"userId",other)));
    }
    @Test void exportSnapshotRetainsPendingOriginalUntilTaskTerminates() {
        var file=file(user,"cv.txt");String id=file.get("id").toString();service.deleteFile(user,id,1);
        db.update("INSERT INTO tasks(id,user_id,type,state) VALUES('export',?,'DATA_EXPORT','RUNNING')",user);
        service.erasePending();assertEquals(1,service.fileCount(user));assertTrue(Files.exists(directory.resolve(user).resolve(id+".bin")));
        db.update("UPDATE tasks SET state='SUCCEEDED' WHERE id='export'");service.erasePending();assertEquals(0,service.fileCount(user));
    }
    @Test void removingReferencesAllowsDurableAsynchronousErase() throws Exception {
        var f=file(user,"cv.txt");String id=f.get("id").toString();var r=resume(user,id,"one");service.deleteResume(user,r.get("id").toString(),1);service.deleteFile(user,id,1);
        assertEquals("PENDING_DELETE",service.files(user,1,20).getFirst().get("state"));assertThrows(ApiProblem.class,()->service.download(user,id));
        service.erasePending();assertEquals(0,service.fileCount(user));assertFalse(Files.exists(directory.resolve(user).resolve(id+".bin")));
    }
    @SuppressWarnings("unchecked") @Test void expiredBackupIsUnreadableAndErasedOnlyAfterPreviewAndActiveTaskRelease() {
        var file=(Map<String,Object>)service.upload(user,"BACKUP","backup.zip","application/zip",new byte[]{80,75,5,6},UUID.randomUUID().toString());
        String id=file.get("id").toString();
        db.update("UPDATE files SET expires_at=? WHERE id=?",java.sql.Timestamp.from(Instant.now().minusSeconds(60)),id);
        assertThrows(ApiProblem.class,()->service.download(user,id));
        db.update("INSERT INTO import_previews VALUES('preview',?,?,'VALID',?)",user,id,java.sql.Timestamp.from(Instant.now().plusSeconds(600)));
        service.erasePending();assertEquals("READY",service.files(user,1,20).getFirst().get("state"));
        db.update("UPDATE import_previews SET expires_at=?",java.sql.Timestamp.from(Instant.now().minusSeconds(1)));
        db.update("INSERT INTO tasks VALUES('import',?,?,'DATA_IMPORT','RUNNING')",user,id);
        service.erasePending();assertEquals(1,service.fileCount(user));assertTrue(Files.exists(directory.resolve(user).resolve(id+".bin")));
        db.update("UPDATE tasks SET state='SUCCEEDED'");service.erasePending();assertEquals(0,service.fileCount(user));
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM import_previews",Integer.class));assertFalse(Files.exists(directory.resolve(user).resolve(id+".bin")));
    }
}
