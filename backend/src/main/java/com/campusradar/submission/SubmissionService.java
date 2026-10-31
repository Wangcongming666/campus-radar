package com.campusradar.submission;

import com.campusradar.common.ApiProblem;
import com.campusradar.common.SqlRows;
import org.springframework.stereotype.Service;
import java.math.BigDecimal;
import java.util.*;
import static com.campusradar.common.SqlRows.map;

/** Read-only, author-scoped projection of moderated public contributions. */
@Service
public class SubmissionService {
    private final SqlRows sql;
    private static final Set<String> KINDS=Set.of("POST","EXPERIENCE","SALARY","REFERRAL","POST_COMMENT","EXPERIENCE_COMMENT");
    private static final Set<String> STATUSES=Set.of("DRAFT","PENDING","PUBLISHED","REJECTED","HIDDEN");
    public SubmissionService(SqlRows sql) { this.sql=sql; }
    public record Result(List<Map<String,Object>> data,long total) {}

    public Result list(String owner,String type,String status,int page,int size) {
        if(owner==null||owner.isBlank())throw new ApiProblem(401,"UNAUTHENTICATED","请先登录。");
        if(type!=null&&!KINDS.contains(type))throw invalid("投稿类型无效。");
        if(status!=null&&!STATUSES.contains(status))throw invalid("审核状态无效。");
        if(page<1||page>500||size<1||size>100)throw invalid("分页参数超出范围。");
        var sources=new ArrayList<String>();
        for(String kind:List.of("POST","EXPERIENCE","SALARY","REFERRAL","POST_COMMENT","EXPERIENCE_COMMENT"))
            if(type==null||type.equals(kind))sources.add(source(kind));
        String from=" FROM ("+String.join(" UNION ALL ",sources)+") submissions"+(status==null?"":" WHERE status=:status");
        var params=map("owner",owner,"status",status,"limit",size,"offset",(page-1)*size);
        long total=sql.db.queryForObject("SELECT COUNT(*)"+from,params,Long.class);
        var rows=sql.query("SELECT *"+from+" ORDER BY created_at DESC,id DESC,kind LIMIT :limit OFFSET :offset",params);
        var salaryIds=rows.stream().filter(row->"SALARY".equals(row.get("kind"))).map(row->row.get("id")).toList();
        if(!salaryIds.isEmpty()) {
            var details=sql.query("SELECT id,role,city,year,base_monthly_minor,salary_months,bonus_minor,source_note FROM salary_reports WHERE author_id=:owner AND id IN (:ids)",map("owner",owner,"ids",salaryIds));
            for(var row:rows)if("SALARY".equals(row.get("kind")))details.stream().filter(detail->detail.get("id").equals(row.get("id"))).findFirst().ifPresent(detail->row.put("details",salaryDetails(detail)));
        }
        var commentIds=rows.stream().filter(row->"POST_COMMENT".equals(row.get("kind"))).map(row->row.get("id")).toList();
        if(!commentIds.isEmpty()) {
            // Enrich only this owner's current page. Foreign unpublished post/reply text stays hidden.
            var contexts=sql.query("SELECT c.id,c.body,c.post_id,c.parent_id,CASE WHEN p.status='PUBLISHED' OR p.author_id=:owner THEN LEFT(p.body_md,500) ELSE NULL END post_summary,CASE WHEN p.status='PUBLISHED' THEN 1 ELSE 0 END post_available,CASE WHEN q.author_id=:owner OR (q.status='PUBLISHED' AND p.status='PUBLISHED') THEN q.body ELSE NULL END parent_body FROM comments c JOIN posts p ON p.id=c.post_id LEFT JOIN comments q ON q.id=c.parent_id AND q.post_id=c.post_id WHERE c.author_id=:owner AND c.id IN (:ids)",map("owner",owner,"ids",commentIds));
            for(var row:rows)if("POST_COMMENT".equals(row.get("kind")))contexts.stream().filter(c->c.get("id").equals(row.get("id"))).findFirst().ifPresent(c->{
                boolean available=((Number)c.get("postAvailable")).intValue()==1;
                row.put("commentContext",map("body",c.get("body"),"postId",c.get("postId"),"postSummary",c.get("postSummary"),"postAvailable",available,"postPath",available?"/community#post-"+c.get("postId"):null,"parentId",c.get("parentId"),"parentBody",c.get("parentBody")));
            });
        }
        return new Result(rows,total);
    }
    private static String source(String kind) {
        return switch(kind) {
            case "POST" -> projection("p",kind,"LEFT(p.body_md,60)","LEFT(p.body_md,500)","CASE WHEN p.status='PUBLISHED' THEN CONCAT('/community#post-',p.id) ELSE NULL END")+" FROM posts p WHERE p.author_id=:owner";
            case "EXPERIENCE" -> projection("e",kind,"e.title","LEFT(e.summary,500)","CASE WHEN e.status='PUBLISHED' THEN CONCAT('/experiences/',e.id) ELSE NULL END")+" FROM experiences e WHERE e.author_id=:owner";
            case "SALARY" -> projection("s",kind,"CONCAT(c.name,' · 薪资样本')","CONCAT(s.role,' · ',s.city,' · ',s.year)","NULL")+" FROM salary_reports s JOIN companies c ON c.id=s.company_id WHERE s.author_id=:owner";
            case "REFERRAL" -> projection("r",kind,"r.title","LEFT(r.description,500)","CASE WHEN r.status='PUBLISHED' AND r.expires_at>CURRENT_TIMESTAMP AND u.status='ACTIVE' AND u.provider_verified=1 AND u.provider_verified_until>CURRENT_TIMESTAMP THEN '/referral' ELSE NULL END")+" FROM referrals r JOIN users u ON u.id=r.provider_id WHERE r.provider_id=:owner";
            case "POST_COMMENT" -> projection("c",kind,"'社区评论'","LEFT(c.body,500)","CASE WHEN c.status='PUBLISHED' AND p.status='PUBLISHED' THEN CONCAT('/community#post-',p.id) ELSE NULL END")+" FROM comments c JOIN posts p ON p.id=c.post_id WHERE c.author_id=:owner";
            case "EXPERIENCE_COMMENT" -> projection("c",kind,"'面经评论'","LEFT(c.body,500)","CASE WHEN c.status='PUBLISHED' AND e.status='PUBLISHED' THEN CONCAT('/experiences/',e.id) ELSE NULL END")+" FROM comments c JOIN experiences e ON e.id=c.experience_id WHERE c.author_id=:owner";
            default -> throw new IllegalArgumentException("Unsupported static source");
        };
    }
    private static String projection(String alias,String kind,String title,String summary,String path) {
        // UUID CONCAT paths inherit ascii_bin, while the referral literal uses the connection
        // collation. CAST every branch (including NULL) to the same connection character set
        // before UNION. 128 covers the fixed routes plus a 36-character UUID; a length also
        // avoids H2's default CHAR(1), so tests and MySQL execute the same SQL.
        return "SELECT "+alias+".id,'"+kind+"' kind,"+alias+".status,"+alias+".version,"+title+" title,"+summary+" summary,"+alias+".created_at,"+alias+".updated_at,CAST("+path+" AS CHAR(128)) public_path";
    }
    private static List<Map<String,Object>> salaryDetails(Map<String,Object> row) {
        return List.of(map("label","岗位方向","value",row.get("role")),map("label","工作城市","value",row.get("city")),map("label","年份","value",row.get("year").toString()),
            map("label","基本月薪","value",money(row.get("baseMonthlyMinor"))),map("label","薪资月数","value",row.get("salaryMonths")==null?"未知":new BigDecimal(row.get("salaryMonths").toString()).stripTrailingZeros().toPlainString()+" 个月"),
            map("label","年度现金奖金","value",money(row.get("bonusMinor"))),map("label","来源说明","value",row.get("sourceNote")));
    }
    private static String money(Object minor) {return minor==null?"未知":new BigDecimal(minor.toString()).movePointLeft(2).stripTrailingZeros().toPlainString()+" 元";}
    private static ApiProblem invalid(String message) {return new ApiProblem(422,"VALIDATION_FAILED",message);}
}
