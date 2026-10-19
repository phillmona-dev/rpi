package et.gov.tigray.rpis.project;

import et.gov.tigray.rpis.analytics.ForecastProvider;
import et.gov.tigray.rpis.analytics.RiskScoringService;
import et.gov.tigray.rpis.analytics.ScheduleBaseline;
import et.gov.tigray.rpis.common.Enums.MilestoneStatus;
import et.gov.tigray.rpis.common.Enums.ProjectHealth;
import et.gov.tigray.rpis.common.Enums.ProjectStatus;
import et.gov.tigray.rpis.common.Money;
import et.gov.tigray.rpis.config.RpisProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

/**
 * Derives planned progress, schedule variance, SPI/CPI, health and forecast for a project.
 * Called whenever progress, milestones or finance change, and by the scheduled alert evaluation.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ProjectMetricsService {
    private final ProjectRepositories.Projects projects;
    private final ProjectRepositories.Milestones milestones;
    private final ProjectRepositories.Disbursements disbursements;
    private final ProjectRepositories.Expenditures expenditures;
    private final ProjectRepositories.Forecasts forecasts;
    private final ForecastProvider forecastProvider;
    private final RpisProperties props;
    private final RiskScoringService riskScoring;

    @Transactional
    public Project recompute(Long projectId, LocalDate asOf) {
        Project p = projects.findById(projectId).orElseThrow();
        return recompute(p, asOf);
    }

    @Transactional
    public Project recompute(Project p, LocalDate asOf) {
        List<Milestone> ms = milestones.findByProjectIdOrderBySequenceAsc(p.getId());
        double plannedPct = ScheduleBaseline.plannedPct(p.getPlannedStart(), effectiveEnd(p), baselinePoints(ms), asOf);
        if (p.getStatus() == ProjectStatus.COMPLETED) plannedPct = 100;
        p.setPlannedProgressPct(bd(plannedPct, 2));
        double physical = p.getPhysicalProgressPct().doubleValue();
        p.setScheduleVariancePp(bd(physical - plannedPct, 2));

        BigDecimal disbursed = disbursements.findByProjectIdOrderByTrancheNoAsc(p.getId()).stream()
            .filter(d -> d.getReleasedDate() != null).map(Disbursement::getAmountEtb).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal expended = expenditures.findByProjectIdOrderByPeriodStartAsc(p.getId()).stream()
            .map(Expenditure::getAmountEtb).reduce(BigDecimal.ZERO, BigDecimal::add);
        p.setDisbursedEtb(disbursed);
        p.setExpendedEtb(expended);

        // Milestone statuses
        for (Milestone m : ms) {
            if (m.getActualDate() != null) m.setStatus(MilestoneStatus.ACHIEVED);
            else if (m.getPlannedDate().isBefore(asOf)) m.setStatus(MilestoneStatus.OVERDUE);
            else if (!m.getPlannedDate().isAfter(asOf.plusDays(30)) && p.getStatus() == ProjectStatus.ACTIVE) m.setStatus(MilestoneStatus.IN_PROGRESS);
            else m.setStatus(MilestoneStatus.PENDING);
        }
        milestones.saveAll(ms);

        ForecastProvider.Forecast f = forecastProvider.forecast(new ForecastProvider.ForecastInput(
            p.getPlannedStart(), effectiveEnd(p), p.getActualStart(), asOf, physical, plannedPct, Money.nz(p.getTotalBudgetEtb()), expended));
        p.setSpi(f.spi() == null ? null : bd(f.spi(), 3));
        p.setCpi(f.cpi() == null ? null : bd(f.cpi(), 3));
        if (p.getStatus() == ProjectStatus.ACTIVE || p.getStatus() == ProjectStatus.SUSPENDED) {
            p.setForecastEnd(f.forecastEnd());
            p.setForecastProvider(forecastProvider.id());
            ProjectForecast stored = new ProjectForecast();
            stored.setProject(p); stored.setProvider(forecastProvider.id()); stored.setForecastEnd(f.forecastEnd());
            stored.setForecastCostEtb(f.forecastCost()); stored.setConfidence(bd(f.confidence(), 3)); stored.setRationale(f.rationale());
            forecasts.save(stored);
        } else if (p.getStatus() == ProjectStatus.COMPLETED) {
            p.setForecastEnd(p.getActualEnd());
        }

        p.setHealth(deriveHealth(p, ms, asOf));
        if (riskScoring != null) {
            RiskScoringService.Result r = riskScoring.score(p, ms, asOf);
            if (r == null) { p.setRiskScore(null); p.setRiskComponents(null); p.setRiskComputedAt(Instant.now()); }
            else { p.setRiskScore(r.score()); p.setRiskComponents(r.asMap()); p.setRiskComputedAt(r.computedAt()); }
        }
        return projects.save(p);
    }

    ProjectHealth deriveHealth(Project p, List<Milestone> ms, LocalDate asOf) {
        var a = props.getAlerts();
        switch (p.getStatus()) {
            case COMPLETED -> { return ProjectHealth.COMPLETED; }
            case PLANNED, PROCUREMENT, CANCELLED -> { return ProjectHealth.NOT_STARTED; }
            case SUSPENDED -> { return ProjectHealth.STALLED; }
            default -> {}
        }
        Instant last = p.getLastProgressReportAt();
        long daysSinceReport = last == null ? ChronoUnit.DAYS.between(p.getActualStart() != null ? p.getActualStart() : p.getPlannedStart(), asOf)
                                            : ChronoUnit.DAYS.between(last.atZone(ZoneOffset.UTC).toLocalDate(), asOf);
        if (daysSinceReport > a.getStalledReportingDays()) return ProjectHealth.STALLED;
        double variance = p.getScheduleVariancePp().doubleValue();
        boolean milestoneBadlyOverdue = ms.stream().anyMatch(m -> m.getActualDate() == null && ChronoUnit.DAYS.between(m.getPlannedDate(), asOf) > a.getMilestoneOverdueDays());
        if (variance <= -a.getScheduleVarianceDelayedPp() || milestoneBadlyOverdue) return ProjectHealth.DELAYED;
        double cpi = p.getCpi() == null ? 1 : p.getCpi().doubleValue();
        if (variance <= -a.getScheduleVarianceAtRiskPp() || cpi < a.getCostPerformanceAtRisk()) return ProjectHealth.AT_RISK;
        return ProjectHealth.ON_TRACK;
    }

    static LocalDate effectiveEnd(Project p) { return p.getRevisedEnd() != null ? p.getRevisedEnd() : p.getPlannedEnd(); }

    static List<ScheduleBaseline.Point> baselinePoints(List<Milestone> ms) {
        List<ScheduleBaseline.Point> pts = new ArrayList<>();
        double cum = 0;
        for (Milestone m : ms) { cum += m.getWeightPct().doubleValue(); pts.add(new ScheduleBaseline.Point(m.getPlannedDate(), Math.min(100, cum))); }
        return pts;
    }

    static BigDecimal bd(double v, int scale) { return BigDecimal.valueOf(v).setScale(scale, RoundingMode.HALF_UP); }
}
