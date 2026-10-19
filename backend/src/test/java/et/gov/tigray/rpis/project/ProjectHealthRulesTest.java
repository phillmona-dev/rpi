package et.gov.tigray.rpis.project;

import et.gov.tigray.rpis.analytics.EarnedValueForecastProvider;
import et.gov.tigray.rpis.common.Enums.ProjectHealth;
import et.gov.tigray.rpis.common.Enums.ProjectStatus;
import et.gov.tigray.rpis.config.RpisProperties;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class ProjectHealthRulesTest {
    private final ProjectMetricsService svc = new ProjectMetricsService(null, null, null, null, null, new EarnedValueForecastProvider(), new RpisProperties(), null);
    private final LocalDate today = LocalDate.of(2026, 10, 19);

    private Project project(ProjectStatus status, double variancePp, Integer daysSinceReport, Double cpi) {
        Project p = new Project();
        p.setStatus(status); p.setPlannedStart(today.minusMonths(6)); p.setPlannedEnd(today.plusMonths(6)); p.setActualStart(today.minusMonths(6));
        p.setScheduleVariancePp(BigDecimal.valueOf(variancePp));
        if (daysSinceReport != null) p.setLastProgressReportAt(today.minusDays(daysSinceReport).atStartOfDay().toInstant(ZoneOffset.UTC));
        if (cpi != null) p.setCpi(BigDecimal.valueOf(cpi));
        return p;
    }

    @Test void completedIsCompleted() { assertThat(svc.deriveHealth(project(ProjectStatus.COMPLETED, 0, 1, 1.0), List.of(), today)).isEqualTo(ProjectHealth.COMPLETED); }
    @Test void plannedIsNotStarted() { assertThat(svc.deriveHealth(project(ProjectStatus.PLANNED, 0, null, null), List.of(), today)).isEqualTo(ProjectHealth.NOT_STARTED); }
    @Test void silentSiteIsStalled() { assertThat(svc.deriveHealth(project(ProjectStatus.ACTIVE, 0, 30, 1.0), List.of(), today)).isEqualTo(ProjectHealth.STALLED); }
    @Test void bigVarianceIsDelayed() { assertThat(svc.deriveHealth(project(ProjectStatus.ACTIVE, -20, 2, 1.0), List.of(), today)).isEqualTo(ProjectHealth.DELAYED); }
    @Test void smallVarianceIsAtRisk() { assertThat(svc.deriveHealth(project(ProjectStatus.ACTIVE, -7, 2, 1.0), List.of(), today)).isEqualTo(ProjectHealth.AT_RISK); }
    @Test void poorCpiIsAtRisk() { assertThat(svc.deriveHealth(project(ProjectStatus.ACTIVE, 0, 2, 0.8), List.of(), today)).isEqualTo(ProjectHealth.AT_RISK); }
    @Test void healthyIsOnTrack() { assertThat(svc.deriveHealth(project(ProjectStatus.ACTIVE, 1, 2, 1.02), List.of(), today)).isEqualTo(ProjectHealth.ON_TRACK); }
    @Test void overdueMilestoneIsDelayed() {
        Milestone m = new Milestone(); m.setPlannedDate(today.minusDays(45)); m.setWeightPct(BigDecimal.TEN);
        assertThat(svc.deriveHealth(project(ProjectStatus.ACTIVE, 0, 2, 1.0), List.of(m), today)).isEqualTo(ProjectHealth.DELAYED);
    }
}
