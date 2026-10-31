package com.campusradar.task;
import java.util.Map;
public interface TaskHandler {
    boolean supports(String type);
    /** Return the private result file ID, if any. taskId/leaseToken are reserved payload keys. */
    String execute(String type,String user,Map<String,Object> payload);
    default void onTerminalFailure(String type,String user,Map<String,Object> payload) {}
}
