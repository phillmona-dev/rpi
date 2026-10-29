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
            contractors(p), projectFundingPriorities(p), fundingPriorities(p),
            riskRegister(p, 50).stream().filter(r -> r.riskScore() >= 25).toList(), AnalyticsController.DISCLAIMER);
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
            n(r, "reported14") + " of " + active + " projects under way sent a progress report in the last 14 days.", "/projects?status=ACTIVE&sort=lastProgressReportAt&dir=asc"));
        double vcov = active == 0 ? 100 : n(r, "verified_recent") * 100.0 / active;
        out.add(sig("VERIFICATION_COVERAGE", vcov >= 60 ? AlertSeverity.LOW : vcov >= 35 ? AlertSeverity.MEDIUM : AlertSeverity.HIGH, bd(vcov, 0), "%", pct(vcov),
            n(r, "verified_recent") + " of " + active + " projects under way had their progress checked on site in the last " + props.getMedia().getEvidenceStaleDays() + " days.", "/evidence?status=UNVERIFIED"));
        BigDecimal lag = money(r, "lag_etb");
        out.add(sig("DISBURSEMENT_LAG", lag.signum() == 0 ? AlertSeverity.LOW : n(r, "lag_projects") >= 5 ? AlertSeverity.HIGH : AlertSeverity.MEDIUM, lag, "ETB", "ETB " + compact(lag),
            n(r, "lag_projects") + " projects under way are waiting for payments that are past their due date.", "/finance"));
        BigDecimal exp = money(r, "cost_exposure");
        out.add(sig("COST_EXPOSURE", exp.signum() == 0 ? AlertSeverity.LOW : AlertSeverity.MEDIUM, exp, "ETB", "ETB " + compact(exp),
            "How much more than their budgets the projects under way are likely to cost, judging by spending so far.", "/finance"));
        out.add(sig("SCHEDULE_SLIP", n(r, "slip60") == 0 ? AlertSeverity.LOW : n(r, "slip60") >= 5 ? AlertSeverity.HIGH : AlertSeverity.MEDIUM, bd(n(r, "slip60"), 0), "projects", String.valueOf(n(r, "slip60")),
            "Projects under way expected to finish more than two months after their planned end.", "/projects?health=DELAYED&health=STALLED"));
        out.add(sig("UNADDRESSED_DAMAGE", n(r, "unaddressed") == 0 ? AlertSeverity.LOW : n(r, "unaddressed") >= 10 ? AlertSeverity.HIGH : AlertSeverity.MEDIUM, bd(n(r, "unaddressed"), 0), "facilities", String.valueOf(n(r, "unaddressed")),
            "Heavily damaged or destroyed facilities that no project covers yet; about " + String.format("%,d", n(r, "unaddressed_benef")) + " people are affected.", "/facilities?severity=SEVERE"));
        out.add(sig("DECISION_BACKLOG", n(r, "backlog") == 0 ? AlertSeverity.LOW : n(r, "backlog") >= 5 ? AlertSeverity.HIGH : AlertSeverity.MEDIUM, bd(n(r, "backlog"), 0), "alerts", String.valueOf(n(r, "backlog")),
            "Problems needing a decision that have been waiting more than 3 days without anyone taking them on.", "/alerts?decisionRequired=true"));
        out.add(sig("DATA_ANOMALIES", n(r, "anomalies") == 0 ? AlertSeverity.LOW : AlertSeverity.MEDIUM, bd(n(r, "anomalies"), 0), "projects", String.valueOf(n(r, "anomalies")),
            "Projects whose figures look unusual and should be checked (sudden jumps, spending without progress, reports that do not match site visits).", "/intelligence?tab=insights&kind=ANOMALY"));
        double hr = active == 0 ? 0 : n(r, "high_risk") * 100.0 / active;
        out.add(sig("PORTFOLIO_RISK", hr >= 40 ? AlertSeverity.HIGH : hr >= 20 ? AlertSeverity.MEDIUM : AlertSeverity.LOW, bd(hr, 0), "%", pct(hr),
            n(r, "high_risk") + " of " + active + " projects under way need close attention (high attention score).", "/projects?minRiskScore=50&sort=riskScore&dir=desc"));
        java.sql.Timestamp lf = (java.sql.Timestamp) r.get("last_field");
        long hours = lf == null ? 999 : Math.max(0, java.time.Duration.between(lf.toInstant(), Instant.now()).toHours());
        out.add(sig("FIELD_DATA_FRESHNESS", hours <= 48 ? AlertSeverity.LOW : hours <= 168 ? AlertSeverity.MEDIUM : AlertSeverity.HIGH, bd(hours, 0), "h", hours < 48 ? hours + (hours == 1 ? " hour" : " hours") : (hours / 24) + " days",
            "How long ago the latest information from the field (damage assessment, site report or site visit) arrived.", "/damage"));
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
                case DISBURSEMENT_LAG -> { kind = "FUNDING"; action = "Ask the treasury or the funder to release the payment, or approve temporary funding; record your decision on the problem."; }
                case SEVERE_DAMAGE_UNADDRESSED -> { kind = "FUNDING"; action = "Decide whether to start a project to rebuild it now or later; ask the sector bureau to prepare it."; }
                case STALLED_REPORTING -> { kind = "VERIFICATION"; action = "Send someone to check the site, and ask the contractor to send a progress report every week again."; }
                case SCHEDULE_SLIPPAGE, MILESTONE_OVERDUE -> { kind = "DECISION"; action = "Ask the contractor and the supervising engineer for a plan, with dates, to catch up; if needed, change the schedule or apply the penalties in the contract."; }
                case COST_OVERRUN -> { kind = "REVIEW"; action = "Have the costs checked before approving any further payment to the contractor."; }
                case PROGRESS_DISCREPANCY -> { kind = "ESCALATION"; action = "Do not accept the reported progress until a second site visit confirms it."; }
                default -> { kind = "DECISION"; action = "Look at the problem and record your decision."; }
            }
            List<IntelligenceDtos.Evidence> ev = new ArrayList<>();
            if (a.metrics() != null) a.metrics().forEach((k, v) -> { if (v != null && !TECHNICAL.contains(k) && ev.size() < 4) ev.add(new IntelligenceDtos.Evidence(humanize(k), fmtMetric(k, v))); });
            out.add(new IntelligenceDtos.Action("alert-" + a.id(), ++i, kind, a.severity(), a.title(), a.detail(), ev, action, a.entityType(), a.entityId(), a.entityName(), a.entityCode(),
                a.sector(), a.weredaName(), a.id(), null, "RULE", a.ageHours()));
        }
        // Contractor concentration of delay
        List<IntelligenceDtos.ContractorPerformance> cs = contractors(p);
        for (var c : cs) {
            if (c.delayed() >= 2 && out.size() < 14) {
                out.add(new IntelligenceDtos.Action("contractor-" + c.contractor().hashCode(), ++i, "REVIEW", c.delayed() >= 3 ? AlertSeverity.HIGH : AlertSeverity.MEDIUM,
                    "Many late projects with one contractor: " + c.contractor(),
                    c.delayed() + " of their " + c.active() + " projects under way are late or have stopped; on average they are " + c.avgVariancePp().abs() + "% " + (c.avgVariancePp().signum() < 0 ? "behind" : "ahead of") + " plan.",
                    List.of(new IntelligenceDtos.Evidence("Projects under way", String.valueOf(c.active())), new IntelligenceDtos.Evidence("Late or stopped", String.valueOf(c.delayed())),
                            new IntelligenceDtos.Evidence("Budget of their projects", "ETB " + compact(c.budgetEtb()))),
                    "Meet the contractor about the delays, and think twice before giving them more contracts.", null, null, c.contractor(), null, null, null, null, null, "RULE", 0));
            }
        }
        // Top funding priorities (unaddressed damage) not already covered by an alert card
        for (var f : fundingPriorities(p).stream().limit(3).toList()) {
            boolean dup = out.stream().anyMatch(x -> x.entityType() == EntityType.FACILITY && Objects.equals(x.entityId(), f.facilityId()));
            if (dup) continue;
            out.add(new IntelligenceDtos.Action("priority-" + f.facilityId(), ++i, "FUNDING", f.priorityScore().doubleValue() >= 70 ? AlertSeverity.HIGH : AlertSeverity.MEDIUM,
                "Fund rebuilding first: " + f.name(),
                String.format("A %s facility serving about %,d people, with no project yet. Rebuilding is estimated at ETB %s.", "DESTROYED".equals(f.severity()) ? "destroyed" : "heavily damaged", f.beneficiaries() == null ? 0 : f.beneficiaries(), compact(f.replacementEstimateEtb())),
                List.of(new IntelligenceDtos.Evidence("Priority (out of 100)", String.valueOf(f.priorityScore())), new IntelligenceDtos.Evidence("People served", String.format("%,d", f.beneficiaries() == null ? 0 : f.beneficiaries())),
                        new IntelligenceDtos.Evidence("Cost to rebuild", "ETB " + compact(f.replacementEstimateEtb()))),
                "Decide whether to include it in the next funding round, and ask the sector bureau to prepare the project.", EntityType.FACILITY, f.facilityId(), f.name(), f.code(), f.sector(), f.weredaName(), null, f.insightId(), "RULE", 0));
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
                rs.getBigDecimal("schedule_variance_pp"), rs.getBigDecimal("cpi"), (Integer) rs.getObject("since_report"), (Integer) rs.getObject("since_verified"), rs.getBigDecimal("total_budget_etb"), json(rs.getString("comps")), null, null, null))
            .stream().map(IntelligenceService::classify).toList();
    }

    /** Adds risk type (dominant weighted component), severity and the matching recommended action. */
    private static IntelligenceDtos.RiskEntry classify(IntelligenceDtos.RiskEntry r) {
        String type = "schedule";
        double best = -1;
        if (r.components().get("components") instanceof List<?> cs) for (Object o : cs) {
            if (!(o instanceof Map<?, ?> c) || !(c.get("score") instanceof Number s) || !(c.get("weight") instanceof Number w)) continue;
            double contribution = s.doubleValue() * w.doubleValue();
            if (contribution > best) { best = contribution; type = String.valueOf(c.get("key")); }
        }
        AlertSeverity sev = switch (r.band()) { case "CRITICAL" -> AlertSeverity.CRITICAL; case "HIGH" -> AlertSeverity.HIGH; case "MODERATE" -> AlertSeverity.MEDIUM; default -> AlertSeverity.LOW; };
        return new IntelligenceDtos.RiskEntry(r.projectId(), r.code(), r.name(), r.sector(), r.weredaName(), r.status(), r.health(), r.riskScore(), r.band(), r.variancePp(), r.cpi(),
            r.daysSinceReport(), r.daysSinceVerified(), r.budgetEtb(), r.components(), type.toUpperCase(), sev, RISK_ACTIONS.getOrDefault(type, "Review the project's risk drivers and record a decision."));
    }
    private static final Map<String, String> RISK_ACTIONS = Map.of(
        "schedule", "Request a time-bound recovery plan from the contractor; consider re-baselining or contractual remedies.",
        "cost", "Commission a cost / variation audit before certifying further payments.",
        "reporting", "Require the site to resume weekly reporting and commission a field visit.",
        "milestones", "Escalate overdue milestones to the supervising engineer and set revised dates.",
        "issues", "Convene the project board to resolve open high-severity issues and risks.",
        "funding", "Instruct the funder / treasury to release overdue tranches or approve bridge financing.",
        "verification", "Schedule an independent verification inspection of reported progress.");

    /**
     * Projects with a tranche overdue or due within 60 days, ranked for release (0–100):
     * urgency (40: lateness or closeness of the due date) + delivery health (35) + verification recency (15) + absorption (10: progress keeps pace with money released).
     * Stalled or never-verified projects are recommended for HOLD; delayed ones for CONDITIONAL release.
     */
    List<IntelligenceDtos.ProjectFundingPriority> projectFundingPriorities(MapSqlParameterSource p) {
        List<IntelligenceDtos.ProjectFundingPriority> rows = jdbc.query("""
            SELECT p.id, p.code, p.name, p.sector, w.name_en wereda, p.health, p.physical_progress_pct phys, p.total_budget_etb budget, p.disbursed_etb disbursed, p.risk_score,
                   EXTRACT(DAY FROM now() - p.last_verified_at)::int since_verified,
                   sum(d.amount_etb) pending, min(d.planned_date) next_due, GREATEST(0, current_date - min(d.planned_date)) lag
            FROM project p JOIN wereda w ON w.id = p.wereda_id
            JOIN disbursement d ON d.project_id = p.id AND d.released_date IS NULL AND d.planned_date < current_date + 60
            WHERE p.status = 'ACTIVE' %s
            GROUP BY p.id, w.name_en
            """.formatted(SCOPE_P), p, (rs, i) -> {
                int lag = rs.getInt("lag");
                long untilDue = java.time.temporal.ChronoUnit.DAYS.between(java.time.LocalDate.now(), rs.getDate("next_due").toLocalDate());
                String health = rs.getString("health");
                Integer sinceVerified = (Integer) rs.getObject("since_verified");
                int stale = props.getMedia().getEvidenceStaleDays();
                BigDecimal budget = rs.getBigDecimal("budget"), disbursed = rs.getBigDecimal("disbursed"), phys = rs.getBigDecimal("phys");
                double urgency = lag > 0 ? 25 + Math.min(15, lag / 4.0) : 25 * Math.max(0, 1 - untilDue / 60.0);
                double delivery = switch (health) { case "ON_TRACK" -> 35; case "AT_RISK" -> 25; case "NOT_STARTED" -> 20; case "DELAYED" -> 12; default -> 0; };
                double verification = sinceVerified == null ? 0 : sinceVerified <= stale ? 15 : sinceVerified <= stale * 2 ? 7 : 0;
                double releasedPct = budget == null || budget.signum() == 0 ? 0 : disbursed.doubleValue() * 100 / budget.doubleValue();
                double absorption = releasedPct <= 0 ? 10 : Math.min(10, 10 * phys.doubleValue() / releasedPct);
                String rec, why;
                if ("STALLED".equals(health) || sinceVerified == null) {
                    rec = "HOLD";
                    why = "STALLED".equals(health) ? "Site reporting has stopped; hold until a verified inspection confirms activity." : "No verified inspection on record; verify progress before releasing funds.";
                } else if ("DELAYED".equals(health)) {
                    rec = "CONDITIONAL";
                    why = "Delivery is behind schedule; release against a time-bound recovery plan.";
                } else {
                    rec = "RELEASE";
                    why = lag > 0 ? "Delivering as planned and the tranche is " + lag + " days late; release now to avoid stalling the site." : "Delivering as planned; release on the due date.";
                }
                return new IntelligenceDtos.ProjectFundingPriority(rs.getLong("id"), rs.getString("code"), rs.getString("name"), Sector.valueOf(rs.getString("sector")), rs.getString("wereda"),
                    health, phys, budget, disbursed, rs.getBigDecimal("pending"), rs.getDate("next_due").toLocalDate(), lag, (Short) rs.getObject("risk_score", Short.class), sinceVerified,
                    bd(urgency + delivery + verification + absorption, 0), rec, why);
            });
        List<IntelligenceDtos.ProjectFundingPriority> ranked = new ArrayList<>(rows);
        List<String> order = List.of("RELEASE", "CONDITIONAL", "HOLD");
        ranked.sort(Comparator.comparing((IntelligenceDtos.ProjectFundingPriority f) -> order.indexOf(f.recommendation())).thenComparing(IntelligenceDtos.ProjectFundingPriority::priorityScore, Comparator.reverseOrder()));
        return ranked.stream().limit(50).toList();
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
    private static final Map<String, String> LABELS = Map.ofEntries(Map.entry("physicalPct", "Work done"), Map.entry("plannedPct", "Planned by now"), Map.entry("variancePp", "Difference from plan"),
        Map.entry("spi", "SPI"), Map.entry("cpi", "CPI"), Map.entry("overrunPct", "Likely extra cost (%)"), Map.entry("expendedEtb", "Money spent"), Map.entry("budgetEtb", "Budget"),
        Map.entry("daysSinceReport", "Days since last report"), Map.entry("daysSinceVerified", "Days since last site check"), Map.entry("thresholdDays", "Allowed (days)"), Map.entry("milestone", "Step"),
        Map.entry("plannedDate", "Planned date"), Map.entry("overdueDays", "Days late"), Map.entry("tranche", "Payment number"), Map.entry("amountEtb", "Amount"), Map.entry("lagDays", "Days late"), Map.entry("fundingSource", "Paid for by"),
        Map.entry("severity", "Damage"), Map.entry("replacementEstimateEtb", "Cost to rebuild"), Map.entry("beneficiaries", "People served"), Map.entry("reportedPct", "Reported done"), Map.entry("observedPct", "Found on site"), Map.entry("gapPp", "Difference"), Map.entry("visitedOn", "Visited on"));
    /** Figures only specialists read; left out of the action cards. */
    private static final Set<String> TECHNICAL = Set.of("spi", "cpi");
    private static String humanize(String k) { if (LABELS.containsKey(k)) return LABELS.get(k); String sp = k.replaceAll("([A-Z])", " $1"); return k.length() <= 3 ? k.toUpperCase() : sp.substring(0, 1).toUpperCase() + sp.substring(1); }
    private static String fmtMetric(String k, Object v) {
        if (v instanceof Number num) { if (k.toLowerCase().contains("etb")) return "ETB " + compact(new BigDecimal(num.toString())); if (k.toLowerCase().contains("pct")) return String.format("%.0f%%", num.doubleValue()); if (k.toLowerCase().endsWith("pp")) return String.format("%+.0f%%", num.doubleValue()); if (k.equals("spi") || k.equals("cpi")) return String.format("%.2f", num.doubleValue()); return num.toString(); }
        return String.valueOf(v);
    }
    @SuppressWarnings("unchecked")
    private static Map<String, Object> json(String s) {
        if (s == null) return Map.of();
        try { return new com.fasterxml.jackson.databind.ObjectMapper().readValue(s, LinkedHashMap.class); } catch (Exception e) { return Map.of(); }
    }
}
