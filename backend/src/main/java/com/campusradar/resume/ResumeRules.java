package com.campusradar.resume;

import java.util.*;
import java.util.regex.Pattern;

public final class ResumeRules {
    private ResumeRules() {}
    public static Map<String,Object> diagnose(String text,List<String> skills) {
        var findings=new ArrayList<Map<String,Object>>();
        var limitations=new ArrayList<String>(List.of("规则只检查已提供文字的结构与关键词，不评价能力或经历真实性。","不执行OCR或外部AI，不生成不存在的经历。"));
        if(text==null||text.isBlank())return report(null,List.of(finding("NO_TEXT","尚无可检查文字。","未提取到文字或尚未手动补充。","请补充文字后重新检查；扫描版PDF不会自动识别。")),limitations);
        double score=100;String lower=text.toLowerCase(Locale.ROOT);
        String[][] sections={{"EDUCATION","教育结构缺失","教育|学历|学校|education|university|college"},{"EXPERIENCE","项目或经历结构缺失","项目|经历|实习|工作|project|experience|employment"},{"SKILLS","技能结构缺失","技能|技术栈|skill|technolog"}};
        for(String[] section:sections)if(!Pattern.compile(section[2],Pattern.CASE_INSENSITIVE).matcher(text).find()){score-=15;findings.add(finding("MISSING_"+section[0],section[1],"全文未出现对应结构标识；该规则扣15分。","补充真实信息，并用清晰的小标题组织。"));}
        if(!skills.isEmpty()){
            var missing=skills.stream().filter(s->!s.isBlank()&&!lower.contains(s.toLowerCase(Locale.ROOT))).toList();
            if(!missing.isEmpty()){double penalty=30d*missing.size()/skills.size();score-=penalty;findings.add(finding("SKILL_COVERAGE","目标岗位的部分技能未在文字中出现。",trim("未覆盖："+String.join("、",missing)+"；按未覆盖比例最多扣30分。",2000),"只补充你确实具备的技能及项目证据，不要为了覆盖关键词编造经历。"));}
        }else limitations.add("未指定有技能要求的目标岗位，未计算关键词覆盖扣分。");
        var longLine=Arrays.stream(text.split("\\R",-1)).filter(line->line.codePointCount(0,line.length())>300).findFirst();
        if(longLine.isPresent()){score-=10;findings.add(finding("LONG_LINE","存在超过300字符的单行。",trim(longLine.get(),2000),"按项目、行动与结果拆分长段，增强可读性；该规则扣10分。"));}
        return report(Math.max(0,score),findings,limitations);
    }
    private static Map<String,Object> report(Double score,List<Map<String,Object>> findings,List<String> limitations){var m=new LinkedHashMap<String,Object>();m.put("ruleVersion","resume-v1");m.put("score",score);m.put("findings",findings);m.put("limitations",limitations);return m;}
    private static Map<String,Object> finding(String code,String message,String evidence,String suggestion){return Map.of("code",code,"message",message,"evidence",evidence,"suggestion",suggestion);}
    public static Map<String,List<String>> diff(String base,String compare){return Map.of("addedLines",subtract(compare,base),"removedLines",subtract(base,compare));}
    private static List<String> subtract(String left,String right){var counts=new HashMap<String,Integer>();for(String line:right.split("\\R",-1))counts.merge(line,1,Integer::sum);var out=new ArrayList<String>();for(String line:left.split("\\R",-1)){int count=counts.getOrDefault(line,0);if(count>0)counts.put(line,count-1);else if(out.size()<2000)out.add(trim(line,2000));}return out;}
    private static String trim(String value,int count){return value.length()<=count?value:value.substring(0,count);}
}
