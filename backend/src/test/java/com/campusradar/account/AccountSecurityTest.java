package com.campusradar.account;

import com.campusradar.security.CurrentUser;
import com.campusradar.common.ApiProblem;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.mock.web.MockHttpServletRequest;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AccountSecurityTest {
    JdbcTemplate db;
    CurrentUser users;
    @BeforeEach void setup() {
        db = new JdbcTemplate(new DriverManagerDataSource("jdbc:h2:mem:auth;MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", ""));
        db.execute("DROP TABLE IF EXISTS users");
        db.execute("CREATE TABLE users(id VARCHAR(36),status VARCHAR(32),role VARCHAR(32),auth_version INT)");
        db.update("INSERT INTO users VALUES('u','ACTIVE','USER',1)");
        users = new CurrentUser(db);
    }
    MockHttpServletRequest authenticated() {
        var request = new MockHttpServletRequest();
        request.getSession().setAttribute(CurrentUser.USER_ID, "u");
        request.getSession().setAttribute(CurrentUser.AUTH_VERSION, 1);
        return request;
    }
    @Test void anonymousCannotReadPrivateData() { assertThrows(ApiProblem.class, () -> users.requireId(new MockHttpServletRequest())); }
    @Test void roleAndAccountStateAreReadFromDatabaseEveryTime() {
        var request = authenticated();
        assertEquals("u", users.requireId(request));
        assertThrows(ApiProblem.class, () -> users.requireRole(request, "ADMIN"));
        db.update("UPDATE users SET role='ADMIN'");
        assertEquals("u", users.requireRole(request, "ADMIN"));
        db.update("UPDATE users SET status='FROZEN'");
        assertThrows(ApiProblem.class, () -> users.requireId(request));
    }
    @Test void passwordVersionChangeRevokesAlreadyIssuedSession() {
        var request = authenticated();
        db.update("UPDATE users SET auth_version=2");
        assertThrows(ApiProblem.class, () -> users.requireId(request));
    }
    @Test void activeSessionsCannotSurvivePastAbsoluteSevenDays() {
        var request=new MockHttpServletRequest();var session=mock(jakarta.servlet.http.HttpSession.class);
        when(session.getAttribute(CurrentUser.USER_ID)).thenReturn("u");
        when(session.getAttribute(CurrentUser.AUTH_VERSION)).thenReturn(1);
        when(session.getCreationTime()).thenReturn(System.currentTimeMillis()-java.time.Duration.ofDays(7).toMillis()-1000);
        request.setSession(session);
        assertThrows(ApiProblem.class,()->users.requireId(request));verify(session).invalidate();
    }
}
