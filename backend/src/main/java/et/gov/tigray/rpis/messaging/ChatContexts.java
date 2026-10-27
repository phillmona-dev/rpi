package et.gov.tigray.rpis.messaging;

import et.gov.tigray.rpis.common.Sector;
import et.gov.tigray.rpis.messaging.MessagingDtos.ContextType;
import et.gov.tigray.rpis.security.CurrentUser;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.*;

/**
 * Who may see a discussion thread attached to a record, and who has a stake in it. Read access mirrors the
 * page the thread lives on; stakeholders are followed in automatically so they are notified of new messages.
 */
@Component
@RequiredArgsConstructor
class ChatContexts {
    private final NamedParameterJdbcTemplate jdbc;

    private static final List<String> APPROVAL_ROLES = List.of("EXECUTIVE", "SECTOR_HEAD", "ANALYST", "ADMIN");
    private static final List<String> FIELD_TEAM_ROLES = List.of("EXECUTIVE", "SECTOR_HEAD", "ANALYST", "ADMIN");

    record Info(ContextType type, Long id, String title, String code, Sector sector, Set<Long> stakeholders, Set<Long> ownUsers) {}

    Optional<Info> resolve(ContextType type, Long id) {
        MapSqlParameterSource p = new MapSqlParameterSource("id", id);
        List<Info> rows = switch (type) {
            case PROJECT, APPROVAL -> jdbc.query("""
                SELECT p.code, p.name, p.sector, p.submitted_by_user_id,
                       ARRAY(SELECT fa.user_id FROM project_assignment pa JOIN field_agent fa ON fa.id = pa.agent_id
                             WHERE pa.project_id = p.id AND pa.status = 'ACTIVE' AND fa.user_id IS NOT NULL) agents,
                       ARRAY(SELECT u.id FROM app_user u JOIN user_role ur ON ur.user_id = u.id JOIN role r ON r.id = ur.role_id
                             WHERE r.code = 'EXECUTIVE' AND u.enabled) execs
                FROM project p WHERE p.id = :id
                """, p, (rs, i) -> {
                    Set<Long> st = new LinkedHashSet<>();
                    long submitter = rs.getLong("submitted_by_user_id");
                    if (!rs.wasNull()) st.add(submitter);
                    Set<Long> agents = ids(rs.getArray("agents"));
                    if (type == ContextType.PROJECT) st.addAll(agents); else st.addAll(ids(rs.getArray("execs")));
                    return new Info(type, id, rs.getString("name"), rs.getString("code"), sector(rs.getString("sector")), st,
                        type == ContextType.PROJECT ? agents : Set.of());
                });
            case ALERT -> jdbc.query("SELECT title, sector, assigned_to_user_id FROM alert WHERE id = :id", p, (rs, i) -> {
                Set<Long> st = new LinkedHashSet<>();
                long assignee = rs.getLong("assigned_to_user_id");
                if (!rs.wasNull()) st.add(assignee);
                return new Info(type, id, rs.getString("title"), null, sector(rs.getString("sector")), st, Set.of());
            });
            case FIELD_AGENT -> jdbc.query("""
                SELECT fa.full_name, fa.code, fa.user_id, sup.user_id supervisor_user_id
                FROM field_agent fa LEFT JOIN field_agent sup ON sup.id = fa.supervisor_id WHERE fa.id = :id
                """, p, (rs, i) -> {
                    Set<Long> own = new LinkedHashSet<>();
                    long agent = rs.getLong("user_id");
                    if (!rs.wasNull()) own.add(agent);
                    long sup = rs.getLong("supervisor_user_id");
                    if (!rs.wasNull()) own.add(sup);
                    return new Info(type, id, rs.getString("full_name"), rs.getString("code"), null, own, own);
                });
        };
        return rows.stream().findFirst();
    }

    /** Null when the user may read the thread, otherwise the reason. */
    String cannotRead(Info info, CurrentUser u) {
        if (u.has("SECTOR_HEAD") && u.sectorScope() != null && info.sector() != null && u.sectorScope() != info.sector())
            return "This record is outside your sector";
        return switch (info.type()) {
            case PROJECT, ALERT -> null;
            case APPROVAL -> APPROVAL_ROLES.stream().anyMatch(u::has) ? null : "Approval discussions are limited to the approval workflow";
            case FIELD_AGENT -> FIELD_TEAM_ROLES.stream().anyMatch(u::has) || info.ownUsers().contains(u.id()) ? null
                : "Only field team coordinators, the member and their supervisor can see this conversation";
        };
    }

    /** Null when the user may post, otherwise the reason. Federal observers read discussions but do not take part. */
    String cannotPost(Info info, CurrentUser u) {
        String read = cannotRead(info, u);
        if (read != null) return read;
        if (u.roles().stream().allMatch(r -> r.equals("PMO_FEDERAL"))) return "Federal observers have read-only access to discussions";
        return null;
    }

    private static Sector sector(String s) { return s == null ? null : Sector.valueOf(s); }

    private static Set<Long> ids(java.sql.Array a) throws java.sql.SQLException {
        Set<Long> out = new LinkedHashSet<>();
        if (a == null) return out;
        for (Object o : (Object[]) a.getArray()) if (o != null) out.add(((Number) o).longValue());
        return out;
    }
}
