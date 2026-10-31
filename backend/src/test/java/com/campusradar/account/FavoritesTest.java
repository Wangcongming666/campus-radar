package com.campusradar.account;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import static org.junit.jupiter.api.Assertions.*;

class FavoritesTest {
    JdbcTemplate db; FavoritesController service;
    String owner="11111111-1111-4111-8111-111111111111",target="33333333-3333-4333-8333-333333333333";
    @BeforeEach void setup(){var source=new DriverManagerDataSource("jdbc:h2:mem:favorites;MODE=MySQL;DB_CLOSE_DELAY=-1","sa","");db=new JdbcTemplate(source);db.execute("DROP ALL OBJECTS");db.execute("CREATE TABLE users(id VARCHAR PRIMARY KEY,status VARCHAR,data_operation VARCHAR,data_revision INT)");db.execute("INSERT INTO users VALUES('"+owner+"','ACTIVE','IDLE',0)");db.execute("CREATE TABLE companies(id VARCHAR PRIMARY KEY,name VARCHAR)");db.execute("INSERT INTO companies VALUES('"+target+"','公司')");db.execute("CREATE TABLE favorites(id VARCHAR PRIMARY KEY,user_id VARCHAR,target_type VARCHAR,target_id VARCHAR,version INT DEFAULT 1,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,UNIQUE(user_id,target_type,target_id))");service=new FavoritesController(new NamedParameterJdbcTemplate(source),null);}
    @Test void duplicatePutAndDeleteOnlyReviseWhenStateChanges(){var first=service.favorite(owner,"COMPANY",target);assertEquals(first,service.favorite(owner,"COMPANY",target));assertEquals(1,db.queryForObject("SELECT data_revision FROM users",Integer.class));service.remove(owner,"COMPANY",target);service.remove(owner,"COMPANY",target);assertEquals(2,db.queryForObject("SELECT data_revision FROM users",Integer.class));}
    @Test void missingTargetsAreRejectedAndUnavailableFavoritesRemainVisible(){assertThrows(RuntimeException.class,()->service.favorite(owner,"COMPANY","44444444-4444-4444-8444-444444444444"));service.favorite(owner,"COMPANY",target);db.update("DELETE FROM companies WHERE id=?",target);var list=service.listFor(owner,1,20,"COMPANY");@SuppressWarnings("unchecked") var items=(List<Map<String,Object>>)list.get("items");assertEquals(true,items.getFirst().get("unavailable"));assertEquals("内容已不可用",items.getFirst().get("title"));}
}
