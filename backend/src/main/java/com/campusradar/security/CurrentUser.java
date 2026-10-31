package com.campusradar.security;

import com.campusradar.common.ApiProblem;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** Session contains only UUID and credential generation. Database owns status and role. */
@Component
public class CurrentUser {
    public static final String USER_ID = "campus.userId";
    public static final String AUTH_VERSION = "campus.authVersion";
    public static final String REAUTH_UNTIL = "campus.reauthUntil";
    private final JdbcTemplate db;
    public CurrentUser(JdbcTemplate db) { this.db = db; }
    public String role(HttpServletRequest request) { return principal(request)[1]; }
    public String requireId(HttpServletRequest request) { return principal(request)[0]; }
    public String requireRole(HttpServletRequest request, String role) {
        var principal = principal(request);
        if (!role.equals(principal[1])) throw new ApiProblem(403,"FORBIDDEN","此操作需要相应管理权限。");
        return principal[0];
    }
    private String[] principal(HttpServletRequest request) {
        var session = request.getSession(false);
        if (session == null || !(session.getAttribute(USER_ID) instanceof String id)) throw unauthorized();
        if (System.currentTimeMillis() - session.getCreationTime() >= java.time.Duration.ofDays(7).toMillis()) {
            session.invalidate(); throw unauthorized();
        }
        var rows = db.queryForList("SELECT status,role,auth_version FROM users WHERE id=?",id);
        if (rows.isEmpty() || !"ACTIVE".equals(rows.getFirst().get("status")) ||
                !Integer.valueOf(((Number) rows.getFirst().get("auth_version")).intValue()).equals(session.getAttribute(AUTH_VERSION))) {
            session.invalidate(); throw unauthorized();
        }
        return new String[]{id, rows.getFirst().get("role").toString()};
    }
    private ApiProblem unauthorized() { return new ApiProblem(401,"UNAUTHENTICATED","请登录后继续。"); }
}
