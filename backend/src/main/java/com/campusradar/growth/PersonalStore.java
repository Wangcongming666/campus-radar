package com.campusradar.growth;

import com.campusradar.common.ApiProblem;
import com.campusradar.common.OwnerTransactions;
import com.campusradar.common.SqlRows;
import org.springframework.stereotype.Component;
import org.springframework.jdbc.core.namedparam.*;
import org.springframework.transaction.PlatformTransactionManager;
import tools.jackson.databind.json.JsonMapper;
import java.sql.*;
import java.time.*;
import java.util.*;
import java.util.function.Supplier;

/** SQL access is limited to these personal entities; every external write runs under the owner lock. */
@Component
public class PersonalStore {
    public final NamedParameterJdbcTemplate db;
    public final JsonMapper json;
    private final OwnerTransactions owners;
    private static final Set<String> TABLES=Set.of("plan_tasks","offers","calendar_events","interview_rounds","interview_reviews","salary_reports","offer_comparisons","applications");
    private static final Set<String> JSON=Set.of("scores","offer_ids","weights");
    public PersonalStore(NamedParameterJdbcTemplate db,JsonMapper json,PlatformTransactionManager manager){this.db=db;this.json=json;this.owners=new OwnerTransactions(new SqlRows(db,json),manager);}
    public static Map<String,Object> map(Object... pairs){var m=new LinkedHashMap<String,Object>();for(int i=0;i<pairs.length;i+=2)m.put(pairs[i].toString(),pairs[i+1]);return m;}
    public static String snake(String s){return s.replaceAll("([a-z])([A-Z])","$1_$2").toLowerCase(Locale.ROOT);}
    public static String camel(String s){StringBuilder b=new StringBuilder();boolean upper=false;for(char c:s.toLowerCase(Locale.ROOT).toCharArray()){if(c=='_'){upper=true;continue;}b.append(upper?Character.toUpperCase(c):c);upper=false;}return b.toString();}
    private String table(String t){if(!TABLES.contains(t))throw new IllegalArgumentException("Unknown personal table");return t;}
    private String owner(String table){return table.equals("salary_reports")?"author_id":"user_id";}
    public static ApiProblem missing(){return new ApiProblem(404,"NOT_FOUND","记录不存在或不可访问。");}
    public static void version(Map<String,Object> row,Object expected){if(!(expected instanceof Number n)||!Double.isFinite(n.doubleValue())||n.doubleValue()!=Math.rint(n.doubleValue())||n.doubleValue()<1||n.doubleValue()>Integer.MAX_VALUE)throw new ApiProblem(422,"VALIDATION_ERROR","版本须为1至2147483647的整数。");if(((Number)expected).intValue()!=((Number)row.get("version")).intValue())throw new ApiProblem(409,"VERSION_CONFLICT","记录已更新，请刷新后重试。");}
    public Object parse(Object value){if(value==null)return null;Object parsed=json.readValue(value.toString(),Object.class);return parsed instanceof String s?json.readValue(s,Object.class):parsed;}
    public List<Map<String,Object>> query(String sql,Map<String,?> params){return db.query(sql,params,(r,n)->{var result=new LinkedHashMap<String,Object>();var meta=r.getMetaData();for(int c=1;c<=meta.getColumnCount();c++){String key=meta.getColumnLabel(c).toLowerCase(Locale.ROOT);if(Set.of("user_id","author_id","generation_key").contains(key))continue;Object v=r.getObject(c);if(v instanceof Timestamp t)v=t.toInstant().toString();else if(v instanceof LocalDateTime d)v=d.toInstant(ZoneOffset.UTC).toString();else if(v instanceof java.sql.Date d)v=d.toLocalDate().toString();if(JSON.contains(key))v=parse(r.getString(c));result.put(camel(key),v);}return result;});}
    public Map<String,Object> one(String table,String user,String id){var rows=query("SELECT * FROM "+table(table)+" WHERE "+owner(table)+"=:u AND id=:id",map("u",user,"id",id));if(rows.isEmpty())throw missing();return rows.getFirst();}
    public List<Map<String,Object>> all(String table,String user,int page,int size){page(page,size);return query("SELECT * FROM "+table(table)+" WHERE "+owner(table)+"=:u ORDER BY created_at DESC,id LIMIT :limit OFFSET :offset",map("u",user,"limit",size,"offset",(page-1)*size));}
    public long count(String table,String user){return db.queryForObject("SELECT COUNT(*) FROM "+table(table)+" WHERE "+owner(table)+"=:u",map("u",user),Long.class);}
    public static void page(int page,int size){if(page<1||page>500||size<1||size>100)throw new ApiProblem(422,"VALIDATION_ERROR","分页参数无效。");}
    private Object sqlValue(String key,Object value){if(value==null)return null;if(JSON.contains(key))return json.writeValueAsString(value);if(key.endsWith("_at")&&value instanceof String s)return Timestamp.from(OffsetDateTime.parse(s).toInstant());return value;}
    public Map<String,Object> insert(String table,String user,Map<String,Object> body){table(table);var p=new MapSqlParameterSource("id",UUID.randomUUID().toString()).addValue("u",user);var cols=new StringBuilder("id,"+owner(table));var vals=new StringBuilder(":id,:u");int i=0;for(var e:body.entrySet()){String k=snake(e.getKey());if(Set.of("version","id","created_at","updated_at","user_id","author_id").contains(k))continue;cols.append(',').append(k);String param="v"+i++;vals.append(",:").append(param);p.addValue(param,sqlValue(k,e.getValue()));}db.update("INSERT INTO "+table+" ("+cols+") VALUES ("+vals+")",p);return one(table,user,p.getValue("id").toString());}
    public Map<String,Object> patch(String table,String user,String id,Map<String,Object> body){var old=one(table,user,id);version(old,body.get("version"));var p=new MapSqlParameterSource("id",id).addValue("u",user).addValue("version",body.get("version"));var sets=new StringBuilder("version=version+1,updated_at=CURRENT_TIMESTAMP");int i=0;for(var e:body.entrySet()){String k=snake(e.getKey());if(k.equals("version"))continue;if(!old.containsKey(e.getKey())||Set.of("id","createdAt","updatedAt").contains(e.getKey()))throw new ApiProblem(422,"VALIDATION_ERROR","不可修改此字段。");String param="v"+i++;sets.append(',').append(k).append("=:").append(param);p.addValue(param,sqlValue(k,e.getValue()));}if(db.update("UPDATE "+table(table)+" SET "+sets+" WHERE id=:id AND "+owner(table)+"=:u AND version=:version",p)!=1)throw new ApiProblem(409,"VERSION_CONFLICT","记录已更新。");return one(table,user,id);}
    public void delete(String table,String user,String id,int expected){version(one(table,user,id),expected);db.update("DELETE FROM "+table(table)+" WHERE id=:id AND "+owner(table)+"=:u",map("id",id,"u",user));}
    public Object write(String user,String key,String path,Map<String,Object> body,int status,Supplier<Object> action){
        return owners.write(user,"POST",path,key,body,status,true,action);
    }
    public static void timeRange(Map<String,Object> body,boolean nullable){Object start=body.get("startsAt"),end=body.get("endsAt");try{ZoneId.of(body.get("timezone").toString());}catch(Exception e){throw new ApiProblem(422,"VALIDATION_ERROR","时区无效。");}if(nullable&&start==null&&end==null)return;if(!(start instanceof String)||!(end instanceof String)||!Instant.parse(end.toString()).isAfter(Instant.parse(start.toString())))throw new ApiProblem(422,"VALIDATION_ERROR","结束时间必须晚于开始时间。");try{ZoneId.of(body.get("timezone").toString());}catch(Exception e){throw new ApiProblem(422,"VALIDATION_ERROR","时区无效。");}}
    public static LocalDate[] dates(String from,String to){try{var a=LocalDate.parse(from);var b=LocalDate.parse(to);if(b.isBefore(a)||java.time.temporal.ChronoUnit.DAYS.between(a,b)>365)throw new IllegalArgumentException();return new LocalDate[]{a,b};}catch(Exception e){throw new ApiProblem(422,"VALIDATION_ERROR","日期范围最多366天。");}}
}
