package com.campusradar.catalog;

import java.time.Instant;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class PublicStatsController {
    private final PublicStatsMapper mapper;
    public PublicStatsController(PublicStatsMapper mapper) { this.mapper = mapper; }

    record LandingStats(long companies, long openJobs, long experiences, long questions, Instant asOf, String dataLabel) {}
    record Envelope(LandingStats data, String requestId) {}

    @GetMapping("/api/v1/public/stats")
    ResponseEntity<Envelope> stats() {
        var requestId = UUID.randomUUID().toString();
        var data = new LandingStats(mapper.companies(), mapper.openJobs(), mapper.experiences(), mapper.questions(), Instant.now(), "ACTUAL");
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("X-Request-Id", requestId).body(new Envelope(data, requestId));
    }
}
