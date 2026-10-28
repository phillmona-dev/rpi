package et.gov.tigray.rpis.damage;

import com.fasterxml.jackson.databind.ObjectMapper;
import et.gov.tigray.rpis.security.CurrentUser;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.Types;
import java.util.*;

/** Shared plumbing of the assessment workflow: activity log, notices, and mapping between logins and field agents. */
@Component
@RequiredArgsConstructor
class AssessmentSupport {
    private final NamedParameterJdbcTemplate jdbc;
    private final ApplicationEventPublisher events;
    private final ObjectMapper json;

    void log(Long campaignId, Long taskId, Long assessmentId, String kind, String note, Map<String, Object> data) {
        CurrentUser u = CurrentUser.get().orElse(null);
        String payload;
        try { payload = data == null || data.isEmpty() ? null : json.writeValueAsString(data); } catch (Exception e) { throw new IllegalStateException(e); }
        jdbc.update("""
            INSERT INTO assessment_event(campaign_id, task_id, assessment_id, kind, actor_user_id, actor_name, note, data)
            VALUES (:c, :t, :a, :k, :uid, :name, :note, CAST(:data AS jsonb))
            """, new MapSqlParameterSource("c", campaignId).addValue("t", taskId, Types.BIGINT).addValue("a", assessmentId, Types.BIGINT).addValue("k", kind)
                .addValue("uid", u == null ? null : u.id(), Types.BIGINT).addValue("name", u == null ? "system" : u.fullName())
                .addValue("note", note, Types.VARCHAR).addValue("data", payload, Types.VARCHAR));
    }

    void notice(Collection<Long> userIds, String type, String severity, String link, Map<String, Object> data) {
        List<Long> to = userIds.stream().filter(Objects::nonNull).distinct().toList();
        if (to.isEmpty()) return;
        CurrentUser u = CurrentUser.get().orElse(null);
        events.publishEvent(new AssessmentNotice(to, u == null ? null : u.id(), u == null ? null : u.fullName(), type, severity, link, data));
    }

    /** Login account of a field agent, if one has been provisioned. */
    Long userOfAgent(Long agentId) {
        if (agentId == null) return null;
        List<Long> ids = jdbc.queryForList("SELECT user_id FROM field_agent WHERE id = :id AND user_id IS NOT NULL", new MapSqlParameterSource("id", agentId), Long.class);
        return ids.isEmpty() ? null : ids.get(0);
    }

    /** Field agent profile of a login account. */
    Long agentOfUser(Long userId) {
        if (userId == null) return null;
        List<Long> ids = jdbc.queryForList("SELECT id FROM field_agent WHERE user_id = :u", new MapSqlParameterSource("u", userId), Long.class);
        return ids.isEmpty() ? null : ids.get(0);
    }

    List<Long> usersWithRole(String role, String sector) {
        return jdbc.queryForList("""
            SELECT u.id FROM app_user u JOIN user_role ur ON ur.user_id = u.id JOIN role r ON r.id = ur.role_id
            WHERE r.code = :role AND u.enabled AND (CAST(:sector AS varchar) IS NULL OR u.sector_scope IS NULL OR u.sector_scope = :sector)
            """, new MapSqlParameterSource("role", role).addValue("sector", sector, Types.VARCHAR), Long.class);
    }

    static Map<String, Object> data(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i + 1 < kv.length; i += 2) if (kv[i + 1] != null) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    static String blankToNull(String s) { return s == null || s.isBlank() ? null : s.trim(); }
}
