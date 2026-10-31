package com.campusradar.catalog;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.json.JsonMapper;

@RestController
@RequestMapping("/api/v1/jobs")
public class JobsController {
    private final NamedParameterJdbcTemplate db;
    private final JsonMapper json;
    public JobsController(NamedParameterJdbcTemplate db, JsonMapper json) { this.db = db; this.json = json; }
    private static final String FROM = " FROM jobs j JOIN sources s ON s.id=j.source_id JOIN companies c ON c.id=j.company_id WHERE j.publication_status='PUBLISHED' AND s.enabled=1 ";
    private static final String SELECT = "SELECT j.*, c.slug c_slug,c.name c_name,c.logo_url c_logo,c.industry c_industry,c.size_band c_size,c.cities c_cities,c.tags c_tags,c.description_md c_description,c.verified_at c_verified,c.version c_version,c.created_at c_created,c.updated_at c_updated,s.name s_name,s.base_url s_url,s.content_mode s_mode,s.verified_at s_verified ";
    private static Map<String,Object> map(Object... pairs) { Map<String,Object> result = new LinkedHashMap<>(); for (int i=0;i<pairs.length;i+=2) result.put((String)pairs[i],pairs[i+1]); return result; }
    private static Instant instant(Timestamp t) { return t == null ? null : t.toInstant(); }
    private Object parse(String value) { return value == null ? null : json.readValue(value, Object.class); }
    private Map<String,Object> item(ResultSet r) throws SQLException {
        String id=r.getString("id");
        var p=new MapSqlParameterSource("id",id);
        var cities=db.queryForList("SELECT city FROM job_cities WHERE job_id=:id ORDER BY city",p,String.class);
        var years=db.queryForList("SELECT graduation_year FROM job_graduation_years WHERE job_id=:id ORDER BY graduation_year",p,Integer.class);
        var company=map("id",r.getString("company_id"),"version",r.getInt("c_version"),"createdAt",instant(r.getTimestamp("c_created")),"updatedAt",instant(r.getTimestamp("c_updated")),"slug",r.getString("c_slug"),"name",r.getString("c_name"),"logoUrl",r.getString("c_logo"),"industry",r.getString("c_industry"),"sizeBand",r.getString("c_size"),"cities",parse(r.getString("c_cities")),"tags",parse(r.getString("c_tags")),"descriptionMd",r.getString("c_description"),"verifiedAt",instant(r.getTimestamp("c_verified")));
        var source=map("id",r.getString("source_id"),"name",r.getString("s_name"),"url",r.getString("s_url"),"verifiedAt",instant(r.getTimestamp("s_verified")),"contentMode",r.getString("s_mode"));
        var date=r.getDate("deadline_date");
        return map("id",id,"version",r.getInt("version"),"createdAt",instant(r.getTimestamp("created_at")),"updatedAt",instant(r.getTimestamp("updated_at")),"companyId",r.getString("company_id"),"title",r.getString("title"),"role",r.getString("role"),"cities",cities,"education",r.getString("education"),"recruitmentType",r.getString("recruitment_type"),"graduationYears",years,"skills",parse(r.getString("skills")),"salary",parse(r.getString("salary")),"descriptionMd",r.getString("description_md"),"canonicalUrl",r.getString("canonical_url"),"deadlineAt",instant(r.getTimestamp("deadline_at")),"deadlineDate",date==null?null:date.toLocalDate().toString(),"deadlinePrecision",r.getString("deadline_precision"),"sourceTimezone",r.getString("source_timezone"),"status",r.getString("status"),"company",company,"source",source,"publishedAt",instant(r.getTimestamp("published_at")),"collectedAt",instant(r.getTimestamp("collected_at")));
    }
    private ResponseEntity<?> error(int status,String code,String message) {
        String id=UUID.randomUUID().toString();
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).header("X-Request-Id",id).body(map("error",map("code",code,"message",message,"requestId",id)));
    }
    private static List<String> values(String value) {
        if (value==null || value.isBlank()) return List.of();
        return Arrays.stream(value.split(",",-1)).map(String::trim).filter(x->!x.isEmpty()).distinct().toList();
    }
    @GetMapping
    public ResponseEntity<?> list(@RequestParam(defaultValue="1") int page, @RequestParam(defaultValue="20") int size,
        @RequestParam(required=false) String q, @RequestParam(required=false) String city, @RequestParam(required=false) String role,
        @RequestParam(required=false) String education, @RequestParam(required=false) String companyId,
        @RequestParam(required=false) String recruitmentType, @RequestParam(required=false) Integer graduationYear,
        @RequestParam(required=false) String status, @RequestParam(defaultValue="NEWEST") String sort) {
        q=q==null?"":q.trim();
        if (!q.isEmpty() && q.codePointCount(0,q.length())<2) return error(422,"Q_TOO_SHORT","搜索关键词至少为两个字符。");
        var cities=values(city); var roles=values(role); var educations=values(education);
        if (page<1 || page>500 || size<1 || size>100 || q.length()>100 || cities.size()>20 || roles.size()>20 || educations.size()>20 || (city!=null && city.length()>300) || (role!=null && role.length()>200) || (education!=null && education.length()>100) || (graduationYear!=null && (graduationYear<2000 || graduationYear>2100)) || !Set.of("NEWEST","DEADLINE").contains(sort) || (status!=null && !Set.of("OPEN","CLOSED","UNKNOWN").contains(status)) || (recruitmentType!=null && !Set.of("CAMPUS","INTERNSHIP").contains(recruitmentType))) return error(422,"VALIDATION_ERROR","筛选条件无效。");
        var p=new MapSqlParameterSource(); var where=new StringBuilder(FROM);
        if (!q.isEmpty()) { where.append(" AND MATCH(j.title,j.search_text) AGAINST (:q IN NATURAL LANGUAGE MODE)"); p.addValue("q",q); }
        if (!cities.isEmpty()) {where.append(" AND EXISTS (SELECT 1 FROM job_cities jc WHERE jc.job_id=j.id AND jc.city IN (:cities))"); p.addValue("cities",cities);}
        if (!roles.isEmpty()) {where.append(" AND j.role IN (:roles)"); p.addValue("roles",roles);}
        if (!educations.isEmpty()) {where.append(" AND j.education IN (:educations)"); p.addValue("educations",educations);}
        if (companyId!=null && !companyId.isBlank()) {where.append(" AND j.company_id=:companyId");p.addValue("companyId",companyId);}
        if (recruitmentType!=null) {where.append(" AND j.recruitment_type=:type");p.addValue("type",recruitmentType);}
        if (graduationYear!=null) {where.append(" AND EXISTS (SELECT 1 FROM job_graduation_years jy WHERE jy.job_id=j.id AND jy.graduation_year=:year)");p.addValue("year",graduationYear);}
        if (status!=null) {where.append(" AND j.status=:status");p.addValue("status",status);}
        Long total=db.queryForObject("SELECT COUNT(*) "+where,p,Long.class);
        p.addValue("limit",size).addValue("offset",(page-1)*size);
        String order=sort.equals("DEADLINE")?" ORDER BY COALESCE(j.deadline_at, j.deadline_date) IS NULL, COALESCE(j.deadline_at,j.deadline_date), j.id":" ORDER BY j.published_at DESC, j.id";
        var rows=db.query(SELECT+where+order+" LIMIT :limit OFFSET :offset",p,(r,n)->item(r));
        String id=UUID.randomUUID().toString();
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("X-Request-Id",id).body(map("data",rows,"page",map("page",page,"size",size,"total",total,"hasMore",(long)page*size<total),"requestId",id));
    }
    public Map<String,Object> applicationJob(String id) {
        var p=new MapSqlParameterSource("id",id);
        String unrestricted=" FROM jobs j JOIN sources s ON s.id=j.source_id JOIN companies c ON c.id=j.company_id WHERE j.id=:id";
        var rows=db.query(SELECT+unrestricted,p,(r,n)-> {
            var result=item(r);
            return result;
        });
        if(rows.isEmpty()) return null;
        var result=rows.getFirst();
        Boolean visible=db.queryForObject("SELECT COUNT(*) > 0 FROM jobs j JOIN sources s ON s.id=j.source_id WHERE j.id=:id AND j.publication_status='PUBLISHED' AND s.enabled=1",p,Boolean.class);
        if(!Boolean.TRUE.equals(visible)) {
            result.put("descriptionMd", ""); result.put("skills",List.of()); result.put("salary",null);
            result.put("deadlineAt",null); result.put("deadlineDate",null); result.put("deadlinePrecision","UNKNOWN"); result.put("status","UNKNOWN");
        }
        return result;
    }
    @GetMapping("/{id}")
    public ResponseEntity<?> detail(@PathVariable String id) {
        var p=new MapSqlParameterSource("id",id);
        var rows=db.query(SELECT+FROM+" AND j.id=:id",p,(r,n)->item(r));
        if (rows.isEmpty()) return error(404,"NOT_FOUND","岗位不存在或不可用。");
        String requestId=UUID.randomUUID().toString();
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("X-Request-Id",requestId).body(map("data",rows.getFirst(),"requestId",requestId));
    }
}
