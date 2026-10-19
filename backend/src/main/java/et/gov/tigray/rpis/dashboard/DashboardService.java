package et.gov.tigray.rpis.dashboard;

import et.gov.tigray.rpis.alert.AlertDtos;
import et.gov.tigray.rpis.alert.AlertService;
import et.gov.tigray.rpis.common.Enums.AlertSeverity;
import et.gov.tigray.rpis.common.Enums.AlertStatus;
import et.gov.tigray.rpis.common.Enums.ProjectHealth;
import et.gov.tigray.rpis.common.Enums.ProjectStatus;
import et.gov.tigray.rpis.common.Sector;
import et.gov.tigray.rpis.geo.GeoService;
import et.gov.tigray.rpis.project.ProjectDtos;
import et.gov.tigray.rpis.project.ProjectService;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class DashboardService {
    private final DashboardQueryRepository queries;
    private final AlertService alerts;
    private final ProjectService projects;
    private final GeoService geo;

    @Cacheable(cacheNames = "overview", key = "#sector + ':' + #zoneId + ':' + #weredaId")
    public DashboardDtos.Overview overview(Sector sector, Short zoneId, Integer weredaId) {
        List<AlertDtos.AlertSummary> queue = alerts.search(new AlertService.Filter(List.of(AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED, AlertStatus.ASSIGNED),
            List.of(AlertSeverity.CRITICAL, AlertSeverity.HIGH), sector, weredaId, zoneId, null, null),
            PageRequest.of(0, 8, Sort.by("severity").ascending().and(Sort.by("triggeredAt").descending()))).getContent();
        List<ProjectDtos.ProjectSummary> attention = projects.search(new ProjectService.Filter(sector, zoneId, weredaId, List.of(ProjectStatus.ACTIVE, ProjectStatus.SUSPENDED),
            List.of(ProjectHealth.DELAYED, ProjectHealth.STALLED, ProjectHealth.AT_RISK), null, null),
            PageRequest.of(0, 10, Sort.by("scheduleVariancePp").ascending())).getContent();
        return new DashboardDtos.Overview(Instant.now(), new DashboardDtos.Scope(sector, zoneId, weredaId),
            queries.kpis(sector, zoneId, weredaId), alerts.counts(sector, zoneId, weredaId), queue, queries.sectors(zoneId, weredaId),
            queries.trend(sector, zoneId, weredaId, 12), queries.budgetBy("sector", sector, zoneId, weredaId), queries.budgetBy("funding_source", sector, zoneId, weredaId),
            attention, geo.weredaMetrics(sector, zoneId, weredaId), queries.stream(sector, zoneId, weredaId, 20), queries.statusCounts(sector, zoneId, weredaId));
    }

    public List<DashboardDtos.TrendPoint> trend(Sector sector, Short zoneId, Integer weredaId, int months) { return queries.trend(sector, zoneId, weredaId, months); }
    public List<DashboardDtos.StreamItem> stream(Sector sector, Short zoneId, Integer weredaId, int limit) { return queries.stream(sector, zoneId, weredaId, limit); }
    public List<DashboardDtos.SectorSummary> sectors(Short zoneId, Integer weredaId) { return queries.sectors(zoneId, weredaId); }
}
