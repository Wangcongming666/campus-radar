package com.campusradar.common;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;

public final class ApiSupport {
    private ApiSupport() {}
    public static ResponseEntity<?> response(Object data, int status) {
        String id = UUID.randomUUID().toString();
        if (status == 204) return ResponseEntity.noContent().header("X-Request-Id", id).cacheControl(CacheControl.noStore()).build();
        Map<String,Object> body = new LinkedHashMap<>();
        body.put("data", data); body.put("requestId", id);
        return ResponseEntity.status(status).header("X-Request-Id", id).cacheControl(CacheControl.noStore()).body(body);
    }
    public static ResponseEntity<?> page(Object data, int page, int size, long total) {
        String id=UUID.randomUUID().toString();
        return ResponseEntity.ok().header("X-Request-Id",id).cacheControl(CacheControl.noStore())
            .body(Map.of("data",data,"page",Map.of("page",page,"size",size,"total",total,"hasMore",(long)page*size<total),"requestId",id));
    }
}
