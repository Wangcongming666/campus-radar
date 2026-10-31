package com.campusradar;
import com.campusradar.common.*;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
class ContractInputsTest {
    final ContractInputs inputs=new ContractInputs(JsonMapper.builder().build());
    @Test void rejectsUnknownOwnerAndOversizedNotes() {
        var valid=new HashMap<String,Object>(Map.of("version",0,"completed",true,"note","hello","chapterVersion",1));
        assertDoesNotThrow(()->inputs.validate("ChapterProgressPut",valid));
        valid.put("userId",UUID.randomUUID().toString());assertThrows(ApiProblem.class,()->inputs.validate("ChapterProgressPut",valid));
        valid.remove("userId");valid.put("note","x".repeat(20001));assertThrows(ApiProblem.class,()->inputs.validate("ChapterProgressPut",valid));
    }
    @Test void nullableFieldsAndRefsAreEnforced() {
        var data=new HashMap<String,Object>();data.put("version",1);data.put("school",null);assertDoesNotThrow(()->inputs.validate("UserPatch",data));
        data.put("graduationYear",1700);assertThrows(ApiProblem.class,()->inputs.validate("UserPatch",data));
    }
}
