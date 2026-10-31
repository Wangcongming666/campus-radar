package com.campusradar;
import com.campusradar.catalog.JobMatchService;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
class JobMatchTest {
    @Test void absentProfileDoesNotInventScore(){var job=Map.<String,Object>of("role","backend","cities",List.of("上海"),"recruitmentType","CAMPUS","graduationYears",List.of(2027),"education","BACHELOR");var value=JobMatchService.evaluate(Map.of("preferences",Map.of()),job);assertNull(value.get("score"));assertEquals(0d,value.get("coverage"));}
    @Test void knownProfileUsesActualCriteria(){var user=Map.<String,Object>of("preferences",Map.of("roles",List.of("backend"),"cities",List.of("上海"),"recruitmentTypes",List.of("CAMPUS")),"graduationYear",2027,"education","MASTER");var job=Map.<String,Object>of("role","backend","cities",List.of("上海"),"recruitmentType","CAMPUS","graduationYears",List.of(2027),"education","BACHELOR");var value=JobMatchService.evaluate(user,job);assertEquals(100d,value.get("score"));assertEquals(100d,value.get("coverage"));}
}
