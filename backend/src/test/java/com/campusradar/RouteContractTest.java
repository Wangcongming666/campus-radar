package com.campusradar;

import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.core.type.filter.AnnotationTypeFilter;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;

/** Every declared contract operation must have a concrete Spring controller mapping. */
class RouteContractTest {
    @Test void allOpenApiOperationsHaveControllerMappings() throws Exception {
        Set<String> implemented=new TreeSet<>();
        var scan=new ClassPathScanningCandidateComponentProvider(false);
        scan.addIncludeFilter(new AnnotationTypeFilter(RestController.class));
        for(var bean:scan.findCandidateComponents("com.campusradar")) {
            var type=Class.forName(bean.getBeanClassName());
            var base=AnnotatedElementUtils.findMergedAnnotation(type,RequestMapping.class);
            String[] prefixes=base==null?new String[]{""}:paths(base);
            for(var method:type.getDeclaredMethods()) {
                var mapping=AnnotatedElementUtils.findMergedAnnotation(method,RequestMapping.class);
                if(mapping==null)continue;
                for(String prefix:prefixes)for(String suffix:paths(mapping))for(var verb:mapping.method())
                    implemented.add(verb.name()+" "+(prefix+"/"+suffix).replaceAll("/+","/").replaceAll("/$",""));
            }
        }
        try(var input=getClass().getResourceAsStream("/contracts/openapi.json")) {
            var document=JsonMapper.builder().build().readTree(input);
            Set<String> missing=new TreeSet<>();int operations=0;
            for(var path:document.path("paths").properties())for(var operation:path.getValue().properties()) {
                String verb=operation.getKey().toUpperCase(Locale.ROOT);
                if(!Set.of("GET","POST","PUT","PATCH","DELETE","HEAD","OPTIONS").contains(verb))continue;
                operations++;String expected=verb+" "+path.getKey();
                boolean present=implemented.stream().filter(route->route.startsWith(verb+" "))
                    .anyMatch(route->org.springframework.web.util.pattern.PathPatternParser.defaultInstance.parse(route.substring(verb.length()+1))
                        .matches(org.springframework.http.server.PathContainer.parsePath(path.getKey())));
                if(!present)missing.add(expected);
            }
            assertTrue(operations>=166,"Contract unexpectedly lost operations");
            assertEquals(Set.of(),missing,"Missing controller operations");
        }
    }
    static String[] paths(RequestMapping mapping) {
        if(mapping.path().length>0)return mapping.path();
        return mapping.value().length>0?mapping.value():new String[]{""};
    }
}
