package com.campusradar;

import com.campusradar.common.*;
import com.campusradar.knowledge.KnowledgeService;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.*;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;

class KnowledgeServiceTest {
    KnowledgeService service;
    NamedParameterJdbcTemplate db;
    final String chapter="6a7c6260-a251-4566-80ad-c748bfa5f062";
    @BeforeEach void setup() {
        var ds=new DriverManagerDataSource("jdbc:h2:mem:knowledge;MODE=MySQL;DB_CLOSE_DELAY=-1","sa","");
        db=new NamedParameterJdbcTemplate(ds); var j=db.getJdbcTemplate();j.execute("DROP ALL OBJECTS");
        j.execute("CREATE TABLE users(id VARCHAR PRIMARY KEY,status VARCHAR,data_operation VARCHAR,data_revision INT)");
        j.execute("INSERT INTO users VALUES ('u1','ACTIVE','IDLE',0),('u2','ACTIVE','IDLE',0)");
        j.execute("CREATE TABLE chapters(id VARCHAR PRIMARY KEY,parent_id VARCHAR,slug VARCHAR,title VARCHAR,direction VARCHAR,sort_order INT,body_md VARCHAR,content_version INT,status VARCHAR,version INT DEFAULT 1,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
        j.update("INSERT INTO chapters(id,slug,title,direction,sort_order,body_md,content_version,status) VALUES(?,?,?,?,?,?,?,?)",chapter,"transactions","事务","backend",0,"content",1,"PUBLISHED");
        j.execute("CREATE TABLE chapter_progress(id VARCHAR PRIMARY KEY,user_id VARCHAR,chapter_id VARCHAR,completed BOOLEAN,note VARCHAR,chapter_version INT,version INT DEFAULT 1,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,UNIQUE(user_id,chapter_id))");
        var json=JsonMapper.builder().build();var rows=new SqlRows(db,json);service=new KnowledgeService(rows,new OwnerTransactions(rows,new DataSourceTransactionManager(ds)),new ContractInputs(json));
    }
    @Test void notesArePrivateAndRejectStaleWrites() {
        var saved=service.putChapterProgress("u1",chapter,new HashMap<>(Map.of("version",0,"completed",false,"note","draft","chapterVersion",1)));
        assertEquals(1,((Number)saved.get("version")).intValue());
        assertThrows(ApiProblem.class,()->service.chapterProgress("u2",chapter));
        var conflict=assertThrows(ApiProblem.class,()->service.putChapterProgress("u1",chapter,new HashMap<>(Map.of("version",0,"completed",true,"note","stale","chapterVersion",1))));
        assertEquals(409,conflict.status());assertEquals("draft",service.chapterProgress("u1",chapter).get("note"));
        assertEquals(1,db.queryForObject("SELECT data_revision FROM users WHERE id='u1'",Map.of(),Integer.class));
    }
    @Test void hiddenChaptersAreNotReadable() { db.update("UPDATE chapters SET status='HIDDEN'",Map.of()); assertThrows(ApiProblem.class,()->service.chapter("transactions")); }
}
