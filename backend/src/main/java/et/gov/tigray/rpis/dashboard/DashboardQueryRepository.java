package et.gov.tigray.rpis.dashboard;

import et.gov.tigray.rpis.common.Sector;
import et.gov.tigray.rpis.project.ProjectDtos;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** Aggregation SQL behind the executive overview. Scoped by optional sector / zone / wereda. */
@Repository
@RequiredArgsConstructor
public class DashboardQueryRepository {
    private final NamedParameterJdbcTemplate jdbc;

    private static final String SCOPE_P = " AND (:sector IS NULL OR p.sector = :sector) AND (:weredaId IS NULL OR p.wereda_id = :weredaId) AND (:zoneId IS NULL OR p.wereda_id IN (SELECT id FROM wereda WHERE zone_id = :zoneId)) ";
    private static final String SCOPE_F = " AND (:sector IS NULL OR f.sector = :sector) AND (:weredaId IS NULL OR f.wereda_id = :weredaId) AND (:zoneId IS NULL OR f.wereda_id IN (SELECT id FROM wereda WHERE zone_id = :zoneId)) ";

    private static MapSqlParameterSource params(Sector sector, Short zoneId, Integer weredaId) {
        return et.gov.tigray.rpis.common.SqlParams.scope(sector, zoneId, weredaId);
    }

    public DashboardDtos.Kpis kpis(Sector sector, Short zoneId, Integer weredaId) {
        String sql = """
            SELECT
              (SELECT count(*) FROM project p WHERE p.status <> 'CANCELLED' %1$s) projects_total,
              (SELECT count(*) FROM project p WHERE p.status = 'ACTIVE' %1$s) projects_active,
              (SELECT count(*) FROM project p WHERE p.status = 'COMPLETED' %1$s) projects_completed,
              (SELECT count(*) FROM project p WHERE p.health = 'DELAYED' %1$s) projects_delayed,
              (SELECT count(*) FROM project p WHERE p.health = 'AT_RISK' %1$s) projects_at_risk,
              (SELECT count(*) FROM project p WHERE p.health = 'STALLED' %1$s) projects_stalled,
              (SELECT avg(physical_progress_pct) FROM project p WHERE p.status IN ('ACTIVE','COMPLETED') %1$s) avg_physical,
              (SELECT avg(planned_progress_pct) FROM project p WHERE p.status IN ('ACTIVE','COMPLETED') %1$s) avg_planned,
              (SELECT coalesce(sum(total_budget_etb),0) FROM project p WHERE p.status <> 'CANCELLED' %1$s) budget,
              (SELECT coalesce(sum(disbursed_etb),0) FROM project p WHERE p.status <> 'CANCELLED' %1$s) disbursed,
              (SELECT coalesce(sum(expended_etb),0) FROM project p WHERE p.status <> 'CANCELLED' %1$s) expended,
              (SELECT count(*) FROM facility f WHERE TRUE %2$s) facilities_total,
              (SELECT count(*) FROM facility f WHERE f.latest_severity IN ('SEVERE','DESTROYED') %2$s) facilities_severe,
              (SELECT count(*) FROM facility f WHERE f.operational_status = 'FUNCTIONAL' %2$s) facilities_functional,
              (SELECT count(DISTINCT pf.facility_id) FROM project_facility pf JOIN project p ON p.id = pf.project_id JOIN facility f ON f.id = pf.facility_id WHERE p.status = 'COMPLETED' %2$s) facilities_restored,
              (SELECT coalesce(sum(replacement_estimate_etb),0) FROM facility f WHERE f.latest_severity IN ('MODERATE','SEVERE','DESTROYED') %2$s) replacement_estimate,
              (SELECT coalesce(sum(beneficiaries),0) FROM project p WHERE p.status <> 'CANCELLED' %1$s) beneficiaries,
              (SELECT count(*) FROM damage_assessment a JOIN facility f ON f.id = a.facility_id WHERE a.created_at > now() - interval '7 days' %2$s) assessments_7d,
              (SELECT count(*) FROM progress_log l JOIN project p ON p.id = l.project_id WHERE l.created_at > now() - interval '7 days' %1$s) reports_7d,
              (SELECT max(a.created_at) FROM damage_assessment a JOIN facility f ON f.id = a.facility_id WHERE TRUE %2$s) last_field,
              (SELECT max(l.created_at) FROM progress_log l JOIN project p ON p.id = l.project_id WHERE TRUE %1$s) last_progress
            """.formatted(SCOPE_P, SCOPE_F);
        return jdbc.queryForObject(sql, params(sector, zoneId, weredaId), (rs, i) -> new DashboardDtos.Kpis(
            rs.getLong("projects_total"), rs.getLong("projects_active"), rs.getLong("projects_completed"), rs.getLong("projects_delayed"),
            rs.getLong("projects_at_risk"), rs.getLong("projects_stalled"), s1(rs.getBigDecimal("avg_physical")), s1(rs.getBigDecimal("avg_planned")),
            rs.getBigDecimal("budget"), rs.getBigDecimal("disbursed"), rs.getBigDecimal("expended"),
            rs.getLong("facilities_total"), rs.getLong("facilities_severe"), rs.getLong("facilities_functional"), rs.getLong("facilities_restored"),
            rs.getBigDecimal("replacement_estimate"), rs.getLong("beneficiaries"), rs.getLong("assessments_7d"), rs.getLong("reports_7d"),
            inst(rs.getTimestamp("last_field")), inst(rs.getTimestamp("last_progress"))));
    }

    public List<DashboardDtos.SectorSummary> sectors(Short zoneId, Integer weredaId) {
        String sql = """
            SELECT s.sector,
              (SELECT count(*) FROM project p WHERE p.sector = s.sector AND p.status <> 'CANCELLED' %1$s) projects_total,
              (SELECT count(*) FROM project p WHERE p.sector = s.sector AND p.status = 'ACTIVE' %1$s) projects_active,
              (SELECT count(*) FROM project p WHERE p.sector = s.sector AND p.status = 'COMPLETED' %1$s) projects_completed,
              (SELECT count(*) FROM project p WHERE p.sector = s.sector AND p.health IN ('DELAYED','STALLED') %1$s) projects_delayed,
              (SELECT avg(physical_progress_pct) FROM project p WHERE p.sector = s.sector AND p.status IN ('ACTIVE','COMPLETED') %1$s) avg_physical,
              (SELECT avg(planned_progress_pct) FROM project p WHERE p.sector = s.sector AND p.status IN ('ACTIVE','COMPLETED') %1$s) avg_planned,
              (SELECT coalesce(sum(total_budget_etb),0) FROM project p WHERE p.sector = s.sector AND p.status <> 'CANCELLED' %1$s) budget,
              (SELECT coalesce(sum(disbursed_etb),0) FROM project p WHERE p.sector = s.sector AND p.status <> 'CANCELLED' %1$s) disbursed,
              (SELECT coalesce(sum(expended_etb),0) FROM project p WHERE p.sector = s.sector AND p.status <> 'CANCELLED' %1$s) expended,
              (SELECT count(*) FROM facility f WHERE f.sector = s.sector %2$s) facilities_total,
              (SELECT count(*) FROM facility f WHERE f.sector = s.sector AND f.latest_severity IN ('SEVERE','DESTROYED') %2$s) facilities_severe,
              (SELECT count(*) FROM facility f WHERE f.sector = s.sector AND f.operational_status = 'FUNCTIONAL' %2$s) facilities_functional,
              (SELECT count(*) FROM alert a WHERE a.sector = s.sector AND a.status IN ('OPEN','ACKNOWLEDGED','ASSIGNED')
                  AND (:weredaId IS NULL OR a.wereda_id = :weredaId) AND (:zoneId IS NULL OR a.wereda_id IN (SELECT id FROM wereda WHERE zone_id = :zoneId))) open_alerts,
              (SELECT count(*) FROM alert a WHERE a.sector = s.sector AND a.severity = 'CRITICAL' AND a.status IN ('OPEN','ACKNOWLEDGED','ASSIGNED')
                  AND (:weredaId IS NULL OR a.wereda_id = :weredaId) AND (:zoneId IS NULL OR a.wereda_id IN (SELECT id FROM wereda WHERE zone_id = :zoneId))) critical_alerts
            FROM (VALUES ('EDUCATION'),('HEALTH'),('MANUFACTURING'),('AGRICULTURE')) AS s(sector)
            """.formatted(SCOPE_P.replace(":sector IS NULL OR p.sector = :sector", "TRUE"), SCOPE_F.replace(":sector IS NULL OR f.sector = :sector", "TRUE"));
        var p = params(null, zoneId, weredaId);
        return jdbc.query(sql, p, (rs, i) -> new DashboardDtos.SectorSummary(Sector.valueOf(rs.getString("sector")),
            rs.getLong("projects_total"), rs.getLong("projects_active"), rs.getLong("projects_completed"), rs.getLong("projects_delayed"),
            s1(rs.getBigDecimal("avg_physical")), s1(rs.getBigDecimal("avg_planned")), rs.getBigDecimal("budget"), rs.getBigDecimal("disbursed"), rs.getBigDecimal("expended"),
            rs.getLong("facilities_total"), rs.getLong("facilities_severe"), rs.getLong("facilities_functional"), rs.getLong("open_alerts"), rs.getLong("critical_alerts"),
            sparkline(Sector.valueOf(rs.getString("sector")), zoneId, weredaId)));
    }

    private List<BigDecimal> sparkline(Sector sector, Short zoneId, Integer weredaId) {
        String sql = """
            SELECT date_trunc('week', l.log_date)::date wk, avg(l.physical_progress_pct) v
            FROM progress_log l JOIN project p ON p.id = l.project_id
            WHERE l.log_date > current_date - interval '12 weeks' %s
            GROUP BY 1 ORDER BY 1
            """.formatted(SCOPE_P);
        List<BigDecimal> out = new ArrayList<>();
        jdbc.query(sql, params(sector, zoneId, weredaId), rs -> { out.add(s1(rs.getBigDecimal("v"))); });
        return out;
    }

    /** Monthly S-curve: planned vs actual mean progress across in-scope projects, plus cumulative money. */
    public List<DashboardDtos.TrendPoint> trend(Sector sector, Short zoneId, Integer weredaId, int months) {
        String sql = """
            WITH months AS (
              SELECT (date_trunc('month', current_date) - (n || ' months')::interval)::date m FROM generate_series(:months - 1, 0, -1) n),
            prog AS (
              SELECT date_trunc('month', l.log_date)::date m, avg(l.physical_progress_pct) actual, avg(l.planned_progress_pct) planned, count(*) reports
              FROM progress_log l JOIN project p ON p.id = l.project_id WHERE TRUE %1$s GROUP BY 1),
            disb AS (
              SELECT date_trunc('month', d.released_date)::date m, sum(d.amount_etb) amt
              FROM disbursement d JOIN project p ON p.id = d.project_id WHERE d.released_date IS NOT NULL %1$s GROUP BY 1),
            exp AS (
              SELECT date_trunc('month', e.period_end)::date m, sum(e.amount_etb) amt
              FROM expenditure e JOIN project p ON p.id = e.project_id WHERE TRUE %1$s GROUP BY 1)
            SELECT months.m, prog.planned, prog.actual, coalesce(prog.reports,0) reports,
                   sum(coalesce(disb.amt,0)) OVER (ORDER BY months.m) disb_cum,
                   sum(coalesce(exp.amt,0))  OVER (ORDER BY months.m) exp_cum
            FROM months LEFT JOIN prog ON prog.m = months.m LEFT JOIN disb ON disb.m = months.m LEFT JOIN exp ON exp.m = months.m
            ORDER BY months.m
            """.formatted(SCOPE_P);
        var p = params(sector, zoneId, weredaId).addValue("months", months, java.sql.Types.INTEGER);
        List<DashboardDtos.TrendPoint> out = jdbc.query(sql, p, (rs, i) -> new DashboardDtos.TrendPoint(rs.getDate("m").toLocalDate(),
            s1(rs.getBigDecimal("planned")), s1(rs.getBigDecimal("actual")), rs.getBigDecimal("disb_cum"), rs.getBigDecimal("exp_cum"), rs.getLong("reports")));
        // carry forward last known values for months without reports so the curve is continuous
        BigDecimal lastP = null, lastA = null;
        List<DashboardDtos.TrendPoint> filled = new ArrayList<>();
        for (var t : out) {
            if (t.plannedPct() != null) lastP = t.plannedPct();
            if (t.actualPct() != null) lastA = t.actualPct();
            filled.add(new DashboardDtos.TrendPoint(t.period(), lastP, lastA, t.disbursedCumulativeEtb(), t.expendedCumulativeEtb(), t.reports()));
        }
        return filled;
    }

    public List<DashboardDtos.FundingSlice> budgetBy(String column, Sector sector, Short zoneId, Integer weredaId) {
        if (!column.equals("sector") && !column.equals("funding_source") && !column.equals("status") && !column.equals("health")) throw new IllegalArgumentException(column);
        String sql = ("SELECT p.%s k, coalesce(sum(total_budget_etb),0) b, coalesce(sum(disbursed_etb),0) d, coalesce(sum(expended_etb),0) e, count(*) n " +
                      "FROM project p WHERE p.status <> 'CANCELLED' " + SCOPE_P + " GROUP BY 1 ORDER BY b DESC").formatted(column);
        return jdbc.query(sql, params(sector, zoneId, weredaId), (rs, i) -> new DashboardDtos.FundingSlice(rs.getString("k"), rs.getBigDecimal("b"), rs.getBigDecimal("d"), rs.getBigDecimal("e"), rs.getLong("n")));
    }

    public ProjectDtos.StatusCounts statusCounts(Sector sector, Short zoneId, Integer weredaId) {
        String sql = "SELECT status, count(*) n FROM project p WHERE TRUE " + SCOPE_P + " GROUP BY status";
        Map<String, Long> m = new java.util.HashMap<>();
        jdbc.query(sql, params(sector, zoneId, weredaId), rs -> { m.put(rs.getString("status"), rs.getLong("n")); });
        return new ProjectDtos.StatusCounts(m.getOrDefault("PLANNED", 0L), m.getOrDefault("PROCUREMENT", 0L), m.getOrDefault("ACTIVE", 0L),
            m.getOrDefault("SUSPENDED", 0L), m.getOrDefault("COMPLETED", 0L), m.getOrDefault("CANCELLED", 0L));
    }

    /** Unified "daily incident & progress stream": assessments, progress reports and alerts, newest first. */
    public List<DashboardDtos.StreamItem> stream(Sector sector, Short zoneId, Integer weredaId, int limit) {
        String sql = """
            SELECT * FROM (
              SELECT 'A' || a.id AS id, 'ASSESSMENT' kind, a.created_at occurred_at, f.name title,
                     'Damage assessed as ' || a.severity || ' (impact ' || a.structural_impact_score || '/100) by ' || a.assessor_name detail,
                     f.sector, 'FACILITY' entity_type, f.id entity_id, w.name_en wereda, a.severity sev, a.source src
              FROM damage_assessment a JOIN facility f ON f.id = a.facility_id JOIN wereda w ON w.id = f.wereda_id WHERE TRUE %2$s
              UNION ALL
              SELECT 'L' || l.id, 'PROGRESS', l.created_at, p.name,
                     'Progress ' || l.physical_progress_pct || '%% vs planned ' || l.planned_progress_pct || '%%' || coalesce(' · ' || l.notes, ''),
                     p.sector, 'PROJECT', p.id, w.name_en, p.health, l.source
              FROM progress_log l JOIN project p ON p.id = l.project_id JOIN wereda w ON w.id = p.wereda_id WHERE TRUE %1$s
              UNION ALL
              SELECT 'T' || al.id, 'ALERT', al.triggered_at, al.title, al.detail, al.sector, al.entity_type, al.entity_id, w.name_en, al.severity, 'RULE'
              FROM alert al LEFT JOIN wereda w ON w.id = al.wereda_id
              WHERE (:sector IS NULL OR al.sector = :sector) AND (:weredaId IS NULL OR al.wereda_id = :weredaId)
                AND (:zoneId IS NULL OR al.wereda_id IN (SELECT id FROM wereda WHERE zone_id = :zoneId))
            ) s ORDER BY occurred_at DESC LIMIT :limit
            """.formatted(SCOPE_P, SCOPE_F);
        var p = params(sector, zoneId, weredaId).addValue("limit", limit, java.sql.Types.INTEGER);
        return jdbc.query(sql, p, (rs, i) -> new DashboardDtos.StreamItem(rs.getString("id"), rs.getString("kind"), inst(rs.getTimestamp("occurred_at")),
            rs.getString("title"), rs.getString("detail"), rs.getString("sector") == null ? null : Sector.valueOf(rs.getString("sector")),
            rs.getString("entity_type"), rs.getLong("entity_id"), rs.getString("wereda"), rs.getString("sev"), Map.of("source", String.valueOf(rs.getString("src")))));
    }

    private static BigDecimal s1(BigDecimal v) { return v == null ? null : v.setScale(1, RoundingMode.HALF_UP); }
    private static Instant inst(Timestamp t) { return t == null ? null : t.toInstant(); }
}
