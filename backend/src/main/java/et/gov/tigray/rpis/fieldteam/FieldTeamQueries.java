package et.gov.tigray.rpis.fieldteam;

import et.gov.tigray.rpis.common.Enums.*;
import et.gov.tigray.rpis.common.Sector;
import et.gov.tigray.rpis.geo.GeoDtos;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.LocalDate;
import java.util.*;

/**
 * Read model of the field team. A visit counts towards an assignment when the assigned member's account recorded an
 * inspection on that project on or after the assignment start; the next visit is due one cadence after the last one.
 */
@Repository
@RequiredArgsConstructor
public class FieldTeamQueries {
    private final NamedParameterJdbcTemplate jdbc;

    /** Per-assignment visit facts, reused by every query that needs workload or overdue figures. */
    static final String ASSIGNMENT_VISITS = """
        av AS (
          SELECT pa.*, lv.last_visit, lv.visits,
                 (coalesce(lv.last_visit, pa.start_on) + pa.visit_frequency_days) AS next_due,
                 CASE WHEN pa.status = 'ACTIVE' AND pa.start_on <= current_date
                           AND coalesce(lv.last_visit, pa.start_on) + pa.visit_frequency_days < current_date
                      THEN current_date - (coalesce(lv.last_visit, pa.start_on) + pa.visit_frequency_days) END AS overdue_days
          FROM project_assignment pa
          JOIN field_agent fa ON fa.id = pa.agent_id
          LEFT JOIN LATERAL (SELECT max(fi.visited_on) last_visit, count(*) visits FROM field_inspection fi
                             WHERE fi.project_id = pa.project_id AND fa.user_id IS NOT NULL AND fi.inspector_user_id = fa.user_id
                               AND fi.visited_on >= pa.start_on AND (pa.closed_at IS NULL OR fi.visited_on <= pa.closed_at::date)) lv ON true)
        """;

    public record AgentFilter(String q, AgentType type, AgentStatus status, Short zoneId, Integer weredaId, Sector sector, Boolean available, Long id, Long supervisorId) {
        static AgentFilter byId(Long id) { return new AgentFilter(null, null, null, null, null, null, null, id, null); }
    }

    public List<FieldTeamDtos.AgentSummary> agents(AgentFilter f) {
        MapSqlParameterSource p = new MapSqlParameterSource()
            .addValue("q", f.q() == null || f.q().isBlank() ? null : "%" + f.q().trim().toLowerCase(Locale.ROOT) + "%", Types.VARCHAR)
            .addValue("type", f.type() == null ? null : f.type().name(), Types.VARCHAR)
            .addValue("status", f.status() == null ? null : f.status().name(), Types.VARCHAR)
            .addValue("zoneId", f.zoneId(), Types.SMALLINT)
            .addValue("weredaId", f.weredaId(), Types.INTEGER)
            .addValue("sector", f.sector() == null ? null : f.sector().name(), Types.VARCHAR)
            .addValue("available", Boolean.TRUE.equals(f.available()))
            .addValue("id", f.id(), Types.BIGINT)
            .addValue("supervisorId", f.supervisorId(), Types.BIGINT);
        return jdbc.query("WITH " + ASSIGNMENT_VISITS + """
            , asg AS (SELECT agent_id, count(*) FILTER (WHERE status = 'ACTIVE') active, count(*) FILTER (WHERE overdue_days IS NOT NULL) overdue FROM av GROUP BY agent_id),
            insp AS (SELECT fa.id agent_id,
                            count(*) FILTER (WHERE fi.visited_on > current_date - 30) n30,
                            count(*) FILTER (WHERE fi.visited_on > current_date - 90 AND fi.verification_status <> 'UNVERIFIED') reviewed90,
                            count(*) FILTER (WHERE fi.visited_on > current_date - 90 AND fi.verification_status = 'VERIFIED') verified90,
                            max(fi.visited_on) last_visit
                     FROM field_agent fa JOIN field_inspection fi ON fi.inspector_user_id = fa.user_id GROUP BY fa.id),
            cov AS (SELECT c.agent_id, count(*) n, array_agg(DISTINCT z.name_en) zones
                    FROM field_agent_coverage c JOIN wereda w ON w.id = c.wereda_id JOIN zone z ON z.id = w.zone_id GROUP BY c.agent_id)
            SELECT a.id, a.code, a.full_name, a.agent_type, a.status, a.phone, a.email, a.sectors::text sectors, a.max_active_assignments, a.contract_end,
                   a.training_completed_on, a.code_of_conduct_signed_on, a.user_id, u.username,
                   o.name org_name, sup.full_name sup_name,
                   hw.id hw_id, hw.name_en hw_en, hw.name_ti hw_ti, hw.name_am hw_am, hz.id hz_id, hz.name_en hz_en, hz.name_ti hz_ti, hz.name_am hz_am,
                   coalesce(asg.active, 0) active, coalesce(asg.overdue, 0) overdue, coalesce(insp.n30, 0) n30, insp.reviewed90, insp.verified90, insp.last_visit,
                   (SELECT max(d.last_sync_at) FROM field_device d WHERE d.id = a.device_id OR (a.user_id IS NOT NULL AND d.assigned_user_id = a.user_id)) last_sync,
                   coalesce(cov.n, 0) cov_n, cov.zones
            FROM field_agent a
            LEFT JOIN app_user u ON u.id = a.user_id
            LEFT JOIN organization o ON o.id = a.organization_id
            LEFT JOIN field_agent sup ON sup.id = a.supervisor_id
            LEFT JOIN wereda hw ON hw.id = a.home_wereda_id LEFT JOIN zone hz ON hz.id = hw.zone_id
            LEFT JOIN asg ON asg.agent_id = a.id LEFT JOIN insp ON insp.agent_id = a.id LEFT JOIN cov ON cov.agent_id = a.id
            WHERE (CAST(:id AS bigint) IS NULL OR a.id = :id)
              AND (CAST(:q AS varchar) IS NULL OR lower(a.full_name) LIKE :q OR lower(a.code) LIKE :q OR a.phone LIKE :q OR lower(coalesce(u.username, '')) LIKE :q)
              AND (CAST(:type AS varchar) IS NULL OR a.agent_type = :type)
              AND (CAST(:status AS varchar) IS NULL OR a.status = :status)
              AND (CAST(:sector AS varchar) IS NULL OR a.sectors @> jsonb_build_array(CAST(:sector AS text)))
              AND (CAST(:weredaId AS int) IS NULL OR EXISTS (SELECT 1 FROM field_agent_coverage c WHERE c.agent_id = a.id AND c.wereda_id = :weredaId))
              AND (CAST(:zoneId AS smallint) IS NULL OR EXISTS (SELECT 1 FROM field_agent_coverage c JOIN wereda w ON w.id = c.wereda_id WHERE c.agent_id = a.id AND w.zone_id = :zoneId))
              AND (CAST(:supervisorId AS bigint) IS NULL OR a.supervisor_id = :supervisorId)
              AND (NOT :available OR (a.status = 'ACTIVE' AND coalesce(asg.active, 0) < a.max_active_assignments))
            ORDER BY CASE a.status WHEN 'ACTIVE' THEN 0 WHEN 'PENDING_ONBOARDING' THEN 1 WHEN 'ON_LEAVE' THEN 2 WHEN 'SUSPENDED' THEN 3 ELSE 4 END, a.full_name
            """, p, (rs, i) -> agentSummary(rs));
    }

    private FieldTeamDtos.AgentSummary agentSummary(ResultSet rs) throws SQLException {
        long reviewed = rs.getLong("reviewed90");
        Double acceptance = reviewed == 0 ? null : Math.round(rs.getLong("verified90") * 1000.0 / reviewed) / 10.0;
        Integer hw = (Integer) rs.getObject("hw_id");
        FieldTeamDtos.WeredaLite home = hw == null ? null : new FieldTeamDtos.WeredaLite(hw, new GeoDtos.LocalizedName(rs.getString("hw_en"), rs.getString("hw_ti"), rs.getString("hw_am")),
            rs.getShort("hz_id"), new GeoDtos.LocalizedName(rs.getString("hz_en"), rs.getString("hz_ti"), rs.getString("hz_am")));
        Timestamp sync = rs.getTimestamp("last_sync");
        return new FieldTeamDtos.AgentSummary(rs.getLong("id"), rs.getString("code"), rs.getString("full_name"), AgentType.valueOf(rs.getString("agent_type")),
            AgentStatus.valueOf(rs.getString("status")), rs.getString("phone"), rs.getString("email"), rs.getString("org_name"), home,
            rs.getInt("cov_n"), strings(rs.getArray("zones")), sectors(rs.getString("sectors")), rs.getInt("active"), rs.getInt("max_active_assignments"),
            rs.getInt("overdue"), rs.getInt("n30"), acceptance, date(rs, "last_visit"), sync == null ? null : sync.toInstant(),
            rs.getObject("user_id") != null, rs.getString("username"),
            rs.getObject("training_completed_on") != null && rs.getObject("code_of_conduct_signed_on") != null, date(rs, "contract_end"), rs.getString("sup_name"));
    }

    public record AssignmentFilter(Long agentId, Long projectId, AssignmentStatus status, Boolean overdueOnly, Long id, Sector sector) {}

    public List<FieldTeamDtos.AssignmentDto> assignments(AssignmentFilter f) {
        MapSqlParameterSource p = new MapSqlParameterSource()
            .addValue("agentId", f.agentId(), Types.BIGINT).addValue("projectId", f.projectId(), Types.BIGINT).addValue("id", f.id(), Types.BIGINT)
            .addValue("status", f.status() == null ? null : f.status().name(), Types.VARCHAR)
            .addValue("sector", f.sector() == null ? null : f.sector().name(), Types.VARCHAR)
            .addValue("overdue", Boolean.TRUE.equals(f.overdueOnly()));
        return jdbc.query("WITH " + ASSIGNMENT_VISITS + """
            SELECT av.*, a.code a_code, a.full_name a_name, a.agent_type a_type, a.status a_status,
                   p.code p_code, p.name p_name, p.sector, p.lifecycle_stage, p.status p_status, p.health, p.approval_status, p.risk_score,
                   w.name_en w_name, z.name_en z_name
            FROM av JOIN field_agent a ON a.id = av.agent_id JOIN project p ON p.id = av.project_id
            JOIN wereda w ON w.id = p.wereda_id JOIN zone z ON z.id = w.zone_id
            WHERE (CAST(:id AS bigint) IS NULL OR av.id = :id)
              AND (CAST(:agentId AS bigint) IS NULL OR av.agent_id = :agentId)
              AND (CAST(:projectId AS bigint) IS NULL OR av.project_id = :projectId)
              AND (CAST(:status AS varchar) IS NULL OR av.status = :status)
              AND (CAST(:sector AS varchar) IS NULL OR p.sector = :sector)
              AND (NOT :overdue OR av.overdue_days IS NOT NULL)
            ORDER BY CASE av.status WHEN 'ACTIVE' THEN 0 ELSE 1 END, av.overdue_days DESC NULLS LAST,
                     CASE av.assignment_role WHEN 'LEAD' THEN 0 WHEN 'FIELD_ANALYST' THEN 1 WHEN 'VERIFIER' THEN 2 ELSE 3 END, av.next_due, av.assigned_at DESC
            """, p, (rs, i) -> assignment(rs));
    }

    private FieldTeamDtos.AssignmentDto assignment(ResultSet rs) throws SQLException {
        var project = new FieldTeamDtos.ProjectRef(rs.getLong("project_id"), rs.getString("p_code"), rs.getString("p_name"), Sector.valueOf(rs.getString("sector")),
            rs.getString("w_name"), rs.getString("z_name"), LifecycleStage.valueOf(rs.getString("lifecycle_stage")), ProjectStatus.valueOf(rs.getString("p_status")),
            ProjectHealth.valueOf(rs.getString("health")), ApprovalStatus.valueOf(rs.getString("approval_status")), (Short) shortOrNull(rs, "risk_score"));
        var agent = new FieldTeamDtos.AgentRef(rs.getLong("agent_id"), rs.getString("a_code"), rs.getString("a_name"), AgentType.valueOf(rs.getString("a_type")), AgentStatus.valueOf(rs.getString("a_status")));
        Timestamp closed = rs.getTimestamp("closed_at");
        boolean active = "ACTIVE".equals(rs.getString("status"));
        return new FieldTeamDtos.AssignmentDto(rs.getLong("id"), project, agent, AssignmentRole.valueOf(rs.getString("assignment_role")),
            AssignmentStatus.valueOf(rs.getString("status")), AssignmentPriority.valueOf(rs.getString("priority")), date(rs, "start_on"), date(rs, "end_on"),
            rs.getInt("visit_frequency_days"), jsonStrings(rs.getString("required_inspection_types")), rs.getString("instructions"), rs.getString("override_note"),
            rs.getString("assigned_by_name"), rs.getTimestamp("assigned_at").toInstant(), rs.getLong("visits"), date(rs, "last_visit"),
            active ? date(rs, "next_due") : null, (Integer) rs.getObject("overdue_days"), closed == null ? null : closed.toInstant(),
            rs.getString("closed_by_name"), rs.getString("close_reason"));
    }

    public FieldTeamDtos.Performance performance(Long userId, Long agentId) {
        MapSqlParameterSource p = new MapSqlParameterSource().addValue("uid", userId, Types.BIGINT).addValue("agentId", agentId);
        var r = jdbc.queryForMap("""
            SELECT count(*) total,
                   count(*) FILTER (WHERE visited_on > current_date - 30) n30,
                   count(*) FILTER (WHERE visited_on > current_date - 90) n90,
                   count(*) FILTER (WHERE visited_on > current_date - 90 AND verification_status = 'VERIFIED') v90,
                   count(*) FILTER (WHERE visited_on > current_date - 90 AND verification_status = 'DISPUTED') d90,
                   count(*) FILTER (WHERE visited_on > current_date - 90 AND verification_status = 'REJECTED') r90,
                   avg(distance_from_site_m) FILTER (WHERE visited_on > current_date - 90) dist,
                   avg(gps_accuracy_m) FILTER (WHERE visited_on > current_date - 90) acc
            FROM field_inspection WHERE CAST(:uid AS bigint) IS NOT NULL AND inspector_user_id = :uid
            """, p);
        long reviewed = num(r.get("v90")) + num(r.get("d90")) + num(r.get("r90"));
        // Share of closed or overdue cadence windows that were met: visits on time divided by visits due so far.
        var sched = jdbc.queryForMap("WITH " + ASSIGNMENT_VISITS + """
            SELECT coalesce(sum(LEAST(visits, GREATEST(1, (LEAST(current_date, coalesce(closed_at::date, current_date)) - start_on) / visit_frequency_days))), 0) met,
                   coalesce(sum(GREATEST(1, (LEAST(current_date, coalesce(closed_at::date, current_date)) - start_on) / visit_frequency_days)), 0) due
            FROM av WHERE agent_id = :agentId AND start_on + visit_frequency_days <= current_date
            """, p);
        long due = num(sched.get("due"));
        List<FieldTeamDtos.MonthCount> monthly = jdbc.query("""
            SELECT to_char(m, 'YYYY-MM') ym, (SELECT count(*) FROM field_inspection fi WHERE CAST(:uid AS bigint) IS NOT NULL AND fi.inspector_user_id = :uid
                                                  AND date_trunc('month', fi.visited_on) = m) n
            FROM generate_series(date_trunc('month', current_date) - interval '5 months', date_trunc('month', current_date), interval '1 month') m ORDER BY m
            """, p, (rs, i) -> new FieldTeamDtos.MonthCount(rs.getString("ym"), rs.getLong("n")));
        return new FieldTeamDtos.Performance(num(r.get("total")), num(r.get("n30")), num(r.get("n90")), num(r.get("v90")), num(r.get("d90")), num(r.get("r90")),
            reviewed == 0 ? null : Math.round(num(r.get("v90")) * 1000.0 / reviewed) / 10.0, round(r.get("dist")), round(r.get("acc")),
            due == 0 ? null : Math.round(Math.min(1.0, num(sched.get("met")) / (double) due) * 1000) / 10.0, monthly);
    }

    public List<FieldTeamDtos.RecentInspection> recentInspections(Long userId) {
        if (userId == null) return List.of();
        return jdbc.query("""
            SELECT fi.id, fi.visited_on, fi.inspection_type, fi.project_id, coalesce(p.name, f.name) subject, fi.verification_status, fi.distance_from_site_m
            FROM field_inspection fi LEFT JOIN project p ON p.id = fi.project_id LEFT JOIN facility f ON f.id = fi.facility_id
            WHERE fi.inspector_user_id = :uid ORDER BY fi.visited_on DESC, fi.id DESC LIMIT 12
            """, new MapSqlParameterSource("uid", userId), (rs, i) -> new FieldTeamDtos.RecentInspection(rs.getLong("id"), date(rs, "visited_on"),
                InspectionType.valueOf(rs.getString("inspection_type")), (Long) rs.getObject("project_id"), rs.getString("subject"),
                VerificationStatus.valueOf(rs.getString("verification_status")), rs.getObject("distance_from_site_m") == null ? null : rs.getDouble("distance_from_site_m")));
    }

    /** Facts about every active member relative to one project, used for ranking and for assignment checks. */
    public record CandidateFacts(long agentId, boolean coversWereda, boolean coversZone, boolean sectorMatch, Double distanceKm, boolean alreadyAssigned, boolean conflict) {}

    public Map<Long, CandidateFacts> candidateFacts(Long projectId) {
        Map<Long, CandidateFacts> out = new LinkedHashMap<>();
        jdbc.query("""
            SELECT a.id,
                   EXISTS (SELECT 1 FROM field_agent_coverage c WHERE c.agent_id = a.id AND c.wereda_id = p.wereda_id) covers_wereda,
                   EXISTS (SELECT 1 FROM field_agent_coverage c JOIN wereda w ON w.id = c.wereda_id WHERE c.agent_id = a.id AND w.zone_id = pw.zone_id) covers_zone,
                   a.sectors @> jsonb_build_array(p.sector) sector_match,
                   CASE WHEN hw.id IS NULL OR p.location IS NULL THEN NULL ELSE ST_Distance(hw.centroid::geography, p.location::geography) / 1000.0 END km,
                   EXISTS (SELECT 1 FROM project_assignment pa WHERE pa.agent_id = a.id AND pa.project_id = p.id AND pa.status = 'ACTIVE') already,
                   (a.organization_id IS NOT NULL AND (
                        EXISTS (SELECT 1 FROM project_organization po WHERE po.project_id = p.id AND po.organization_id = a.organization_id AND po.role = 'CONTRACTOR')
                        OR lower(coalesce(o.name, '')) = lower(coalesce(p.contractor_name, '#')))) conflict
            FROM field_agent a JOIN project p ON p.id = :pid JOIN wereda pw ON pw.id = p.wereda_id
            LEFT JOIN wereda hw ON hw.id = a.home_wereda_id LEFT JOIN organization o ON o.id = a.organization_id
            """, new MapSqlParameterSource("pid", projectId), rs -> {
                out.put(rs.getLong("id"), new CandidateFacts(rs.getLong("id"), rs.getBoolean("covers_wereda"), rs.getBoolean("covers_zone"), rs.getBoolean("sector_match"),
                    rs.getObject("km") == null ? null : Math.round(rs.getDouble("km") * 10) / 10.0, rs.getBoolean("already"), rs.getBoolean("conflict")));
            });
        return out;
    }

    public FieldTeamDtos.TeamSummary summary(Sector sector) {
        MapSqlParameterSource p = new MapSqlParameterSource().addValue("sector", sector == null ? null : sector.name(), Types.VARCHAR);
        var a = jdbc.queryForMap("WITH " + ASSIGNMENT_VISITS + """
            , act AS (SELECT agent_id, count(*) n FROM project_assignment WHERE status = 'ACTIVE' GROUP BY agent_id)
            SELECT count(*) total,
                   count(*) FILTER (WHERE fa.status = 'ACTIVE') active,
                   count(*) FILTER (WHERE fa.status = 'PENDING_ONBOARDING') pending,
                   count(*) FILTER (WHERE fa.status = 'ON_LEAVE') leave,
                   count(*) FILTER (WHERE fa.status = 'SUSPENDED') suspended,
                   count(*) FILTER (WHERE fa.status = 'ACTIVE' AND fa.agent_type = 'DATA_COLLECTOR') t_dc,
                   count(*) FILTER (WHERE fa.status = 'ACTIVE' AND fa.agent_type = 'FIELD_ANALYST') t_fa,
                   count(*) FILTER (WHERE fa.status = 'ACTIVE' AND fa.agent_type = 'FIELD_SUPERVISOR') t_fs,
                   coalesce(sum(GREATEST(0, fa.max_active_assignments - coalesce(act.n, 0))) FILTER (WHERE fa.status = 'ACTIVE'), 0) slots,
                   count(*) FILTER (WHERE fa.status = 'ACTIVE' AND coalesce(act.n, 0) >= fa.max_active_assignments) at_cap,
                   count(*) FILTER (WHERE fa.status IN ('ACTIVE', 'ON_LEAVE') AND fa.contract_end BETWEEN current_date AND current_date + 30) ending,
                   count(*) FILTER (WHERE fa.status = 'ACTIVE' AND fa.user_id IS NULL) no_account,
                   (SELECT count(*) FROM av JOIN project p ON p.id = av.project_id WHERE av.status = 'ACTIVE' AND (CAST(:sector AS varchar) IS NULL OR p.sector = :sector)) assignments,
                   (SELECT count(*) FROM av JOIN project p ON p.id = av.project_id WHERE av.overdue_days IS NOT NULL AND (CAST(:sector AS varchar) IS NULL OR p.sector = :sector)) overdue
            FROM field_agent fa LEFT JOIN act ON act.agent_id = fa.id
            """, p);
        var c = jdbc.queryForMap("""
            SELECT count(*) needs,
                   count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM project_assignment pa WHERE pa.project_id = p.id AND pa.status = 'ACTIVE')) no_team,
                   count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM project_assignment pa WHERE pa.project_id = p.id AND pa.status = 'ACTIVE' AND pa.assignment_role = 'LEAD')) no_lead
            FROM project p WHERE p.approval_status = 'APPROVED' AND p.status IN ('ACTIVE', 'SUSPENDED') AND (CAST(:sector AS varchar) IS NULL OR p.sector = :sector)
            """, p);
        long needs = num(c.get("needs")), noTeam = num(c.get("no_team"));
        Map<String, Long> byType = new LinkedHashMap<>();
        byType.put("DATA_COLLECTOR", num(a.get("t_dc"))); byType.put("FIELD_ANALYST", num(a.get("t_fa"))); byType.put("FIELD_SUPERVISOR", num(a.get("t_fs")));
        return new FieldTeamDtos.TeamSummary(num(a.get("total")), num(a.get("active")), num(a.get("pending")), num(a.get("leave")), num(a.get("suspended")), byType,
            num(a.get("assignments")), num(a.get("overdue")), needs, noTeam, num(c.get("no_lead")),
            needs == 0 ? null : Math.round((needs - noTeam) * 1000.0 / needs) / 10.0, num(a.get("slots")), num(a.get("at_cap")), num(a.get("ending")), num(a.get("no_account")));
    }

    /** Approved projects that are not finished, with their team and the most pressing coverage gap. */
    public List<FieldTeamDtos.CoverageRow> coverage(Sector sector, Short zoneId, boolean gapsOnly) {
        MapSqlParameterSource p = new MapSqlParameterSource().addValue("sector", sector == null ? null : sector.name(), Types.VARCHAR).addValue("zoneId", zoneId, Types.SMALLINT);
        List<FieldTeamDtos.ProjectRef> projects = new ArrayList<>();
        Map<Long, Object[]> facts = new HashMap<>();
        jdbc.query("""
            SELECT p.id, p.code, p.name, p.sector, p.lifecycle_stage, p.status, p.health, p.approval_status, p.risk_score, p.last_verified_at, w.name_en w_name, z.name_en z_name
            FROM project p JOIN wereda w ON w.id = p.wereda_id JOIN zone z ON z.id = w.zone_id
            WHERE p.approval_status = 'APPROVED' AND p.status NOT IN ('COMPLETED', 'CANCELLED')
              AND (CAST(:sector AS varchar) IS NULL OR p.sector = :sector) AND (CAST(:zoneId AS smallint) IS NULL OR w.zone_id = :zoneId)
            ORDER BY p.risk_score DESC NULLS LAST, p.name
            """, p, rs -> {
                var ref = new FieldTeamDtos.ProjectRef(rs.getLong("id"), rs.getString("code"), rs.getString("name"), Sector.valueOf(rs.getString("sector")), rs.getString("w_name"), rs.getString("z_name"),
                    LifecycleStage.valueOf(rs.getString("lifecycle_stage")), ProjectStatus.valueOf(rs.getString("status")), ProjectHealth.valueOf(rs.getString("health")),
                    ApprovalStatus.valueOf(rs.getString("approval_status")), (Short) shortOrNull(rs, "risk_score"));
                projects.add(ref);
                Timestamp v = rs.getTimestamp("last_verified_at");
                facts.put(ref.id(), new Object[]{v == null ? null : v.toInstant()});
            });
        Map<Long, List<FieldTeamDtos.AssignmentDto>> team = new HashMap<>();
        for (var a : assignments(new AssignmentFilter(null, null, AssignmentStatus.ACTIVE, false, null, sector))) team.computeIfAbsent(a.project().id(), k -> new ArrayList<>()).add(a);
        List<FieldTeamDtos.CoverageRow> rows = new ArrayList<>();
        LocalDate today = LocalDate.now();
        for (var pr : projects) {
            List<FieldTeamDtos.AssignmentDto> t = team.getOrDefault(pr.id(), List.of());
            boolean needs = pr.status() == ProjectStatus.ACTIVE || pr.status() == ProjectStatus.SUSPENDED;
            int overdue = (int) t.stream().filter(x -> x.overdueDays() != null).count();
            boolean lead = t.stream().anyMatch(x -> x.role() == AssignmentRole.LEAD);
            boolean verifier = t.stream().anyMatch(x -> x.role() == AssignmentRole.VERIFIER || x.role() == AssignmentRole.FIELD_ANALYST);
            String gap = t.isEmpty() ? (needs ? "NO_TEAM" : "NOT_STARTED") : !lead ? "NO_LEAD" : overdue > 0 ? "OVERDUE" : needs && !verifier ? "NO_VERIFIER" : "OK";
            if (gapsOnly && (gap.equals("OK") || gap.equals("NOT_STARTED"))) continue;
            java.time.Instant verified = (java.time.Instant) facts.get(pr.id())[0];
            Integer days = verified == null ? null : (int) java.time.temporal.ChronoUnit.DAYS.between(verified.atZone(java.time.ZoneOffset.UTC).toLocalDate(), today);
            rows.add(new FieldTeamDtos.CoverageRow(pr, verified, days, needs, gap, t, overdue));
        }
        List<String> order = List.of("NO_TEAM", "NO_LEAD", "OVERDUE", "NO_VERIFIER", "NOT_STARTED", "OK");
        rows.sort(Comparator.comparingInt((FieldTeamDtos.CoverageRow r) -> order.indexOf(r.gap())));
        return rows;
    }

    // ── helpers ──────────────────────────────────────────────────────────
    private static long num(Object o) { return o == null ? 0 : ((Number) o).longValue(); }
    private static Double round(Object o) { return o == null ? null : Math.round(((Number) o).doubleValue() * 10) / 10.0; }
    private static LocalDate date(ResultSet rs, String c) throws SQLException { var d = rs.getDate(c); return d == null ? null : d.toLocalDate(); }
    private static Object shortOrNull(ResultSet rs, String c) throws SQLException { Object o = rs.getObject(c); return o == null ? null : ((Number) o).shortValue(); }
    private static List<String> strings(Array a) throws SQLException { return a == null ? List.of() : Arrays.stream((Object[]) a.getArray()).map(String::valueOf).sorted().toList(); }
    private static List<Sector> sectors(String json) { return jsonStrings(json).stream().map(Sector::valueOf).toList(); }
    static List<String> jsonStrings(String json) {
        if (json == null || json.isBlank() || json.equals("[]")) return List.of();
        return Arrays.stream(json.replaceAll("[\\[\\]\" ]", "").split(",")).filter(s -> !s.isEmpty()).toList();
    }
}
