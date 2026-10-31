package com.campusradar.practice;

import com.campusradar.common.*;
import java.math.*;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import static com.campusradar.common.SqlRows.map;

@Service
public class PracticeService {
    private final SqlRows rows;
    private final OwnerTransactions tx;
    private final ContractInputs inputs;
    private final Clock clock;
    private static final String ANSWERS="id,version,created_at,updated_at,question_id,prompt_snapshot,reference_snapshot,sequence,answer_text,self_score";
    public PracticeService(SqlRows rows,OwnerTransactions tx,ContractInputs inputs,Clock clock){this.rows=rows;this.tx=tx;this.inputs=inputs;this.clock=clock;}
    public record Page(List<Map<String,Object>> data,long total){}
    private static String id(String value){try{if(value==null||!value.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"))throw new IllegalArgumentException();return UUID.fromString(value).toString();}catch(IllegalArgumentException e){throw new ApiProblem(422,"VALIDATION_ERROR","标识符格式无效。");}}
    private static int number(Object value){return ((Number)value).intValue();}
    private static void version(Object actual,Object expected){if(number(actual)!=number(expected))throw new ApiProblem(409,"VERSION_CONFLICT","练习已更新，请刷新后重试。");}
    private Map<String,Object> session(String owner,String sessionId){return rows.one("SELECT * FROM mock_sessions WHERE user_id=:u AND id=:id",map("u",owner,"id",id(sessionId)),Set.of("report"),Set.of());}
    private List<Map<String,Object>> answers(String owner,String sessionId){return rows.query("SELECT "+ANSWERS+" FROM mock_answers WHERE user_id=:u AND session_id=:id ORDER BY sequence,id",map("u",owner,"id",sessionId));}
    private int remaining(Map<String,Object> session){int saved=number(session.get("remainingSeconds"));if(!"ACTIVE".equals(session.get("state"))||session.get("timerStartedAt")==null)return saved;long elapsed=Math.max(0,Duration.between(Instant.parse(session.get("timerStartedAt").toString()),clock.instant()).getSeconds());return (int)Math.max(0,saved-elapsed);}
    private Map<String,Object> dto(String owner,Map<String,Object> raw){var answers=answers(owner,raw.get("id").toString());return map("id",raw.get("id"),"version",raw.get("version"),"createdAt",raw.get("createdAt"),"updatedAt",raw.get("updatedAt"),"role",raw.get("role"),"companyId",raw.get("companyId"),"questionIds",answers.stream().map(a->a.get("questionId")).toList(),"durationSeconds",raw.get("durationSeconds"),"state",raw.get("state"),"remainingSeconds",remaining(raw),"answers",answers,"report",raw.get("report"));}
    @Transactional(readOnly=true) public Map<String,Object> detail(String owner,String sessionId){return dto(owner,session(owner,sessionId));}
    @Transactional(readOnly=true) public Page list(String owner,int page,int size){if(page<1||page>500||size<1||size>100)throw new ApiProblem(422,"VALIDATION_ERROR","分页参数无效。");var p=map("u",owner,"limit",size,"offset",(page-1)*size);var all=rows.query("SELECT * FROM mock_sessions WHERE user_id=:u ORDER BY created_at DESC,id LIMIT :limit OFFSET :offset",p,Set.of("report"),Set.of());long total=rows.db.queryForObject("SELECT COUNT(*) FROM mock_sessions WHERE user_id=:u",p,Long.class);return new Page(all.stream().map(s->dto(owner,s)).toList(),total);}
    public Object create(String owner,Map<String,Object> body,String key){inputs.validate("MockInput",body);return tx.write(owner,"POST","/api/v1/mock-sessions",key,body,201,true,()->{
        String role=body.get("role").toString();if(role.isBlank())throw new ApiProblem(422,"VALIDATION_ERROR","请选择练习方向。");String company=body.get("companyId")==null?null:id(body.get("companyId").toString());
        if(company!=null&&rows.db.queryForObject("SELECT COUNT(*) FROM companies WHERE id=:id",Map.of("id",company),Integer.class)!=1)throw new ApiProblem(404,"NOT_FOUND","公司不存在。");
        var selected=new ArrayList<Map<String,Object>>();for(Object questionId:(List<?>)body.get("questionIds")){var p=map("id",id(questionId.toString()),"role",role,"company",company);String filter=company==null?"":" AND EXISTS (SELECT 1 FROM question_companies qc WHERE qc.question_id=q.id AND qc.company_id=:company)";selected.add(rows.one("SELECT id,prompt_md,answer_md FROM questions q WHERE q.id=:id AND q.status='PUBLISHED' AND q.role=:role"+filter,p,Set.of(),Set.of()));}
        String sessionId=UUID.randomUUID().toString();var params=map("id",sessionId,"u",owner,"role",role,"company",company,"duration",body.get("durationSeconds"),"now",Timestamp.from(clock.instant()));
        rows.db.update("INSERT INTO mock_sessions(id,user_id,role,company_id,duration_seconds,remaining_seconds,state,timer_started_at,report,created_at,updated_at) VALUES(:id,:u,:role,:company,:duration,:duration,'ACTIVE',:now,NULL,:now,:now)",params);
        int sequence=0;for(var question:selected){params.put("answerId",UUID.randomUUID().toString());params.put("question",question.get("id"));params.put("sequence",++sequence);params.put("prompt",question.get("promptMd"));params.put("reference",question.get("answerMd"));rows.db.update("INSERT INTO mock_answers(id,user_id,session_id,question_id,sequence,prompt_snapshot,reference_snapshot,answer_text,self_score,created_at,updated_at) VALUES(:answerId,:u,:id,:question,:sequence,:prompt,:reference,'',NULL,:now,:now)",params);}
        return detail(owner,sessionId);
    });}
    public Object action(String owner,String sessionId,Map<String,Object> body,String key){inputs.validate("MockAction",body);String sid=id(sessionId);return tx.write(owner,"PATCH","/api/v1/mock-sessions/"+sid,key,body,200,true,()->{
        var current=session(owner,sid);version(current.get("version"),body.get("version"));String old=current.get("state").toString(),action=body.get("action").toString();int remaining=remaining(current);Object report=null;String state;
        switch(action){
            case "PAUSE"->{if(!old.equals("ACTIVE")||remaining==0)throw new ApiProblem(409,"INVALID_STATE","只能暂停尚未到时的进行中练习。");state="PAUSED";}
            case "RESUME"->{if(!old.equals("PAUSED")||remaining==0)throw new ApiProblem(409,"INVALID_STATE","当前练习不能恢复计时。");state="ACTIVE";}
            case "SUBMIT"->{if(!Set.of("ACTIVE","PAUSED").contains(old))throw new ApiProblem(409,"INVALID_STATE","练习已经提交。");state="COMPLETED";report=report(answers(owner,sid));}
            default->throw new ApiProblem(422,"VALIDATION_ERROR","练习操作无效。");
        }
        var p=map("u",owner,"id",sid,"version",body.get("version"),"state",state,"remaining",remaining,"timer",state.equals("ACTIVE")?Timestamp.from(clock.instant()):null,"report",report==null?null:rows.json.writeValueAsString(report),"now",Timestamp.from(clock.instant()));
        if(rows.db.update("UPDATE mock_sessions SET state=:state,remaining_seconds=:remaining,timer_started_at=:timer,report=:report,version=version+1,updated_at=:now WHERE user_id=:u AND id=:id AND version=:version",p)!=1)throw new ApiProblem(409,"VERSION_CONFLICT","练习已更新。");return detail(owner,sid);
    });}
    public Object saveAnswer(String owner,String sessionId,String answerId,Map<String,Object> body){inputs.validate("AnswerPut",body);String sid=id(sessionId),aid=id(answerId);return tx.write(owner,"PUT","/api/v1/mock-sessions/"+sid+"/answers/"+aid,null,body,200,true,()->{
        var current=session(owner,sid);if(!"ACTIVE".equals(current.get("state")))throw new ApiProblem(409,"INVALID_STATE","请在进行中的练习保存回答；已提交练习不可修改。");if(remaining(current)==0)throw new ApiProblem(409,"TIMER_EXPIRED","练习时间已到，请提交已保存的回答。");
        var p=map("u",owner,"session",sid,"id",aid,"version",body.get("version"),"text",body.get("answerText"),"score",body.get("selfScore"),"now",Timestamp.from(clock.instant()));var answer=rows.one("SELECT "+ANSWERS+" FROM mock_answers WHERE user_id=:u AND session_id=:session AND id=:id",p,Set.of(),Set.of());version(answer.get("version"),body.get("version"));
        if(rows.db.update("UPDATE mock_answers SET answer_text=:text,self_score=:score,version=version+1,updated_at=:now WHERE user_id=:u AND session_id=:session AND id=:id AND version=:version",p)!=1)throw new ApiProblem(409,"VERSION_CONFLICT","回答已更新，请刷新后重试。");return rows.one("SELECT "+ANSWERS+" FROM mock_answers WHERE user_id=:u AND session_id=:session AND id=:id",p,Set.of(),Set.of());
    });}
    static Map<String,Object> report(List<Map<String,Object>> answers){var findings=new ArrayList<Map<String,Object>>();int answered=0,scored=0;BigDecimal score=BigDecimal.ZERO;
        for(var a:answers){String text=a.get("answerText").toString().strip();int length=text.codePointCount(0,text.length());String label="第 "+a.get("sequence")+" 题";if(length==0)findings.add(map("code","UNANSWERED","message",label+"尚未作答","evidence","已保存回答为空。","suggestion","对照参考内容，补充自己的推导过程后再开启新练习。"));else{answered++;if(length<80)findings.add(map("code","BRIEF_ANSWER","message",label+"回答较简短","evidence","已保存回答共 "+length+" 个字符。","suggestion","自查是否说明了结论、理由、例子及适用边界；字数规则不能判断回答是否正确。"));}if(a.get("selfScore") instanceof Number n){score=score.add(new BigDecimal(n.toString()));scored++;}}
        findings.addFirst(map("code","ANSWER_COVERAGE","message","回答完成度","evidence","已保存 "+answered+" / "+answers.size()+" 题的非空回答。","suggestion","结合题目参考内容检查知识点，针对未完成题目安排复习。"));
        if(scored>0)findings.add(map("code","SELF_SCORE_SUMMARY","message","自评分均值","evidence",scored+" / "+answers.size()+" 题填写了自评分。","suggestion","该均值只汇总本人填写的分数，不代表系统判断或面试通过概率。"));
        return map("ruleVersion","mock-rules-1","score",scored==0?null:score.divide(BigDecimal.valueOf(scored),2,RoundingMode.HALF_UP),"findings",findings,"limitations",List.of("分数是已填写自评分的算术平均值，未填写项不参与计算。","规则仅检查回答完成度与长度，不判断技术正确性；未调用外部 AI。","题目与参考内容来自创建练习时的快照，可能需要结合最新资料核对。"));
    }
}
