package com.campusradar.account;

import java.util.*;
import com.campusradar.common.ApiProblem;
import com.campusradar.security.CurrentUser;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.mock.web.MockHttpServletRequest;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AuthRateLimitsTest {
    @Test void independentEnvironmentsDoNotShareRateCounters() {
        var keys=new ArrayList<String>();
        var redis=mock(StringRedisTemplate.class,invocation->{if(invocation.getMethod().getName().equals("execute")){keys.add(invocation.getArgument(1).toString());return 1L;}return RETURNS_DEFAULTS.answer(invocation);});
        var request=new MockHttpServletRequest();
        new AuthRateLimits(redis,1,"campus:main").anonymousRead(request);
        new AuthRateLimits(redis,10,"campus:test").anonymousRead(request);
        assertNotEquals(keys.get(0),keys.get(1));
    }
    @Test void defaultLimitsUseAtomicRedisWindowsAndNeverStoreEmailInKeys() {
        var calls=new ArrayList<List<Object>>();
        var redis=mock(StringRedisTemplate.class,invocation->{
            if(invocation.getMethod().getName().equals("execute")){
                calls.add(Arrays.asList(invocation.getArguments()));return 1L;
            }return RETURNS_DEFAULTS.answer(invocation);
        });
        var limits=new AuthRateLimits(redis,1);var request=new MockHttpServletRequest();
        limits.anonymousRead(request);limits.authenticatedWrite("user");
        limits.forgot(request,"secret@example.com");
        limits.failedLogin(request,"secret@example.com");
        var thresholds=calls.stream().map(c->c.get(2)+"/"+c.get(3)).toList();
        assertTrue(thresholds.contains("60/60"));assertTrue(thresholds.contains("5/3600"));assertTrue(thresholds.contains("5/900"));
        assertTrue(calls.stream().noneMatch(c->c.get(1).toString().contains("secret@example.com")));
        assertTrue(calls.stream().allMatch(c->((DefaultRedisScript<?>)c.getFirst()).getScriptAsString().contains("EXPIRE")));
    }
    @Test void rejectedWindowCarriesRetryAfterAndMultiplierIsBounded() {
        var redis=mock(StringRedisTemplate.class,invocation->invocation.getMethod().getName().equals("execute")?-42L:RETURNS_DEFAULTS.answer(invocation));
        var limits=new AuthRateLimits(redis,1);
        var error=assertThrows(AuthRateLimits.Exceeded.class,()->limits.authenticatedWrite("u"));
        assertEquals(42,error.retryAfter());assertEquals(429,error.status());
        assertThrows(IllegalArgumentException.class,()->new AuthRateLimits(redis,0));
        assertThrows(IllegalArgumentException.class,()->new AuthRateLimits(redis,101));
    }
    @Test void loginCounterOnlyIncrementsForIncorrectCredentials() {
        var accounts=mock(AccountService.class);var limits=mock(AuthRateLimits.class);
        var controller=new AuthController(accounts,mock(CurrentUser.class),limits);
        var request=new MockHttpServletRequest();var input=new AuthController.Login("student@example.com","some-password");
        doThrow(new ApiProblem(401,"INVALID_CREDENTIALS","invalid")).when(accounts).login(input.email(),input.password(),request);
        assertThrows(ApiProblem.class,()->controller.login(input,request));verify(limits).failedLogin(request,input.email());
        clearInvocations(limits);
        doThrow(new ApiProblem(403,"ACCOUNT_INACTIVE","inactive")).when(accounts).login(input.email(),input.password(),request);
        assertThrows(ApiProblem.class,()->controller.login(input,request));verify(limits,never()).failedLogin(any(),anyString());
        doReturn(Map.of()).when(accounts).login(input.email(),input.password(),request);
        assertEquals(200,controller.login(input,request).getStatusCode().value());verify(limits,never()).failedLogin(any(),anyString());
    }
    @Test void throttlingAdviceIncludesRetryAfterAndRequestId() {
        var response=new AuthRateLimitErrors().limited(new AuthRateLimits.Exceeded(60));
        assertEquals(429,response.getStatusCode().value());assertEquals("60",response.getHeaders().getFirst("Retry-After"));assertNotNull(response.getHeaders().getFirst("X-Request-Id"));
    }
}
