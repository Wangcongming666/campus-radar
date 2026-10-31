package com.campusradar.common;

import java.math.BigDecimal;
import java.net.URI;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

/** Validates explicit operation DTO maps against the single checked-in OpenAPI schema. */
@Component
public class ContractInputs {
    private final Map<String,Object> schemas;
    @SuppressWarnings("unchecked")
    public ContractInputs(JsonMapper json) {
        try (var stream=getClass().getResourceAsStream("/contracts/openapi.json")) {
            if(stream==null) throw new IllegalStateException("OpenAPI resource missing");
            var spec=json.readValue(stream,Map.class);
            schemas=(Map<String,Object>)((Map<?,?>)spec.get("components")).get("schemas");
        } catch(java.io.IOException e) { throw new IllegalStateException("OpenAPI resource unreadable",e); }
    }
    public void validate(String schema, Map<String,Object> input) { check(object(schemas.get(schema)),input,""); }
    @SuppressWarnings("unchecked") private static Map<String,Object> object(Object v) { return (Map<String,Object>)v; }
    private static ApiProblem invalid(String path) { return new ApiProblem(422,"VALIDATION_ERROR", "字段无效："+(path.isBlank()?"请求体":path)); }
    private static BigDecimal number(Object n) { return new BigDecimal(n.toString()); }
    private void check(Map<String,Object> s,Object v,String path) {
        if(s==null) throw new IllegalArgumentException("Unknown contract schema");
        if(s.get("$ref") instanceof String ref) {check(object(schemas.get(ref.substring(ref.lastIndexOf('/')+1))),v,path);return;}
        if(s.containsKey("const")&&!Objects.equals(s.get("const"),v)) throw invalid(path);
        if(s.get("enum") instanceof List<?> choices&&!choices.contains(v)) throw invalid(path);
        if(s.get("anyOf") instanceof List<?> branches) {
            for(Object b:branches) { try { check(object(b),v,path); return; } catch(ApiProblem ignored) {} }
            throw invalid(path);
        }
        if(s.get("allOf") instanceof List<?> branches) for(Object b:branches) check(object(b),v,path);
        if(s.get("if") instanceof Map<?,?> condition) {boolean matches=true;try{check(object(condition),v,path);}catch(ApiProblem e){matches=false;}if(matches && s.get("then") instanceof Map<?,?> then)check(object(then),v,path);}
        String type=(String)s.get("type");
        if(type==null) { if(s.containsKey("properties")&&v instanceof Map<?,?> m)properties(s,m,path); return; }
        switch(type) {
            case "null" -> { if(v!=null)throw invalid(path); }
            case "object" -> { if(!(v instanceof Map<?,?>))throw invalid(path);properties(s,(Map<?,?>)v,path); }
            case "array" -> { if(!(v instanceof List<?>))throw invalid(path);var a=(List<?>)v;bounds(s,a.size(),"minItems","maxItems",path);if(Boolean.TRUE.equals(s.get("uniqueItems"))&&new HashSet<>(a).size()!=a.size())throw invalid(path);for(Object item:a)check(object(s.get("items")),item,path+"[]"); }
            case "string" -> {
                if(!(v instanceof String))throw invalid(path);String text=(String)v;bounds(s,text.codePointCount(0,text.length()),"minLength","maxLength",path);
                if(s.get("pattern") instanceof String pattern&&!text.matches(pattern))throw invalid(path);
                try { switch(Objects.toString(s.get("format"),"")) {
                    case "uuid" -> { if(!text.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"))throw invalid(path);UUID.fromString(text); }
                    case "date" -> LocalDate.parse(text);
                    case "date-time" -> OffsetDateTime.parse(text);
                    case "email" -> { if(!text.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+"))throw invalid(path); }
                    case "uri" -> {var u=URI.create(text);if(!Set.of("http","https").contains(u.getScheme())||u.getHost()==null)throw invalid(path);}
                }} catch(java.time.format.DateTimeParseException|IllegalArgumentException e){throw invalid(path);}
            }
            case "integer","number" -> { if(!(v instanceof Number))throw invalid(path);BigDecimal n;try{n=number(v);}catch(NumberFormatException e){throw invalid(path);}if(type.equals("integer")&&n.stripTrailingZeros().scale()>0)throw invalid(path);if(s.containsKey("minimum")&&n.compareTo(number(s.get("minimum")))<0||s.containsKey("maximum")&&n.compareTo(number(s.get("maximum")))>0)throw invalid(path); }
            case "boolean" -> { if(!(v instanceof Boolean))throw invalid(path); }
            default -> throw new IllegalStateException("Unsupported contract type");
        }
    }
    private void properties(Map<String,Object> s,Map<?,?> m,String path) {
        if(s.get("required") instanceof List<?> required)for(Object key:required)if(!m.containsKey(key))throw invalid(path+"."+key);
        bounds(s,m.size(),"minProperties","maxProperties",path);
        Map<String,Object> props=s.containsKey("properties")?object(s.get("properties")):Map.of();
        for(var entry:m.entrySet()) {
            String key=entry.getKey().toString();
            if(props.containsKey(key))check(object(props.get(key)),entry.getValue(),path.isEmpty()?key:path+"."+key);
            else if(Boolean.FALSE.equals(s.get("additionalProperties")))throw invalid(path+"."+key);
            else if(s.get("additionalProperties") instanceof Map<?,?> extra)check(object(extra),entry.getValue(),path+"."+key);
        }
    }
    private static void bounds(Map<String,Object> s,int value,String min,String max,String path) {if(s.containsKey(min)&&value<((Number)s.get(min)).intValue()||s.containsKey(max)&&value>((Number)s.get(max)).intValue())throw invalid(path);}
}
