package com.campusradar.resume;

import com.campusradar.common.ApiProblem;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class ResumeRulesTest {
    @Test void emptyScanHasNoInventedAbilityScore() {
        var report=ResumeRules.diagnose("",List.of("Java"));assertNull(report.get("score"));assertEquals("resume-v1",report.get("ruleVersion"));
    }
    @Test void contractRulesUseStructureCoverageAndLongLinePenalties() {
        String complete="教育背景 本科\n项目经历 优化检索\n技能 Java Redis";
        assertEquals(100d,ResumeRules.diagnose(complete,List.of("Java","Redis")).get("score"));
        assertEquals(55d,ResumeRules.diagnose("个人信息",List.of()).get("score"));
        assertEquals(85d,ResumeRules.diagnose(complete,List.of("Java","Python")).get("score"));
        assertEquals(90d,ResumeRules.diagnose(complete+"\n"+"x".repeat(301),List.of()).get("score"));
    }
    @Test void multisetDiffDetectsAddedDuplicateAndRemoval() {
        var diff=ResumeRules.diff("a\na\nb","a\nb\nc");assertEquals(List.of("c"),diff.get("addedLines"));assertEquals(List.of("a"),diff.get("removedLines"));
    }
    @Test void filePurposeChecksBytesMimeNamesAndLimits() {
        assertEquals("text/plain",FilePolicy.validate("RESUME","cv.txt","text/plain","教育背景".getBytes(StandardCharsets.UTF_8)));
        assertThrows(ApiProblem.class,()->FilePolicy.validate("RESUME","../cv.txt","text/plain",new byte[]{65}));
        assertThrows(ApiProblem.class,()->FilePolicy.validate("RESUME","cv.pdf","application/pdf","not a pdf".getBytes(StandardCharsets.UTF_8)));
        assertThrows(ApiProblem.class,()->FilePolicy.validate("AVATAR","evil.png","image/png","<script>bad</script>".getBytes(StandardCharsets.UTF_8)));
        assertThrows(ApiProblem.class,()->FilePolicy.validate("RESUME","empty.txt","text/plain",new byte[0]));
        assertThrows(ApiProblem.class,()->FilePolicy.validate("AVATAR","big.png","image/png",new byte[2*1024*1024+1]));
    }
}
