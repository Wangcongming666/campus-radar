package com.campusradar.accountdata;

import com.campusradar.common.ApiProblem;
import com.campusradar.resume.PrivateFileStorage;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.*;
import java.util.*;
import java.util.zip.*;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

/** A signed, account-scoped archive. JSON here is the backup format, never the live business store. */
@Component
public class BackupCodec {
    public static final int MAX_ARCHIVE=100*1024*1024, MAX_EXPANDED=120*1024*1024;
    private final JsonMapper json;private final Clock clock;private final String key,mailKey,environment;
    public BackupCodec(JsonMapper json,Clock clock,@Value("${campus.backup-key:}")String key,@Value("${campus.mail-key:}")String mailKey,@Value("${campus.backup-environment:local-campus-radar}")String environment){this.json=json;this.clock=clock;this.key=key;this.mailKey=mailKey;this.environment=environment;}
    private byte[] secret(){try{String configured=key.isBlank()?mailKey:key;byte[] raw=Base64.getDecoder().decode(configured);if(raw.length<32)throw new IllegalArgumentException();var hash=MessageDigest.getInstance("SHA-256");hash.update("campus-account-backup-v1".getBytes(StandardCharsets.UTF_8));return hash.digest(raw);}catch(Exception e){throw new ApiProblem(503,"BACKUP_UNAVAILABLE","备份签名密钥未配置，请联系管理员。");}}
    public void ensureConfigured(){secret();}
    private byte[] mac(byte[] bytes){try{var mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(secret(),"HmacSHA256"));return mac.doFinal(bytes);}catch(GeneralSecurityException e){throw new IllegalStateException(e);}}
    public record Archive(Map<String,Object> manifest,Map<String,Object> data,Map<String,byte[]> files){}
    public byte[] encode(String owner,Map<String,Object> data,List<Map<String,Object>> files,Map<String,byte[]> originals,boolean includeFiles){ensureConfigured();if(files.size()>4997)throw invalid("备份文件数量超限。");long originalSize=includeFiles?originals.values().stream().mapToLong(b->b.length).sum():0;if(originalSize>MAX_EXPANDED-11L*1024*1024)throw invalid("备份原件总容量超限。");byte[] privateJson=json.writeValueAsBytes(data);if(privateJson.length>10*1024*1024)throw invalid("私人数据超过单份备份容量。");var manifest=new LinkedHashMap<String,Object>();manifest.put("schemaVersion",1);manifest.put("userId",owner);manifest.put("environment",environment);Instant created=clock.instant();manifest.put("createdAt",created.toString());manifest.put("expiresAt",created.plus(Duration.ofDays(7)).toString());manifest.put("includeFiles",includeFiles);manifest.put("privateSha256",PrivateFileStorage.hash(privateJson));manifest.put("files",files);byte[] signed=json.writeValueAsBytes(manifest);if(signed.length>1024*1024)throw invalid("备份文件清单容量超限。");
        try(var out=new ByteArrayOutputStream();var zip=new ZipOutputStream(out,StandardCharsets.UTF_8)){put(zip,"manifest.json",signed);put(zip,"manifest.sig",HexFormat.of().formatHex(mac(signed)).getBytes(StandardCharsets.US_ASCII));put(zip,"private.json",privateJson);for(var file:files){String id=file.get("id").toString();if(includeFiles){byte[] bytes=originals.get(id);if(bytes==null||!PrivateFileStorage.hash(bytes).equals(file.get("sha256")))throw invalid("备份原件校验失败。");put(zip,"files/"+id+".bin",bytes);}if(out.size()>MAX_ARCHIVE)throw invalid("含附件的备份超过 100 MB，请缩小附件或使用不含原件的导出。");}zip.finish();if(out.size()>MAX_ARCHIVE)throw invalid("备份超过 100 MB。");return out.toByteArray();}catch(IOException e){throw new ApiProblem(503,"BACKUP_UNAVAILABLE","无法生成备份。");}
    }
    private static void put(ZipOutputStream zip,String name,byte[] bytes)throws IOException{zip.putNextEntry(new ZipEntry(name));zip.write(bytes);zip.closeEntry();}
    @SuppressWarnings("unchecked") public Archive decode(String owner,byte[] archive){ensureConfigured();if(archive.length>MAX_ARCHIVE)throw invalid("备份超过 100 MB。");try{var entries=new HashMap<String,byte[]>();int expanded=0;try(var zip=new ZipInputStream(new ByteArrayInputStream(archive),StandardCharsets.UTF_8)){ZipEntry entry;while((entry=zip.getNextEntry())!=null){String name=entry.getName();if(entry.isDirectory()||!(Set.of("manifest.json","manifest.sig","private.json").contains(name)||name.matches("files/[0-9a-fA-F-]{36}\\.bin"))||entries.containsKey(name)||entries.size()>5000)throw invalid("备份包含无效文件路径或重复条目。");int limit=name.equals("manifest.json")?1024*1024:name.equals("manifest.sig")?128:name.equals("private.json")?10*1024*1024:MAX_ARCHIVE;byte[] bytes=zip.readNBytes(limit+1);expanded+=bytes.length;if(bytes.length>limit||expanded>MAX_EXPANDED)throw invalid("备份展开容量超限。");entries.put(name,bytes);}}
            byte[] manifestBytes=entries.get("manifest.json"),signature=entries.get("manifest.sig"),dataBytes=entries.get("private.json");if(manifestBytes==null||signature==null||dataBytes==null||!MessageDigest.isEqual(mac(manifestBytes),HexFormat.of().parseHex(new String(signature,StandardCharsets.US_ASCII))))throw invalid("备份签名无效。");
            Map<String,Object> manifest=json.readValue(manifestBytes,Map.class);if(!manifest.keySet().equals(Set.of("schemaVersion","userId","environment","createdAt","expiresAt","includeFiles","privateSha256","files"))||!(manifest.get("includeFiles") instanceof Boolean))throw invalid("备份清单字段无效。");if(!Integer.valueOf(1).equals(manifest.get("schemaVersion"))||!owner.equals(manifest.get("userId"))||!environment.equals(manifest.get("environment")))throw invalid("备份须来自同一账号、同一环境及受支持的版本。");Instant created=Instant.parse(manifest.get("createdAt").toString()),expires=Instant.parse(manifest.get("expiresAt").toString());if(created.isAfter(clock.instant().plusSeconds(60))||!expires.isAfter(clock.instant())||!expires.isAfter(created)||expires.isAfter(created.plus(Duration.ofDays(7))))throw invalid("备份已过期或时间无效。");if(!PrivateFileStorage.hash(dataBytes).equals(manifest.get("privateSha256")))throw invalid("备份私人数据哈希不一致。");
            boolean included=Boolean.TRUE.equals(manifest.get("includeFiles"));var originals=new HashMap<String,byte[]>();var ids=new HashSet<String>();for(Object raw:(List<?>)manifest.get("files")){var file=(Map<String,Object>)raw;String id=file.get("id").toString();UUID.fromString(id);if(!ids.add(id))throw invalid("备份文件标识重复。");if(included){byte[] bytes=entries.remove("files/"+id+".bin");if(bytes==null||bytes.length!=((Number)file.get("sizeBytes")).longValue()||!PrivateFileStorage.hash(bytes).equals(file.get("sha256")))throw invalid("备份原件缺失或校验失败。");originals.put(id,bytes);}}
            entries.keySet().removeAll(Set.of("manifest.json","manifest.sig","private.json"));if(!entries.isEmpty())throw invalid("备份包含清单之外的原件。");return new Archive(manifest,json.readValue(dataBytes,Map.class),originals);
        }catch(ApiProblem e){throw e;}catch(Exception e){throw invalid("备份格式、签名或内容无效。");}}
    private static ApiProblem invalid(String message){return new ApiProblem(422,"BACKUP_INVALID",message);}
}
