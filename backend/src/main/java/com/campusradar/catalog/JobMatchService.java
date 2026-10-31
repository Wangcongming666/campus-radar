package com.campusradar.catalog;

import com.campusradar.common.*;
import org.springframework.stereotype.Service;
import java.util.*;
import static com.campusradar.common.SqlRows.map;
@Service
public class JobMatchService {
    private final SqlRows r;private final JobsController jobs;
    public JobMatchService(SqlRows rows,JobsController jobs){r=rows;this.jobs=jobs;}
    public Map<String,Object> match(String user,String jobId){long visible=r.db.queryForObject("SELECT COUNT(*) FROM jobs j JOIN sources s ON s.id=j.source_id WHERE j.id=:id AND j.publication_status='PUBLISHED' AND s.enabled=1",Map.of("id",jobId),Long.class);if(visible==0)throw new ApiProblem(404,"NOT_FOUND","岗位不存在或不可用。");var profile=r.one("SELECT preferences,education,graduation_year FROM users WHERE id=:id",Map.of("id",user),Set.of("preferences"),Set.of());return evaluate(profile,jobs.applicationJob(jobId));}
    public static Map<String,Object> evaluate(Map<String,Object> user,Map<String,Object> job){
        Map<?,?> prefs=user.get("preferences") instanceof Map<?,?> p?p:Map.of();var reasons=new ArrayList<String>();var missing=new ArrayList<String>();var criteria=new ArrayList<Boolean>();
        compare(prefs.get("roles"),List.of(Objects.toString(job.get("role"),"")),"preferences.roles","方向",criteria,reasons,missing);
        compare(prefs.get("cities"),job.get("cities"),"preferences.cities","城市",criteria,reasons,missing);
        compare(prefs.get("recruitmentTypes"),List.of(Objects.toString(job.get("recruitmentType"),"")),"preferences.recruitmentTypes","招聘类型",criteria,reasons,missing);
        Object year=user.get("graduationYear");List<?> years=job.get("graduationYears") instanceof List<?> y?y:List.of();if(!(year instanceof Number)||years.isEmpty())missing.add("graduationYear");else {boolean match=years.stream().anyMatch(y->y instanceof Number n&&n.intValue()==((Number)year).intValue());criteria.add(match);reasons.add(match?"毕业届别符合岗位要求。":"毕业届别不在岗位要求范围内。");}
        String education=Objects.toString(user.get("education"),""),required=Objects.toString(job.get("education"),"UNKNOWN");Map<String,Integer> ranks=Map.of("ASSOCIATE",1,"BACHELOR",2,"MASTER",3,"DOCTORATE",4);if(required.equals("ANY")){criteria.add(true);reasons.add("岗位不限学历。");}else if(!ranks.containsKey(education)||!ranks.containsKey(required))missing.add("education");else {boolean match=ranks.get(education)>=ranks.get(required);criteria.add(match);reasons.add(match?"学历达到岗位标注要求。":"学历未达到岗位标注要求。");}
        double coverage=criteria.size()*100d/5;Double score=criteria.isEmpty()?null:criteria.stream().filter(Boolean::booleanValue).count()*100d/criteria.size();reasons.add("仅按已填写的偏好和岗位条件比较，不代表录用概率。");return map("score",score,"coverage",coverage,"ruleVersion","profile-match-v1","reasons",reasons,"missingFields",missing);
    }
    private static void compare(Object profile,Object target,String key,String label,List<Boolean> criteria,List<String> reasons,List<String> missing){if(!(profile instanceof List<?> choices)||choices.isEmpty()||!(target instanceof List<?> actual)||actual.isEmpty()){missing.add(key);return;}boolean match=choices.stream().anyMatch(actual::contains);criteria.add(match);reasons.add(label+(match?"符合已填写的意向。":"与已填写的意向不同。"));}
}
