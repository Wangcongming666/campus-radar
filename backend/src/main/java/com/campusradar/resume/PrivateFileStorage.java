package com.campusradar.resume;

import com.campusradar.common.ApiProblem;
import java.io.IOException;
import java.nio.file.*;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.ArrayList;
import java.util.List;
import java.time.Instant;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class PrivateFileStorage {
    private final Path root;
    public PrivateFileStorage(@Value("${campus.file-storage-root:../.data/private-files}") String root){this.root=Path.of(root).toAbsolutePath().normalize();}
    public Path stage(byte[] bytes){try{Files.createDirectories(root);try{Files.setPosixFilePermissions(root,PosixFilePermissions.fromString("rwx------"));}catch(UnsupportedOperationException ignored){}Path file=Files.createTempFile(root,"upload-",".tmp");Files.write(file,bytes);return file;}catch(IOException e){throw unavailable();}}
    public void move(Path stage,String key){try{Path target=path(key);Files.createDirectories(target.getParent());Files.move(stage,target,StandardCopyOption.ATOMIC_MOVE);}catch(IOException e){throw unavailable();}}
    public byte[] read(String key,long length,String expectedHash){try{Path file=path(key);if(!Files.isRegularFile(file,LinkOption.NOFOLLOW_LINKS)||Files.size(file)!=length)throw unavailable();byte[] bytes=Files.readAllBytes(file);if(!hash(bytes).equals(expectedHash))throw unavailable();return bytes;}catch(IOException e){throw unavailable();}}
    public void remove(String key){try{Files.deleteIfExists(path(key));}catch(IOException e){throw unavailable();}}
    public void discard(Path staged){try{Files.deleteIfExists(staged);}catch(IOException ignored){}}
    public record StaleObject(Path path,String storageKey) {}
    /** Bounded inventory; never follow a symbolic link or inspect outside the configured private root. */
    public List<StaleObject> staleObjects(Instant before,int limit){
        var found=new ArrayList<StaleObject>();if(!Files.isDirectory(root,LinkOption.NOFOLLOW_LINKS))return found;
        int scanned=0;try(var entries=Files.newDirectoryStream(root)){for(Path entry:entries){if(found.size()>=limit||++scanned>1000)break;String name=entry.getFileName().toString();
            if(name.matches("upload-[a-zA-Z0-9-]+\\.tmp")&&oldRegular(entry,before))found.add(new StaleObject(entry,null));
            else if(name.matches("[0-9a-fA-F-]{36}")&&Files.isDirectory(entry,LinkOption.NOFOLLOW_LINKS))try(var children=Files.newDirectoryStream(entry)){for(Path file:children){if(found.size()>=limit||++scanned>1000)break;String leaf=file.getFileName().toString();if(leaf.matches("[0-9a-fA-F-]{36}\\.bin")&&oldRegular(file,before))found.add(new StaleObject(file,name+"/"+leaf));}}
        }}catch(IOException e){throw unavailable();}return found;
    }
    private boolean oldRegular(Path file,Instant before){try{return Files.isRegularFile(file,LinkOption.NOFOLLOW_LINKS)&&Files.getLastModifiedTime(file,LinkOption.NOFOLLOW_LINKS).toInstant().isBefore(before);}catch(IOException e){return false;}}
    public void reap(StaleObject object,Instant before){Path file=object.path().toAbsolutePath().normalize();if(!file.startsWith(root)||!Files.isDirectory(root,LinkOption.NOFOLLOW_LINKS)||!Files.isDirectory(file.getParent(),LinkOption.NOFOLLOW_LINKS)||!oldRegular(file,before))return;Path expected=object.storageKey()==null?root.resolve(file.getFileName()):path(object.storageKey());if(!file.equals(expected))return;try{Files.deleteIfExists(file);}catch(IOException e){throw unavailable();}}
    private Path path(String key){if(key==null||!key.matches("[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}\\.bin"))throw unavailable();Path target=root.resolve(key).normalize();if(!target.startsWith(root))throw unavailable();return target;}
    public static String hash(byte[] bytes){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));}catch(java.security.NoSuchAlgorithmException e){throw new IllegalStateException(e);}}
    private static ApiProblem unavailable(){return new ApiProblem(503,"DEPENDENCY_UNAVAILABLE","私有文件暂时不可用，请稍后重试。");}
}
