package com.campusradar.catalog;
import com.campusradar.common.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;
import java.util.*;
import static com.campusradar.common.SqlRows.map;

@RestController
public class SearchController {
    private final SqlRows r;
    public SearchController(SqlRows rows){r=rows;}
    @GetMapping("/api/v1/search") ResponseEntity<?> search(@RequestParam String q,@RequestParam(required=false)String types,@RequestParam(defaultValue="20")int limit){
        q=q.trim();if(q.length()<2||q.length()>100||limit<1||limit>50||(types!=null&&types.length()>100))throw new ApiProblem(422,"VALIDATION_ERROR","关键词须为2至100个字符，条数须为1至50。");
        Set<String> allowed=Set.of("JOB","COMPANY","EXPERIENCE","QUESTION","CHAPTER");Set<String> selected=types==null?allowed:new HashSet<>(Arrays.asList(types.split(",",-1)));if(!allowed.containsAll(selected))throw new ApiProblem(422,"VALIDATION_ERROR","搜索类型无效。");
        var p=map("q",q,"like","%"+q.replace("!","!!").replace("%","!%").replace("_","!_")+"%","limit",limit);var items=new ArrayList<Map<String,Object>>();
        for(String type:List.of("JOB","COMPANY","EXPERIENCE","QUESTION","CHAPTER")){
            if(!selected.contains(type)||items.size()>=limit)continue;List<Map<String,Object>> rows;
            switch(type){
                case "JOB" -> rows=r.query("SELECT j.id,j.title,c.name subtitle FROM jobs j JOIN companies c ON c.id=j.company_id JOIN sources s ON s.id=j.source_id WHERE j.publication_status='PUBLISHED' AND s.enabled=1 AND MATCH(j.title,j.search_text) AGAINST (:q IN NATURAL LANGUAGE MODE) ORDER BY j.published_at DESC,j.id LIMIT :limit",p);
                case "COMPANY" -> rows=r.query("SELECT id,name title,COALESCE(industry,'公司资料') subtitle FROM companies WHERE name LIKE :like ESCAPE '!' ORDER BY name,id LIMIT :limit",p);
                case "EXPERIENCE" -> rows=r.query("SELECT id,title,role subtitle FROM experiences WHERE status='PUBLISHED' AND MATCH(title,body_md) AGAINST (:q IN NATURAL LANGUAGE MODE) ORDER BY published_at DESC,id LIMIT :limit",p);
                case "QUESTION" -> rows=r.query("SELECT id,title,role subtitle FROM questions WHERE status='PUBLISHED' AND MATCH(title,prompt_md) AGAINST (:q IN NATURAL LANGUAGE MODE) ORDER BY updated_at DESC,id LIMIT :limit",p);
                default -> rows=r.query("SELECT id,title,direction subtitle FROM chapters WHERE status='PUBLISHED' AND title LIKE :like ESCAPE '!' ORDER BY sort_order,id LIMIT :limit",p);
            }
            for(var row:rows){if(items.size()>=limit)break;String id=row.get("id").toString();String href=switch(type){case "JOB"->"/jobs/"+id;case "COMPANY"->"/company/"+id;case "EXPERIENCE"->"/experiences/"+id;case "QUESTION"->"/questions?question="+id;default->"/handbook?chapter="+id;};items.add(map("id",id,"type",type,"title",row.get("title"),"subtitle",row.get("subtitle"),"href",href,"previewable",Set.of("JOB","EXPERIENCE","QUESTION").contains(type)));}
        }
        return ApiSupport.response(Map.of("items",items),200);
    }
}
