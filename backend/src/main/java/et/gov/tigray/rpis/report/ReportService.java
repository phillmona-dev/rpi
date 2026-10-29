package et.gov.tigray.rpis.report;

import et.gov.tigray.rpis.alert.AlertDtos;
import et.gov.tigray.rpis.alert.AlertService;
import et.gov.tigray.rpis.audit.Audited;
import et.gov.tigray.rpis.common.Enums.*;
import et.gov.tigray.rpis.common.Sector;
import et.gov.tigray.rpis.common.SqlParams;
import et.gov.tigray.rpis.dashboard.DashboardDtos;
import et.gov.tigray.rpis.dashboard.DashboardQueryRepository;
import et.gov.tigray.rpis.geo.GeoDtos;
import et.gov.tigray.rpis.geo.GeoService;
import et.gov.tigray.rpis.intelligence.IntelligenceDtos;
import et.gov.tigray.rpis.intelligence.IntelligenceService;
import et.gov.tigray.rpis.security.CurrentUser;
import lombok.RequiredArgsConstructor;
import org.slf4j.MDC;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.security.MessageDigest;
import java.sql.Types;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.*;

/**
 * Builds typed government reports over a period and scope. Report content is a renderer-agnostic model
 * (see ReportDtos); exports and prints are recorded in report_run for accountability.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ReportService {
    public static final String CLASSIFICATION = "OFFICIAL — Tigray Regional Government · Office of the Chief Executive for Economic Affairs and Reconstruction";
    private final NamedParameterJdbcTemplate jdbc;
    private final DashboardQueryRepository queries;
    private final AlertService alerts;
    private final GeoService geo;
    private final IntelligenceService intelligence;
    private final ReportRunRepository runs;
    private final CsvReportRenderer csv;

    private static final String SCOPE_P = " AND (:sector IS NULL OR p.sector = :sector) AND (:weredaId IS NULL OR p.wereda_id = :weredaId) AND (:zoneId IS NULL OR p.wereda_id IN (SELECT id FROM wereda WHERE zone_id = :zoneId)) AND (:projectId IS NULL OR p.id = :projectId) ";
    private static final String SCOPE_F = " AND (:sector IS NULL OR f.sector = :sector) AND (:weredaId IS NULL OR f.wereda_id = :weredaId) AND (:zoneId IS NULL OR f.wereda_id IN (SELECT id FROM wereda WHERE zone_id = :zoneId)) ";

    public List<ReportDtos.CatalogEntry> catalog() {
        List<ReportPeriod> all = List.of(ReportPeriod.DAILY, ReportPeriod.WEEKLY, ReportPeriod.MONTHLY, ReportPeriod.QUARTERLY, ReportPeriod.CUSTOM);
        List<ReportFormat> fmts = List.of(ReportFormat.JSON, ReportFormat.CSV);
        return List.of(
            new ReportDtos.CatalogEntry(ReportType.EXECUTIVE_SUMMARY, "Summary for the leadership", "Main figures, what happened in the period, serious problems, projects behind plan, finished projects and decisions taken.", all, List.of("sector", "zone"), fmts),
            new ReportDtos.CatalogEntry(ReportType.SECTOR, "Sector report", "How each sector is doing: projects, money, damaged facilities and the projects that need attention.", all, List.of("sector", "zone"), fmts),
            new ReportDtos.CatalogEntry(ReportType.GEOGRAPHIC, "Zone and wereda report", "Facilities, damage, projects, work done, budget and problems in each zone and wereda.", all, List.of("sector", "zone", "wereda"), fmts),
            new ReportDtos.CatalogEntry(ReportType.PROJECT_PROGRESS, "Project progress report", "Work done against the plan, expected finish, last report and attention score for each project. Choose one project to see its steps and reports.", all, List.of("sector", "zone", "wereda", "project"), fmts),
            new ReportDtos.CatalogEntry(ReportType.FINANCIAL, "Money report", "Budget, money released and money spent by sector, funder and zone; payments still waiting; projects spending too fast.", all, List.of("sector", "zone"), fmts),
            new ReportDtos.CatalogEntry(ReportType.RISK, "Risk report", "Projects most at risk, serious open problems, warnings, and badly damaged facilities with no project.", all, List.of("sector", "zone"), fmts),
            new ReportDtos.CatalogEntry(ReportType.FIELD_EVIDENCE, "Site visits report", "Site visits in the period, whether they were confirmed, and where the work seen differs from what was reported.", all, List.of("sector", "zone", "wereda", "project"), fmts),
            new ReportDtos.CatalogEntry(ReportType.DECISION_LOG, "Decisions record", "Every decision, stage change and site-visit confirmation in the period, with who did it and their note.", all, List.of("sector"), fmts));
    }

    public ReportDtos.Report build(ReportType type, ReportPeriod period, LocalDate from, LocalDate to, Sector sector, Short zoneId, Integer weredaId, Long projectId) {
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        LocalDate end = to != null ? to : today;
        LocalDate start = from != null ? from : switch (period) { case DAILY -> end.minusDays(1); case WEEKLY -> end.minusDays(7); case MONTHLY -> end.minusMonths(1); case QUARTERLY -> end.minusMonths(3); case CUSTOM -> end.minusDays(30); };
        var p = SqlParams.scope(sector, zoneId, weredaId).addValue("projectId", projectId, Types.BIGINT)
            .addValue("from", start, Types.DATE).addValue("to", end, Types.DATE)
            .addValue("fromTs", java.sql.Timestamp.from(start.atStartOfDay().toInstant(ZoneOffset.UTC)), Types.TIMESTAMP)
            .addValue("toTs", java.sql.Timestamp.from(end.plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC)), Types.TIMESTAMP);
        ReportDtos.Scope scope = scope(sector, zoneId, weredaId, projectId);
        String by = CurrentUser.get().map(CurrentUser::fullName).orElse("Executive Office");
        List<ReportDtos.Section> sections = switch (type) {
            case EXECUTIVE_SUMMARY -> executive(p, sector, zoneId, weredaId);
            case SECTOR -> sectorReport(p, sector, zoneId, weredaId);
            case GEOGRAPHIC -> geographic(p, sector, zoneId, weredaId);
            case PROJECT_PROGRESS -> projectProgress(p, projectId);
            case FINANCIAL -> financial(p, sector, zoneId, weredaId);
            case RISK -> risk(p, sector, zoneId);
            case FIELD_EVIDENCE -> fieldEvidence(p);
            case DECISION_LOG -> decisionLog(p);
        };
        String title = catalog().stream().filter(c -> c.type() == type).map(ReportDtos.CatalogEntry::title).findFirst().orElse(type.name());
        String subtitle = (sector == null ? "Tigray Region" : sector.name().charAt(0) + sector.name().substring(1).toLowerCase() + " sector") + (scope.zoneName() != null ? " · " + scope.zoneName() + " Zone" : "") + (scope.weredaName() != null ? " · " + scope.weredaName() : "") + (scope.projectCode() != null ? " · " + scope.projectCode() : "");
        return new ReportDtos.Report(type, title, subtitle, period, start, end, Instant.now(), by, scope, sections, CLASSIFICATION);
    }

    @Audited(action = "REPORT_EXPORT", entityType = "REPORT")
    @Transactional
    public byte[] export(ReportDtos.Report report, ReportFormat format) {
        byte[] bytes = format == ReportFormat.CSV ? csv.render(report) : jsonBytes(report);
        record(report.type(), report.period(), report.title(), scopeMap(report.scope()), format, rows(report), bytes);
        return bytes;
    }

    @Audited(action = "REPORT_PRINT", entityType = "REPORT")
    @Transactional
    public ReportDtos.RunDto recordRun(ReportDtos.RecordRunRequest req) {
        return dto(record(req.type(), req.period(), req.title(), req.scope(), req.format() == null ? ReportFormat.JSON : req.format(), req.rowCount(), null));
    }

    public List<ReportDtos.RunDto> runs(int size) { return runs.findAllByOrderByGeneratedAtDesc(PageRequest.of(0, size)).getContent().stream().map(ReportService::dto).toList(); }

    private ReportRun record(ReportType type, ReportPeriod period, String title, Map<String, Object> scope, ReportFormat format, Integer rowCount, byte[] bytes) {
        ReportRun run = new ReportRun();
        run.setReportType(type); run.setPeriod(period); run.setTitle(title); run.setScope(scope); run.setFormat(format); run.setRowCount(rowCount);
        run.setGeneratedBy(CurrentUser.get().map(CurrentUser::username).orElse(null)); run.setCorrelationId(MDC.get(et.gov.tigray.rpis.common.CorrelationIdFilter.MDC_KEY));
        if (bytes != null) try { run.setSha256(java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes))); } catch (Exception ignored) { }
        return runs.save(run);
    }

    // ── report bodies ─────────────────────────────────────────────────────
    private List<ReportDtos.Section> executive(MapSqlParameterSource p, Sector sector, Short zoneId, Integer weredaId) {
        DashboardDtos.Kpis k = queries.kpis(sector, zoneId, weredaId);
        AlertDtos.Counts ac = alerts.counts(sector, zoneId, weredaId);
        List<ReportDtos.Section> s = new ArrayList<>();
        s.add(ReportDtos.Section.kpis("headline", "Main figures", null, headline(k, ac)));
        s.add(ReportDtos.Section.table("activity", "What happened in the period", null, cols(c("label", "What"), c("count", "Number", "right", "int")), List.of(
            row("label", "Damage assessments received", "count", one("SELECT count(*) FROM damage_assessment a JOIN facility f ON f.id = a.facility_id WHERE a.created_at >= :fromTs AND a.created_at < :toTs " + SCOPE_F, p)),
            row("label", "Progress reports received", "count", one("SELECT count(*) FROM progress_log l JOIN project p ON p.id = l.project_id WHERE l.created_at >= :fromTs AND l.created_at < :toTs " + SCOPE_P, p)),
            row("label", "Site visits recorded", "count", one("SELECT count(*) FROM field_inspection i JOIN wereda w ON w.id = i.wereda_id LEFT JOIN project p ON p.id = i.project_id WHERE i.created_at >= :fromTs AND i.created_at < :toTs AND (:zoneId IS NULL OR w.zone_id = :zoneId) AND (:weredaId IS NULL OR w.id = :weredaId) AND (:sector IS NULL OR coalesce(p.sector, (SELECT f.sector FROM facility f WHERE f.id = i.facility_id)) = :sector)", p)),
            row("label", "Problems found", "count", one("SELECT count(*) FROM alert a WHERE a.triggered_at >= :fromTs AND a.triggered_at < :toTs AND (:sector IS NULL OR a.sector = :sector) AND (:zoneId IS NULL OR a.wereda_id IN (SELECT id FROM wereda WHERE zone_id = :zoneId))", p)),
            row("label", "Problems fixed", "count", one("SELECT count(*) FROM alert a WHERE a.resolved_at >= :fromTs AND a.resolved_at < :toTs AND a.status = 'RESOLVED' AND (:sector IS NULL OR a.sector = :sector) AND (:zoneId IS NULL OR a.wereda_id IN (SELECT id FROM wereda WHERE zone_id = :zoneId))", p)),
            row("label", "Decisions taken", "count", one("SELECT count(*) FROM alert_action x JOIN alert a ON a.id = x.alert_id WHERE x.created_at >= :fromTs AND x.created_at < :toTs AND x.action <> 'COMMENT' AND (:sector IS NULL OR a.sector = :sector)", p)),
            row("label", "Payments released", "count", one("SELECT count(*) FROM disbursement d JOIN project p ON p.id = d.project_id WHERE d.released_date >= :from AND d.released_date <= :to " + SCOPE_P, p)))));
        s.add(sectorTable(queries.sectors(zoneId, weredaId).stream().filter(x -> sector == null || x.sector() == sector).toList()));
        List<AlertDtos.AlertSummary> crit = alerts.search(new AlertService.Filter(List.of(AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED, AlertStatus.ASSIGNED), List.of(AlertSeverity.CRITICAL, AlertSeverity.HIGH), sector, weredaId, zoneId, null, null), PageRequest.of(0, 20, Sort.by("severity").ascending())).getContent();
        s.add(ReportDtos.Section.table("alerts", "Serious problems still open", null, cols(c("severity", "How serious"), c("title", "Problem"), c("entity", "Project or facility"), c("wereda", "Wereda"), c("age", "Open for (hours)", "right", "int"), c("status", "Status")),
            crit.stream().map(a -> row("severity", a.severity().name(), "title", a.title(), "entity", a.entityName(), "wereda", a.weredaName(), "age", a.ageHours(), "status", a.status().name())).toList()));
        s.add(ReportDtos.Section.table("behind", "Projects behind plan", "The furthest behind first", projectColsShort(), projectRows("p.status = 'ACTIVE' AND p.health IN ('DELAYED','STALLED','AT_RISK')", "p.schedule_variance_pp ASC", 25, p)));
        s.add(ReportDtos.Section.table("completed", "Finished in the period", null, cols(c("code", "Code"), c("name", "Project"), c("sector", "Sector"), c("wereda", "Wereda"), c("actualEnd", "Finished on", null, "date"), c("budget", "Budget (ETB)", "right", "money")),
            jdbc.queryForList("SELECT p.code, p.name, p.sector, w.name_en wereda, p.actual_end \"actualEnd\", p.total_budget_etb budget FROM project p JOIN wereda w ON w.id = p.wereda_id WHERE p.status = 'COMPLETED' AND p.actual_end >= :from AND p.actual_end <= :to " + SCOPE_P + " ORDER BY p.actual_end DESC", p)));
        s.add(decisionsTable(p));
        return s;
    }

    private List<ReportDtos.Section> sectorReport(MapSqlParameterSource p, Sector sector, Short zoneId, Integer weredaId) {
        List<ReportDtos.Section> s = new ArrayList<>();
        s.add(sectorTable(queries.sectors(zoneId, weredaId).stream().filter(x -> sector == null || x.sector() == sector).toList()));
        s.add(ReportDtos.Section.table("facilities", "Facilities by kind and damage", null,
            cols(c("sector", "Sector"), c("type", "Kind of facility"), c("total", "Total", "right", "int"), c("destroyed", "Destroyed", "right", "int"), c("severe", "Heavy", "right", "int"), c("moderate", "Moderate", "right", "int"), c("functional", "Working", "right", "int"), c("replacement", "Cost to rebuild (ETB)", "right", "money")),
            jdbc.queryForList("""
                SELECT f.sector, f.facility_type type, count(*) total, count(*) FILTER (WHERE latest_severity = 'DESTROYED') destroyed, count(*) FILTER (WHERE latest_severity = 'SEVERE') severe,
                       count(*) FILTER (WHERE latest_severity = 'MODERATE') moderate, count(*) FILTER (WHERE operational_status = 'FUNCTIONAL') functional, coalesce(sum(replacement_estimate_etb),0) replacement
                FROM facility f WHERE TRUE %s GROUP BY 1, 2 ORDER BY 1, total DESC""".formatted(SCOPE_F), p)));
        s.add(ReportDtos.Section.table("projects", "All projects", null, projectCols(), projectRows("p.status <> 'CANCELLED'", "p.sector, p.health, p.schedule_variance_pp ASC", 200, p)));
        s.add(ReportDtos.Section.table("funding", "Budget by funder", null, moneyCols("source", "Paid for by"), queries.budgetBy("funding_source", sector, zoneId, weredaId).stream().map(f -> row("source", f.key(), "budget", f.budgetEtb(), "disbursed", f.disbursedEtb(), "expended", f.expendedEtb(), "projects", f.projects())).toList()));
        return s;
    }

    private List<ReportDtos.Section> geographic(MapSqlParameterSource p, Sector sector, Short zoneId, Integer weredaId) {
        List<GeoDtos.WeredaMetrics> ws = geo.weredaMetrics(sector, zoneId, weredaId);
        List<ReportDtos.Section> s = new ArrayList<>();
        Map<String, List<GeoDtos.WeredaMetrics>> byZone = new TreeMap<>();
        ws.forEach(w -> byZone.computeIfAbsent(w.zoneName().en(), x -> new ArrayList<>()).add(w));
        s.add(ReportDtos.Section.table("zones", "Zones", null, cols(c("zone", "Zone"), c("weredas", "Weredas", "right", "int"), c("facilities", "Facilities", "right", "int"), c("severe", "Badly damaged", "right", "int"), c("projects", "Projects", "right", "int"), c("delayed", "Late", "right", "int"), c("budget", "Budget (ETB)", "right", "money"), c("alerts", "Open problems", "right", "int")),
            byZone.entrySet().stream().map(e -> row("zone", e.getKey(), "weredas", e.getValue().size(), "facilities", e.getValue().stream().mapToInt(GeoDtos.WeredaMetrics::facilitiesTotal).sum(), "severe", e.getValue().stream().mapToInt(GeoDtos.WeredaMetrics::facilitiesSevere).sum(),
                "projects", e.getValue().stream().mapToInt(GeoDtos.WeredaMetrics::projectsTotal).sum(), "delayed", e.getValue().stream().mapToInt(GeoDtos.WeredaMetrics::projectsDelayed).sum(), "budget", e.getValue().stream().map(GeoDtos.WeredaMetrics::budgetEtb).reduce(BigDecimal.ZERO, BigDecimal::add), "alerts", e.getValue().stream().mapToInt(GeoDtos.WeredaMetrics::openAlerts).sum())).toList()));
        s.add(ReportDtos.Section.table("weredas", "Weredas", null, cols(c("wereda", "Wereda"), c("zone", "Zone"), c("population", "Population", "right", "int"), c("facilities", "Facilities", "right", "int"), c("severe", "Badly damaged", "right", "int"), c("impact", "Average damage score", "right", "num"), c("projects", "Projects", "right", "int"), c("delayed", "Late", "right", "int"), c("progress", "Average work done %", "right", "num"), c("budget", "Budget (ETB)", "right", "money"), c("alerts", "Open problems", "right", "int")),
            ws.stream().filter(w -> w.facilitiesTotal() + w.projectsTotal() > 0).map(w -> row("wereda", w.name().en(), "zone", w.zoneName().en(), "population", w.population(), "facilities", w.facilitiesTotal(), "severe", w.facilitiesSevere(), "impact", w.avgImpactScore(), "projects", w.projectsTotal(), "delayed", w.projectsDelayed(), "progress", w.avgProgressPct(), "budget", w.budgetEtb(), "alerts", w.openAlerts())).toList()));
        return s;
    }

    private List<ReportDtos.Section> projectProgress(MapSqlParameterSource p, Long projectId) {
        List<ReportDtos.Section> s = new ArrayList<>();
        s.add(ReportDtos.Section.table("projects", "Projects: work done against the plan", "Projects under way or paused, the furthest behind first", projectCols(), projectRows("p.status IN ('ACTIVE','SUSPENDED')", "p.schedule_variance_pp ASC", 500, p)));
        if (projectId != null) {
            s.add(ReportDtos.Section.table("milestones", "Project steps", null, cols(c("seq", "#", "right", "int"), c("name", "Step"), c("planned", "Planned date", null, "date"), c("actual", "Done on", null, "date"), c("status", "Status")),
                jdbc.queryForList("SELECT m.sequence seq, m.name, m.planned_date planned, m.actual_date actual, m.status FROM milestone m WHERE m.project_id = :projectId ORDER BY m.sequence", p)));
            s.add(ReportDtos.Section.table("reports", "Progress reports in the period", null, cols(c("date", "Date", null, "date"), c("physical", "Work done %", "right", "num"), c("planned", "Plan %", "right", "num"), c("workforce", "Workers", "right", "int"), c("by", "Reported by"), c("source", "Paid for by"), c("notes", "Notes")),
                jdbc.queryForList("SELECT l.log_date date, l.physical_progress_pct physical, l.planned_progress_pct planned, l.workforce_count workforce, l.reported_by by, l.source, l.notes FROM progress_log l WHERE l.project_id = :projectId AND l.log_date >= :from AND l.log_date <= :to ORDER BY l.log_date DESC", p)));
            s.add(ReportDtos.Section.table("inspections", "Site visits", null, inspectionCols(), inspectionRows("i.project_id = :projectId", p)));
        }
        return s;
    }

    private List<ReportDtos.Section> financial(MapSqlParameterSource p, Sector sector, Short zoneId, Integer weredaId) {
        List<ReportDtos.Section> s = new ArrayList<>();
        DashboardDtos.Kpis k = queries.kpis(sector, zoneId, weredaId);
        s.add(ReportDtos.Section.kpis("totals", "Totals", null, List.of(kpi("Budget", money(k.budgetEtb()), null), kpi("Money released", money(k.disbursedEtb()), pct(k.disbursedEtb(), k.budgetEtb()) + " of the budget"),
            kpi("Money spent", money(k.expendedEtb()), pct(k.expendedEtb(), k.disbursedEtb()) + " of the money released"), kpi("Cost to rebuild damaged facilities", money(k.replacementEstimateEtb()), null))));
        s.add(ReportDtos.Section.table("sector", "By sector", null, moneyCols("sector", "Sector"), queries.budgetBy("sector", sector, zoneId, weredaId).stream().map(f -> row("sector", f.key(), "budget", f.budgetEtb(), "disbursed", f.disbursedEtb(), "expended", f.expendedEtb(), "projects", f.projects())).toList()));
        s.add(ReportDtos.Section.table("source", "By funder", null, moneyCols("source", "Paid for by"), queries.budgetBy("funding_source", sector, zoneId, weredaId).stream().map(f -> row("source", f.key(), "budget", f.budgetEtb(), "disbursed", f.disbursedEtb(), "expended", f.expendedEtb(), "projects", f.projects())).toList()));
        s.add(ReportDtos.Section.table("zone", "By zone", null, moneyCols("zone", "Zone"), jdbc.queryForList("""
            SELECT z.name_en zone, coalesce(sum(p.total_budget_etb),0) budget, coalesce(sum(p.disbursed_etb),0) disbursed, coalesce(sum(p.expended_etb),0) expended, count(p.id) projects
            FROM zone z LEFT JOIN wereda w ON w.zone_id = z.id LEFT JOIN project p ON p.wereda_id = w.id AND p.status <> 'CANCELLED' AND (:sector IS NULL OR p.sector = :sector)
            WHERE (:zoneId IS NULL OR z.id = :zoneId) GROUP BY z.name_en ORDER BY budget DESC""", p)));
        s.add(ReportDtos.Section.table("pending", "Payments still waiting", "Not yet released, the oldest planned date first", cols(c("code", "Project"), c("name", "Name"), c("tranche", "Payment no.", "right", "int"), c("planned", "Planned date", null, "date"), c("amount", "Amount (ETB)", "right", "money"), c("source", "Paid for by"), c("status", "Status"), c("lag", "Days late", "right", "int")),
            jdbc.queryForList("SELECT p.code, p.name, d.tranche_no tranche, d.planned_date planned, d.amount_etb amount, d.funding_source source, d.status, GREATEST(0, current_date - d.planned_date) lag FROM disbursement d JOIN project p ON p.id = d.project_id WHERE d.status <> 'RELEASED' AND p.status IN ('ACTIVE','PROCUREMENT','PLANNED') " + SCOPE_P + " ORDER BY d.planned_date LIMIT 100", p)));
        s.add(ReportDtos.Section.table("variance", "Spending too fast", "Projects that have spent more than the work done so far would justify", cols(c("code", "Project"), c("name", "Name"), c("physical", "Work done %", "right", "num"), c("budget", "Budget (ETB)", "right", "money"), c("expended", "Spent (ETB)", "right", "money"), c("forecast", "Expected final cost (ETB)", "right", "money")),
            jdbc.queryForList("SELECT p.code, p.name, p.physical_progress_pct physical, p.total_budget_etb budget, p.expended_etb expended, p.cpi, (SELECT f.forecast_cost_etb FROM project_forecast f WHERE f.project_id = p.id ORDER BY f.computed_at DESC LIMIT 1) forecast FROM project p WHERE p.status = 'ACTIVE' AND p.cpi < 0.95 AND p.physical_progress_pct >= 10 " + SCOPE_P + " ORDER BY p.cpi", p)));
        return s;
    }

    private List<ReportDtos.Section> risk(MapSqlParameterSource p, Sector sector, Short zoneId) {
        List<ReportDtos.Section> s = new ArrayList<>();
        List<IntelligenceDtos.RiskEntry> reg = intelligence.riskRegister(SqlParams.scope(sector, zoneId, null), 100);
        s.add(ReportDtos.Section.table("register", "Projects most at risk", "Attention score from 0 to 100: the higher it is, the more attention the project needs", cols(c("score", "Attention score", "right", "int"), c("band", "Level"), c("code", "Code"), c("name", "Project"), c("sector", "Sector"), c("wereda", "Wereda"), c("health", "How it is going"), c("sinceReport", "Days since last report", "right", "int"), c("budget", "Budget (ETB)", "right", "money"), c("riskType", "Main reason"), c("action", "Suggested action")),
            reg.stream().map(r -> row("score", r.riskScore(), "band", r.band(), "code", r.code(), "name", r.name(), "sector", r.sector().name(), "wereda", r.weredaName(), "health", r.health(), "variance", r.variancePp(), "cpi", r.cpi(), "sinceReport", r.daysSinceReport(), "budget", r.budgetEtb(), "riskType", r.riskType(), "action", r.recommendedAction())).toList()));
        List<AlertDtos.AlertSummary> crit = alerts.search(new AlertService.Filter(List.of(AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED, AlertStatus.ASSIGNED), List.of(AlertSeverity.CRITICAL, AlertSeverity.HIGH), sector, null, zoneId, null, null), PageRequest.of(0, 100, Sort.by("severity").ascending())).getContent();
        s.add(ReportDtos.Section.table("alerts", "Serious problems still open", null, cols(c("severity", "How serious"), c("rule", "Kind of problem"), c("title", "Problem"), c("entity", "Project or facility"), c("wereda", "Wereda"), c("age", "Open for (hours)", "right", "int"), c("status", "Status"), c("decision", "Needs a decision")),
            crit.stream().map(a -> row("severity", a.severity().name(), "rule", a.rule().name(), "title", a.title(), "entity", a.entityName(), "wereda", a.weredaName(), "age", a.ageHours(), "status", a.status().name(), "decision", a.decisionRequired() ? "Yes" : "No")).toList()));
        s.add(ReportDtos.Section.table("insights", "Warnings from the data", "Worked out from the recorded figures, not by AI", cols(c("kind", "Kind"), c("severity", "How serious"), c("subject", "Project or facility"), c("title", "Warning")),
            jdbc.queryForList("""
                SELECT i.kind, i.severity, coalesce(p.name, f.name) subject, i.title, i.score, i.confidence, i.provider
                FROM analytics_insight i LEFT JOIN project p ON i.entity_type = 'PROJECT' AND p.id = i.entity_id LEFT JOIN facility f ON i.entity_type = 'FACILITY' AND f.id = i.entity_id
                WHERE i.status = 'ACTIVE' AND i.kind <> 'RISK_SCORE' AND (:sector IS NULL OR i.sector = :sector) AND (:zoneId IS NULL OR i.wereda_id IN (SELECT id FROM wereda WHERE zone_id = :zoneId))
                ORDER BY i.severity, i.score DESC NULLS LAST LIMIT 200""", p)));
        s.add(ReportDtos.Section.table("unaddressed", "Badly damaged facilities with no project", null, cols(c("code", "Code"), c("name", "Facility"), c("sector", "Sector"), c("wereda", "Wereda"), c("severity", "Damage"), c("beneficiaries", "Beneficiaries", "right", "int"), c("replacement", "Cost to rebuild (ETB)", "right", "money")),
            jdbc.queryForList("SELECT f.code, f.name, f.sector, w.name_en wereda, f.latest_severity severity, f.beneficiaries, f.replacement_estimate_etb replacement FROM facility f JOIN wereda w ON w.id = f.wereda_id WHERE f.latest_severity IN ('SEVERE','DESTROYED') AND NOT EXISTS (SELECT 1 FROM project_facility pf WHERE pf.facility_id = f.id) " + SCOPE_F + " ORDER BY f.beneficiaries DESC NULLS LAST", p)));
        return s;
    }

    private List<ReportDtos.Section> fieldEvidence(MapSqlParameterSource p) {
        List<ReportDtos.Section> s = new ArrayList<>();
        Map<String, Object> c = jdbc.queryForMap("""
            SELECT count(*) total, count(*) FILTER (WHERE i.verification_status = 'VERIFIED') verified, count(*) FILTER (WHERE i.verification_status = 'DISPUTED') disputed,
                   count(*) FILTER (WHERE i.verification_status = 'REJECTED') rejected, count(*) FILTER (WHERE i.verification_status = 'UNVERIFIED') unverified,
                   (SELECT count(*) FROM evidence_media m JOIN field_inspection j ON j.id = m.inspection_id WHERE j.created_at >= :fromTs AND j.created_at < :toTs) media,
                   count(*) FILTER (WHERE i.distance_from_site_m > 250) far
            FROM field_inspection i LEFT JOIN project p ON p.id = i.project_id JOIN wereda w ON w.id = i.wereda_id
            WHERE i.created_at >= :fromTs AND i.created_at < :toTs AND (:zoneId IS NULL OR w.zone_id = :zoneId) AND (:weredaId IS NULL OR w.id = :weredaId)
              AND (:projectId IS NULL OR i.project_id = :projectId) AND (:sector IS NULL OR coalesce(p.sector, (SELECT f.sector FROM facility f WHERE f.id = i.facility_id)) = :sector)""", p);
        s.add(ReportDtos.Section.kpis("coverage", "Site visits in the period", null, List.of(kpi("Site visits", str(c.get("total")), null), kpi("Confirmed", str(c.get("verified")), null), kpi("Questioned or rejected", str(((Number) c.get("disputed")).longValue() + ((Number) c.get("rejected")).longValue()), null),
            kpi("Not checked yet", str(c.get("unverified")), null), kpi("Photos and videos", str(c.get("media")), null), kpi("Recorded far from the site", str(c.get("far")), "More than 250 m away"))));
        s.add(ReportDtos.Section.table("inspections", "Site visits", null, inspectionCols(), inspectionRows("i.created_at >= :fromTs AND i.created_at < :toTs AND (:projectId IS NULL OR i.project_id = :projectId)", p)));
        return s;
    }

    private List<ReportDtos.Section> decisionLog(MapSqlParameterSource p) {
        List<ReportDtos.Section> s = new ArrayList<>();
        s.add(decisionsTable(p));
        s.add(ReportDtos.Section.table("stages", "Project stage changes", null, cols(c("at", "When", null, "datetime"), c("actor", "By"), c("code", "Project"), c("name", "Name"), c("from", "From"), c("to", "To"), c("reference", "Reference"), c("note", "Note")),
            jdbc.queryForList("SELECT e.occurred_at at, e.actor_name actor, p.code, p.name, e.from_stage \"from\", e.to_stage \"to\", e.reference, e.note FROM project_stage_event e JOIN project p ON p.id = e.project_id WHERE e.occurred_at >= :fromTs AND e.occurred_at < :toTs AND (:sector IS NULL OR p.sector = :sector) ORDER BY e.occurred_at DESC LIMIT 300", p)));
        s.add(ReportDtos.Section.table("verifications", "Site-visit confirmations", null, cols(c("at", "When", null, "datetime"), c("actor", "Answered by"), c("subject", "Project or facility"), c("type", "Kind of visit"), c("status", "Answer"), c("note", "Note")),
            jdbc.queryForList("SELECT i.verified_at at, i.verified_by_name actor, coalesce(p.name, f.name) subject, i.inspection_type type, i.verification_status status, i.verification_note note FROM field_inspection i LEFT JOIN project p ON p.id = i.project_id LEFT JOIN facility f ON f.id = i.facility_id WHERE i.verified_at >= :fromTs AND i.verified_at < :toTs AND (:sector IS NULL OR coalesce(p.sector, f.sector) = :sector) ORDER BY i.verified_at DESC LIMIT 300", p)));
        s.add(ReportDtos.Section.table("insights", "Warnings reviewed", null, cols(c("at", "When", null, "datetime"), c("actor", "Reviewed by"), c("kind", "Kind"), c("title", "Warning"), c("status", "Answer"), c("note", "Note")),
            jdbc.queryForList("SELECT i.reviewed_at at, i.reviewed_by_name actor, i.kind, i.title, i.status, i.review_note note FROM analytics_insight i WHERE i.reviewed_at >= :fromTs AND i.reviewed_at < :toTs AND (:sector IS NULL OR i.sector = :sector) ORDER BY i.reviewed_at DESC LIMIT 300", p)));
        return s;
    }

    // ── shared pieces ─────────────────────────────────────────────────────
    private ReportDtos.Section decisionsTable(MapSqlParameterSource p) {
        return ReportDtos.Section.table("decisions", "Decisions on problems", null, cols(c("at", "When", null, "datetime"), c("actor", "By"), c("action", "What was done"), c("title", "Problem"), c("entity", "Project or facility"), c("note", "Note")),
            jdbc.queryForList("SELECT x.created_at at, x.actor_name actor, x.action, a.title, coalesce(p.name, f.name) entity, x.note FROM alert_action x JOIN alert a ON a.id = x.alert_id LEFT JOIN project p ON a.entity_type = 'PROJECT' AND p.id = a.entity_id LEFT JOIN facility f ON a.entity_type = 'FACILITY' AND f.id = a.entity_id WHERE x.created_at >= :fromTs AND x.created_at < :toTs AND x.action <> 'COMMENT' AND (:sector IS NULL OR a.sector = :sector) AND (:zoneId IS NULL OR a.wereda_id IN (SELECT id FROM wereda WHERE zone_id = :zoneId)) ORDER BY x.created_at DESC LIMIT 300", p));
    }
    private ReportDtos.Section sectorTable(List<DashboardDtos.SectorSummary> rows) {
        return ReportDtos.Section.table("sectors", "Sectors at a glance", null, cols(c("sector", "Sector"), c("active", "Under way", "right", "int"), c("total", "Total", "right", "int"), c("completed", "Finished", "right", "int"), c("delayed", "Late or stopped", "right", "int"), c("progress", "Work done %", "right", "num"), c("planned", "Plan %", "right", "num"), c("budget", "Budget (ETB)", "right", "money"), c("disbursed", "Released (ETB)", "right", "money"), c("expended", "Spent (ETB)", "right", "money"), c("facilities", "Facilities", "right", "int"), c("severe", "Badly damaged", "right", "int"), c("alerts", "Open problems", "right", "int")),
            rows.stream().map(x -> row("sector", x.sector().name(), "active", x.projectsActive(), "total", x.projectsTotal(), "completed", x.projectsCompleted(), "delayed", x.projectsDelayed(), "progress", x.avgPhysicalProgressPct(), "planned", x.avgPlannedProgressPct(), "budget", x.budgetEtb(), "disbursed", x.disbursedEtb(), "expended", x.expendedEtb(), "facilities", x.facilitiesTotal(), "severe", x.facilitiesSevere(), "alerts", x.openAlerts())).toList());
    }
    private static List<ReportDtos.Column> projectColsShort() {
        return cols(c("code", "Code"), c("name", "Project"), c("wereda", "Wereda"), c("health", "How it is going"), c("physical", "Work done %", "right", "num"), c("planned", "Plan %", "right", "num"), c("variance", "Behind (−) or ahead (+) of plan, %", "right", "num"), c("risk", "Attention score", "right", "int"), c("forecastEnd", "Expected finish", null, "date"), c("lastReport", "Last report", null, "datetime"));
    }
    private static List<ReportDtos.Column> projectCols() {
        return cols(c("code", "Code"), c("name", "Project"), c("sector", "Sector"), c("wereda", "Wereda"), c("status", "Status"), c("health", "How it is going"), c("stage", "Stage"), c("physical", "Work done %", "right", "num"), c("planned", "Plan %", "right", "num"), c("variance", "Behind (−) or ahead (+) of plan, %", "right", "num"), c("risk", "Attention score", "right", "int"), c("budget", "Budget (ETB)", "right", "money"), c("disbursed", "Released (ETB)", "right", "money"), c("plannedEnd", "Planned finish", null, "date"), c("forecastEnd", "Expected finish", null, "date"), c("lastReport", "Last report", null, "datetime"), c("contractor", "Contractor"));
    }
    private List<Map<String, Object>> projectRows(String where, String order, int limit, MapSqlParameterSource p) {
        var q = SqlParams.copy(p).addValue("limit", limit, Types.INTEGER);
        return jdbc.queryForList(("SELECT p.code, p.name, p.sector, w.name_en wereda, p.status, p.health, p.lifecycle_stage stage, p.physical_progress_pct physical, p.planned_progress_pct planned, p.schedule_variance_pp variance, p.spi, p.cpi, p.risk_score risk, " +
            "p.total_budget_etb budget, p.disbursed_etb disbursed, coalesce(p.revised_end, p.planned_end) \"plannedEnd\", p.forecast_end \"forecastEnd\", p.last_progress_report_at \"lastReport\", p.contractor_name contractor " +
            "FROM project p JOIN wereda w ON w.id = p.wereda_id WHERE " + where + SCOPE_P + " ORDER BY " + order + " LIMIT :limit"), q);
    }
    private static List<ReportDtos.Column> inspectionCols() {
        return cols(c("visited", "Date", null, "date"), c("type", "Kind of visit"), c("subject", "Project or facility"), c("wereda", "Wereda"), c("inspector", "Visited by"), c("observed", "Work seen %", "right", "num"), c("reported", "Report said %", "right", "num"), c("quality", "Quality (1–5)", "right", "int"), c("safety", "Safety (1–5)", "right", "int"), c("distance", "Metres from the site", "right", "num"), c("media", "Photos", "right", "int"), c("status", "Confirmed?"), c("verifiedBy", "Answered by"));
    }
    private List<Map<String, Object>> inspectionRows(String where, MapSqlParameterSource p) {
        return jdbc.queryForList("""
            SELECT i.visited_on visited, i.inspection_type type, coalesce(p.name, f.name) subject, w.name_en wereda, i.inspector_name inspector, i.observed_progress_pct observed, i.reported_progress_pct reported,
                   i.quality_rating quality, i.safety_rating safety, i.distance_from_site_m distance, (SELECT count(*) FROM evidence_media m WHERE m.inspection_id = i.id) media, i.verification_status status, i.verified_by_name "verifiedBy"
            FROM field_inspection i JOIN wereda w ON w.id = i.wereda_id LEFT JOIN project p ON p.id = i.project_id LEFT JOIN facility f ON f.id = i.facility_id
            WHERE %s AND (:zoneId IS NULL OR w.zone_id = :zoneId) AND (:weredaId IS NULL OR w.id = :weredaId) AND (:sector IS NULL OR coalesce(p.sector, f.sector) = :sector)
            ORDER BY i.visited_on DESC LIMIT 300""".formatted(where), p);
    }
    private static List<ReportDtos.Kpi> headline(DashboardDtos.Kpis k, AlertDtos.Counts ac) {
        BigDecimal var = k.avgPhysicalProgressPct() == null || k.avgPlannedProgressPct() == null ? null : k.avgPhysicalProgressPct().subtract(k.avgPlannedProgressPct());
        return List.of(kpi("Projects under way", k.projectsActive() + " of " + k.projectsTotal(), k.projectsCompleted() + " finished"),
            kpi("Work done", k.avgPhysicalProgressPct() == null ? "—" : k.avgPhysicalProgressPct() + "%", var == null ? null : var.signum() < 0 ? String.format("behind plan by %.0f%%", var.abs()) : String.format("ahead of plan by %.0f%%", var)),
            kpi("Money released", money(k.disbursedEtb()), pct(k.disbursedEtb(), k.budgetEtb()) + " of the " + money(k.budgetEtb()) + " budget"),
            kpi("Money spent", money(k.expendedEtb()), pct(k.expendedEtb(), k.disbursedEtb()) + " of the money released"),
            kpi("Facilities back in service", k.facilitiesRestored() + " of " + k.facilitiesSevere() + " badly damaged", "rebuilding would cost " + money(k.replacementEstimateEtb())),
            kpi("Problems needing a decision", String.valueOf(ac.decisionRequired()), ac.critical() + " very serious · " + ac.open() + " open problems"),
            kpi("Projects needing attention", String.valueOf(k.projectsDelayed() + k.projectsStalled() + k.projectsAtRisk()), k.projectsDelayed() + " late · " + k.projectsStalled() + " stopped · " + k.projectsAtRisk() + " at risk"),
            kpi("People to be served", String.format("%,d", k.beneficiariesTargeted()), null));
    }
    private static ReportDtos.Kpi kpi(String l, String v, String h) { return new ReportDtos.Kpi(l, v, h, null); }
    private static ReportDtos.Column c(String key, String label) { return new ReportDtos.Column(key, label, "left", "text"); }
    private static ReportDtos.Column c(String key, String label, String align, String format) { return new ReportDtos.Column(key, label, align == null ? "left" : align, format); }
    private static List<ReportDtos.Column> cols(ReportDtos.Column... c) { return List.of(c); }
    private static List<ReportDtos.Column> moneyCols(String key, String label) { return cols(c(key, label), c("budget", "Budget (ETB)", "right", "money"), c("disbursed", "Released (ETB)", "right", "money"), c("expended", "Spent (ETB)", "right", "money"), c("projects", "Projects", "right", "int")); }
    private static Map<String, Object> row(Object... kv) { Map<String, Object> m = new LinkedHashMap<>(); for (int i = 0; i + 1 < kv.length; i += 2) m.put(String.valueOf(kv[i]), kv[i + 1]); return m; }
    private Long one(String sql, MapSqlParameterSource p) { Long v = jdbc.queryForObject(sql, p, Long.class); return v == null ? 0 : v; }
    private static String money(BigDecimal v) { return v == null ? "—" : "ETB " + IntelligenceService_compact(v); }
    private static String IntelligenceService_compact(BigDecimal v) { double d = v.doubleValue(); if (Math.abs(d) >= 1e9) return String.format("%.2f B", d / 1e9); if (Math.abs(d) >= 1e6) return String.format("%.1f M", d / 1e6); if (Math.abs(d) >= 1e4) return String.format("%.0f K", d / 1e3); return String.format("%,.0f", d); }
    private static String pct(BigDecimal a, BigDecimal b) { return a == null || b == null || b.signum() == 0 ? "—" : a.multiply(BigDecimal.valueOf(100)).divide(b, 0, RoundingMode.HALF_UP) + "%"; }
    private static String str(Object o) { return o == null ? "0" : String.valueOf(o); }
    private ReportDtos.Scope scope(Sector sector, Short zoneId, Integer weredaId, Long projectId) {
        String zone = zoneId == null ? null : jdbc.queryForObject("SELECT name_en FROM zone WHERE id = :z", new MapSqlParameterSource("z", zoneId), String.class);
        String wereda = weredaId == null ? null : jdbc.queryForObject("SELECT name_en FROM wereda WHERE id = :w", new MapSqlParameterSource("w", weredaId), String.class);
        String code = projectId == null ? null : jdbc.queryForObject("SELECT code FROM project WHERE id = :p", new MapSqlParameterSource("p", projectId), String.class);
        return new ReportDtos.Scope(sector, zoneId, zone, weredaId, wereda, projectId, code);
    }
    private static Map<String, Object> scopeMap(ReportDtos.Scope s) { Map<String, Object> m = new LinkedHashMap<>(); if (s.sector() != null) m.put("sector", s.sector().name()); if (s.zoneId() != null) m.put("zoneId", s.zoneId()); if (s.weredaId() != null) m.put("weredaId", s.weredaId()); if (s.projectId() != null) m.put("projectId", s.projectId()); return m; }
    private static int rows(ReportDtos.Report r) { return r.sections().stream().mapToInt(s -> s.rows() == null ? (s.kpis() == null ? (s.items() == null ? 0 : s.items().size()) : s.kpis().size()) : s.rows().size()).sum(); }
    private static byte[] jsonBytes(ReportDtos.Report r) { try { return new com.fasterxml.jackson.databind.ObjectMapper().findAndRegisterModules().writeValueAsBytes(r); } catch (Exception e) { return new byte[0]; } }
    static ReportDtos.RunDto dto(ReportRun r) { return new ReportDtos.RunDto(r.getId(), r.getReportType(), r.getPeriod(), r.getTitle(), r.getScope(), r.getFormat(), r.getGeneratedAt(), r.getGeneratedBy(), r.getRowCount(), r.getSha256()); }
}
