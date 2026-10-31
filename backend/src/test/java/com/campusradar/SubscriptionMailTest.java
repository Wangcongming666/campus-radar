package com.campusradar;

import com.campusradar.notification.SubscriptionMail;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import tools.jackson.databind.json.JsonMapper;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class SubscriptionMailTest {
    JdbcTemplate db;SubscriptionMail mail;Transport transport;
    static class Transport extends JavaMailSenderImpl {boolean fail;List<SimpleMailMessage> sent=new ArrayList<>();@Override public void send(SimpleMailMessage message){if(fail)throw new IllegalStateException("SMTP unavailable");sent.add(message);}}
    @BeforeEach void setup(){var ds=new DriverManagerDataSource("jdbc:h2:mem:subscriptionmail;MODE=MySQL;DB_CLOSE_DELAY=-1","sa","");db=new JdbcTemplate(ds);db.execute("DROP ALL OBJECTS");db.execute("CREATE TABLE mail_deliveries(id VARCHAR PRIMARY KEY,user_id VARCHAR,recipient VARCHAR,template VARCHAR,encrypted_payload VARCHAR,dedup_key VARCHAR UNIQUE,state VARCHAR,attempt INT DEFAULT 0,expires_at TIMESTAMP,version INT DEFAULT 1)");db.execute("CREATE TABLE outbox_events(id VARCHAR PRIMARY KEY,event_type VARCHAR,aggregate_id VARCHAR,routing_key VARCHAR,payload VARCHAR,state VARCHAR,available_at TIMESTAMP,attempt INT DEFAULT 0,lease_token VARCHAR,lease_until TIMESTAMP,published_at TIMESTAMP,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");transport=new Transport();mail=new SubscriptionMail(db,transport,new DataSourceTransactionManager(ds),JsonMapper.builder().build(),Base64.getEncoder().encodeToString(new byte[32]),"localhost","radar@example.test","https://example.test");}
    @Test void mailIsEncryptedAndDeduplicatedThenMarkedSentOnlyAfterTransportSuccess(){mail.queue("u1","member@example.test","hit1","Job\r\nAlert","Private body","/jobs/j1");mail.queue("u1","member@example.test","hit1","Duplicate","Other","/jobs/j1");assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM mail_deliveries",Integer.class));assertFalse(db.queryForObject("SELECT encrypted_payload FROM mail_deliveries",String.class).contains("Private body"));transport.fail=true;mail.dispatch();assertEquals("PENDING",db.queryForObject("SELECT state FROM mail_deliveries",String.class));assertTrue(transport.sent.isEmpty());db.update("UPDATE outbox_events SET available_at=CURRENT_TIMESTAMP");transport.fail=false;mail.dispatch();assertEquals("SENT",db.queryForObject("SELECT state FROM mail_deliveries",String.class));assertEquals("",db.queryForObject("SELECT encrypted_payload FROM mail_deliveries",String.class));assertEquals("Private body\nhttps://example.test/jobs/j1",transport.sent.getFirst().getText());assertFalse(transport.sent.getFirst().getSubject().contains("\n"));assertEquals("PUBLISHED",db.queryForObject("SELECT state FROM outbox_events",String.class));}
    @Test void expiredDeliveryCannotBeSent(){mail.queue("u1","member@example.test","expired","Job","Body","/jobs/j1");db.update("UPDATE mail_deliveries SET expires_at=DATEADD('DAY',-1,CURRENT_TIMESTAMP)");mail.dispatch();assertTrue(transport.sent.isEmpty());assertEquals("FAILED",db.queryForObject("SELECT state FROM mail_deliveries",String.class));assertEquals("FAILED",db.queryForObject("SELECT state FROM outbox_events",String.class));}
}
