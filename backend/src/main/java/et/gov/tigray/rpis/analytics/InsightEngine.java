package et.gov.tigray.rpis.analytics;

import et.gov.tigray.rpis.common.Enums.*;
import et.gov.tigray.rpis.config.RpisProperties;
import et.gov.tigray.rpis.facility.Facility;
import et.gov.tigray.rpis.facility.FacilityRepository;
import et.gov.tigray.rpis.project.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.Types;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * Rule-based decision-support engine. Produces explainable, persisted insights for every delivering project
 * (delay prediction, completion forecast, cost / inflation exposure, supply-chain risk, anomalies) and for
 * severely damaged facilities (funding priority). A trained AI provider later writes the same kinds with basis MODEL.
 *
 * Nothing here changes government decisions: every output is advisory, reviewable and labelled with its provider.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class InsightEngine {
    public static final String PROVIDER = "RULE_BASED_BASELINE";
    private final RpisProperties props;
    private final ProjectRepositories.Projects projects;
    private final ProjectRepositories.ProgressLogs progressLogs;
    private final ProjectRepositories.Expenditures expenditures;
    private final ProjectRepositories.Disbursements disbursements;
    private final ProjectRepositories.Risks risks;
    private final ProjectRepositories.Issues issues;
    private final ProjectRepositories.Forecasts forecasts;
    private final ProjectRepositories.ProjectFacilities projectFacilities;
    private final FacilityRepository facilities;
    private final InsightService insights;
    private final NamedParameterJdbcTemplate jdbc;

    @Scheduled(cron = "${rpis.analytics.evaluation-cron:0 2/5 * * * *}")
    public void scheduled() { try { evaluateAll(); } catch (Exception e) { log.warn("Insight evaluation failed: {}", e.getMessage()); } }

    @Transactional
    public int evaluateAll() {
        // One evaluation at a time (scheduler, seeder, other instances): a concurrent run would insert the same
        // active insights and trip ux_insight_active. The lock is released when this transaction ends.
        jdbc.getJdbcOperations().execute("SELECT pg_advisory_xact_lock(4207001)");
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        int n = 0;
        for (Project p : projects.findByStatusIn(List.of(ProjectStatus.ACTIVE, ProjectStatus.SUSPENDED, ProjectStatus.PROCUREMENT, ProjectStatus.PLANNED))) {
            try { n += evaluateProject(p, today); } catch (Exception e) { log.warn("Insights for project {} failed: {}", p.getCode(), e.getMessage()); }
        }
        for (Project p : projects.findByStatusIn(List.of(ProjectStatus.COMPLETED, ProjectStatus.CANCELLED))) {
            for (InsightKind k : List.of(InsightKind.DELAY_PREDICTION, InsightKind.COMPLETION_FORECAST, InsightKind.COST_RISK, InsightKind.SUPPLY_RISK, InsightKind.ANOMALY, InsightKind.RISK_SCORE))
                insights.resolve(k, EntityType.PROJECT, p.getId());
        }
        n += evaluateFacilities();
        return n;
    }

    int evaluateProject(Project p, LocalDate today) {
        int n = 0;
        Integer wid = p.getWereda().getId();
        boolean delivering = p.getStatus() == ProjectStatus.ACTIVE || p.getStatus() == ProjectStatus.SUSPENDED;

        // 1. Composite risk score (persisted on the project by ProjectMetricsService; mirrored as an insight for the registry)
        if (p.getRiskScore() != null) {
            String band = RiskScoringService.band(p.getRiskScore());
            insights.upsert(new InsightService.Draft(InsightKind.RISK_SCORE, EntityType.PROJECT, p.getId(), p.getSector(), wid, RiskScoringService.PROVIDER, InsightBasis.RULE,
                sevForBand(band), p.getRiskScore().doubleValue(), 0.7, null, "Composite risk " + p.getRiskScore() + "/100 (" + band.toLowerCase() + ")",
                "Weighted schedule, cost, reporting, milestone, issue, funding and verification signals.", p.getRiskComponents()));
            n++;
        } else insights.resolve(InsightKind.RISK_SCORE, EntityType.PROJECT, p.getId());

        if (!delivering) {
            for (InsightKind k : List.of(InsightKind.DELAY_PREDICTION, InsightKind.COMPLETION_FORECAST, InsightKind.COST_RISK, InsightKind.SUPPLY_RISK, InsightKind.ANOMALY))
                insights.resolve(k, EntityType.PROJECT, p.getId());
            return n;
        }

        List<ProgressLog> logs = progressLogs.findByProjectIdOrderByLogDateAsc(p.getId());
        LocalDate plannedEnd = p.getRevisedEnd() != null ? p.getRevisedEnd() : p.getPlannedEnd();
        double physical = p.getPhysicalProgressPct().doubleValue();
        double spi = p.getSpi() == null ? 1 : p.getSpi().doubleValue();
        double cpi = p.getCpi() == null ? 1 : p.getCpi().doubleValue();

        // 2. Delay prediction: slip against planned end + trend of weekly productivity over the last 8 reports
        long slip = p.getForecastEnd() == null ? 0 : ChronoUnit.DAYS.between(plannedEnd, p.getForecastEnd());
        double trend = productivityTrend(logs);
        double pDelay = clamp01(0.5 + (1 - spi) * 1.2 + (slip > 0 ? Math.min(0.3, slip / 300.0) : -0.15) - trend * 0.5);
        AlertSeverity dsev = pDelay >= 0.8 ? AlertSeverity.CRITICAL : pDelay >= 0.6 ? AlertSeverity.HIGH : pDelay >= 0.4 ? AlertSeverity.MEDIUM : AlertSeverity.LOW;
        Map<String, Object> dx = explain(List.of(
            f("Schedule performance index", String.format("%.2f", spi), 0.45), f("Forecast slip vs planned end", slip + " days", 0.3),
            f("Productivity trend (8 reports)", String.format("%+.1f pp/wk", trend), 0.15), f("Physical progress", pct(physical), 0.1)));
        insights.upsert(new InsightService.Draft(InsightKind.DELAY_PREDICTION, EntityType.PROJECT, p.getId(), p.getSector(), wid, PROVIDER, InsightBasis.RULE, dsev,
            Math.round(pDelay * 100) * 1.0, confidence(physical), (int) Math.max(0, slip),
            String.format("%d%% likelihood of missing %s", Math.round(pDelay * 100), plannedEnd),
            slip > 0 ? "Current productivity projects completion " + slip + " days after the planned end." : "Current productivity keeps the planned end within reach.", dx));
        n++;

        // 3. Completion forecast (latest provider output, with history available on the project page)
        var fc = forecasts.findFirstByProjectIdOrderByComputedAtDesc(p.getId()).orElse(null);
        if (fc != null && fc.getForecastEnd() != null) {
            insights.upsert(new InsightService.Draft(InsightKind.COMPLETION_FORECAST, EntityType.PROJECT, p.getId(), p.getSector(), wid, fc.getProvider(), InsightBasis.RULE,
                slip > 90 ? AlertSeverity.HIGH : slip > 30 ? AlertSeverity.MEDIUM : AlertSeverity.LOW, (double) slip, fc.getConfidence() == null ? null : fc.getConfidence().doubleValue(),
                (int) ChronoUnit.DAYS.between(LocalDate.now(ZoneOffset.UTC), fc.getForecastEnd()),
                "Forecast completion " + fc.getForecastEnd() + (slip != 0 ? String.format(" (%+d days vs plan)", slip) : " (on plan)"), fc.getRationale(),
                explain(List.of(f("Planned end", plannedEnd.toString(), 0.3), f("Forecast end", fc.getForecastEnd().toString(), 0.4), f("Provider", fc.getProvider(), 0.3)))));
            n++;
        }

        // 4. Cost & inflation exposure
        BigDecimal budget = p.getTotalBudgetEtb();
        double overrun = fc != null && fc.getForecastCostEtb() != null ? Math.max(0, fc.getForecastCostEtb().subtract(budget).doubleValue()) : 0;
        double remainingShare = Math.max(0, 1 - physical / 100);
        double remainingMonths = Math.max(1, ChronoUnit.MONTHS.between(LocalDate.now(ZoneOffset.UTC), p.getForecastEnd() != null ? p.getForecastEnd() : plannedEnd));
        double inflationExposure = budget.doubleValue() * remainingShare * (props.getAnalytics().getConstructionInflationPctAnnual() / 100.0) * (remainingMonths / 12.0);
        double exposurePct = budget.signum() == 0 ? 0 : (overrun + inflationExposure) / budget.doubleValue() * 100;
        AlertSeverity csev = exposurePct >= 25 ? AlertSeverity.CRITICAL : exposurePct >= 15 ? AlertSeverity.HIGH : exposurePct >= 8 ? AlertSeverity.MEDIUM : AlertSeverity.LOW;
        insights.upsert(new InsightService.Draft(InsightKind.COST_RISK, EntityType.PROJECT, p.getId(), p.getSector(), wid, PROVIDER, InsightBasis.RULE, csev,
            Math.round(exposurePct * 10) / 10.0, 0.5, (int) (remainingMonths * 30),
            String.format("Cost exposure %.0f%% of budget (ETB %,.0f)", exposurePct, overrun + inflationExposure),
            String.format("CPI-based overrun ETB %,.0f plus inflation on remaining works ETB %,.0f at %.0f%%/yr over %.0f months.", overrun, inflationExposure,
                props.getAnalytics().getConstructionInflationPctAnnual(), remainingMonths),
            explain(List.of(f("Cost performance index", String.format("%.2f", cpi), 0.5), f("Remaining works", pct(remainingShare * 100), 0.25),
                f("Assumed construction inflation", props.getAnalytics().getConstructionInflationPctAnnual() + "%/yr", 0.25)))));
        n++;

        // 5. Supply-chain / material risk from the risk register, issues and funding flow
        List<ProjectRisk> rs = risks.findByProjectIdOrderByRaisedOnDesc(p.getId());
        List<ProjectIssue> is = issues.findByProjectIdOrderByRaisedOnDesc(p.getId());
        int supplyPts = 0; List<String> drivers = new ArrayList<>();
        for (ProjectRisk r : rs) if (r.getStatus() != RiskStatus.CLOSED && Set.of("SUPPLY", "MARKET", "RESOURCE").contains(r.getCategory())) {
            int pts = (r.getLikelihood() == Level.HIGH ? 3 : r.getLikelihood() == Level.MEDIUM ? 2 : 1) * (r.getImpact() == Level.HIGH ? 10 : 5);
            supplyPts += pts; drivers.add(r.getTitle());
        }
        for (ProjectIssue i : is) if (i.getStatus() != IssueStatus.RESOLVED && i.getTitle().matches("(?i).*(customs|deliver|transformer|fuel|cement|rebar|import|material|supply).*")) {
            supplyPts += i.getSeverity() == Level.HIGH ? 25 : 12; drivers.add(i.getTitle());
        }
        long laggingTranches = disbursements.findByProjectIdOrderByTrancheNoAsc(p.getId()).stream().filter(d -> d.getReleasedDate() == null && d.getPlannedDate().isBefore(today)).count();
        if (laggingTranches > 0) { supplyPts += 10 * laggingTranches; drivers.add(laggingTranches + " tranche(s) unreleased past due"); }
        if (supplyPts > 0) {
            double sScore = Math.min(100, supplyPts);
            insights.upsert(new InsightService.Draft(InsightKind.SUPPLY_RISK, EntityType.PROJECT, p.getId(), p.getSector(), wid, PROVIDER, InsightBasis.RULE,
                sScore >= 60 ? AlertSeverity.HIGH : sScore >= 30 ? AlertSeverity.MEDIUM : AlertSeverity.LOW, sScore, 0.45, 90,
                "Material / supply-chain risk " + Math.round(sScore) + "/100", "Drivers: " + String.join("; ", drivers.subList(0, Math.min(4, drivers.size()))) + ".",
                explain(drivers.stream().map(d -> f(d, "open", 1.0 / drivers.size())).toList())));
            n++;
        } else insights.resolve(InsightKind.SUPPLY_RISK, EntityType.PROJECT, p.getId());

        // 6. Anomalies (aggregated into one insight per project)
        List<Map<String, Object>> anomalies = detectAnomalies(p, logs, today);
        if (!anomalies.isEmpty()) {
            AlertSeverity asev = anomalies.stream().anyMatch(a -> "HIGH".equals(a.get("severity"))) ? AlertSeverity.HIGH : AlertSeverity.MEDIUM;
            Map<String, Object> ex = new LinkedHashMap<>(); ex.put("basis", "RULE"); ex.put("items", anomalies); ex.put("dataAsOf", today.toString());
            insights.upsert(new InsightService.Draft(InsightKind.ANOMALY, EntityType.PROJECT, p.getId(), p.getSector(), wid, PROVIDER, InsightBasis.RULE, asev,
                (double) anomalies.size(), 0.6, null, anomalies.size() + (anomalies.size() == 1 ? " data anomaly flagged" : " data anomalies flagged"),
                anomalies.stream().map(a -> String.valueOf(a.get("title"))).reduce((a, b) -> a + "; " + b).orElse(""), ex));
            n++;
        } else insights.resolve(InsightKind.ANOMALY, EntityType.PROJECT, p.getId());
        return n;
    }

    /** Data-quality and integrity checks that executives should see before trusting a number. */
    List<Map<String, Object>> detectAnomalies(Project p, List<ProgressLog> logs, LocalDate today) {
        List<Map<String, Object>> out = new ArrayList<>();
        double jump = props.getAnalytics().getProgressJumpAnomalyPp();
        for (int i = 1; i < logs.size(); i++) {
            double d = logs.get(i).getPhysicalProgressPct().doubleValue() - logs.get(i - 1).getPhysicalProgressPct().doubleValue();
            long days = ChronoUnit.DAYS.between(logs.get(i - 1).getLogDate(), logs.get(i).getLogDate());
            if (d >= jump && days <= 7 && logs.get(i).getLogDate().isAfter(today.minusDays(120)))
                out.add(anomaly("PROGRESS_JUMP", "MEDIUM", String.format("Progress jumped %.0f pp in %d days (%s)", d, days, logs.get(i).getLogDate()),
                    "A single report added more than " + jump + " pp; verify with a site inspection."));
        }
        if (logs.size() >= 2) {
            LocalDate cutoff = today.minusDays(60);
            double progressDelta = logs.get(logs.size() - 1).getPhysicalProgressPct().doubleValue() - logs.stream().filter(l -> !l.getLogDate().isAfter(cutoff)).reduce((a, b) -> b).map(l -> l.getPhysicalProgressPct().doubleValue()).orElse(logs.get(0).getPhysicalProgressPct().doubleValue());
            BigDecimal spend60 = expenditures.findByProjectIdOrderByPeriodStartAsc(p.getId()).stream().filter(e -> e.getPeriodEnd().isAfter(cutoff)).map(Expenditure::getAmountEtb).reduce(BigDecimal.ZERO, BigDecimal::add);
            if (spend60.signum() > 0 && progressDelta <= 1 && p.getStatus() == ProjectStatus.ACTIVE)
                out.add(anomaly("SPEND_WITHOUT_PROGRESS", "HIGH", String.format("ETB %,.0f certified in 60 days with %.1f pp progress", spend60, progressDelta),
                    "Certified expenditure is not matched by physical progress; review interim payment certificates."));
        }
        double disbPct = p.getTotalBudgetEtb().signum() == 0 ? 0 : p.getDisbursedEtb().doubleValue() / p.getTotalBudgetEtb().doubleValue() * 100;
        if (disbPct - p.getPhysicalProgressPct().doubleValue() > 35)
            out.add(anomaly("DISBURSED_AHEAD_OF_PROGRESS", "MEDIUM", String.format("%.0f%% released vs %.0f%% physical", disbPct, p.getPhysicalProgressPct()),
                "Funds released run well ahead of delivered works; confirm advance-payment guarantees."));
        Map<String, Object> obs = jdbc.queryForMap("""
            SELECT coalesce(max(observed_progress_pct), -1) obs, coalesce(max(reported_progress_pct), -1) rep FROM field_inspection
            WHERE project_id = :id AND observed_progress_pct IS NOT NULL AND visited_on > current_date - interval '60 days' AND verification_status <> 'REJECTED'
            """, new MapSqlParameterSource().addValue("id", p.getId(), Types.BIGINT));
        double o = ((Number) obs.get("obs")).doubleValue(), r = ((Number) obs.get("rep")).doubleValue();
        if (o >= 0 && r >= 0 && r - o >= 10)
            out.add(anomaly("REPORTED_VS_OBSERVED", "HIGH", String.format("Site reported %.0f%% but inspection observed %.0f%%", r, o),
                "Independent inspection contradicts the site report; treat reported progress as unverified."));
        return out;
    }

    int evaluateFacilities() {
        int n = 0;
        for (Facility f : facilities.findAll()) {
            boolean severe = f.getLatestSeverity() == DamageSeverity.SEVERE || f.getLatestSeverity() == DamageSeverity.DESTROYED;
            boolean unaddressed = severe && projectFacilities.countByFacilityId(f.getId()) == 0;
            if (!unaddressed) { insights.resolve(InsightKind.FUNDING_PRIORITY, EntityType.FACILITY, f.getId()); continue; }
            double severityW = f.getLatestSeverity() == DamageSeverity.DESTROYED ? 1.0 : 0.75;
            double beneficiaries = f.getBeneficiaries() == null ? 0 : f.getBeneficiaries();
            double replacement = f.getReplacementEstimateEtb() == null ? 0 : f.getReplacementEstimateEtb().doubleValue();
            // People reached per ETB million, scaled by severity: a transparent prioritisation heuristic reviewed by the executive office
            double reach = replacement <= 0 ? beneficiaries / 1e3 : beneficiaries / (replacement / 1e6);
            double score = Math.min(100, Math.log10(1 + reach) * 25 * severityW + (f.getSector() == et.gov.tigray.rpis.common.Sector.HEALTH ? 10 : 0));
            insights.upsert(new InsightService.Draft(InsightKind.FUNDING_PRIORITY, EntityType.FACILITY, f.getId(), f.getSector(), f.getWereda().getId(), PROVIDER, InsightBasis.RULE,
                score >= 70 ? AlertSeverity.HIGH : score >= 40 ? AlertSeverity.MEDIUM : AlertSeverity.LOW, Math.round(score * 10) / 10.0, 0.55, null,
                "Funding priority " + Math.round(score) + "/100 — " + f.getLatestSeverity().name().toLowerCase() + ", no project",
                String.format("%,.0f beneficiaries; replacement estimate ETB %,.0f; %s.", beneficiaries, replacement, f.getLatestSeverity() == DamageSeverity.DESTROYED ? "facility destroyed" : "severely damaged"),
                explain(List.of(f("Beneficiaries", String.format("%,.0f", beneficiaries), 0.4), f("Replacement estimate", String.format("ETB %,.0f", replacement), 0.3),
                    f("Severity", f.getLatestSeverity().name(), 0.2), f("Sector weighting", f.getSector().name(), 0.1)))));
            n++;
        }
        return n;
    }

    // ── helpers ───────────────────────────────────────────────────────────
    static double productivityTrend(List<ProgressLog> logs) {
        if (logs.size() < 3) return 0;
        List<ProgressLog> tail = logs.subList(Math.max(0, logs.size() - 8), logs.size());
        int half = tail.size() / 2;
        double first = rate(tail.subList(0, half + 1)), second = rate(tail.subList(half, tail.size()));
        return second - first;
    }
    private static double rate(List<ProgressLog> l) {
        if (l.size() < 2) return 0;
        long days = Math.max(1, ChronoUnit.DAYS.between(l.get(0).getLogDate(), l.get(l.size() - 1).getLogDate()));
        return (l.get(l.size() - 1).getPhysicalProgressPct().doubleValue() - l.get(0).getPhysicalProgressPct().doubleValue()) / days * 7;
    }
    static AlertSeverity sevForBand(String band) { return switch (band) { case "CRITICAL" -> AlertSeverity.CRITICAL; case "HIGH" -> AlertSeverity.HIGH; case "MODERATE" -> AlertSeverity.MEDIUM; default -> AlertSeverity.LOW; }; }
    static double confidence(double physical) { return physical < 10 ? 0.35 : physical < 40 ? 0.55 : 0.7; }
    static double clamp01(double v) { return Math.max(0.02, Math.min(0.98, v)); }
    static String pct(double v) { return String.format("%.0f%%", v); }
    static Map<String, Object> f(String name, String value, double weight) { Map<String, Object> m = new LinkedHashMap<>(); m.put("name", name); m.put("value", value); m.put("weight", weight); return m; }
    static Map<String, Object> explain(List<Map<String, Object>> features) { Map<String, Object> m = new LinkedHashMap<>(); m.put("basis", "RULE"); m.put("features", features); return m; }
    static Map<String, Object> anomaly(String code, String severity, String title, String detail) { Map<String, Object> m = new LinkedHashMap<>(); m.put("code", code); m.put("severity", severity); m.put("title", title); m.put("detail", detail); return m; }
}
