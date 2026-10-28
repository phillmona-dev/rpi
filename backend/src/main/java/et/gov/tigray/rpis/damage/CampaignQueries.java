package et.gov.tigray.rpis.damage;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import et.gov.tigray.rpis.common.Enums.*;
import et.gov.tigray.rpis.common.Sector;
import et.gov.tigray.rpis.geo.GeoDtos;
import et.gov.tigray.rpis.security.CurrentUser;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.*;

/**
 * Read model of assessment campaigns (plain SQL). The cost of a need is the replacement estimate when the recommended
 * intervention is reconstruction or relocation, otherwise the repair estimate; whichever exists when the other is missing.
 */
@Component
@RequiredArgsConstructor
public class CampaignQueries {
    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper json;

    static final String ESTIMATE = """
        (CASE WHEN a.recommended_intervention IN ('RECONSTRUCTION', 'RELOCATION') THEN coalesce(a.estimated_replacement_cost_etb, a.estimated_repair_cost_etb)
              ELSE coalesce(a.estimated_repair_cost_etb, a.estimated_replacement_cost_etb) END)""";
    private static final List<String> OPEN = List.of("ASSIGNED", "IN_PROGRESS", "RETURNED");

    // ── campaigns ────────────────────────────────────────────────────────
    public List<CampaignDtos.CampaignSummary> campaigns(Sector sector, CampaignStatus status, Long id) {
        MapSqlParameterSource p = new MapSqlParameterSource().addValue("sector", sector == null ? null : sector.name(), Types.VARCHAR)
            .addValue("status", status == null ? null : status.name(), Types.VARCHAR).addValue("id", id, Types.BIGINT);
        List<CampaignDtos.CampaignSummary> rows = jdbc.query("""
            SELECT c.*, (SELECT count(*) FROM assessment_campaign_wereda cw WHERE cw.campaign_id = c.id) weredas,
                   (SELECT count(DISTINCT m.agent_id) FROM assessment_campaign_member m WHERE m.campaign_id = c.id AND m.active) members,
                   (SELECT coalesce(sum(%s), 0) FROM damage_assessment a JOIN assessment_task t ON t.assessment_id = a.id
                     WHERE t.campaign_id = c.id AND a.status = 'VERIFIED') estimate
            FROM assessment_campaign c
            WHERE (CAST(:sector AS varchar) IS NULL OR c.sector = :sector OR c.sector IS NULL)
              AND (CAST(:status AS varchar) IS NULL OR c.status = :status) AND (CAST(:id AS bigint) IS NULL OR c.id = :id)
            ORDER BY CASE c.status WHEN 'ACTIVE' THEN 0 WHEN 'REVIEW' THEN 1 WHEN 'PLANNING' THEN 2 WHEN 'COMPLETED' THEN 3 ELSE 4 END, c.planned_start DESC, c.id DESC
            """.formatted(ESTIMATE), p, (rs, i) -> campaignSummary(rs, null));
        if (rows.isEmpty()) return rows;
        Map<Long, CampaignDtos.Progress> progress = progress(rows.stream().map(CampaignDtos.CampaignSummary::id).toList());
        return rows.stream().map(c -> withProgress(c, progress.getOrDefault(c.id(), emptyProgress()))).toList();
    }

    public Map<Long, CampaignDtos.Progress> progress(Collection<Long> campaignIds) {
        Map<Long, CampaignDtos.Progress> out = new HashMap<>();
        jdbc.query("""
            SELECT campaign_id,
                   count(*) FILTER (WHERE status <> 'CANCELLED') total, count(*) FILTER (WHERE status = 'PLANNED') planned,
                   count(*) FILTER (WHERE status = 'ASSIGNED') assigned, count(*) FILTER (WHERE status = 'IN_PROGRESS') in_progress,
                   count(*) FILTER (WHERE status = 'SUBMITTED') submitted, count(*) FILTER (WHERE status = 'RETURNED') returned,
                   count(*) FILTER (WHERE status = 'VERIFIED') verified, count(*) FILTER (WHERE status = 'INACCESSIBLE') inaccessible,
                   count(*) FILTER (WHERE status = 'CANCELLED') cancelled,
                   count(*) FILTER (WHERE due_on < current_date AND status IN ('PLANNED', 'ASSIGNED', 'IN_PROGRESS', 'RETURNED')) overdue
            FROM assessment_task WHERE campaign_id IN (:ids) GROUP BY campaign_id
            """, new MapSqlParameterSource("ids", campaignIds), rs -> {
            int total = rs.getInt("total"), verified = rs.getInt("verified"), inaccessible = rs.getInt("inaccessible");
            out.put(rs.getLong("campaign_id"), new CampaignDtos.Progress(total, rs.getInt("planned"), rs.getInt("assigned"), rs.getInt("in_progress"),
                rs.getInt("submitted"), rs.getInt("returned"), verified, inaccessible, rs.getInt("cancelled"), rs.getInt("overdue"),
                total == 0 ? 0 : Math.round((verified + inaccessible) * 1000.0 / total) / 10.0));
        });
        return out;
    }

    public List<GeoDtos.WeredaRef> weredas(Long campaignId) {
        return jdbc.query("""
            SELECT w.id wid, w.code wcode, w.name_en, w.name_ti, w.name_am, z.id zid, z.code zcode, z.name_en zen, z.name_ti zti, z.name_am zam
            FROM assessment_campaign_wereda cw JOIN wereda w ON w.id = cw.wereda_id JOIN zone z ON z.id = w.zone_id
            WHERE cw.campaign_id = :c ORDER BY z.name_en, w.name_en
            """, new MapSqlParameterSource("c", campaignId), (rs, i) -> wereda(rs));
    }

    public List<CampaignDtos.Member> members(Long campaignId, boolean showContact) {
        return jdbc.query("""
            SELECT m.*, fa.code, fa.full_name, fa.agent_type, fa.phone, fa.user_id IS NOT NULL has_login,
                   EXISTS (SELECT 1 FROM field_agent_coverage cv JOIN assessment_campaign_wereda cw ON cw.wereda_id = cv.wereda_id AND cw.campaign_id = m.campaign_id
                           WHERE cv.agent_id = m.agent_id) covers,
                   (SELECT count(*) FROM assessment_task t WHERE t.campaign_id = m.campaign_id AND t.assessor_agent_id = m.agent_id AND t.status IN (:open)) open_tasks,
                   (SELECT count(*) FROM assessment_task t WHERE t.campaign_id = m.campaign_id AND t.assessor_agent_id = m.agent_id AND t.status = 'VERIFIED') verified,
                   (SELECT count(*) FROM assessment_task t WHERE t.campaign_id = m.campaign_id AND t.verifier_agent_id = m.agent_id AND t.status = 'SUBMITTED') reviews
            FROM assessment_campaign_member m JOIN field_agent fa ON fa.id = m.agent_id
            WHERE m.campaign_id = :c
            ORDER BY m.active DESC, CASE m.role WHEN 'TEAM_LEAD' THEN 0 WHEN 'VERIFIER' THEN 1 WHEN 'ENGINEER' THEN 2 ELSE 3 END, fa.full_name
            """, new MapSqlParameterSource("c", campaignId).addValue("open", OPEN), (rs, i) -> new CampaignDtos.Member(rs.getLong("id"), rs.getLong("agent_id"),
                rs.getString("code"), rs.getString("full_name"), AgentType.valueOf(rs.getString("agent_type")), CampaignRole.valueOf(rs.getString("role")),
                showContact ? rs.getString("phone") : null, rs.getBoolean("has_login"), rs.getBoolean("covers"), rs.getInt("open_tasks"), rs.getInt("verified"),
                rs.getInt("reviews"), rs.getBoolean("active"), rs.getTimestamp("added_at").toInstant(), rs.getString("added_by_name"),
                rs.getTimestamp("released_at") == null ? null : rs.getTimestamp("released_at").toInstant(), rs.getString("release_reason")));
    }

    public List<CampaignDtos.MemberCandidate> memberCandidates(Long campaignId, Sector campaignSector, CampaignRole role) {
        return jdbc.query("""
            SELECT fa.id, fa.code, fa.full_name, fa.agent_type, fa.sectors::text sectors, fa.user_id IS NOT NULL has_login,
                   (SELECT count(*) FROM field_agent_coverage cv JOIN assessment_campaign_wereda cw ON cw.wereda_id = cv.wereda_id AND cw.campaign_id = :c
                     WHERE cv.agent_id = fa.id) covered,
                   (SELECT count(*) FROM assessment_task t JOIN assessment_campaign c2 ON c2.id = t.campaign_id
                     WHERE t.assessor_agent_id = fa.id AND t.status IN (:open) AND c2.status IN ('PLANNING', 'ACTIVE')) open_tasks,
                   (SELECT string_agg(m.role, ',') FROM assessment_campaign_member m WHERE m.campaign_id = :c AND m.agent_id = fa.id AND m.active) roles
            FROM field_agent fa WHERE fa.status = 'ACTIVE'
            ORDER BY covered DESC, open_tasks, fa.full_name
            """, new MapSqlParameterSource("c", campaignId).addValue("open", OPEN), (rs, i) -> {
            AgentType type = AgentType.valueOf(rs.getString("agent_type"));
            List<CampaignRole> roles = rs.getString("roles") == null ? List.of() : Arrays.stream(rs.getString("roles").split(",")).map(CampaignRole::valueOf).toList();
            List<String> sectors = strings(rs.getString("sectors"));
            String reason = null;
            if (role != null && roles.contains(role)) reason = "ALREADY_IN_ROLE";
            else if (role != null && (role == CampaignRole.VERIFIER || role == CampaignRole.TEAM_LEAD) && type == AgentType.DATA_COLLECTOR) reason = "ROLE_NEEDS_ANALYST_OR_SUPERVISOR";
            return new CampaignDtos.MemberCandidate(rs.getLong("id"), rs.getString("code"), rs.getString("full_name"), type, sectors, rs.getBoolean("has_login"),
                rs.getInt("covered"), rs.getInt("open_tasks"), roles, reason == null, reason);
        }).stream()
            // Sector specialists first when the campaign has a sector.
            .sorted(Comparator.comparing((CampaignDtos.MemberCandidate m) -> !m.eligible())
                .thenComparing(m -> campaignSector != null && !m.sectors().contains(campaignSector.name()))
                .thenComparing(m -> -m.coveredWeredas()).thenComparingInt(CampaignDtos.MemberCandidate::openTasks))
            .toList();
    }

    // ── tasks ────────────────────────────────────────────────────────────
    public record TaskFilter(Long campaignId, TaskStatus status, Integer weredaId, Long assessorAgentId, Long verifierAgentId, String q, Long mineAgentId, Long id, Sector sector) {
        static TaskFilter of(Long campaignId) { return new TaskFilter(campaignId, null, null, null, null, null, null, null, null); }
        static TaskFilter one(Long id) { return new TaskFilter(null, null, null, null, null, null, null, id, null); }
    }

    public List<CampaignDtos.TaskRow> tasks(TaskFilter f) {
        MapSqlParameterSource p = new MapSqlParameterSource().addValue("c", f.campaignId(), Types.BIGINT).addValue("status", f.status() == null ? null : f.status().name(), Types.VARCHAR)
            .addValue("wereda", f.weredaId(), Types.INTEGER).addValue("assessor", f.assessorAgentId(), Types.BIGINT).addValue("verifier", f.verifierAgentId(), Types.BIGINT)
            .addValue("q", f.q() == null || f.q().isBlank() ? null : "%" + f.q().trim() + "%", Types.VARCHAR).addValue("mine", f.mineAgentId(), Types.BIGINT)
            .addValue("id", f.id(), Types.BIGINT).addValue("sector", f.sector() == null ? null : f.sector().name(), Types.VARCHAR);
        return jdbc.query("""
            SELECT t.*, c.code ccode, c.name cname, c.status cstatus, f.code fcode, f.name fname, f.sector, f.facility_type,
                   ST_Y(f.location) lat, ST_X(f.location) lng,
                   w.id wid, w.code wcode, w.name_en, w.name_ti, w.name_am, z.id zid, z.code zcode, z.name_en zen, z.name_ti zti, z.name_am zam,
                   aa.full_name assessor_name, aa.user_id assessor_user, va.full_name verifier_name, va.user_id verifier_user,
                   a.status astatus, a.severity, a.estimated_replacement_cost_etb, prev.severity prev_severity, prev.assessed_on prev_on
            FROM assessment_task t
            JOIN assessment_campaign c ON c.id = t.campaign_id
            JOIN facility f ON f.id = t.facility_id JOIN wereda w ON w.id = f.wereda_id JOIN zone z ON z.id = w.zone_id
            LEFT JOIN field_agent aa ON aa.id = t.assessor_agent_id LEFT JOIN field_agent va ON va.id = t.verifier_agent_id
            LEFT JOIN damage_assessment a ON a.id = t.assessment_id
            LEFT JOIN damage_assessment prev ON prev.id = f.latest_assessment_id AND prev.id IS DISTINCT FROM t.assessment_id
            WHERE (CAST(:c AS bigint) IS NULL OR t.campaign_id = :c) AND (CAST(:id AS bigint) IS NULL OR t.id = :id)
              AND (CAST(:status AS varchar) IS NULL OR t.status = :status) AND (CAST(:wereda AS int) IS NULL OR f.wereda_id = :wereda)
              AND (CAST(:assessor AS bigint) IS NULL OR t.assessor_agent_id = :assessor) AND (CAST(:verifier AS bigint) IS NULL OR t.verifier_agent_id = :verifier)
              AND (CAST(:q AS varchar) IS NULL OR f.name ILIKE :q OR f.code ILIKE :q)
              AND (CAST(:sector AS varchar) IS NULL OR f.sector = :sector)
              AND (CAST(:mine AS bigint) IS NULL OR ((t.assessor_agent_id = :mine OR t.verifier_agent_id = :mine) AND c.status IN ('PLANNING', 'ACTIVE', 'REVIEW')))
            ORDER BY CASE t.status WHEN 'RETURNED' THEN 0 WHEN 'SUBMITTED' THEN 1 WHEN 'IN_PROGRESS' THEN 2 WHEN 'ASSIGNED' THEN 3 WHEN 'PLANNED' THEN 4
                                   WHEN 'VERIFIED' THEN 5 WHEN 'INACCESSIBLE' THEN 6 ELSE 7 END,
                     CASE t.priority WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 ELSE 2 END, t.due_on NULLS LAST, w.name_en, f.name
            LIMIT 2000
            """, p, (rs, i) -> taskRow(rs));
    }

    public List<CampaignDtos.SiteCandidate> siteCandidates(Long campaignId, Sector campaignSector, Integer weredaId, String q, FacilityType type, DamageSeverity severity, boolean neverAssessed) {
        MapSqlParameterSource p = new MapSqlParameterSource().addValue("c", campaignId).addValue("sector", campaignSector == null ? null : campaignSector.name(), Types.VARCHAR)
            .addValue("wereda", weredaId, Types.INTEGER).addValue("q", q == null || q.isBlank() ? null : "%" + q.trim() + "%", Types.VARCHAR)
            .addValue("type", type == null ? null : type.name(), Types.VARCHAR).addValue("severity", severity == null ? null : severity.name(), Types.VARCHAR)
            .addValue("never", neverAssessed);
        return jdbc.query("""
            SELECT f.id, f.code, f.name, f.sector, f.facility_type, f.latest_severity, la.assessed_on last_on, f.beneficiaries,
                   w.id wid, w.code wcode, w.name_en, w.name_ti, w.name_am, z.id zid, z.code zcode, z.name_en zen, z.name_ti zti, z.name_am zam,
                   (SELECT c2.code FROM assessment_task t2 JOIN assessment_campaign c2 ON c2.id = t2.campaign_id
                     WHERE t2.facility_id = f.id AND c2.id <> :c AND c2.status IN ('PLANNING', 'ACTIVE') AND t2.status <> 'CANCELLED' LIMIT 1) other
            FROM facility f JOIN wereda w ON w.id = f.wereda_id JOIN zone z ON z.id = w.zone_id
            LEFT JOIN damage_assessment la ON la.id = f.latest_assessment_id
            WHERE f.wereda_id IN (SELECT wereda_id FROM assessment_campaign_wereda WHERE campaign_id = :c)
              AND (CAST(:sector AS varchar) IS NULL OR f.sector = :sector)
              AND NOT EXISTS (SELECT 1 FROM assessment_task t WHERE t.campaign_id = :c AND t.facility_id = f.id)
              AND (CAST(:wereda AS int) IS NULL OR f.wereda_id = :wereda)
              AND (CAST(:q AS varchar) IS NULL OR f.name ILIKE :q OR f.code ILIKE :q)
              AND (CAST(:type AS varchar) IS NULL OR f.facility_type = :type)
              AND (CAST(:severity AS varchar) IS NULL OR f.latest_severity = :severity)
              AND (NOT :never OR f.latest_assessment_id IS NULL)
            ORDER BY la.assessed_on NULLS FIRST, w.name_en, f.name LIMIT 500
            """, p, (rs, i) -> new CampaignDtos.SiteCandidate(rs.getLong("id"), rs.getString("code"), rs.getString("name"), Sector.valueOf(rs.getString("sector")),
                FacilityType.valueOf(rs.getString("facility_type")), wereda(rs), rs.getString("latest_severity") == null ? null : DamageSeverity.valueOf(rs.getString("latest_severity")),
                rs.getObject("last_on", LocalDate.class), (Integer) rs.getObject("beneficiaries"), rs.getString("other")));
    }

    // ── results ──────────────────────────────────────────────────────────
    public CampaignDtos.CampaignResults results(Long campaignId) {
        MapSqlParameterSource p = new MapSqlParameterSource("c", campaignId);
        String base = " " + """
            FROM assessment_task t JOIN damage_assessment a ON a.id = t.assessment_id AND a.status = 'VERIFIED'
            JOIN facility f ON f.id = t.facility_id JOIN wereda w ON w.id = f.wereda_id
            WHERE t.campaign_id = :c""";
        String sums = "count(*) sites, coalesce(sum(" + ESTIMATE + "), 0) est, coalesce(sum(coalesce(a.beneficiaries_affected, f.beneficiaries, 0)), 0) ben";
        var totals = jdbc.queryForMap("""
            SELECT count(*) n, coalesce(sum(a.estimated_repair_cost_etb), 0) repair, coalesce(sum(a.estimated_replacement_cost_etb), 0) replacement,
                   coalesce(sum(a.equipment_loss_etb), 0) equipment, coalesce(sum(coalesce(a.beneficiaries_affected, f.beneficiaries, 0)), 0) ben,
                   count(*) FILTER (WHERE a.uxo_suspected) uxo, count(*) FILTER (WHERE a.current_use = 'IDP_SHELTER') idp,
                   count(*) FILTER (WHERE a.project_id IS NOT NULL) linked
            """ + base, p);
        CampaignDtos.Progress progress = progress(List.of(campaignId)).getOrDefault(campaignId, emptyProgress());
        return new CampaignDtos.CampaignResults(progress, ((Number) totals.get("n")).longValue(), (BigDecimal) totals.get("repair"), (BigDecimal) totals.get("replacement"),
            (BigDecimal) totals.get("equipment"), ((Number) totals.get("ben")).longValue(), ((Number) totals.get("uxo")).longValue(), ((Number) totals.get("idp")).longValue(),
            buckets("SELECT a.severity k, " + sums + base + " GROUP BY a.severity ORDER BY sites DESC", p),
            buckets("SELECT coalesce(a.recommended_intervention, 'UNSPECIFIED') k, " + sums + base + " GROUP BY 1 ORDER BY est DESC", p),
            buckets("SELECT coalesce(a.intervention_priority, 'UNSPECIFIED') k, " + sums + base + " GROUP BY 1 ORDER BY sites DESC", p),
            buckets("SELECT w.name_en k, " + sums + base + " GROUP BY w.name_en ORDER BY est DESC", p),
            buckets("SELECT f.facility_type k, " + sums + base + " GROUP BY f.facility_type ORDER BY est DESC", p),
            buckets("SELECT cause k, " + sums + base.replace("WHERE t.campaign_id = :c", ", jsonb_array_elements_text(a.damage_causes) cause WHERE t.campaign_id = :c") + " GROUP BY cause ORDER BY sites DESC", p),
            jdbc.query("""
                SELECT ac.component k, count(*) sites, coalesce(sum(ac.repair_cost_etb), 0) est, 0 ben
                FROM assessment_task t JOIN damage_assessment a ON a.id = t.assessment_id AND a.status = 'VERIFIED'
                JOIN assessment_component ac ON ac.assessment_id = a.id AND ac.condition IN ('SEVERE', 'DESTROYED')
                WHERE t.campaign_id = :c GROUP BY ac.component ORDER BY sites DESC, est DESC
                """, p, (rs, i) -> bucket(rs)),
            ((Number) totals.get("linked")).longValue());
    }

    public List<CampaignDtos.Activity> activity(Long campaignId, int limit) {
        return jdbc.query("""
            SELECT e.id, e.kind, e.occurred_at, e.actor_name, e.note, e.task_id, e.assessment_id, e.data::text data,
                   coalesce(f1.name, f2.name) facility
            FROM assessment_event e
            LEFT JOIN assessment_task t ON t.id = e.task_id LEFT JOIN facility f1 ON f1.id = t.facility_id
            LEFT JOIN damage_assessment a ON a.id = e.assessment_id LEFT JOIN facility f2 ON f2.id = a.facility_id
            WHERE e.campaign_id = :c ORDER BY e.occurred_at DESC, e.id DESC LIMIT :n
            """, new MapSqlParameterSource("c", campaignId).addValue("n", Math.min(Math.max(limit, 1), 500)),
            (rs, i) -> new CampaignDtos.Activity(rs.getLong("id"), rs.getString("kind"), rs.getTimestamp("occurred_at").toInstant(), rs.getString("actor_name"),
                rs.getString("note"), (Long) rs.getObject("task_id"), (Long) rs.getObject("assessment_id"), rs.getString("facility"), map(rs.getString("data"))));
    }

    // ── overview ─────────────────────────────────────────────────────────
    public CampaignDtos.Overview overview(Sector sector, CurrentUser u, Long myAgentId) {
        MapSqlParameterSource p = new MapSqlParameterSource().addValue("sector", sector == null ? null : sector.name(), Types.VARCHAR).addValue("me", u == null ? null : u.id(), Types.BIGINT);
        var r = jdbc.queryForMap("""
            SELECT (SELECT count(*) FROM assessment_campaign c WHERE c.status = 'PLANNING' AND %1$s) c_planning,
                   (SELECT count(*) FROM assessment_campaign c WHERE c.status = 'ACTIVE' AND %1$s) c_active,
                   (SELECT count(*) FROM assessment_campaign c WHERE c.status = 'REVIEW' AND %1$s) c_review,
                   (SELECT count(*) FROM assessment_campaign c WHERE c.status = 'COMPLETED' AND %1$s) c_completed,
                   count(*) FILTER (WHERE t.status <> 'CANCELLED') sites,
                   count(*) FILTER (WHERE t.status = 'VERIFIED') verified,
                   count(*) FILTER (WHERE t.status IN ('PLANNED', 'ASSIGNED', 'IN_PROGRESS', 'RETURNED', 'SUBMITTED')) outstanding,
                   count(*) FILTER (WHERE t.status = 'INACCESSIBLE') inaccessible
            FROM assessment_task t JOIN assessment_campaign c ON c.id = t.campaign_id JOIN facility f ON f.id = t.facility_id
            WHERE c.status IN ('PLANNING', 'ACTIVE', 'REVIEW', 'COMPLETED') AND (CAST(:sector AS varchar) IS NULL OR f.sector = :sector)
            """.formatted("(CAST(:sector AS varchar) IS NULL OR c.sector = :sector OR c.sector IS NULL)"), p);
        var review = jdbc.queryForMap("""
            SELECT count(*) FILTER (WHERE a.status = 'SUBMITTED') awaiting, count(*) FILTER (WHERE a.status = 'RETURNED') returned,
                   max(current_date - a.submitted_at::date) FILTER (WHERE a.status = 'SUBMITTED') oldest
            FROM damage_assessment a JOIN facility f ON f.id = a.facility_id
            WHERE a.status IN ('SUBMITTED', 'RETURNED') AND (CAST(:sector AS varchar) IS NULL OR f.sector = :sector)
            """, p);
        Map<String, Long> bySeverity = new LinkedHashMap<>();
        for (DamageSeverity s : DamageSeverity.values()) bySeverity.put(s.name(), 0L);
        long[] never = {0};
        jdbc.query("SELECT coalesce(latest_severity, 'UNASSESSED') s, count(*) n FROM facility WHERE (CAST(:sector AS varchar) IS NULL OR sector = :sector) GROUP BY 1", p, rs -> {
            if ("UNASSESSED".equals(rs.getString("s"))) never[0] = rs.getLong("n"); else bySeverity.put(rs.getString("s"), rs.getLong("n"));
        });
        BigDecimal replacement = jdbc.queryForObject("""
            SELECT coalesce(sum(replacement_estimate_etb), 0) FROM facility WHERE latest_severity IN ('MODERATE', 'SEVERE', 'DESTROYED') AND (CAST(:sector AS varchar) IS NULL OR sector = :sector)
            """, p, BigDecimal.class);
        var needs = jdbc.queryForMap("""
            SELECT count(*) n, coalesce(sum(%s), 0) est
            FROM damage_assessment a JOIN facility f ON f.id = a.facility_id AND f.latest_assessment_id = a.id
            WHERE a.status = 'VERIFIED' AND a.project_id IS NULL AND a.severity <> 'NONE' AND coalesce(a.recommended_intervention, 'REHABILITATION') <> 'NO_ACTION'
              AND NOT EXISTS (SELECT 1 FROM project_facility pf JOIN project pr ON pr.id = pf.project_id WHERE pf.facility_id = f.id AND pr.status <> 'CANCELLED')
              AND (CAST(:sector AS varchar) IS NULL OR f.sector = :sector)
            """.formatted(ESTIMATE), p);
        long assessed = bySeverity.values().stream().mapToLong(Long::longValue).sum();
        return new CampaignDtos.Overview(n(r, "c_planning"), n(r, "c_active"), n(r, "c_review"), n(r, "c_completed"), n(r, "sites"), n(r, "verified"),
            n(r, "outstanding"), n(r, "inaccessible"), n(review, "awaiting"), review.get("oldest") == null ? null : ((Number) review.get("oldest")).intValue(),
            n(review, "returned"), bySeverity, assessed, never[0], replacement, n(needs, "n"), (BigDecimal) needs.get("est"), myQueue(sector, u, myAgentId));
    }

    private CampaignDtos.MyQueue myQueue(Sector sector, CurrentUser u, Long agentId) {
        if (u == null) return new CampaignDtos.MyQueue(0, 0, 0);
        MapSqlParameterSource p = new MapSqlParameterSource().addValue("agent", agentId, Types.BIGINT).addValue("me", u.id()).addValue("sector", sector == null ? null : sector.name(), Types.VARCHAR);
        var r = jdbc.queryForMap("""
            SELECT count(*) FILTER (WHERE t.assessor_agent_id = :agent AND t.status IN ('ASSIGNED', 'IN_PROGRESS') AND c.status = 'ACTIVE') to_assess,
                   count(*) FILTER (WHERE t.assessor_agent_id = :agent AND t.status = 'RETURNED' AND c.status = 'ACTIVE') returned,
                   count(*) FILTER (WHERE t.verifier_agent_id = :agent AND t.status = 'SUBMITTED') to_review
            FROM assessment_task t JOIN assessment_campaign c ON c.id = t.campaign_id
            WHERE CAST(:agent AS bigint) IS NOT NULL
            """, p);
        int toReview = ((Number) r.get("to_review")).intValue();
        if (u.has("ANALYST") || u.has("ADMIN") || u.has("SECTOR_HEAD")) {
            Long all = jdbc.queryForObject("""
                SELECT count(*) FROM damage_assessment a JOIN facility f ON f.id = a.facility_id
                WHERE a.status = 'SUBMITTED' AND a.submitted_by_user_id IS DISTINCT FROM :me AND a.assessor_user_id IS DISTINCT FROM :me
                  AND (CAST(:sector AS varchar) IS NULL OR f.sector = :sector)
                """, p, Long.class);
            toReview = Math.max(toReview, all == null ? 0 : all.intValue());
        }
        return new CampaignDtos.MyQueue(((Number) r.get("to_assess")).intValue(), ((Number) r.get("returned")).intValue(), toReview);
    }

    // ── mapping ──────────────────────────────────────────────────────────
    private CampaignDtos.CampaignSummary campaignSummary(ResultSet rs, CampaignDtos.Progress progress) throws SQLException {
        CampaignStatus status = CampaignStatus.valueOf(rs.getString("status"));
        LocalDate end = rs.getObject("planned_end", LocalDate.class);
        Integer daysLeft = status == CampaignStatus.ACTIVE || status == CampaignStatus.PLANNING
            ? (int) java.time.temporal.ChronoUnit.DAYS.between(LocalDate.now(ZoneOffset.UTC), end) : null;
        return new CampaignDtos.CampaignSummary(rs.getLong("id"), rs.getString("code"), rs.getString("name"),
            rs.getString("sector") == null ? null : Sector.valueOf(rs.getString("sector")), status, rs.getObject("planned_start", LocalDate.class), end,
            rs.getString("coordinator_name"), rs.getInt("weredas"), rs.getInt("members"), progress, rs.getBigDecimal("estimate"),
            rs.getTimestamp("endorsed_at") == null ? null : rs.getTimestamp("endorsed_at").toInstant(), rs.getString("endorsement_reference"), daysLeft);
    }

    private static CampaignDtos.CampaignSummary withProgress(CampaignDtos.CampaignSummary c, CampaignDtos.Progress p) {
        return new CampaignDtos.CampaignSummary(c.id(), c.code(), c.name(), c.sector(), c.status(), c.plannedStart(), c.plannedEnd(), c.coordinatorName(),
            c.weredaCount(), c.memberCount(), p, c.verifiedEstimateEtb(), c.endorsedAt(), c.endorsementReference(), c.daysLeft());
    }

    static CampaignDtos.Progress emptyProgress() { return new CampaignDtos.Progress(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0); }

    private CampaignDtos.TaskRow taskRow(ResultSet rs) throws SQLException {
        TaskStatus status = TaskStatus.valueOf(rs.getString("status"));
        LocalDate due = rs.getObject("due_on", LocalDate.class);
        boolean overdue = due != null && due.isBefore(LocalDate.now(ZoneOffset.UTC))
            && EnumSet.of(TaskStatus.PLANNED, TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS, TaskStatus.RETURNED).contains(status);
        Long assessor = (Long) rs.getObject("assessor_agent_id"), verifier = (Long) rs.getObject("verifier_agent_id");
        Double lat = (Double) rs.getObject("lat"), lng = (Double) rs.getObject("lng");
        return new CampaignDtos.TaskRow(rs.getLong("id"), rs.getLong("campaign_id"), rs.getString("ccode"), rs.getString("cname"), CampaignStatus.valueOf(rs.getString("cstatus")),
            new DamageDtos.FacilityRef(rs.getLong("facility_id"), rs.getString("fcode"), rs.getString("fname"), Sector.valueOf(rs.getString("sector")),
                FacilityType.valueOf(rs.getString("facility_type")), wereda(rs)),
            status, AssignmentPriority.valueOf(rs.getString("priority")),
            assessor == null ? null : new CampaignDtos.Person(assessor, rs.getString("assessor_name"), (Long) rs.getObject("assessor_user")),
            verifier == null ? null : new CampaignDtos.Person(verifier, rs.getString("verifier_name"), (Long) rs.getObject("verifier_user")),
            due, overdue, rs.getString("instructions"), rs.getString("status_note"), (Long) rs.getObject("assessment_id"),
            rs.getString("astatus") == null ? null : AssessmentStatus.valueOf(rs.getString("astatus")),
            rs.getString("severity") == null ? null : DamageSeverity.valueOf(rs.getString("severity")), rs.getBigDecimal("estimated_replacement_cost_etb"),
            rs.getString("prev_severity") == null ? null : DamageSeverity.valueOf(rs.getString("prev_severity")), rs.getObject("prev_on", LocalDate.class),
            ts(rs, "assigned_at"), ts(rs, "submitted_at"), ts(rs, "verified_at"), lat, lng);
    }

    static GeoDtos.WeredaRef wereda(ResultSet rs) throws SQLException {
        return new GeoDtos.WeredaRef(rs.getInt("wid"), rs.getString("wcode"), new GeoDtos.LocalizedName(rs.getString("name_en"), rs.getString("name_ti"), rs.getString("name_am")),
            rs.getShort("zid"), rs.getString("zcode"), new GeoDtos.LocalizedName(rs.getString("zen"), rs.getString("zti"), rs.getString("zam")));
    }

    private List<CampaignDtos.Bucket> buckets(String sql, MapSqlParameterSource p) { return jdbc.query(sql, p, (rs, i) -> bucket(rs)); }

    private static CampaignDtos.Bucket bucket(ResultSet rs) throws SQLException {
        return new CampaignDtos.Bucket(rs.getString("k"), rs.getLong("sites"), rs.getBigDecimal("est"), rs.getLong("ben"));
    }

    private static java.time.Instant ts(ResultSet rs, String col) throws SQLException { return rs.getTimestamp(col) == null ? null : rs.getTimestamp(col).toInstant(); }
    private static long n(Map<String, Object> m, String k) { return m.get(k) == null ? 0 : ((Number) m.get(k)).longValue(); }

    private List<String> strings(String s) {
        try { return s == null ? List.of() : json.readValue(s, new TypeReference<List<String>>() {}); } catch (Exception e) { return List.of(); }
    }

    private Map<String, Object> map(String s) {
        try { return s == null ? null : json.readValue(s, new TypeReference<Map<String, Object>>() {}); } catch (Exception e) { return null; }
    }
}
