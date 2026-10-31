package com.campusradar.submission;

import com.campusradar.common.SqlRows;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.yaml.snakeyaml.Yaml;
import tools.jackson.databind.json.JsonMapper;
import java.nio.file.*;
import java.sql.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

/** Explicitly opt in against the local MySQL; all queries are read-only and use no user content. */
@EnabledIfEnvironmentVariable(named="CAMPUS_SUBMISSION_MYSQL",matches="true")
class SubmissionMySqlTest {
    private static final String OWNER="00000000-0000-0000-0000-000000000000";
    private static final List<String> KINDS=List.of("POST","EXPERIENCE","SALARY","REFERRAL","POST_COMMENT","EXPERIENCE_COMMENT");
    private Connection connection;
    private SqlRows sql;

    @BeforeEach void connectReadOnly() throws Exception {
        Map<?,?> configuration=new Yaml().load(Files.readString(Path.of("src/main/resources/application-dev.yml")));
        var datasource=(Map<?,?>)((Map<?,?>)configuration.get("spring")).get("datasource");
        connection=DriverManager.getConnection(datasource.get("url").toString(),datasource.get("username").toString(),datasource.get("password").toString());
        connection.setReadOnly(true);
        assertTrue(connection.isReadOnly());
        assertEquals("MySQL",connection.getMetaData().getDatabaseProductName());
        sql=new SqlRows(new NamedParameterJdbcTemplate(new SingleConnectionDataSource(connection,true)),JsonMapper.builder().build());
        assertEquals(0L,sql.db.queryForObject("SELECT COUNT(*) FROM users WHERE id=:owner",Map.of("owner",OWNER),Long.class));
    }
    @AfterEach void disconnect() throws Exception {if(connection!=null)connection.close();}

    @Test void actualServiceCompilesEveryKindStatusAndPageWithAccurateEmptyTotals() {
        var service=new SubmissionService(sql);
        for(String kind:Arrays.asList(null,"POST","EXPERIENCE","SALARY","REFERRAL","POST_COMMENT","EXPERIENCE_COMMENT"))
            for(String status:Arrays.asList(null,"DRAFT","PENDING","PUBLISHED","REJECTED","HIDDEN"))
                for(int page:List.of(1,2,500)) {
                    var result=service.list(OWNER,kind,status,page,page==500?100:1);
                    assertEquals(0,result.total());assertTrue(result.data().isEmpty());
                }
    }

    @Test void realMySqlUnionsAsciiIdentifiersWithUnicodeLiteralsWithoutLosingText() throws Exception {
        // Literal-only derived rows reproduce schema coercibility without reading or writing business rows.
        var projection=SubmissionService.class.getDeclaredMethod("projection",String.class,String.class,String.class,String.class,String.class);
        projection.setAccessible(true);
        String text="社区🧭".repeat(120);
        var sources=new ArrayList<String>();
        for(String kind:KINDS) {
            String path=kind.equals("REFERRAL")?"'/referral'":kind.equals("SALARY")?"NULL":"CONCAT('/community#post-',f.id)";
            sources.add(projection.invoke(null,"f",kind,"'中文标题🧭'","'"+text+"'",path)+" FROM (SELECT CAST('00000000-0000-0000-0000-000000000001' AS CHAR CHARACTER SET ascii) COLLATE ascii_bin id,CAST('PUBLISHED' AS CHAR CHARACTER SET ascii) COLLATE ascii_bin status,1 version,CURRENT_TIMESTAMP created_at,CURRENT_TIMESTAMP updated_at) f");
        }
        var rows=sql.query(String.join(" UNION ALL ",sources),Map.of());
        assertEquals(6,rows.size());
        for(var row:rows) {
            assertEquals("00000000-0000-0000-0000-000000000001",row.get("id"));
            assertEquals("中文标题🧭",row.get("title"));assertEquals(text,row.get("summary"));
            assertEquals("PUBLISHED",row.get("status"));
            assertTrue(KINDS.contains(row.get("kind")));
            if(row.get("kind").equals("SALARY"))assertNull(row.get("publicPath"));
            else assertEquals(row.get("kind").equals("REFERRAL")?"/referral":"/community#post-00000000-0000-0000-0000-000000000001",row.get("publicPath"));
        }
    }
}
