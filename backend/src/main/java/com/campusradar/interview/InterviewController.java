package com.campusradar.interview;

import com.campusradar.common.*;
import com.campusradar.growth.*;
import com.campusradar.security.CurrentUser;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.nio.charset.StandardCharsets;
import java.util.*;
import static com.campusradar.growth.PersonalStore.map;

@RestController
@RequestMapping("/api/v1")
public class InterviewController {
    private final PersonalStore store;private final InterviewService service;private final CurrentUser auth;
    public InterviewController(PersonalStore store,InterviewService service,CurrentUser auth){this.store=store;this.service=service;this.auth=auth;}
    @GetMapping("/calendar/events") public ResponseEntity<?> events(HttpServletRequest r,@RequestParam(defaultValue="1")int page,@RequestParam(defaultValue="20")int size){String u=auth.requireId(r);var rows=store.all("calendar_events",u,page,size);rows.forEach(e->service.decorate(u,e));return ApiSupport.page(rows,page,size,store.count("calendar_events",u));}
    @PostMapping("/calendar/events")public ResponseEntity<?> createEvent(HttpServletRequest r,@RequestHeader("Idempotency-Key")String key,@RequestBody Map<String,Object>b){PersonalContract.validate("EventInput",b);String u=auth.requireId(r);return ApiSupport.response(store.write(u,key,"/calendar/events",b,201,()->service.eventCreate(u,b)),201);}
    @PatchMapping("/calendar/events/{id}")public ResponseEntity<?> patchEvent(HttpServletRequest r,@PathVariable String id,@RequestBody Map<String,Object>b){PersonalContract.validate("EventPatch",b);String u=auth.requireId(r);return ApiSupport.response(store.write(u,null,"",b,200,()->service.eventPatch(u,id,b)),200);}
    @DeleteMapping("/calendar/events/{id}")public ResponseEntity<?> deleteEvent(HttpServletRequest r,@PathVariable String id,@RequestParam int version){String u=auth.requireId(r);store.write(u,null,"",map("version",version),204,()->{service.eventDelete(u,id,version);return null;});return ApiSupport.response(null,204);}
    @GetMapping("/applications/{id}/rounds")public ResponseEntity<?> rounds(HttpServletRequest r,@PathVariable String id){return ApiSupport.response(service.rounds(auth.requireId(r),id),200);}
    @PostMapping("/applications/{id}/rounds")public ResponseEntity<?> createRound(HttpServletRequest r,@PathVariable String id,@RequestHeader("Idempotency-Key")String key,@RequestBody Map<String,Object>b){PersonalContract.validate("RoundInput",b);String u=auth.requireId(r);return ApiSupport.response(store.write(u,key,"/applications/"+id+"/rounds",b,201,()->service.roundCreate(u,id,b)),201);}
    @PatchMapping("/rounds/{id}")public ResponseEntity<?> patchRound(HttpServletRequest r,@PathVariable String id,@RequestBody Map<String,Object>b){PersonalContract.validate("RoundPatch",b);String u=auth.requireId(r);return ApiSupport.response(store.write(u,null,"",b,200,()->service.roundPatch(u,id,b)),200);}
    @DeleteMapping("/rounds/{id}")public ResponseEntity<?> deleteRound(HttpServletRequest r,@PathVariable String id,@RequestParam int version){String u=auth.requireId(r);store.write(u,null,"",map("version",version),204,()->{service.roundDelete(u,id,version);return null;});return ApiSupport.response(null,204);}
    @GetMapping("/rounds/{id}/review")public ResponseEntity<?> review(HttpServletRequest r,@PathVariable String id){return ApiSupport.response(service.review(auth.requireId(r),id),200);}
    @PutMapping("/rounds/{id}/review")public ResponseEntity<?> reviewPut(HttpServletRequest r,@PathVariable String id,@RequestBody Map<String,Object>b){PersonalContract.validate("ReviewPut",b);String u=auth.requireId(r);return ApiSupport.response(store.write(u,null,"",b,200,()->service.reviewPut(u,id,b)),200);}
    @GetMapping("/calendar/export")public ResponseEntity<byte[]> export(HttpServletRequest r,@RequestParam String from,@RequestParam String to){String u=auth.requireId(r);var dates=PersonalStore.dates(from,to);var rows=store.query("SELECT * FROM calendar_events WHERE user_id=:u AND starts_at<:to AND ends_at>=:from ORDER BY starts_at,id",map("u",u,"from",dates[0].atStartOfDay(),"to",dates[1].plusDays(1).atStartOfDay()));var b=new StringBuilder("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Campus Radar//Calendar//ZH\r\nCALSCALE:GREGORIAN\r\n");for(var e:rows){b.append("BEGIN:VEVENT\r\nUID:").append(e.get("id")).append("@campus-radar\r\nDTSTAMP:").append(icsTime(Instant.now().toString())).append("\r\nDTSTART:").append(icsTime(e.get("startsAt").toString())).append("\r\nDTEND:").append(icsTime(e.get("endsAt").toString())).append("\r\nSUMMARY:").append(PersonalRules.icsText(e.get("title").toString())).append("\r\nDESCRIPTION:").append(PersonalRules.icsText(e.get("notes").toString())).append("\r\nLOCATION:").append(PersonalRules.icsText((String)e.get("location"))).append("\r\nSTATUS:").append("CANCELLED".equals(e.get("status"))?"CANCELLED":"CONFIRMED").append("\r\nEND:VEVENT\r\n");}b.append("END:VCALENDAR\r\n");return ResponseEntity.ok().header("Content-Disposition","attachment; filename=campus-radar.ics").header("X-Request-Id",UUID.randomUUID().toString()).cacheControl(CacheControl.noStore()).contentType(MediaType.parseMediaType("text/calendar;charset=UTF-8")).body(fold(b.toString()).getBytes(StandardCharsets.UTF_8));}
    private static String icsTime(String value){return DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'").withZone(ZoneOffset.UTC).format(Instant.parse(value));}
    static String fold(String text){var out=new StringBuilder();for(String line:text.split("\r\n")){int bytes=0;for(int cp:line.codePoints().toArray()){int n=new String(Character.toChars(cp)).getBytes(StandardCharsets.UTF_8).length;if(bytes+n>73){out.append("\r\n ");bytes=1;}out.appendCodePoint(cp);bytes+=n;}out.append("\r\n");}return out.toString();}
}
