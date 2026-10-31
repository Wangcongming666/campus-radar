package com.campusradar.growth;

import java.math.BigDecimal;
import java.util.*;

public final class PersonalRules {
    private PersonalRules() {}
    public static Long annual(Number base,Number months,Number bonus) {
        if(base==null||months==null||bonus==null)return null;
        return new BigDecimal(base.toString()).multiply(new BigDecimal(months.toString())).add(new BigDecimal(bonus.toString())).longValue();
    }
    public static Map<String,Object> score(List<? extends Map<String,?>> weights,List<? extends Map<String,?>> scores) {
        double known=0,sum=0,total=0;
        for(var w:weights){double weight=((Number)w.get("weight")).doubleValue();total+=weight;for(var s:scores)if(Objects.equals(w.get("dimension"),s.get("dimension"))&&s.get("score") instanceof Number n){known+=weight;sum+=weight*n.doubleValue();break;}}
        var result=new LinkedHashMap<String,Object>();result.put("score",known==0?null:sum/known);result.put("coverage",total==0?0d:known/total);return result;
    }
    public static String icsText(String text) {return text==null?"":text.replace("\\","\\\\").replace("\r\n","\n").replace("\r","\n").replace("\n","\\n").replace(",","\\,").replace(";","\\;");}
}
