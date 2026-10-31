package com.campusradar.growth;

import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class PersonalRulesTest {
    @Test void missingMoneyRemainsUnknownInsteadOfBecomingZero() {
        assertNull(PersonalRules.annual(null, 12, 0L));
        assertNull(PersonalRules.annual(100000L, null, 0L));
        assertNull(PersonalRules.annual(100000L, 12, null));
        assertEquals(1300000L, PersonalRules.annual(100000L, 12, 100000L));
    }
    @Test void comparisonNormalizesOnlyKnownWeightsAndReportsCoverage() {
        var result = PersonalRules.score(List.of(Map.of("dimension","growth","weight",0.6),Map.of("dimension","cash","weight",0.4)), List.of(Map.of("dimension","growth","score",80)));
        assertEquals(80d, result.get("score"));
        assertEquals(0.6d, result.get("coverage"));
    }
    @Test void icsEscapesTextToPreventInjectedProperties() {
        assertEquals("Team\\, A\\; B\\nEND:VEVENT",PersonalRules.icsText("Team, A; B\r\nEND:VEVENT"));
    }
}
