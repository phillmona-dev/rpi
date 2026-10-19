package et.gov.tigray.rpis.federal;

import et.gov.tigray.rpis.alert.AlertDtos;
import et.gov.tigray.rpis.alert.AlertService;
import et.gov.tigray.rpis.common.Sector;
import et.gov.tigray.rpis.dashboard.DashboardDtos;
import et.gov.tigray.rpis.dashboard.DashboardQueryRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;

/**
 * Versioned, aggregate-only read model for the Federal Government / Prime Minister's Office.
 * No personal data, no decision workflow; every call is audited by FederalReadAuditFilter.
 */
@RestController
@RequestMapping("/api/v1/federal")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('PMO_FEDERAL','EXECUTIVE','ADMIN')")
@Tag(name = "Federal / PMO gateway")
public class FederalController {
    public static final String SCHEMA_VERSION = "2026-10.1";
    private final DashboardQueryRepository queries;
    private final AlertService alerts;

    public record Summary(String schemaVersion, Instant generatedAt, String region, Sector sector, DashboardDtos.Kpis kpis, AlertDtos.Counts alerts, List<DashboardDtos.SectorSummary> sectors, List<DashboardDtos.FundingSlice> byFundingSource) {}

    @GetMapping("/summary")
    @Operation(summary = "Stable aggregate summary for federal integration (schemaVersion is a contract)")
    public Summary summary(@RequestParam(required = false) Sector sector) {
        return new Summary(SCHEMA_VERSION, Instant.now(), "TG", sector, queries.kpis(sector, null, null), alerts.counts(sector), queries.sectors(null, null), queries.budgetBy("funding_source", sector, null, null));
    }
}
