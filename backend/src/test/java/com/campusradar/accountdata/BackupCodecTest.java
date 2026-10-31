package com.campusradar.accountdata;
import com.campusradar.common.ApiProblem;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;
class BackupCodecTest {
    Clock clock=Clock.fixed(Instant.parse("2026-10-28T08:00:00Z"),ZoneOffset.UTC);
    BackupCodec codec=new BackupCodec(JsonMapper.builder().build(),clock,Base64.getEncoder().encodeToString(new byte[32]),"","test-environment");
    String user="11111111-1111-4111-8111-111111111111";
    @Test void signatureAndOwnerBindTheEntireArchive(){byte[] archive=codec.encode(user,Map.of("profile",Map.of(),"tables",Map.of()),List.of(),Map.of(),false);assertEquals(user,codec.decode(user,archive).manifest().get("userId"));assertThrows(ApiProblem.class,()->codec.decode("22222222-2222-4222-8222-222222222222",archive));archive[archive.length/2]^=1;assertThrows(ApiProblem.class,()->codec.decode(user,archive));}
    @Test void expiryAndEnvironmentCannotBeReused(){byte[] archive=codec.encode(user,Map.of("profile",Map.of(),"tables",Map.of()),List.of(),Map.of(),false);var expired=new BackupCodec(JsonMapper.builder().build(),Clock.offset(clock,Duration.ofDays(8)),Base64.getEncoder().encodeToString(new byte[32]),"","test-environment");assertThrows(ApiProblem.class,()->expired.decode(user,archive));var other=new BackupCodec(JsonMapper.builder().build(),clock,Base64.getEncoder().encodeToString(new byte[32]),"","other-environment");assertThrows(ApiProblem.class,()->other.decode(user,archive));}
    @Test void advancingClockStillProducesAValidSevenDayArchive(){
        var advancing=new Clock(){private long calls;public ZoneId getZone(){return ZoneOffset.UTC;}public Clock withZone(ZoneId zone){return this;}public Instant instant(){return Instant.parse("2026-10-28T08:00:00Z").plusNanos(calls++);}};
        var live=new BackupCodec(JsonMapper.builder().build(),advancing,Base64.getEncoder().encodeToString(new byte[32]),"","test-environment");
        byte[] archive=live.encode(user,Map.of("profile",Map.of(),"tables",Map.of()),List.of(),Map.of(),false);
        var manifest=assertDoesNotThrow(()->live.decode(user,archive)).manifest();
        assertEquals(Duration.ofDays(7),Duration.between(Instant.parse(manifest.get("createdAt").toString()),Instant.parse(manifest.get("expiresAt").toString())));
    }
}
