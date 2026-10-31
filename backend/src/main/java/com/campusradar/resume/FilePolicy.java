package com.campusradar.resume;

import com.campusradar.common.ApiProblem;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.*;

public final class FilePolicy {
    private FilePolicy() {}
    public static long limit(String purpose) {return switch(purpose){case "RESUME"->10L*1024*1024;case "RECORDING"->30L*1024*1024;case "AVATAR"->2L*1024*1024;case "BACKUP"->100L*1024*1024;default->throw new ApiProblem(422,"VALIDATION_ERROR","文件用途无效。");};}
    public static String validate(String purpose,String name,String mime,byte[] bytes) {
        if(name==null||name.isBlank()||name.length()>255||name.contains("/")||name.contains("\\")||name.equals(".")||name.equals("..")||name.chars().anyMatch(c->c<32||c==127))throw new ApiProblem(422,"VALIDATION_ERROR","文件名不能包含路径或控制字符。");
        if(bytes.length==0)throw new ApiProblem(422,"VALIDATION_ERROR","不能上传空文件。");
        if(bytes.length>limit(purpose))throw new ApiProblem(413,"PAYLOAD_TOO_LARGE","文件超过该用途的大小限制。");
        String lower=name.toLowerCase(Locale.ROOT);int dot=lower.lastIndexOf('.');String extension=dot<0?"":lower.substring(dot+1);
        String expected=switch(extension){case "pdf"->"application/pdf";case "txt"->"text/plain";case "md"->"text/markdown";case "mp3"->"audio/mpeg";case "wav"->"audio/wav";case "m4a"->"audio/mp4";case "webm"->"audio/webm";case "png"->"image/png";case "jpg","jpeg"->"image/jpeg";case "webp"->"image/webp";case "zip"->"application/zip";default->throw unsupported();};
        Set<String> extensions=switch(purpose){case "RESUME"->Set.of("pdf","txt","md");case "RECORDING"->Set.of("mp3","wav","m4a","webm");case "AVATAR"->Set.of("png","jpg","jpeg","webp");case "BACKUP"->Set.of("zip");default->throw unsupported();};
        if(!extensions.contains(extension))throw unsupported();
        String claimed=mime==null?"":mime.split(";",2)[0].trim().toLowerCase(Locale.ROOT);
        Set<String> aliases=switch(extension){case "md"->Set.of("text/markdown","text/plain");case "wav"->Set.of("audio/wav","audio/x-wav","audio/wave");case "m4a"->Set.of("audio/mp4","audio/x-m4a");case "zip"->Set.of("application/zip","application/x-zip-compressed");default->Set.of(expected);};
        if(!claimed.isEmpty()&&!claimed.equals("application/octet-stream")&&!aliases.contains(claimed))throw unsupported();
        boolean valid=switch(extension){
            case "pdf"->starts(bytes,new byte[]{'%','P','D','F','-'});
            case "png"->starts(bytes,new byte[]{(byte)137,80,78,71,13,10,26,10});
            case "jpg","jpeg"->bytes.length>=3&&(bytes[0]&255)==255&&(bytes[1]&255)==216&&(bytes[2]&255)==255;
            case "webp"->ascii(bytes,0,"RIFF")&&ascii(bytes,8,"WEBP");
            case "wav"->ascii(bytes,0,"RIFF")&&ascii(bytes,8,"WAVE");
            case "mp3"->ascii(bytes,0,"ID3")||bytes.length>=2&&(bytes[0]&255)==255&&(bytes[1]&224)==224;
            case "m4a"->ascii(bytes,4,"ftyp")&&bytes.length>=12;
            case "webm"->starts(bytes,new byte[]{0x1a,0x45,(byte)0xdf,(byte)0xa3});
            case "zip"->starts(bytes,new byte[]{80,75,3,4})||starts(bytes,new byte[]{80,75,5,6});
            case "txt","md"->isText(bytes);
            default->false;
        };
        if(!valid)throw unsupported();return expected;
    }
    private static boolean isText(byte[] bytes){try{String text=StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();return text.chars().noneMatch(c->c==0||c<9||c>13&&c<32);}catch(CharacterCodingException e){return false;}}
    private static boolean starts(byte[] bytes,byte[] head){if(bytes.length<head.length)return false;for(int i=0;i<head.length;i++)if(bytes[i]!=head[i])return false;return true;}
    private static boolean ascii(byte[] bytes,int offset,String text){return bytes.length>=offset+text.length()&&new String(bytes,offset,text.length(),StandardCharsets.US_ASCII).equals(text);}
    private static ApiProblem unsupported(){return new ApiProblem(415,"UNSUPPORTED_MEDIA_TYPE","文件扩展名、MIME或文件头不匹配，或不支持此用途。");}
}
