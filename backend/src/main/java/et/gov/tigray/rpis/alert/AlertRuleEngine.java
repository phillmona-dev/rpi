package et.gov.tigray.rpis.alert;

import et.gov.tigray.rpis.common.Enums.*;
import et.gov.tigray.rpis.config.RpisProperties;
import et.gov.tigray.rpis.facility.Facility;
import et.gov.tigray.rpis.facility.FacilityRepository;
import et.gov.tigray.rpis.project.Disbursement;
import et.gov.tigray.rpis.project.Milestone;
import et.gov.tigray.rpis.project.Project;
import et.gov.tigray.rpis.project.ProjectMetricsService;
import et.gov.tigray.rpis.project.ProjectRepositories;
import et.gov.tigray.rpis.realtime.DomainEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * Declarative, threshold-driven alert rules (Pillar 3 "flag delays or cost variances instantly").
 * Each alert carries the metric values that fired it so executives can see *why*.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AlertRuleEngine {
    private final RpisProperties props;
    private final ProjectRepositories.Projects projects;
    private final ProjectRepositories.Milestones milestones;
    private final ProjectRepositories.Disbursements disbursements;
    private final ProjectRepositories.ProjectFacilities projectFacilities;
    private final FacilityRepository facilities;
    private final AlertRepository alerts;
    private final ProjectMetricsService metrics;
    private final ApplicationEventPublisher events;
    private final org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate jdbc;

    @Scheduled(cron = "${rpis.alerts.evaluation-cron:0 */5 * * * *}")
    public void scheduled() { evaluateAll(); }

    @Transactional
    public int evaluateAll() {
        // One evaluation at a time, so concurrent runs cannot raise the same alert twice. Released at transaction end.
        jdbc.getJdbcOperations().execute("SELECT pg_advisory_xact_lock(4207002)");
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        var a = props.getAlerts();
        Set<String> stillFiring = new HashSet<>();
        int created = 0;

        for (Long id : projects.allIds()) {
            Project p = metrics.recompute(id, today);
            if (p.getStatus() != ProjectStatus.ACTIVE && p.getStatus() != ProjectStatus.SUSPENDED) continue;
            double variance = p.getScheduleVariancePp().doubleValue();
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("physicalPct", p.getPhysicalProgressPct()); m.put("plannedPct", p.getPlannedProgressPct()); m.put("variancePp", p.getScheduleVariancePp());
            m.put("spi", p.getSpi()); m.put("cpi", p.getCpi());

            if (variance <= -a.getScheduleVarianceDelayedPp()) {
                created += upsert(stillFiring, AlertRule.SCHEDULE_SLIPPAGE, variance <= -30 ? AlertSeverity.CRITICAL : AlertSeverity.HIGH, p,
                    "Behind plan by " + fmt(-variance) + "%",
                    String.format("%s%% of the work is done, but the plan expected %s%% by now. At this pace it will finish on %s instead of %s.",
                        fmt(p.getPhysicalProgressPct().doubleValue()), fmt(p.getPlannedProgressPct().doubleValue()), p.getForecastEnd() == null ? "an unknown date" : p.getForecastEnd(), p.getPlannedEnd()), m, true);
            } else if (variance <= -a.getScheduleVarianceAtRiskPp()) {
                created += upsert(stillFiring, AlertRule.SCHEDULE_SLIPPAGE, AlertSeverity.MEDIUM, p,
                    "Starting to fall behind: " + fmt(-variance) + "% behind plan",
                    String.format("%s%% of the work is done; the plan expected %s%% by now.", fmt(p.getPhysicalProgressPct().doubleValue()), fmt(p.getPlannedProgressPct().doubleValue())), m, false);
            }

            if (p.getCpi() != null && p.getPhysicalProgressPct().doubleValue() >= 10) {
                double overrunPct = (1 / Math.max(0.01, p.getCpi().doubleValue()) - 1) * 100;
                if (overrunPct >= a.getCostOverrunPct()) {
                    Map<String, Object> cm = new LinkedHashMap<>(m); cm.put("overrunPct", Math.round(overrunPct));
                    cm.put("expendedEtb", p.getExpendedEtb()); cm.put("budgetEtb", p.getTotalBudgetEtb());
                    created += upsert(stillFiring, AlertRule.COST_OVERRUN, overrunPct >= 25 ? AlertSeverity.CRITICAL : AlertSeverity.HIGH, p,
                        "Likely to cost about " + Math.round(overrunPct) + "% more than planned",
                        String.format("ETB %,.0f has been spent for %s%% of the work, on a budget of ETB %,.0f. At this rate the project will cost about %d%% more than planned.",
                            p.getExpendedEtb(), fmt(p.getPhysicalProgressPct().doubleValue()), p.getTotalBudgetEtb(), Math.round(overrunPct)), cm, true);
                }
            }

            long daysSince = p.getLastProgressReportAt() == null
                ? ChronoUnit.DAYS.between(p.getActualStart() != null ? p.getActualStart() : p.getPlannedStart(), today)
                : ChronoUnit.DAYS.between(p.getLastProgressReportAt().atZone(ZoneOffset.UTC).toLocalDate(), today);
            if (p.getStatus() == ProjectStatus.ACTIVE && daysSince > a.getStalledReportingDays()) {
                Map<String, Object> sm = new LinkedHashMap<>(m); sm.put("daysSinceReport", daysSince);
                created += upsert(stillFiring, AlertRule.STALLED_REPORTING, daysSince > 2L * a.getStalledReportingDays() ? AlertSeverity.CRITICAL : AlertSeverity.HIGH, p,
                    "No progress report for " + daysSince + " days",
                    String.format("%s Reports are expected at least every %d days: work may have stopped, or the site manager may not be able to send reports.",
                        p.getLastProgressReportAt() == null ? "No progress report has been received yet." : "The last progress report was on " + p.getLastProgressReportAt().atZone(ZoneOffset.UTC).toLocalDate() + ".", a.getStalledReportingDays()), sm, true);
            }
        }

        // Field verification: active projects whose reported progress has not been independently verified for too long
        int staleDays = props.getMedia().getEvidenceStaleDays();
        for (Project p : projects.findByStatusIn(List.of(ProjectStatus.ACTIVE))) {
            long sinceVerified = p.getLastVerifiedAt() == null
                ? ChronoUnit.DAYS.between(p.getActualStart() != null ? p.getActualStart() : p.getPlannedStart(), today)
                : ChronoUnit.DAYS.between(p.getLastVerifiedAt().atZone(ZoneOffset.UTC).toLocalDate(), today);
            if (p.getPhysicalProgressPct().doubleValue() >= 10 && sinceVerified > 2L * staleDays) {
                Map<String, Object> vm = new LinkedHashMap<>(); vm.put("daysSinceVerified", sinceVerified); vm.put("physicalPct", p.getPhysicalProgressPct()); vm.put("thresholdDays", 2L * staleDays);
                created += upsert(stillFiring, AlertRule.FIELD_VERIFICATION_OVERDUE, sinceVerified > 4L * staleDays ? AlertSeverity.HIGH : AlertSeverity.MEDIUM, p,
                    "No one has checked this site for " + sinceVerified + " days",
                    String.format("The reported progress (%s%%) has not been checked on site since %s. Send someone to check before relying on it.",
                        fmt(p.getPhysicalProgressPct().doubleValue()), p.getLastVerifiedAt() == null ? "the project started" : p.getLastVerifiedAt().atZone(ZoneOffset.UTC).toLocalDate().toString()), vm, false);
            }
            // Reported vs observed discrepancy from the latest non-rejected inspection within 60 days
            Map<String, Object> obs = jdbc.queryForMap("""
                SELECT coalesce(max(observed_progress_pct), -1) obs, coalesce(max(reported_progress_pct), -1) rep, max(visited_on) visited FROM field_inspection
                WHERE project_id = :id AND observed_progress_pct IS NOT NULL AND visited_on > current_date - interval '60 days' AND verification_status <> 'REJECTED'
                """, new org.springframework.jdbc.core.namedparam.MapSqlParameterSource().addValue("id", p.getId(), java.sql.Types.BIGINT));
            double o = ((Number) obs.get("obs")).doubleValue(), r = ((Number) obs.get("rep")).doubleValue();
            if (o >= 0 && r >= 0 && r - o >= 10) {
                Map<String, Object> pm = new LinkedHashMap<>(); pm.put("reportedPct", r); pm.put("observedPct", o); pm.put("gapPp", r - o); pm.put("visitedOn", String.valueOf(obs.get("visited")));
                created += upsert(stillFiring, AlertRule.PROGRESS_DISCREPANCY, r - o >= 20 ? AlertSeverity.CRITICAL : AlertSeverity.HIGH, p,
                    String.format("Site report says %.0f%% done, but the visit found %.0f%%", r, o),
                    String.format("On %s a field visit found %.0f%% of the work done, while the site reported %.0f%%. Do not accept the reported figure until it is confirmed.", obs.get("visited"), o, r), pm, true);
            }
        }

        for (Milestone ms : milestones.findOverdue(today.minusDays(a.getMilestoneOverdueDays()))) {
            Project p = ms.getProject();
            long overdue = ChronoUnit.DAYS.between(ms.getPlannedDate(), today);
            Map<String, Object> mm = new LinkedHashMap<>(); mm.put("milestone", ms.getName()); mm.put("plannedDate", ms.getPlannedDate().toString()); mm.put("overdueDays", overdue);
            created += upsert(stillFiring, AlertRule.MILESTONE_OVERDUE, overdue > 90 ? AlertSeverity.CRITICAL : AlertSeverity.HIGH, p,
                "Step overdue: " + ms.getName(), String.format("This step was planned for %s and is now %d days late.", ms.getPlannedDate(), overdue), mm, overdue > 60);
        }

        for (Disbursement d : disbursements.findLagging(today.minusDays(a.getDisbursementLagDays()))) {
            Project p = d.getProject();
            long lag = ChronoUnit.DAYS.between(d.getPlannedDate(), today);
            Map<String, Object> dm = new LinkedHashMap<>(); dm.put("tranche", d.getTrancheNo()); dm.put("amountEtb", d.getAmountEtb()); dm.put("plannedDate", d.getPlannedDate().toString()); dm.put("lagDays", lag); dm.put("fundingSource", d.getFundingSource().name());
            created += upsert(stillFiring, AlertRule.DISBURSEMENT_LAG, lag > 90 ? AlertSeverity.HIGH : AlertSeverity.MEDIUM, p,
                String.format("Payment %d (ETB %,.0f) is %d days late", d.getTrancheNo(), d.getAmountEtb(), lag),
                String.format("It was due on %s (%s) and has not been released yet (%s). Work may slow down without the money.",
                    d.getPlannedDate(), words(d.getFundingSource().name()), words(d.getStatus().name())), dm, true);
        }

        // Severe / destroyed facilities with no reconstruction project at all
        for (Facility f : facilities.findAll()) {
            if ((f.getLatestSeverity() == DamageSeverity.SEVERE || f.getLatestSeverity() == DamageSeverity.DESTROYED) && projectFacilities.countByFacilityId(f.getId()) == 0) {
                Map<String, Object> fm = new LinkedHashMap<>(); fm.put("severity", f.getLatestSeverity().name()); fm.put("replacementEstimateEtb", f.getReplacementEstimateEtb()); fm.put("beneficiaries", f.getBeneficiaries());
                Alert existing = alerts.findOpen(AlertRule.SEVERE_DAMAGE_UNADDRESSED, EntityType.FACILITY, f.getId()).orElse(null);
                String key = AlertRule.SEVERE_DAMAGE_UNADDRESSED + ":FACILITY:" + f.getId();
                stillFiring.add(key);
                if (existing == null) {
                    Alert al = new Alert();
                    al.setRule(AlertRule.SEVERE_DAMAGE_UNADDRESSED); al.setSeverity(f.getLatestSeverity() == DamageSeverity.DESTROYED ? AlertSeverity.HIGH : AlertSeverity.MEDIUM);
                    al.setTitle(facilityTitle(f));
                    al.setDetail(facilityDetail(f));
                    al.setEntityType(EntityType.FACILITY); al.setEntityId(f.getId()); al.setSector(f.getSector()); al.setWeredaId(f.getWereda().getId());
                    al.setDecisionRequired(true); al.setMetrics(fm);
                    alerts.save(al); created++;
                    publish(al);
                } else { existing.setTitle(facilityTitle(f)); existing.setDetail(facilityDetail(f)); existing.setLastEvaluatedAt(Instant.now()); existing.setMetrics(fm); alerts.save(existing); }
            }
        }

        // Auto-resolve alerts whose condition has cleared
        int autoResolved = 0;
        for (Alert open : alerts.findAllOpen()) {
            String key = open.getRule() + ":" + open.getEntityType() + ":" + open.getEntityId();
            if (!stillFiring.contains(key)) {
                open.setStatus(AlertStatus.RESOLVED); open.setResolvedAt(Instant.now());
                open.setDetail((open.getDetail() == null ? "" : open.getDetail() + " ") + "(Closed automatically: the problem is no longer there.)");
                alerts.save(open); autoResolved++;
            }
        }
        if (created > 0 || autoResolved > 0) log.info("Alert evaluation: {} new, {} auto-resolved", created, autoResolved);
        return created;
    }

    private int upsert(Set<String> firing, AlertRule rule, AlertSeverity sev, Project p, String title, String detail, Map<String, Object> metrics, boolean decision) {
        String key = rule + ":PROJECT:" + p.getId();
        firing.add(key);
        Alert existing = alerts.findOpen(rule, EntityType.PROJECT, p.getId()).orElse(null);
        if (existing != null) {
            existing.setSeverity(sev); existing.setTitle(title); existing.setDetail(detail); existing.setMetrics(metrics); existing.setLastEvaluatedAt(Instant.now());
            alerts.save(existing);
            return 0;
        }
        Alert al = new Alert();
        al.setRule(rule); al.setSeverity(sev); al.setTitle(title); al.setDetail(detail); al.setEntityType(EntityType.PROJECT); al.setEntityId(p.getId());
        al.setSector(p.getSector()); al.setWeredaId(p.getWereda().getId()); al.setDecisionRequired(decision); al.setMetrics(metrics);
        alerts.save(al);
        publish(al);
        return 1;
    }

    private void publish(Alert al) {
        events.publishEvent(DomainEvent.of("ALERT_RAISED", al.getEntityType().name(), al.getEntityId(), al.getSector(), al.getWeredaId(),
            Map.of("alertId", al.getId(), "title", al.getTitle(), "severity", al.getSeverity().name(), "rule", al.getRule().name(), "decisionRequired", al.isDecisionRequired())));
    }

    private static String fmt(double v) { return String.format("%.0f", v); }

    /** DONOR_GRANT → "donor grant": codes read as words in alert text. */
    private static String words(String code) { return code.replace('_', ' ').toLowerCase(java.util.Locale.ROOT); }

    private static String facilityTitle(Facility f) {
        return (f.getLatestSeverity() == DamageSeverity.DESTROYED ? "Destroyed, no project yet: " : "Heavily damaged, no project yet: ") + f.getName();
    }

    private static String facilityDetail(Facility f) {
        return String.format("This facility was found %s and no project covers it. Rebuilding is estimated at ETB %,.0f; %s.",
            f.getLatestSeverity() == DamageSeverity.DESTROYED ? "destroyed" : "heavily damaged", f.getReplacementEstimateEtb() == null ? 0d : f.getReplacementEstimateEtb(),
            f.getBeneficiaries() == null ? "the number of people affected is not known" : String.format("about %,d people are affected", f.getBeneficiaries()));
    }
}
