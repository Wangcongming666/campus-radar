package com.campusradar.account;

import com.campusradar.security.AuthSecurity;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AuthWriteBoundaryTest {
    final AuthSecurity.WriteBoundary filter=new AuthSecurity.WriteBoundary(Set.of("http://localhost:5173"));
    @Test void anonymousRegistrationRequiresOriginAndSessionBoundCsrf() throws Exception {
        var request=new MockHttpServletRequest("POST","/api/v1/auth/register");
        request.setServletPath("/api/v1/auth/register");
        var response=new MockHttpServletResponse();var reached=new AtomicBoolean();
        filter.doFilter(request,response,(r,s)->reached.set(true));
        assertEquals(403,response.getStatus());assertTrue(response.getContentAsString().contains("ORIGIN_FORBIDDEN"));assertFalse(reached.get());
        request.addHeader("Origin","http://localhost:5173");response=new MockHttpServletResponse();
        filter.doFilter(request,response,(r,s)->reached.set(true));
        assertEquals(403,response.getStatus());assertTrue(response.getContentAsString().contains("CSRF_INVALID"));assertFalse(reached.get());
        String csrf=AuthSecurity.issueCsrf(request,response);request.addHeader("X-CSRF-TOKEN",csrf);response=new MockHttpServletResponse();
        filter.doFilter(request,response,(r,s)->reached.set(true));assertTrue(reached.get());assertEquals(200,response.getStatus());
    }
    @Test void csrfFromAnotherSessionCannotBeReused() throws Exception {
        var first=new MockHttpServletRequest();String token=AuthSecurity.issueCsrf(first,new MockHttpServletResponse());
        var request=new MockHttpServletRequest("PUT","/api/v1/auth/password");request.addHeader("Origin","http://localhost:5173");request.addHeader("X-CSRF-TOKEN",token);
        AuthSecurity.issueCsrf(request,new MockHttpServletResponse());
        var response=new MockHttpServletResponse();filter.doFilter(request,response,(r,s)->fail("Cross-session token passed"));assertEquals(403,response.getStatus());
    }
    @Test void publicReadDoesNotRequireOrCreateSession() throws Exception {
        var request=new MockHttpServletRequest("GET","/api/v1/jobs");filter.doFilter(request,new MockHttpServletResponse(),(r,s)->{});assertNull(request.getSession(false));
    }
    @Test void anonymousReadLimitReturnsRetryAfterWithoutCreatingSession() throws Exception {
        var limits=mock(AuthRateLimits.class);var boundary=new AuthSecurity.WriteBoundary(Set.of("http://localhost:5173"),limits);
        var request=new MockHttpServletRequest("GET","/api/v1/jobs");var response=new MockHttpServletResponse();
        doThrow(new AuthRateLimits.Exceeded(31)).when(limits).anonymousRead(request);
        boundary.doFilter(request,response,(r,s)->fail("Throttled request reached controller"));
        assertEquals(429,response.getStatus());assertEquals("31",response.getHeader("Retry-After"));assertNull(request.getSession(false));
    }
}
