package com.campusradar.security;

import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.mock.web.*;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;

class RoleBoundaryTest {
    JdbcTemplate db;RoleBoundary boundary;
    @BeforeEach void setup(){
        db=new JdbcTemplate(new DriverManagerDataSource("jdbc:h2:mem:role_boundary;MODE=MySQL;DB_CLOSE_DELAY=-1","sa",""));
        db.execute("DROP ALL OBJECTS");db.execute("CREATE TABLE users(id VARCHAR(36),status VARCHAR(32),role VARCHAR(32),auth_version INT)");
        db.update("INSERT INTO users VALUES('u','ACTIVE','USER',1)");boundary=new RoleBoundary(new CurrentUser(db),JsonMapper.builder().build());
    }
    MockHttpServletResponse call(String role,String method,String path) throws Exception {
        db.update("UPDATE users SET role=?",role);var request=new MockHttpServletRequest(method,path);
        request.getSession().setAttribute(CurrentUser.USER_ID,"u");request.getSession().setAttribute(CurrentUser.AUTH_VERSION,1);
        var response=new MockHttpServletResponse();boundary.doFilter(request,response,(r,s)->((jakarta.servlet.http.HttpServletResponse)s).setStatus(204));return response;
    }
    @Test void applicantAndManagementOperationsAreSeparatedAcrossReadAndWriteRoutes() throws Exception {
        for(String role:List.of("ADMIN","REVIEWER"))for(String path:List.of("/api/v1/applications","/api/v1/resumes","/api/v1/files","/api/v1/planner/tasks","/api/v1/mock-sessions","/api/v1/favorites","/api/v1/jobs/111/match","/api/v1/calendar/events","/api/v1/analytics","/api/v1/questions/111/progress","/api/v1/handbook/progress/111","/api/v1/subscriptions","/api/v1/account/data-revision","/api/v1/me/overview","/api/v1/offers","/api/v1/buddy/candidates","/api/v1/me/submissions"))assertEquals(403,call(role,"GET",path).getStatus(),role+" "+path);
        for(String path:List.of("/api/v1/account/reset","/api/v1/account/exports","/api/v1/experiences","/api/v1/reports"))assertEquals(403,call("ADMIN","POST",path).getStatus());
        assertEquals(403,call("ADMIN","DELETE","/api/v1/me").getStatus());
        assertEquals(204,call("USER","GET","/api/v1/applications").getStatus());
        assertEquals(204,call("USER","GET","/api/v1/me/submissions").getStatus());
        assertEquals(403,call("USER","GET","/api/v1/admin/companies").getStatus());
        assertEquals(403,call("USER","PATCH","/api/v1/admin/users/111").getStatus());
        assertEquals(204,call("ADMIN","GET","/api/v1/admin/users").getStatus());
        assertEquals(204,call("REVIEWER","GET","/api/v1/admin/moderation").getStatus());
        assertEquals(403,call("REVIEWER","POST","/api/v1/admin/companies").getStatus());
        assertEquals(403,call("REVIEWER","GET","/api/v1/admin/users").getStatus());
    }
    @Test void sharedAccountOperationsAndPublicCatalogRemainAvailable() throws Exception {
        for(String role:List.of("USER","ADMIN","REVIEWER")){
            for(String path:List.of("/api/v1/me","/api/v1/jobs","/api/v1/companies","/api/v1/questions","/api/v1/handbook/chapters","/api/v1/experiences","/api/v1/public/stats"))assertEquals(204,call(role,"GET",path).getStatus());
            assertEquals(204,call(role,"PATCH","/api/v1/me").getStatus());assertEquals(204,call(role,"PUT","/api/v1/auth/password").getStatus());assertEquals(204,call(role,"POST","/api/v1/auth/logout").getStatus());
        }
        var request=new MockHttpServletRequest("GET","/api/v1/jobs");var response=new MockHttpServletResponse();boundary.doFilter(request,response,(r,s)->((jakarta.servlet.http.HttpServletResponse)s).setStatus(204));assertEquals(204,response.getStatus());assertNull(request.getSession(false));
    }
    @Test void submissionsRequireApplicantSession() throws Exception {
        var request=new MockHttpServletRequest("GET","/api/v1/me/submissions");var response=new MockHttpServletResponse();
        boundary.doFilter(request,response,(r,s)->fail("Anonymous submission access"));assertEquals(401,response.getStatus());
    }
    @Test void policyFailsClosedAndUsesFreshDatabaseRoleAndCredentialGeneration() throws Exception {
        assertEquals(403,call("ADMIN","GET","/api/v1/unregistered-feature").getStatus());
        var request=new MockHttpServletRequest("GET","/api/v1/admin/companies");request.getSession().setAttribute(CurrentUser.USER_ID,"u");request.getSession().setAttribute(CurrentUser.AUTH_VERSION,1);
        db.update("UPDATE users SET role='ADMIN'");var response=new MockHttpServletResponse();boundary.doFilter(request,response,(r,s)->((jakarta.servlet.http.HttpServletResponse)s).setStatus(204));assertEquals(204,response.getStatus());
        db.update("UPDATE users SET role='USER'");response=new MockHttpServletResponse();boundary.doFilter(request,response,(r,s)->fail("Stale role granted management access"));assertEquals(403,response.getStatus());
        db.update("UPDATE users SET role='ADMIN',auth_version=2");response=new MockHttpServletResponse();boundary.doFilter(request,response,(r,s)->fail("Revoked session granted management access"));assertEquals(401,response.getStatus());
    }
}
