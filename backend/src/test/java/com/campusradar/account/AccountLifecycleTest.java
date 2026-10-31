package com.campusradar.account;

import com.campusradar.common.ApiProblem;
import com.campusradar.security.CurrentUser;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.ObjectMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

class AccountLifecycleTest {
    JdbcTemplate db; AccountService accounts; CurrentUser users; TransactionTemplate tx;
    @BeforeEach void setup() {
        var dataSource=new DriverManagerDataSource("jdbc:h2:mem:lifecycle;MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", "");
        db=new JdbcTemplate(dataSource);var manager=new DataSourceTransactionManager(dataSource);tx=new TransactionTemplate(manager);
        db.execute("DROP ALL OBJECTS");
        db.execute("CREATE TABLE users(id VARCHAR(36) PRIMARY KEY,email VARCHAR(254) UNIQUE,password_hash VARCHAR(255),display_name VARCHAR(40),status VARCHAR(32) DEFAULT 'PENDING',role VARCHAR(32) DEFAULT 'USER',auth_version INT DEFAULT 1,version INT DEFAULT 1,avatar_file_id VARCHAR(36),school VARCHAR(100),education VARCHAR(32),graduation_year INT,preferences VARCHAR(2000),theme VARCHAR(32) DEFAULT 'DARK',timezone VARCHAR(64),onboarding_step INT DEFAULT 0,provider_verified BOOLEAN DEFAULT FALSE,provider_verified_until TIMESTAMP,buddy_discoverable BOOLEAN DEFAULT FALSE,email_verified_at TIMESTAMP,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
        db.execute("CREATE TABLE auth_tokens(id VARCHAR(36),user_id VARCHAR(36),purpose VARCHAR(32),token_hash VARCHAR(64),expires_at TIMESTAMP,consumed_at TIMESTAMP,version INT DEFAULT 1)");
        db.execute("CREATE TABLE mail_deliveries(id VARCHAR(36),user_id VARCHAR(36),recipient VARCHAR(254),template VARCHAR(32),encrypted_payload VARCHAR(4000),dedup_key VARCHAR(190),state VARCHAR(32),expires_at TIMESTAMP,attempt INT DEFAULT 0,version INT DEFAULT 1)");
        db.execute("CREATE TABLE outbox_events(id VARCHAR(36),event_type VARCHAR(64),aggregate_id VARCHAR(36),routing_key VARCHAR(100),payload VARCHAR(4000),state VARCHAR(32),available_at TIMESTAMP,attempt INT DEFAULT 0,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,lease_until TIMESTAMP,published_at TIMESTAMP)");
        var mail=new AuthMail(db,mock(JavaMailSender.class),manager,Base64.getEncoder().encodeToString(new byte[32]),"http://localhost:5173","test@campus.local");
        accounts=new AccountService(db,mail,new ObjectMapper(),new com.campusradar.common.ContractInputs(tools.jackson.databind.json.JsonMapper.builder().build()));users=new CurrentUser(db);
    }
    String registerAndActivate() {
        tx.executeWithoutResult(s->accounts.register("test@example.com","long-test-password","同学"));
        return db.queryForObject("SELECT id FROM users",String.class);
    }
    @Test void registrationIsActiveWithoutMailAndCanLoginImmediately() {
        // Registration must work even when authentication mail is unconfigured.
        accounts=new AccountService(db,null,new ObjectMapper(),new com.campusradar.common.ContractInputs(tools.jackson.databind.json.JsonMapper.builder().build()));
        tx.executeWithoutResult(s->accounts.register(" Test@Example.com ","long-test-password","同学"));
        assertEquals("ACTIVE",db.queryForObject("SELECT status FROM users",String.class));
        assertEquals("test@example.com",db.queryForObject("SELECT email FROM users",String.class));
        String hash=db.queryForObject("SELECT password_hash FROM users",String.class);assertTrue(hash.startsWith("$argon2id$"));
        assertNull(db.queryForObject("SELECT email_verified_at FROM users",Object.class));
        for(String table:java.util.List.of("auth_tokens","mail_deliveries","outbox_events"))assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM "+table,Integer.class));
        var request=new MockHttpServletRequest();String previous=request.getSession().getId();
        var user=accounts.login("test@example.com","long-test-password",request);
        assertEquals("USER",user.get("role"));assertEquals(false,user.get("emailVerified"));
        assertNotEquals(previous,request.getSession().getId());assertEquals(user.get("id"),users.requireId(request));
    }
    @Test void duplicateRegistrationDoesNotReplacePasswordOrProfile() {
        registerAndActivate();
        tx.executeWithoutResult(s->accounts.register("TEST@example.com","another-password","替换昵称"));
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM users",Integer.class));
        assertEquals("同学",db.queryForObject("SELECT display_name FROM users",String.class));
        assertNotNull(accounts.login("test@example.com","long-test-password",new MockHttpServletRequest()));
        assertEquals("INVALID_CREDENTIALS",assertThrows(ApiProblem.class,()->accounts.login("test@example.com","another-password",new MockHttpServletRequest())).code());
    }
    @Test void removingVerificationDoesNotEnableInactiveAccounts() {
        registerAndActivate();
        for(String state:java.util.List.of("FROZEN","DISABLED","DELETING","PENDING")) {
            db.update("UPDATE users SET status=?",state);var request=new MockHttpServletRequest();
            assertEquals("ACCOUNT_INACTIVE",assertThrows(ApiProblem.class,()->accounts.login("test@example.com","long-test-password",request)).code());
            assertNull(request.getSession(false));
        }
    }
    @Test void registrationResponseDoesNotRequireVerification() {
        var controller=new AuthController(accounts,users,mock(AuthRateLimits.class));
        var response=controller.register(new AuthController.Register("test@example.com","long-test-password","同学"),new MockHttpServletRequest());
        assertEquals(202,response.getStatusCode().value());
        assertEquals(Map.of("accepted",true,"verificationRequired",false),((Map<?,?>)response.getBody()).get("data"));
    }
    @Test void resetMailRemainsEncryptedAndResetTokenIsSingleUse() {
        String id=registerAndActivate();
        tx.executeWithoutResult(s->accounts.email("test@example.com","RESET_PASSWORD"));
        assertEquals("RESET_PASSWORD",db.queryForObject("SELECT purpose FROM auth_tokens",String.class));
        assertFalse(db.queryForObject("SELECT encrypted_payload FROM mail_deliveries",String.class).contains("token="));
        var request=new MockHttpServletRequest();accounts.login("test@example.com","long-test-password",request);
        db.update("INSERT INTO auth_tokens(id,user_id,purpose,token_hash,expires_at) VALUES('reset-known',?,'RESET_PASSWORD',?,?)",id,AccountService.hash("known-reset-token"),java.sql.Timestamp.from(Instant.now().plusSeconds(600)));
        tx.executeWithoutResult(s->accounts.consume("known-reset-token","RESET_PASSWORD","new-long-password"));
        assertThrows(ApiProblem.class,()->users.requireId(request));
        assertThrows(ApiProblem.class,()->tx.executeWithoutResult(s->accounts.consume("known-reset-token","RESET_PASSWORD","other-password")));
        assertNotNull(accounts.login("test@example.com","new-long-password",new MockHttpServletRequest()));
        assertThrows(ApiProblem.class,()->accounts.consume("unused-legacy-verification-token","VERIFY_EMAIL",null));
    }
    @Test void profileVersionConflictAndPasswordChangeRevokeSession() {
        String id=registerAndActivate();var request=new MockHttpServletRequest();accounts.login("test@example.com","long-test-password",request);
        Map<String,Object> initial=accounts.view(accounts.find(id));int version=((Number)initial.get("version")).intValue();
        assertEquals("新昵称",accounts.patch(id,Map.of("version",version,"displayName","新昵称")).get("displayName"));
        assertThrows(ApiProblem.class,()->accounts.patch(id,Map.of("version",version,"displayName","过时更新")));
        accounts.password(id,"long-test-password","another-long-password");assertThrows(ApiProblem.class,()->users.requireId(request));
        assertThrows(ApiProblem.class,()->accounts.login("test@example.com","long-test-password",new MockHttpServletRequest()));
    }
    @Test void providerCertificationExpiresInProfileAtReadTime() {
        String id=registerAndActivate();db.update("UPDATE users SET provider_verified=TRUE,provider_verified_until=? WHERE id=?",java.sql.Timestamp.from(Instant.now().minusSeconds(1)),id);
        assertEquals(false,accounts.view(accounts.find(id)).get("providerVerified"));
        db.update("UPDATE users SET provider_verified_until=? WHERE id=?",java.sql.Timestamp.from(Instant.now().plusSeconds(600)),id);assertEquals(true,accounts.view(accounts.find(id)).get("providerVerified"));
    }
    @Test void expiredResetCannotChangePassword() {
        String id=registerAndActivate();db.update("INSERT INTO auth_tokens(id,user_id,purpose,token_hash,expires_at) VALUES('reset',?,'RESET_PASSWORD',?,?)",id,AccountService.hash("expired-reset-token"),java.sql.Timestamp.from(Instant.now().minusSeconds(1)));
        assertThrows(ApiProblem.class,()->tx.executeWithoutResult(s->accounts.consume("expired-reset-token","RESET_PASSWORD","replacement-password")));
        assertNotNull(accounts.login("test@example.com","long-test-password",new MockHttpServletRequest()));
    }
    @Test void profileRejectsFractionalAndOverflowingContractIntegersBeforeWriting() {
        String id=registerAndActivate();int version=((Number)accounts.find(id).get("version")).intValue();
        for(var body:java.util.List.of(
                Map.<String,Object>of("version",version+0.5,"displayName","invalid"),
                Map.<String,Object>of("version",version,"graduationYear",2027.5),
                Map.<String,Object>of("version",version,"onboardingStep",4294967297L))) {
            assertThrows(ApiProblem.class,()->accounts.patch(id,body));
            assertEquals(version,((Number)accounts.find(id).get("version")).intValue());
        }
    }
    @Test void managersCanChangeBasicSettingsButCannotEnableApplicantProfileFeatures(){
        String id=registerAndActivate();db.update("UPDATE users SET role='ADMIN' WHERE id=?",id);int version=db.queryForObject("SELECT version FROM users",Integer.class);
        assertEquals("LIGHT",accounts.patch(id,Map.of("version",version,"theme","LIGHT")).get("theme"));
        for(var value:java.util.List.of(Map.entry("onboardingStep",(Object)2),Map.entry("buddyDiscoverable",(Object)true),Map.entry("preferences",(Object)Map.of("roles",java.util.List.of(),"cities",java.util.List.of(),"recruitmentTypes",java.util.List.of(),"graduationYear",2027))))assertEquals(403,assertThrows(ApiProblem.class,()->accounts.patch(id,Map.of("version",version+1,value.getKey(),value.getValue()))).status());
    }

}
