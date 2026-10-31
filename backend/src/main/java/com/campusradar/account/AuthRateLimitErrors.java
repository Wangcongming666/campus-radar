package com.campusradar.account;

import java.util.Map;
import java.util.UUID;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;

@RestControllerAdvice
@Order(Ordered.HIGHEST_PRECEDENCE)
public class AuthRateLimitErrors {
    @ExceptionHandler(AuthRateLimits.Exceeded.class)
    ResponseEntity<?> limited(AuthRateLimits.Exceeded failure){String id=UUID.randomUUID().toString();return ResponseEntity.status(429).cacheControl(CacheControl.noStore()).header("X-Request-Id",id).header("Retry-After",Integer.toString(failure.retryAfter())).body(Map.of("error",Map.of("code",failure.code(),"message",failure.getMessage(),"requestId",id)));}
}
