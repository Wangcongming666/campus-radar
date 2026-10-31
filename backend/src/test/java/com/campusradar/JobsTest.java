package com.campusradar;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"spring.datasource.url=jdbc:h2:mem:jobtests;MODE=MySQL", "spring.datasource.password="})
@AutoConfigureMockMvc
class JobsTest {
    @org.springframework.test.context.bean.override.mockito.MockitoBean com.campusradar.account.AuthRateLimits rateLimits;
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate db;
    @Autowired org.springframework.web.context.WebApplicationContext context;
    @Autowired @org.springframework.beans.factory.annotation.Qualifier("springSecurityFilterChain") jakarta.servlet.Filter securityChain;
    @BeforeEach void setup() {
        db.execute("DROP ALL OBJECTS");
        db.execute("CREATE TABLE users(id VARCHAR(36),status VARCHAR(32),role VARCHAR(32),auth_version INT)");
        db.execute("CREATE TABLE companies (id VARCHAR(36) PRIMARY KEY, slug VARCHAR(80), name VARCHAR(120), logo_url VARCHAR(2000), industry VARCHAR(80), size_band VARCHAR(40), cities VARCHAR, tags VARCHAR, description_md VARCHAR, verified_at TIMESTAMP, version INT, created_at TIMESTAMP, updated_at TIMESTAMP)");
        db.execute("CREATE TABLE sources (id VARCHAR(36) PRIMARY KEY, name VARCHAR(120), base_url VARCHAR(2000), content_mode VARCHAR(32), enabled BOOLEAN, verified_at TIMESTAMP)");
        db.execute("CREATE TABLE jobs (id VARCHAR(36) PRIMARY KEY, company_id VARCHAR(36), source_id VARCHAR(36), title VARCHAR(200), role VARCHAR(40), education VARCHAR(32), recruitment_type VARCHAR(32), skills VARCHAR, description_md VARCHAR, search_text VARCHAR, canonical_url VARCHAR, salary VARCHAR, deadline_at TIMESTAMP, deadline_date DATE, deadline_precision VARCHAR(32), source_timezone VARCHAR(64), status VARCHAR(32), publication_status VARCHAR(32), published_at TIMESTAMP, collected_at TIMESTAMP, version INT, created_at TIMESTAMP, updated_at TIMESTAMP)");
        db.execute("CREATE TABLE job_cities (job_id VARCHAR(36), city VARCHAR(64))");
        db.execute("CREATE TABLE job_graduation_years (job_id VARCHAR(36), graduation_year INT)");
        db.execute("INSERT INTO companies VALUES ('c1','demo','Company',null,null,null,'[]','[]','',null,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)");
        db.execute("INSERT INTO sources VALUES ('s1','Official','https://example.com','ORIGINAL',true,null),('s2','Hidden','https://example.org','ORIGINAL',false,null)");
        db.execute("INSERT INTO jobs VALUES ('j1','c1','s1','Java Engineer','backend','BACHELOR','CAMPUS','[]','hello','java engineer','https://example.com/job',null,null,null,'UNKNOWN','UTC','OPEN','PUBLISHED',null,CURRENT_TIMESTAMP,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),('j2','c1','s2','Hidden job','backend','BACHELOR','CAMPUS','[]','','hidden','https://example.org/job',null,null,null,'UNKNOWN','UTC','OPEN','PUBLISHED',null,CURRENT_TIMESTAMP,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)");
        db.execute("INSERT INTO job_cities VALUES ('j1','Shanghai')");
        db.execute("INSERT INTO job_graduation_years VALUES ('j1',2027)");
    }
    @Test void listsPublishedJobsFromEnabledSources() throws Exception {
        mvc.perform(get("/api/v1/jobs").param("city","Shanghai").param("graduationYear","2027"))
          .andExpect(status().isOk()).andExpect(jsonPath("$.page.total").value(1))
          .andExpect(jsonPath("$.data[0].id").value("j1"))
          .andExpect(jsonPath("$.data[0].company.name").value("Company"))
          .andExpect(jsonPath("$.data[0].cities[0]").value("Shanghai"));
    }
    @Test void rejectsSingleCharacterSearch() throws Exception {
        mvc.perform(get("/api/v1/jobs").param("q","a"))
          .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.error.code").value("Q_TOO_SHORT"));
    }
    @Test void securityChainEnforcesRoleSeparationBeforeApplicantControllersRun() throws Exception {
        // Exercise the actual security chain with local sessions; the Redis servlet-session adapter is external to this boundary.
        var securityMvc=org.springframework.test.web.servlet.setup.MockMvcBuilders.webAppContextSetup(context).addFilters(securityChain).build();
        db.update("INSERT INTO users VALUES('role-test','ACTIVE','ADMIN',1)");var session=new org.springframework.mock.web.MockHttpSession();
        session.setAttribute(com.campusradar.security.CurrentUser.USER_ID,"role-test");session.setAttribute(com.campusradar.security.CurrentUser.AUTH_VERSION,1);
        securityMvc.perform(get("/api/v1/applications").session(session)).andExpect(status().isForbidden()).andExpect(jsonPath("$.error.code").value("ROLE_FORBIDDEN"));
        db.update("UPDATE users SET role='USER'");securityMvc.perform(get("/api/v1/admin/companies").session(session)).andExpect(status().isForbidden());
        db.update("UPDATE users SET role='REVIEWER'");securityMvc.perform(get("/api/v1/admin/users").session(session)).andExpect(status().isForbidden());
        securityMvc.perform(get("/api/v1/jobs").session(session)).andExpect(status().isOk());
    }

}
