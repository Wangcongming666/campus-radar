package com.campusradar.growth;

import com.campusradar.common.ContractInputs;
import tools.jackson.databind.json.JsonMapper;
import java.util.Map;

/** Personal DTOs use the same checked-in OpenAPI validator as every other module. */
public final class PersonalContract {
    private static final ContractInputs INPUTS = new ContractInputs(JsonMapper.builder().build());
    private PersonalContract() {}
    public static void validate(String schema, Map<String,Object> input) {
        INPUTS.validate(schema, input);
    }
}
