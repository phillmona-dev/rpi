package et.gov.tigray.rpis.notification;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import et.gov.tigray.rpis.common.BusinessException;
import et.gov.tigray.rpis.damage.AssessmentNotice;
import et.gov.tigray.rpis.messaging.ChatRealtime;
import et.gov.tigray.rpis.realtime.DomainEvent;
import et.gov.tigray.rpis.security.CurrentUser;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.time.Instant;
import java.util.*;

/**
 * Personal notifications. Listens to domain events and tells the people who need to act or know:
 * executives when a project awaits their decision, the submitter when it is decided, the owner of an
 * assigned alert, executives and sector heads when a critical alert fires, field staff on a new
 * assignment, inspectors when their inspection is reviewed, and anyone mentioned in a discussion.
 * Rows store a type and parameters; the client renders the text in the reader's language.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class NotificationService {
    private final NamedParameterJdbcTemplate jdbc;
    private final ApplicationEventPublisher events;
    private final ObjectMapper json;

    public record Notification(Long id, String type, String severity, String link, String actorName, Map<String, Object> data, Instant createdAt, Instant readAt) {}
    public record Page(List<Notification> items, boolean hasMore, long unread) {}
    public record Unread(long unread) {}
    /** Live frame on /user/queue/notifications. */
    public record Frame(String type, Notification notification, Long unread) {}

    // ── queries and state ────────────────────────────────────────────────
    @Transactional(readOnly = true)
    public Page list(boolean unreadOnly, Long before, int limit) {
        Long me = me();
        int n = Math.min(Math.max(limit, 1), 100);
        List<Notification> rows = new ArrayList<>(jdbc.query("""
            SELECT id, type, severity, link, actor_name, data::text data, created_at, read_at FROM notification
            WHERE user_id = :me AND (NOT :unreadOnly OR read_at IS NULL) AND (CAST(:before AS bigint) IS NULL OR id < :before)
            ORDER BY id DESC LIMIT :n
            """, new MapSqlParameterSource("me", me).addValue("unreadOnly", unreadOnly).addValue("before", before, Types.BIGINT).addValue("n", n + 1),
            (rs, i) -> row(rs)));
        boolean more = rows.size() > n;
        if (more) rows.remove(rows.size() - 1);
        return new Page(rows, more, unreadCount(me));
    }

    @Transactional(readOnly = true)
    public Unread unread() { return new Unread(unreadCount(me())); }

    @Transactional
    public Unread markRead(Long id) {
        Long me = me();
        jdbc.update("UPDATE notification SET read_at = now() WHERE id = :id AND user_id = :me AND read_at IS NULL", new MapSqlParameterSource("id", id).addValue("me", me));
        return syncUnread(me);
    }

    @Transactional
    public Unread markAllRead() {
        Long me = me();
        jdbc.update("UPDATE notification SET read_at = now() WHERE user_id = :me AND read_at IS NULL", new MapSqlParameterSource("me", me));
        return syncUnread(me);
    }

    /** Sends the user's other tabs and devices the new unread count. */
    private Unread syncUnread(Long me) {
        long n = unreadCount(me);
        deliver(List.of(me), new Frame("READ", null, n));
        return new Unread(n);
    }

    // ── producers ────────────────────────────────────────────────────────
    /** Runs after the business transaction commits, in its own transaction, so it only reports what really happened. */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onDomainEvent(DomainEvent e) {
        try {
            route(e);
        } catch (RuntimeException ex) {
            log.warn("Notification for {} failed: {}", e.type(), ex.getMessage());
        }
    }

    private void route(DomainEvent e) {
        Map<String, Object> p = e.payload() == null ? Map.of() : e.payload();
        String actor = str(p.get("actor"));
        Long actorId = CurrentUser.get().map(CurrentUser::id).orElse(null);
        switch (e.type()) {
            case "PROJECT_SUBMITTED", "PROJECT_RESUBMITTED" -> notify(usersWithRole("EXECUTIVE", null), actorId,
                e.type().equals("PROJECT_SUBMITTED") ? "APPROVAL_REQUESTED" : "APPROVAL_RESUBMITTED", "INFO", "/approvals/" + e.entityId(), actor,
                data("projectId", e.entityId(), "code", p.get("projectCode"), "name", p.get("projectName"), "wereda", p.get("weredaName")));
            case "PROJECT_APPROVED", "PROJECT_RETURNED", "PROJECT_REJECTED" -> {
                String decision = e.type().substring("PROJECT_".length());
                notify(ids("SELECT submitted_by_user_id FROM project WHERE id = :id AND submitted_by_user_id IS NOT NULL", e.entityId()), actorId,
                    "APPROVAL_" + decision, switch (decision) { case "APPROVED" -> "SUCCESS"; case "REJECTED" -> "CRITICAL"; default -> "WARNING"; },
                    "/approvals/" + e.entityId(), actor,
                    data("projectId", e.entityId(), "code", p.get("projectCode"), "name", p.get("projectName"), "reference", p.get("reference")));
            }
            case "ALERT_RAISED" -> {
                boolean critical = "CRITICAL".equals(str(p.get("severity"))) || Boolean.TRUE.equals(p.get("decisionRequired"));
                if (!critical) return;
                Set<Long> to = new LinkedHashSet<>(usersWithRole("EXECUTIVE", null));
                to.addAll(usersWithRole("SECTOR_HEAD", e.sector() == null ? null : e.sector().name()));
                notify(to, actorId, "ALERT_CRITICAL", "CRITICAL", "/alerts?id=" + p.get("alertId"), null,
                    data("alertId", p.get("alertId"), "title", p.get("title"), "rule", p.get("rule"), "severity", p.get("severity"), "sector", e.sector() == null ? null : e.sector().name()));
            }
            case "ALERT_UPDATED" -> {
                if (!"ASSIGN".equals(str(p.get("action")))) return;
                Long alertId = ((Number) p.get("alertId")).longValue();
                notify(ids("SELECT assigned_to_user_id FROM alert WHERE id = :id AND assigned_to_user_id IS NOT NULL", alertId), actorId,
                    "ALERT_ASSIGNED", "WARNING", "/alerts?id=" + alertId, actor, data("alertId", alertId, "title", p.get("title"), "severity", p.get("severity")));
            }
            case "ASSIGNMENT_CREATED" -> {
                if (p.get("agentId") == null) return;
                notify(ids("SELECT user_id FROM field_agent WHERE id = :id AND user_id IS NOT NULL", ((Number) p.get("agentId")).longValue()), actorId,
                    "ASSIGNMENT_NEW", "INFO", "/projects/" + e.entityId(), actor,
                    data("projectId", e.entityId(), "code", p.get("projectCode"), "name", p.get("projectName"), "role", p.get("role"), "wereda", p.get("weredaName")));
            }
            case "INSPECTION_VERIFIED" -> {
                String status = str(p.get("status"));
                Long inspectionId = ((Number) p.get("inspectionId")).longValue();
                List<Map<String, Object>> rows = jdbc.queryForList("""
                    SELECT fi.inspector_user_id, coalesce(pr.name, fa.name) subject, fi.visited_on::text visited_on
                    FROM field_inspection fi LEFT JOIN project pr ON pr.id = fi.project_id LEFT JOIN facility fa ON fa.id = fi.facility_id
                    WHERE fi.id = :id AND fi.inspector_user_id IS NOT NULL
                    """, new MapSqlParameterSource("id", inspectionId));
                if (rows.isEmpty()) return;
                Map<String, Object> r = rows.get(0);
                notify(List.of(((Number) r.get("inspector_user_id")).longValue()), actorId, "INSPECTION_" + status,
                    switch (status) { case "VERIFIED" -> "SUCCESS"; case "REJECTED" -> "CRITICAL"; default -> "WARNING"; },
                    "/evidence", actor, data("inspectionId", inspectionId, "subject", r.get("subject"), "visitedOn", r.get("visited_on")));
            }
            default -> { }
        }
    }

    /** Damage assessment workflow: the workflow has already chosen the recipients (assessor, verifier, coordinator, endorsers). */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onAssessmentNotice(AssessmentNotice n) {
        try {
            notify(n.userIds(), n.actorUserId(), n.type(), n.severity(), n.link(), n.actorName(), n.data());
        } catch (RuntimeException ex) {
            log.warn("Notification {} failed: {}", n.type(), ex.getMessage());
        }
    }

    /** Called by messaging for people mentioned in a message. */
    public void mentioned(Collection<Long> userIds, Long actorId, String actorName, Long conversationId, String conversationTitle, String excerpt) {
        notify(userIds, actorId, "CHAT_MENTION", "INFO", "/messages?c=" + conversationId, actorName,
            data("conversationId", conversationId, "conversation", conversationTitle, "excerpt", excerpt));
    }

    // ── helpers ──────────────────────────────────────────────────────────
    private void notify(Collection<Long> recipients, Long actorId, String type, String severity, String link, String actorName, Map<String, Object> data) {
        Set<Long> to = new LinkedHashSet<>(recipients);
        if (actorId != null) to.remove(actorId);  // never notify people of their own actions
        if (to.isEmpty()) return;
        String payload;
        try { payload = json.writeValueAsString(data); } catch (Exception ex) { throw new IllegalStateException(ex); }
        for (Long uid : to) {
            Notification n = jdbc.queryForObject("""
                INSERT INTO notification(user_id, type, severity, link, actor_name, data) VALUES (:u, :t, :s, :l, :a, CAST(:d AS jsonb))
                RETURNING id, type, severity, link, actor_name, data::text data, created_at, read_at
                """, new MapSqlParameterSource("u", uid).addValue("t", type).addValue("s", severity).addValue("l", link).addValue("a", actorName).addValue("d", payload),
                (rs, i) -> row(rs));
            deliver(List.of(uid), new Frame("NEW", n, unreadCount(uid)));
        }
    }

    private void deliver(Collection<Long> userIds, Frame frame) {
        List<String> usernames = jdbc.queryForList("SELECT username FROM app_user WHERE id IN (:ids) AND enabled", new MapSqlParameterSource("ids", userIds), String.class);
        if (!usernames.isEmpty()) events.publishEvent(new ChatRealtime.Outbound(usernames, frame, ChatRealtime.NOTIFICATION_QUEUE));
    }

    private List<Long> usersWithRole(String role, String sector) {
        return jdbc.queryForList("""
            SELECT u.id FROM app_user u JOIN user_role ur ON ur.user_id = u.id JOIN role r ON r.id = ur.role_id
            WHERE r.code = :role AND u.enabled AND (CAST(:sector AS varchar) IS NULL OR u.sector_scope IS NULL OR u.sector_scope = :sector)
            """, new MapSqlParameterSource("role", role).addValue("sector", sector, Types.VARCHAR), Long.class);
    }

    private List<Long> ids(String sql, Long id) { return jdbc.queryForList(sql, new MapSqlParameterSource("id", id), Long.class); }

    private long unreadCount(Long userId) {
        Long n = jdbc.queryForObject("SELECT count(*) FROM notification WHERE user_id = :u AND read_at IS NULL", new MapSqlParameterSource("u", userId), Long.class);
        return n == null ? 0 : n;
    }

    private Notification row(ResultSet rs) throws SQLException {
        Map<String, Object> data;
        try { data = json.readValue(rs.getString("data"), new TypeReference<>() {}); } catch (Exception ex) { data = Map.of(); }
        return new Notification(rs.getLong("id"), rs.getString("type"), rs.getString("severity"), rs.getString("link"), rs.getString("actor_name"), data,
            rs.getTimestamp("created_at").toInstant(), rs.getTimestamp("read_at") == null ? null : rs.getTimestamp("read_at").toInstant());
    }

    private static Map<String, Object> data(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i + 1 < kv.length; i += 2) if (kv[i + 1] != null) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    private static String str(Object o) { return o == null ? null : String.valueOf(o); }

    private Long me() {
        return CurrentUser.get().map(CurrentUser::id).orElseThrow(() -> BusinessException.unauthorized("unauthenticated", "Sign in required"));
    }
}
