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

@SpringBootTest(properties = {"spring.datasource.url=jdbc:h2:mem:testdb;MODE=MySQL", "spring.datasource.password="})
@AutoConfigureMockMvc
class PublicStatsTest {
    @org.springframework.test.context.bean.override.mockito.MockitoBean com.campusradar.account.AuthRateLimits rateLimits;
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate db;

    @BeforeEach void setup() {
        db.execute("DROP ALL OBJECTS");
        db.execute("CREATE TABLE companies (id VARCHAR(36) PRIMARY KEY)");
        db.execute("CREATE TABLE sources (id VARCHAR(36) PRIMARY KEY, enabled BOOLEAN)");
        db.execute("CREATE TABLE jobs (id VARCHAR(36) PRIMARY KEY, source_id VARCHAR(36), status VARCHAR(20), publication_status VARCHAR(20))");
        db.execute("CREATE TABLE experiences (id VARCHAR(36) PRIMARY KEY, status VARCHAR(20))");
        db.execute("CREATE TABLE questions (id VARCHAR(36) PRIMARY KEY, status VARCHAR(20))");
        db.execute("INSERT INTO companies VALUES ('c1')");
        db.execute("INSERT INTO sources VALUES ('s1', TRUE), ('s2', FALSE)");
        db.execute("INSERT INTO jobs VALUES ('j1','s1','OPEN','PUBLISHED'), ('j2','s2','OPEN','PUBLISHED'), ('j3','s1','OPEN','DRAFT')");
        db.execute("INSERT INTO experiences VALUES ('e1','PUBLISHED'), ('e2','DRAFT')");
        db.execute("INSERT INTO questions VALUES ('q1','PUBLISHED'), ('q2','DRAFT')");
    }

    @Test void publicStatsCountsOnlyPublishedContentAndEnabledSources() throws Exception {
        mvc.perform(get("/api/v1/public/stats"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.companies").value(1))
            .andExpect(jsonPath("$.data.openJobs").value(1))
            .andExpect(jsonPath("$.data.experiences").value(1))
            .andExpect(jsonPath("$.data.questions").value(1))
            .andExpect(jsonPath("$.data.dataLabel").value("ACTUAL"))
            .andExpect(jsonPath("$.requestId").isNotEmpty());
    }
    @Test void databaseFailureReturnsSafeError() throws Exception {
        db.execute("DROP TABLE jobs");
        mvc.perform(get("/api/v1/public/stats"))
            .andExpect(status().isServiceUnavailable())
            .andExpect(jsonPath("$.error.code").value("DEPENDENCY_UNAVAILABLE"))
            .andExpect(jsonPath("$.error.requestId").isNotEmpty());
    }
}
