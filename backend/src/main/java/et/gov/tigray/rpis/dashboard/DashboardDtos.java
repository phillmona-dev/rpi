package et.gov.tigray.rpis.dashboard;

import et.gov.tigray.rpis.alert.AlertDtos;
import et.gov.tigray.rpis.common.Sector;
import et.gov.tigray.rpis.geo.GeoDtos;
import et.gov.tigray.rpis.project.ProjectDtos;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

public final class DashboardDtos {
    private DashboardDtos() {}

    public record Kpis(long projectsTotal, long projectsActive, long projectsCompleted, long projectsDelayed, long projectsAtRisk, long projectsStalled,
                       BigDecimal avgPhysicalProgressPct, BigDecimal avgPlannedProgressPct, BigDecimal budgetEtb, BigDecimal disbursedEtb, BigDecimal expendedEtb,
                       long facilitiesTotal, long facilitiesSevere, long facilitiesFunctional, long facilitiesRestored, BigDecimal replacementEstimateEtb,
                       long beneficiariesTargeted, long assessmentsLast7Days, long progressReportsLast7Days, Instant lastFieldDataAt, Instant lastProgressDataAt) {}

    public record SectorSummary(Sector sector, long projectsTotal, long projectsActive, long projectsCompleted, long projectsDelayed,
                                BigDecimal avgPhysicalProgressPct, BigDecimal avgPlannedProgressPct, BigDecimal budgetEtb, BigDecimal disbursedEtb, BigDecimal expendedEtb,
                                long facilitiesTotal, long facilitiesSevere, long facilitiesFunctional, long openAlerts, long criticalAlerts, List<BigDecimal> progressSparkline) {}

    public record TrendPoint(LocalDate period, BigDecimal plannedPct, BigDecimal actualPct, BigDecimal disbursedCumulativeEtb, BigDecimal expendedCumulativeEtb, long reports) {}

    public record FundingSlice(String key, BigDecimal budgetEtb, BigDecimal disbursedEtb, BigDecimal expendedEtb, long projects) {}

    public record StreamItem(String id, String kind, Instant occurredAt, String title, String detail, Sector sector, String entityType, Long entityId,
                             String weredaName, String severity, Map<String, Object> data) {}

    public record Overview(Instant generatedAt, Scope scope, Kpis kpis, AlertDtos.Counts alertCounts, List<AlertDtos.AlertSummary> decisionQueue,
                           List<SectorSummary> sectors, List<TrendPoint> trend, List<FundingSlice> budgetBySector, List<FundingSlice> budgetByFundingSource,
                           List<ProjectDtos.ProjectSummary> attentionProjects, List<GeoDtos.WeredaMetrics> weredas, List<StreamItem> stream,
                           ProjectDtos.StatusCounts statusCounts) {}

    public record Scope(Sector sector, Short zoneId, Integer weredaId) {}
}
