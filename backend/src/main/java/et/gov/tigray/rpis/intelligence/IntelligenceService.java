package et.gov.tigray.rpis.intelligence;

import et.gov.tigray.rpis.alert.AlertDtos;
import et.gov.tigray.rpis.alert.AlertService;
import et.gov.tigray.rpis.analytics.AnalyticsController;
import et.gov.tigray.rpis.common.Enums.*;
import et.gov.tigray.rpis.common.Sector;
import et.gov.tigray.rpis.common.SqlParams;
import et.gov.tigray.rpis.config.RpisProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.time.Instant;
import java.util.*;

/**
 * Executive decision support. Synthesises alerts, insights and read models into:
 * early-warning signals → action cards ("what requires my decision") → comparisons → priorities → risk register.
 * Every figure is traceable to recorded data; nothing here is predictive beyond the labelled rule-based insights.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class IntelligenceService {
    private final NamedParameterJdbcTemplate jdbc;
    private final AlertService alerts;
    private final RpisProperties props;

    private static final String SCOPE_P = " AND (:sector IS NULL OR p.sector = :sector) AND (:weredaId IS NULL OR p.wereda_id = :weredaId) AND (:zoneId IS NULL OR p.wereda_id IN (SELECT id FROM wereda WHERE zone_id = :zoneId)) ";
    private static final String SCOPE_F = " AND (:sector IS NULL OR f.sector = :sector) AND (:weredaId IS NULL OR f.wereda_id = :weredaId) AND (:zoneId IS NULL OR f.wereda_id IN (SELECT id FROM wereda WHERE zone_id = :zoneId)) ";

    @Cacheable(cacheNames = "briefing", key = "#sector + ':' + #zoneId")
    public IntelligenceDtos.Briefing briefing(Sector sector, Short zoneId) {
        var p = SqlParams.scope(sector, zoneId, null).addValue("staleDays", props.getMedia().getEvidenceStaleDays(), Types.INTEGER);
        return new IntelligenceDtos.Briefing(Instant.now(), sector, zoneId, signals(p), actions(sector, zoneId, p), sectorComparison(p), zoneComparison(p),
            contractors(p), fundingPriorities(p), riskRegister(p, 12), AnalyticsController.DISCLAIMER);
    }

    // ── signals ───────────────────────────────────────────────────────────
    List<IntelligenceDtos.Signal> signals(MapSqlParameterSource p) {
        Map<String, Object> r = jdbc.queryForMap("""
            SELECT
              (SELECT count(*) FROM project p WHERE p.status = 'ACTIVE' %1$s) active,
              (SELECT count(*) FROM project p WHERE p.status = 'ACTIVE' AND p.last_progress_report_at > now() - interval '14 days' %1$s) reported14,
              (SELECT count(*) FROM project p WHERE p.status = 'ACTIVE' AND p.last_verified_at > now() - (:staleDays || ' days')::interval %1$s) verified_recent,
              (SELECT coalesce(sum(d.amount_etb),0) FROM disbursement d JOIN project p ON p.id = d.project_id WHERE d.released_date IS NULL AND d.planned_date < current_date AND p.status = 'ACTIVE' %1$s) lag_etb,
              (SELECT count(DISTINCT d.project_id) FROM disbursement d JOIN project p ON p.id = d.project_id WHERE d.released_date IS NULL AND d.planned_date < current_date AND p.status = 'ACTIVE' %1$s) lag_projects,
              (SELECT coalesce(sum(GREATEST(0, (SELECT f.forecast_cost_etb FROM project_forecast f WHERE f.project_id = p.id ORDER BY f.computed_at DESC LIMIT 1) - p.total_budget_etb)),0) FROM project p WHERE p.status = 'ACTIVE' %1$s) cost_exposure,
              (SELECT count(*) FROM project p WHERE p.status = 'ACTIVE' AND p.forecast_end > coalesce(p.revised_end, p.planned_end) + 60 %1$s) slip60,
              (SELECT count(*) FROM facility f WHERE f.latest_severity IN ('SEVERE','DESTROYED') AND NOT EXISTS (SELECT 1 FROM project_facility pf WHERE pf.facility_id = f.id) %2$s) unaddressed,
              (SELECT coalesce(sum(f.beneficiaries),0) FROM facility f WHERE f.latest_severity IN ('SEVERE','DESTROYED') AND NOT EXISTS (SELECT 1 FROM project_facility pf WHERE pf.facility_id = f.id) %2$s) unaddressed_benef,
              (SELECT count(*) FROM alert a WHERE a.status IN ('OPEN','ACKNOWLEDGED') AND a.decision_required AND a.triggered_at < now() - interval '72 hours'
                 AND (:sector IS NULL OR a.sector = :sector) AND (:zoneId IS NULL OR a.wereda_id IN (SELECT id FROM wereda WHERE zone_id = :zoneId))) backlog,
              (SELECT count(*) FROM analytics_insight i WHERE i.kind = 'ANOMALY' AND i.status = 'ACTIVE' AND (:sector IS NULL OR i.sector = :sector)
                 AND (:zoneId IS NULL OR i.wereda_id IN (SELECT id FROM wereda WHERE zone_id = :zoneId))) anomalies,
              (SELECT count(*) FROM project p WHERE p.status = 'ACTIVE' AND p.risk_score >= 50 %1$s) high_risk,
              (SELECT max(x) FROM (SELECT max(a.created_at) x FROM damage_assessment a JOIN facility f ON f.id = a.facility_id WHERE TRUE %2$s
                                   UNION ALL SELECT max(l.created_at) FROM progress_log l JOIN project p ON p.id = l.project_id WHERE TRUE %1$s
                                   UNION ALL SELECT max(i.created_at) FROM field_inspection i JOIN wereda w ON w.id = i.wereda_id WHERE (:zoneId IS NULL OR w.zone_id = :zoneId) AND (:weredaId IS NULL OR w.id = :weredaId)) s) last_field
            """.formatted(SCOPE_P, SCOPE_F), p);
        long active = n(r, "active");
        List<IntelligenceDtos.Signal> out = new ArrayList<>();
        double cov = active == 0 ? 100 : n(r, "reported14") * 100.0 / active;
        out.add(sig("REPORTING_COVERAGE", cov >= 80 ? AlertSeverity.LOW : cov >= 60 ? AlertSeverity.MEDIUM : AlertSeverity.HIGH, bd(cov, 0), "%", pct(cov),
            "Share of active projects with a site report in the last 14 days (" + n(r, "reported14") + " of " + active + ").", "/projects?status=ACTIVE&sort=lastProgressReportAt&dir=asc"));
        double vcov = active == 0 ? 100 : n(r, "verified_recent") * 100.0 / active;
        out.add(sig("VERIFICATION_COVERAGE", vcov >= 60 ? AlertSeverity.LOW : vcov >= 35 ? AlertSeverity.MEDIUM : AlertSeverity.HIGH, bd(vcov, 0), "%", pct(vcov),
            "Active projects with an independently verified inspection in the last " + props.getMedia().getEvidenceStaleDays() + " days (" + n(r, "verified_recent") + " of " + active + ").", "/evidence?status=UNVERIFIED"));
        BigDecimal lag = money(r, "lag_etb");
        out.add(sig("DISBURSEMENT_LAG", lag.signum() == 0 ? AlertSeverity.LOW : n(r, "lag_projects") >= 5 ? AlertSeverity.HIGH : AlertSeverity.MEDIUM, lag, "ETB", "ETB " + compact(lag),
            n(r, "lag_projects") + " active projects have tranches unreleased past their planned date.", "/finance"));
        BigDecimal exp = money(r, "cost_exposure");
        out.add(sig("COST_EXPOSURE", exp.signum() == 0 ? AlertSeverity.LOW : AlertSeverity.MEDIUM, exp, "ETB", "ETB " + compact(exp),
            "Forecast cost above budget across active projects (CPI projection).", "/finance"));
        out.add(sig("SCHEDULE_SLIP", n(r, "slip60") == 0 ? AlertSeverity.LOW : n(r, "slip60") >= 5 ? AlertSeverity.HIGH : AlertSeverity.MEDIUM, bd(n(r, "slip60"), 0), "projects", String.valueOf(n(r, "slip60")),
            "Active projects forecast to finish more than 60 days after their planned end.", "/projects?health=DELAYED&health=STALLED"));
        out.add(sig("UNADDRESSED_DAMAGE", n(r, "unaddressed") == 0 ? AlertSeverity.LOW : n(r, "unaddressed") >= 10 ? AlertSeverity.HIGH : AlertSeverity.MEDIUM, bd(n(r, "unaddressed"), 0), "facilities", String.valueOf(n(r, "unaddressed")),
            "Severely damaged or destroyed facilities without any reconstruction project; " + String.format("%,d", n(r, "unaddressed_benef")) + " beneficiaries affected.", "/facilities?severity=SEVERE"));
        out.add(sig("DECISION_BACKLOG", n(r, "backlog") == 0 ? AlertSeverity.LOW : n(r, "backlog") >= 5 ? AlertSeverity.HIGH : AlertSeverity.MEDIUM, bd(n(r, "backlog"), 0), "alerts", String.valueOf(n(r, "backlog")),
            "Decision-required alerts open for more than 72 hours without assignment or resolution.", "/alerts?decisionRequired=true"));
        out.add(sig("DATA_ANOMALIES", n(r, "anomalies") == 0 ? AlertSeverity.LOW : AlertSeverity.MEDIUM, bd(n(r, "anomalies"), 0), "projects", String.valueOf(n(r, "anomalies")),
            "Projects with flagged data anomalies (progress jumps, spend without progress, reported vs observed gaps).", "/intelligence?tab=insights&kind=ANOMALY"));
        double hr = active == 0 ? 0 : n(r, "high_risk") * 100.0 / active;
        out.add(sig("PORTFOLIO_RISK", hr >= 40 ? AlertSeverity.HIGH : hr >= 20 ? AlertSeverity.MEDIUM : AlertSeverity.LOW, bd(hr, 0), "%", pct(hr),
            n(r, "high_risk") + " of " + active + " active projects carry a high or critical composite risk score.", "/projects?minRiskScore=50&sort=riskScore&dir=desc"));
        java.sql.Timestamp lf = (java.sql.Timestamp) r.get("last_field");
        long hours = lf == null ? 999 : Math.max(0, java.time.Duration.between(lf.toInstant(), Instant.now()).toHours());
        out.add(sig("FIELD_DATA_FRESHNESS", hours <= 48 ? AlertSeverity.LOW : hours <= 168 ? AlertSeverity.MEDIUM : AlertSeverity.HIGH, bd(hours, 0), "h", hours < 48 ? hours + " h" : (hours / 24) + " d",
            "Time since the most recent field data (assessment, site report or inspection) reached the platform.", "/damage"));
        return out;
    }

    // ── action cards ──────────────────────────────────────────────────────
    List<IntelligenceDtos.Action> actions(Sector sector, Short zoneId, MapSqlParameterSource p) {
        List<IntelligenceDtos.Action> out = new ArrayList<>();
        List<AlertDtos.AlertSummary> queue = alerts.search(new AlertService.Filter(List.of(AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED), List.of(AlertSeverity.CRITICAL, AlertSeverity.HIGH), sector, null, zoneId, null, true),
            PageRequest.of(0, 12, Sort.by("severity").ascending().and(Sort.by("triggeredAt").ascending()))).getContent();
        int i = 0;
        for (AlertDtos.AlertSummary a : queue) {
            String kind, action;
            switch (a.rule()) {
                case DISBURSEMENT_LAG -> { kind = "FUNDING"; action = "Instruct the treasury / funder to release the tranche or approve bridge financing; record the decision on the alert."; }
                case SEVERE_DAMAGE_UNADDRESSED -> { kind = "FUNDING"; action = "Decide whether to open a reconstruction project or defer; assign the sector bureau to scope it."; }
                case STALLED_REPORTING -> { kind = "VERIFICATION"; action = "Commission a field verification visit and require the contractor to resume weekly reporting."; }
                case SCHEDULE_SLIPPAGE, MILESTONE_OVERDUE -> { kind = "DECISION"; action = "Request a time-bound recovery plan from the contractor and supervising engineer; consider re-baselining or contractual remedies."; }
                case COST_OVERRUN -> { kind = "REVIEW"; action = "Trigger a variation / cost audit before approving further interim payment certificates."; }
                case PROGRESS_DISCREPANCY -> { kind = "ESCALATION"; action = "Suspend acceptance of reported progress until a second inspection confirms the figures."; }
                default -> { kind = "DECISION"; action = "Review and record a decision on the alert."; }
            }
            List<IntelligenceDtos.Evidence> ev = new ArrayList<>();
            if (a.metrics() != null) a.metrics().forEach((k, v) -> { if (v != null && ev.size() < 4) ev.add(new IntelligenceDtos.Evidence(humanize(k), fmtMetric(k, v))); });
            out.add(new IntelligenceDtos.Action("alert-" + a.id(), ++i, kind, a.severity(), a.title(), a.detail(), ev, action, a.entityType(), a.entityId(), a.entityName(), a.entityCode(),
                a.sector(), a.weredaName(), a.id(), null, "RULE", a.ageHours()));
        }
        // Contractor concentration of delay
        List<IntelligenceDtos.ContractorPerformance> cs = contractors(p);
        for (var c : cs) {
            if (c.delayed() >= 2 && out.size() < 14) {
                out.add(new IntelligenceDtos.Action("contractor-" + c.contractor().hashCode(), ++i, "REVIEW", c.delayed() >= 3 ? AlertSeverity.HIGH : AlertSeverity.MEDIUM,
                    "Review contractor performance: " + c.contractor(),
                    c.delayed() + " of " + c.active() + " active projects delayed or stalled; portfolio variance " + c.avgVariancePp() + " pp, CPI " + c.avgCpi() + ".",
                    List.of(new IntelligenceDtos.Evidence("Active projects", String.valueOf(c.active())), new IntelligenceDtos.Evidence("Delayed", String.valueOf(c.delayed())),
                            new IntelligenceDtos.Evidence("Avg schedule variance", c.avgVariancePp() + " pp"), new IntelligenceDtos.Evidence("Portfolio budget", "ETB " + compact(c.budgetEtb()))),
                    "Convene a contractor performance review; consider capacity limits before awarding further contracts.", null, null, c.contractor(), null, null, null, null, null, "RULE", 0));
            }
        }
        // Top funding priorities (unaddressed damage) not already covered by an alert card
        for (var f : fundingPriorities(p).stream().limit(3).toList()) {
            boolean dup = out.stream().anyMatch(x -> x.entityType() == EntityType.FACILITY && Objects.equals(x.entityId(), f.facilityId()));
            if (dup) continue;
            out.add(new IntelligenceDtos.Action("priority-" + f.facilityId(), ++i, "FUNDING", f.priorityScore().doubleValue() >= 70 ? AlertSeverity.HIGH : AlertSeverity.MEDIUM,
                "Prioritise reconstruction funding: " + f.name(),
                String.format("%s facility serving %,d beneficiaries with no project; replacement estimate ETB %s.", f.severity().toLowerCase(), f.beneficiaries() == null ? 0 : f.beneficiaries(), compact(f.replacementEstimateEtb())),
                List.of(new IntelligenceDtos.Evidence("Priority score", f.priorityScore() + "/100"), new IntelligenceDtos.Evidence("Beneficiaries", String.format("%,d", f.beneficiaries() == null ? 0 : f.beneficiaries())),
                        new IntelligenceDtos.Evidence("Replacement estimate", "ETB " + compact(f.replacementEstimateEtb())), new IntelligenceDtos.Evidence("Damage", f.severity())),
                "Decide on inclusion in the next funding round; task the sector bureau with a scoping assessment.", EntityType.FACILITY, f.facilityId(), f.name(), f.code(), f.sector(), f.weredaName(), null, f.insightId(), "RULE", 0));
        }
        out.sort(Comparator.comparing((IntelligenceDtos.Action a) -> a.severity().ordinal()).thenComparing(a -> -a.ageHours()));
        List<IntelligenceDtos.Action> ranked = new ArrayList<>();
        for (int k = 0; k < Math.min(10, out.size()); k++) { var a = out.get(k); ranked.add(new IntelligenceDtos.Action(a.id(), k + 1, a.kind(), a.severity(), a.title(), a.rationale(), a.evidence(), a.suggestedAction(), a.entityType(), a.entityId(), a.entityName(), a.entityCode(), a.sector(), a.weredaName(), a.alertId(), a.insightId(), a.basis(), a.ageHours())); }
        return ranked;
    }

    // ── comparisons ───────────────────────────────────────────────────────
    private static final String UNIT_SQL = """
        SELECT %1$s AS k, %2$s AS label, max(%5$s) AS critical,
               count(*) FILTER (WHERE p.status = 'ACTIVE') active,
               count(*) FILTER (WHERE p.status = 'ACTIVE' AND p.health IN ('DELAYED','STALLED')) delayed,
               avg(p.schedule_variance_pp) FILTER (WHERE p.status = 'ACTIVE') var,
               avg(p.cpi) FILTER (WHERE p.status = 'ACTIVE') cpi,
               count(*) FILTER (WHERE p.status = 'ACTIVE' AND p.last_progress_report_at > now() - interval '14 days') rep14,
               count(*) FILTER (WHERE p.status = 'ACTIVE' AND p.last_verified_at > now() - (:staleDays || ' days')::interval) ver,
               sum(p.total_budget_etb) FILTER (WHERE p.status <> 'CANCELLED') budget,
               sum(p.disbursed_etb) FILTER (WHERE p.status <> 'CANCELLED') disbursed,
               avg(p.risk_score) FILTER (WHERE p.status = 'ACTIVE') risk
        FROM project p JOIN wereda w ON w.id = p.wereda_id JOIN zone z ON z.id = w.zone_id
        WHERE TRUE %4$s GROUP BY 1, 2 ORDER BY 2
        """;

    List<IntelligenceDtos.UnitComparison> sectorComparison(MapSqlParameterSource p) {
        String scope = SCOPE_P.replace(":sector IS NULL OR p.sector = :sector", "TRUE");
        return rank(jdbc.query(UNIT_SQL.formatted("p.sector", "p.sector", "", scope,
            "(SELECT count(*) FROM alert a WHERE a.severity = 'CRITICAL' AND a.status IN ('OPEN','ACKNOWLEDGED','ASSIGNED') AND a.sector = p.sector AND (:zoneId IS NULL OR a.wereda_id IN (SELECT id FROM wereda WHERE zone_id = :zoneId)))"), p, IntelligenceService::unit));
    }
    List<IntelligenceDtos.UnitComparison> zoneComparison(MapSqlParameterSource p) {
        String scope = SCOPE_P.replace(":zoneId IS NULL OR p.wereda_id IN (SELECT id FROM wereda WHERE zone_id = :zoneId)", "TRUE");
        return rank(jdbc.query(UNIT_SQL.formatted("z.id::text", "z.name_en", "", scope,
            "(SELECT count(*) FROM alert a WHERE a.severity = 'CRITICAL' AND a.status IN ('OPEN','ACKNOWLEDGED','ASSIGNED') AND a.wereda_id IN (SELECT id FROM wereda WHERE zone_id = z.id) AND (:sector IS NULL OR a.sector = :sector))"), p, IntelligenceService::unit));
    }
    private static IntelligenceDtos.UnitComparison unit(ResultSet rs, int i) throws SQLException {
        long active = rs.getLong("active");
        return new IntelligenceDtos.UnitComparison(rs.getString("k"), rs.getString("label"), active, rs.getLong("delayed"), s1(rs.getBigDecimal("var")), s2(rs.getBigDecimal("cpi")),
            bd(active == 0 ? 0 : rs.getLong("rep14") * 100.0 / active, 0), bd(active == 0 ? 0 : rs.getLong("ver") * 100.0 / active, 0),
            pctOf(rs.getBigDecimal("disbursed"), rs.getBigDecimal("budget")), s1(rs.getBigDecimal("risk")), rs.getLong("critical"), 0);
    }
    /** Rank by a composite of variance, CPI, reporting coverage and risk: 1 = best performing unit. */
    private static List<IntelligenceDtos.UnitComparison> rank(List<IntelligenceDtos.UnitComparison> rows) {
        List<IntelligenceDtos.UnitComparison> sorted = new ArrayList<>(rows);
        sorted.sort(Comparator.comparingDouble(u -> -perf(u)));
        List<IntelligenceDtos.UnitComparison> out = new ArrayList<>();
        for (int i = 0; i < sorted.size(); i++) { var u = sorted.get(i); out.add(new IntelligenceDtos.UnitComparison(u.key(), u.label(), u.projectsActive(), u.projectsDelayed(), u.avgVariancePp(), u.avgCpi(), u.reportingCoveragePct(), u.verifiedCoveragePct(), u.disbursementPct(), u.avgRiskScore(), u.criticalAlerts(), i + 1)); }
        out.sort(Comparator.comparing(IntelligenceDtos.UnitComparison::label));
        return out;
    }
    private static double perf(IntelligenceDtos.UnitComparison u) {
        if (u.projectsActive() == 0) return -1e9;
        return (u.avgVariancePp() == null ? 0 : u.avgVariancePp().doubleValue()) * 1.5 + (u.avgCpi() == null ? 0 : (u.avgCpi().doubleValue() - 1) * 50)
             + (u.reportingCoveragePct() == null ? 0 : u.reportingCoveragePct().doubleValue() * 0.3) - (u.avgRiskScore() == null ? 0 : u.avgRiskScore().doubleValue() * 0.5);
    }

    List<IntelligenceDtos.ContractorPerformance> contractors(MapSqlParameterSource p) {
        List<IntelligenceDtos.ContractorPerformance> rows = jdbc.query("""
            SELECT p.contractor_name c, count(*) n, count(*) FILTER (WHERE p.status = 'ACTIVE') active,
                   count(*) FILTER (WHERE p.status = 'ACTIVE' AND p.health IN ('DELAYED','STALLED')) delayed,
                   count(*) FILTER (WHERE p.status = 'COMPLETED') completed,
                   count(*) FILTER (WHERE p.status = 'COMPLETED' AND p.actual_end <= coalesce(p.revised_end, p.planned_end)) on_time,
                   avg(p.schedule_variance_pp) FILTER (WHERE p.status = 'ACTIVE') var, avg(p.cpi) FILTER (WHERE p.status IN ('ACTIVE','COMPLETED')) cpi,
                   sum(p.total_budget_etb) budget
            FROM project p WHERE p.contractor_name IS NOT NULL AND p.status <> 'CANCELLED' %s
            GROUP BY 1 ORDER BY delayed DESC, var ASC
            """.formatted(SCOPE_P), p, (rs, i) -> new IntelligenceDtos.ContractorPerformance(rs.getString("c"), rs.getLong("n"), rs.getLong("active"), rs.getLong("delayed"), rs.getLong("completed"),
                s1(rs.getBigDecimal("var")), s2(rs.getBigDecimal("cpi")), rs.getBigDecimal("budget"),
                rs.getLong("completed") == 0 ? null : bd(rs.getLong("on_time") * 100.0 / rs.getLong("completed"), 0), 0));
        List<IntelligenceDtos.ContractorPerformance> ranked = new ArrayList<>(rows);
        ranked.sort(Comparator.comparingDouble(c -> -((c.avgVariancePp() == null ? 0 : c.avgVariancePp().doubleValue()) + (c.avgCpi() == null ? 0 : (c.avgCpi().doubleValue() - 1) * 50) - c.delayed() * 5)));
        List<IntelligenceDtos.ContractorPerformance> out = new ArrayList<>();
        for (int i = 0; i < ranked.size(); i++) { var c = ranked.get(i); out.add(new IntelligenceDtos.ContractorPerformance(c.contractor(), c.projects(), c.active(), c.delayed(), c.completed(), c.avgVariancePp(), c.avgCpi(), c.budgetEtb(), c.onTimeRatePct(), i + 1)); }
        return out;
    }

    List<IntelligenceDtos.FundingPriority> fundingPriorities(MapSqlParameterSource p) {
        return jdbc.query("""
            SELECT f.id, f.code, f.name, f.sector, f.facility_type, w.name_en wereda, f.latest_severity, a.structural_impact_score impact, f.beneficiaries, f.replacement_estimate_etb,
                   i.id insight_id, i.score, i.explanation::text expl
            FROM facility f JOIN wereda w ON w.id = f.wereda_id LEFT JOIN damage_assessment a ON a.id = f.latest_assessment_id
            LEFT JOIN analytics_insight i ON i.kind = 'FUNDING_PRIORITY' AND i.entity_type = 'FACILITY' AND i.entity_id = f.id AND i.status = 'ACTIVE'
            WHERE f.latest_severity IN ('SEVERE','DESTROYED') AND NOT EXISTS (SELECT 1 FROM project_facility pf WHERE pf.facility_id = f.id) %s
            ORDER BY i.score DESC NULLS LAST, f.beneficiaries DESC NULLS LAST LIMIT 15
            """.formatted(SCOPE_F), p, (rs, i) -> new IntelligenceDtos.FundingPriority(rs.getLong("id"), rs.getString("code"), rs.getString("name"), Sector.valueOf(rs.getString("sector")), rs.getString("facility_type"),
                rs.getString("wereda"), rs.getString("latest_severity"), (Integer) rs.getObject("impact"), (Integer) rs.getObject("beneficiaries"), rs.getBigDecimal("replacement_estimate_etb"),
                rs.getBigDecimal("score") == null ? BigDecimal.ZERO : rs.getBigDecimal("score"), (Long) rs.getObject("insight_id"), json(rs.getString("expl"))));
    }

    public List<IntelligenceDtos.RiskEntry> riskRegister(MapSqlParameterSource p, int limit) {
        var q = SqlParams.copy(p).addValue("limit", limit, Types.INTEGER);
        return jdbc.query("""
            SELECT p.id, p.code, p.name, p.sector, w.name_en wereda, p.status, p.health, p.risk_score, p.schedule_variance_pp, p.cpi, p.total_budget_etb,
                   EXTRACT(DAY FROM now() - p.last_progress_report_at)::int since_report, EXTRACT(DAY FROM now() - p.last_verified_at)::int since_verified, p.risk_components::text comps
            FROM project p JOIN wereda w ON w.id = p.wereda_id
            WHERE p.risk_score IS NOT NULL AND p.status IN ('ACTIVE','SUSPENDED','PROCUREMENT','PLANNED') %s
            ORDER BY p.risk_score DESC, p.schedule_variance_pp ASC LIMIT :limit
            """.formatted(SCOPE_P), q, (rs, i) -> new IntelligenceDtos.RiskEntry(rs.getLong("id"), rs.getString("code"), rs.getString("name"), Sector.valueOf(rs.getString("sector")), rs.getString("wereda"),
                rs.getString("status"), rs.getString("health"), rs.getShort("risk_score"), et.gov.tigray.rpis.analytics.RiskScoringService.band(rs.getShort("risk_score")),
                rs.getBigDecimal("schedule_variance_pp"), rs.getBigDecimal("cpi"), (Integer) rs.getObject("since_report"), (Integer) rs.getObject("since_verified"), rs.getBigDecimal("total_budget_etb"), json(rs.getString("comps"))));
    }

    // ── helpers ───────────────────────────────────────────────────────────
    private static IntelligenceDtos.Signal sig(String code, AlertSeverity sev, BigDecimal value, String unit, String display, String explanation, String href) { return new IntelligenceDtos.Signal(code, sev, value, unit, display, null, explanation, href); }
    private static long n(Map<String, Object> r, String k) { Object v = r.get(k); return v == null ? 0 : ((Number) v).longValue(); }
    private static BigDecimal money(Map<String, Object> r, String k) { Object v = r.get(k); return v == null ? BigDecimal.ZERO : new BigDecimal(v.toString()); }
    private static BigDecimal bd(double v, int s) { return BigDecimal.valueOf(v).setScale(s, RoundingMode.HALF_UP); }
    private static BigDecimal bd(long v, int s) { return BigDecimal.valueOf(v).setScale(s, RoundingMode.HALF_UP); }
    private static BigDecimal s1(BigDecimal v) { return v == null ? null : v.setScale(1, RoundingMode.HALF_UP); }
    private static BigDecimal s2(BigDecimal v) { return v == null ? null : v.setScale(2, RoundingMode.HALF_UP); }
    private static BigDecimal pctOf(BigDecimal a, BigDecimal b) { return a == null || b == null || b.signum() == 0 ? null : a.multiply(BigDecimal.valueOf(100)).divide(b, 0, RoundingMode.HALF_UP); }
    private static String pct(double v) { return String.format("%.0f%%", v); }
    static String compact(BigDecimal v) {
        if (v == null) return "0";
        double d = v.doubleValue();
        if (Math.abs(d) >= 1e9) return String.format("%.2f B", d / 1e9);
        if (Math.abs(d) >= 1e6) return String.format("%.1f M", d / 1e6);
        if (Math.abs(d) >= 1e4) return String.format("%.0f K", d / 1e3);
        return String.format("%,.0f", d);
    }
    private static final Map<String, String> LABELS = Map.ofEntries(Map.entry("physicalPct", "Physical progress"), Map.entry("plannedPct", "Planned progress"), Map.entry("variancePp", "Schedule variance (pp)"),
        Map.entry("spi", "SPI"), Map.entry("cpi", "CPI"), Map.entry("overrunPct", "Projected overrun %"), Map.entry("expendedEtb", "Certified expenditure"), Map.entry("budgetEtb", "Budget"),
        Map.entry("daysSinceReport", "Days since site report"), Map.entry("daysSinceVerified", "Days since verified visit"), Map.entry("thresholdDays", "Threshold (days)"), Map.entry("milestone", "Milestone"),
        Map.entry("plannedDate", "Planned date"), Map.entry("overdueDays", "Days overdue"), Map.entry("tranche", "Tranche"), Map.entry("amountEtb", "Amount"), Map.entry("lagDays", "Days late"), Map.entry("fundingSource", "Funding source"),
        Map.entry("severity", "Damage"), Map.entry("replacementEstimateEtb", "Replacement estimate"), Map.entry("beneficiaries", "Beneficiaries"), Map.entry("reportedPct", "Reported progress"), Map.entry("observedPct", "Observed on site"), Map.entry("gapPp", "Gap (pp)"), Map.entry("visitedOn", "Inspected on"));
    private static String humanize(String k) { if (LABELS.containsKey(k)) return LABELS.get(k); String sp = k.replaceAll("([A-Z])", " $1"); return k.length() <= 3 ? k.toUpperCase() : sp.substring(0, 1).toUpperCase() + sp.substring(1); }
    private static String fmtMetric(String k, Object v) {
        if (v instanceof Number num) { if (k.toLowerCase().contains("etb")) return "ETB " + compact(new BigDecimal(num.toString())); if (k.toLowerCase().contains("pct")) return String.format("%.1f%%", num.doubleValue()); if (k.toLowerCase().endsWith("pp")) return String.format("%+.1f pp", num.doubleValue()); if (k.equals("spi") || k.equals("cpi")) return String.format("%.2f", num.doubleValue()); return num.toString(); }
        return String.valueOf(v);
    }
    @SuppressWarnings("unchecked")
    private static Map<String, Object> json(String s) {
        if (s == null) return Map.of();
        try { return new com.fasterxml.jackson.databind.ObjectMapper().readValue(s, LinkedHashMap.class); } catch (Exception e) { return Map.of(); }
    }
}
