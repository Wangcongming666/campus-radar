package com.campusradar.common;

import java.sql.*;
import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

@Component
public class SqlRows {
    public final NamedParameterJdbcTemplate db;
    public final JsonMapper json;
    public SqlRows(NamedParameterJdbcTemplate db,JsonMapper json) {this.db=db;this.json=json;}
    public static Map<String,Object> map(Object... pairs) {var m=new LinkedHashMap<String,Object>();for(int i=0;i<pairs.length;i+=2)m.put(pairs[i].toString(),pairs[i+1]);return m;}
    public static String camel(String s){var b=new StringBuilder();boolean upper=false;for(char c:s.toLowerCase(Locale.ROOT).toCharArray()){if(c=='_'){upper=true;continue;}b.append(upper?Character.toUpperCase(c):c);upper=false;}return b.toString();}
    public static String snake(String s){return s.replaceAll("([a-z])([A-Z])","$1_$2").toLowerCase(Locale.ROOT);}
    public Object parse(String text){if(text==null)return null;Object result=json.readValue(text,Object.class);return result instanceof String nested?json.readValue(nested,Object.class):result;}
    public List<Map<String,Object>> query(String sql,Map<String,?> params,Set<String> jsonFields,Set<String> booleans) {
        return db.query(sql,params,(r,n)->{var row=new LinkedHashMap<String,Object>();var meta=r.getMetaData();for(int c=1;c<=meta.getColumnCount();c++){String field=meta.getColumnLabel(c).toLowerCase(Locale.ROOT);Object value=r.getObject(c);if(jsonFields.contains(field))value=parse(r.getString(c));else if(booleans.contains(field))value=r.getBoolean(c);else if(value instanceof Timestamp t)value=t.toInstant().toString();else if(value instanceof LocalDateTime d)value=d.toInstant(ZoneOffset.UTC).toString();else if(value instanceof java.sql.Date d)value=d.toLocalDate().toString();row.put(camel(field),value);}return row;});
    }
    public List<Map<String,Object>> query(String sql,Map<String,?> params) {return query(sql,params,Set.of(),Set.of());}
    public Map<String,Object> one(String sql,Map<String,?> params,Set<String> jsonFields,Set<String> booleans){var rows=query(sql,params,jsonFields,booleans);if(rows.isEmpty())throw new ApiProblem(404,"NOT_FOUND","记录不存在或不可访问。");return rows.getFirst();}
    public Object value(String field,Object v,Set<String> jsonFields){if(v==null)return null;if(jsonFields.contains(field))return json.writeValueAsString(v);if(field.endsWith("_at")&&v instanceof String s)return Timestamp.from(OffsetDateTime.parse(s).toInstant());return v;}
}
