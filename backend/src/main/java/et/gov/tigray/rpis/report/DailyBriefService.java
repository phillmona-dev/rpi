package et.gov.tigray.rpis.report;

import et.gov.tigray.rpis.alert.AlertDtos;
import et.gov.tigray.rpis.alert.AlertService;
import et.gov.tigray.rpis.common.Enums.AlertSeverity;
import et.gov.tigray.rpis.common.Enums.AlertStatus;
import et.gov.tigray.rpis.common.Sector;
import et.gov.tigray.rpis.dashboard.DashboardDtos;
import et.gov.tigray.rpis.dashboard.DashboardQueryRepository;
import et.gov.tigray.rpis.security.CurrentUser;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * Produces the executive daily brief model. Phase 3 adds a scheduler + PDF/email renderer
 * for the Federal/PMO digests on top of this same service.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class DailyBriefService {
    private final DashboardQueryRepository queries;
    private final AlertService alerts;
    private final NamedParameterJdbcTemplate jdbc;

    public record Change(String label, long last24h, long last7d) {}
    public record ProjectLine(Long id, String code, String name, Sector sector, String weredaName, BigDecimal physicalPct, BigDecimal plannedPct, BigDecimal variancePp, String health, LocalDate plannedEnd) {}
    public record DecisionLine(Long alertId, String title, String actor, String action, String note, Instant at) {}
    public record DailyBrief(Instant generatedAt, String preparedFor, Sector scope, DashboardDtos.Kpis kpis, AlertDtos.Counts alertCounts, List<Change> changes,
                             List<AlertDtos.AlertSummary> newCriticalAlerts, List<ProjectLine> newlyDelayed, List<ProjectLine> completedRecently,
                             List<DecisionLine> decisionsTaken, List<DashboardDtos.SectorSummary> sectors) {}

    public DailyBrief build(Sector sector) {
        var p = et.gov.tigray.rpis.common.SqlParams.scope(sector, null, null);
        List<Change> changes = List.of(
            count("Damage assessments received", "SELECT count(*) FROM damage_assessment a JOIN facility f ON f.id=a.facility_id WHERE a.created_at > now() - interval '%s' AND (:sector IS NULL OR f.sector = :sector)", p),
            count("Progress reports received", "SELECT count(*) FROM progress_log l JOIN project p ON p.id=l.project_id WHERE l.created_at > now() - interval '%s' AND (:sector IS NULL OR p.sector = :sector)", p),
            count("Alerts raised", "SELECT count(*) FROM alert WHERE triggered_at > now() - interval '%s' AND (:sector IS NULL OR sector = :sector)", p),
            count("Alerts resolved", "SELECT count(*) FROM alert WHERE resolved_at > now() - interval '%s' AND status='RESOLVED' AND (:sector IS NULL OR sector = :sector)", p),
            count("Disbursements released", "SELECT count(*) FROM disbursement d JOIN project p ON p.id=d.project_id WHERE d.released_date > current_date - interval '%s' AND (:sector IS NULL OR p.sector = :sector)", p));
        List<AlertDtos.AlertSummary> critical = alerts.search(new AlertService.Filter(List.of(AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED, AlertStatus.ASSIGNED),
            List.of(AlertSeverity.CRITICAL), sector, null, null, null, null), PageRequest.of(0, 10, Sort.by("triggeredAt").descending())).getContent();
        List<ProjectLine> delayed = jdbc.query("""
            SELECT p.id, p.code, p.name, p.sector, w.name_en, p.physical_progress_pct, p.planned_progress_pct, p.schedule_variance_pp, p.health, p.planned_end
            FROM project p JOIN wereda w ON w.id = p.wereda_id
            WHERE p.health IN ('DELAYED','STALLED') AND p.status = 'ACTIVE' AND (:sector IS NULL OR p.sector = :sector)
            ORDER BY p.schedule_variance_pp ASC LIMIT 10""", p, this::line);
        List<ProjectLine> completed = jdbc.query("""
            SELECT p.id, p.code, p.name, p.sector, w.name_en, p.physical_progress_pct, p.planned_progress_pct, p.schedule_variance_pp, p.health, p.planned_end
            FROM project p JOIN wereda w ON w.id = p.wereda_id
            WHERE p.status = 'COMPLETED' AND p.actual_end > current_date - interval '30 days' AND (:sector IS NULL OR p.sector = :sector)
            ORDER BY p.actual_end DESC LIMIT 10""", p, this::line);
        List<DecisionLine> decisions = jdbc.query("""
            SELECT x.alert_id, a.title, x.actor_name, x.action, x.note, x.created_at
            FROM alert_action x JOIN alert a ON a.id = x.alert_id
            WHERE x.created_at > now() - interval '7 days' AND x.action <> 'COMMENT' AND (:sector IS NULL OR a.sector = :sector)
            ORDER BY x.created_at DESC LIMIT 15""", p, (rs, i) -> new DecisionLine(rs.getLong("alert_id"), rs.getString("title"), rs.getString("actor_name"), rs.getString("action"), rs.getString("note"), rs.getTimestamp("created_at").toInstant()));
        return new DailyBrief(Instant.now(), CurrentUser.get().map(CurrentUser::fullName).orElse("Executive Office"), sector,
            queries.kpis(sector, null, null), alerts.counts(sector), changes, critical, delayed, completed, decisions, queries.sectors(null, null));
    }

    private Change count(String label, String sqlTemplate, MapSqlParameterSource p) {
        Long d1 = jdbc.queryForObject(sqlTemplate.formatted("24 hours"), p, Long.class);
        Long d7 = jdbc.queryForObject(sqlTemplate.formatted("7 days"), p, Long.class);
        return new Change(label, d1 == null ? 0 : d1, d7 == null ? 0 : d7);
    }

    private ProjectLine line(java.sql.ResultSet rs, int i) throws java.sql.SQLException {
        return new ProjectLine(rs.getLong("id"), rs.getString("code"), rs.getString("name"), Sector.valueOf(rs.getString("sector")), rs.getString("name_en"),
            rs.getBigDecimal("physical_progress_pct"), rs.getBigDecimal("planned_progress_pct"), rs.getBigDecimal("schedule_variance_pp"), rs.getString("health"), rs.getDate("planned_end").toLocalDate());
    }
}
