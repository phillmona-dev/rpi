package et.gov.tigray.rpis.finance;

import et.gov.tigray.rpis.common.Sector;
import et.gov.tigray.rpis.dashboard.DashboardDtos;
import et.gov.tigray.rpis.dashboard.DashboardQueryRepository;
import et.gov.tigray.rpis.security.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/v1/finance")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('EXECUTIVE','ANALYST','PMO_FEDERAL','ADMIN','SECTOR_HEAD')")
@Tag(name = "Finance")
public class FinanceController {
    private final DashboardQueryRepository queries;
    private final NamedParameterJdbcTemplate jdbc;

    public record PipelineItem(Long projectId, String projectCode, String projectName, Sector sector, String weredaName, short trancheNo,
                               LocalDate plannedDate, BigDecimal amountEtb, String fundingSource, String status, long lagDays) {}
    public record ZoneSlice(Short zoneId, String zoneName, BigDecimal budgetEtb, BigDecimal disbursedEtb, BigDecimal expendedEtb, long projects) {}
    public record VarianceItem(Long projectId, String projectCode, String projectName, Sector sector, BigDecimal budgetEtb, BigDecimal expendedEtb,
                               BigDecimal physicalPct, BigDecimal cpi, BigDecimal forecastCostEtb) {}
    public record FinanceOverview(List<DashboardDtos.FundingSlice> bySector, List<DashboardDtos.FundingSlice> byFundingSource, List<DashboardDtos.FundingSlice> byStatus,
                                  List<ZoneSlice> byZone, List<PipelineItem> pendingDisbursements, List<VarianceItem> costVariance) {}

    @GetMapping("/overview")
    @Operation(summary = "Allocation vs release vs certified expenditure by sector, source, zone; pending tranches; cost-variance watchlist")
    public FinanceOverview overview(@RequestParam(required = false) Sector sector, @RequestParam(required = false) Short zoneId) {
        Sector s = CurrentUser.get().map(u -> u.effectiveSectorFilter(sector)).orElse(sector);
        var p = et.gov.tigray.rpis.common.SqlParams.scope(s, zoneId, null);
        List<ZoneSlice> byZone = jdbc.query("""
            SELECT z.id, z.name_en, coalesce(sum(p.total_budget_etb),0) b, coalesce(sum(p.disbursed_etb),0) d, coalesce(sum(p.expended_etb),0) e, count(p.id) n
            FROM zone z LEFT JOIN wereda w ON w.zone_id = z.id
            LEFT JOIN project p ON p.wereda_id = w.id AND p.status <> 'CANCELLED' AND (:sector IS NULL OR p.sector = :sector)
            WHERE (:zoneId IS NULL OR z.id = :zoneId) GROUP BY z.id, z.name_en ORDER BY b DESC
            """, p, (rs, i) -> new ZoneSlice(rs.getShort("id"), rs.getString("name_en"), rs.getBigDecimal("b"), rs.getBigDecimal("d"), rs.getBigDecimal("e"), rs.getLong("n")));
        List<PipelineItem> pipeline = jdbc.query("""
            SELECT p.id, p.code, p.name, p.sector, w.name_en wereda, d.tranche_no, d.planned_date, d.amount_etb, d.funding_source, d.status,
                   GREATEST(0, current_date - d.planned_date) lag
            FROM disbursement d JOIN project p ON p.id = d.project_id JOIN wereda w ON w.id = p.wereda_id
            WHERE d.status <> 'RELEASED' AND p.status IN ('ACTIVE','PROCUREMENT','PLANNED')
              AND (:sector IS NULL OR p.sector = :sector) AND (:zoneId IS NULL OR w.zone_id = :zoneId)
            ORDER BY d.planned_date ASC LIMIT 50
            """, p, (rs, i) -> new PipelineItem(rs.getLong("id"), rs.getString("code"), rs.getString("name"), Sector.valueOf(rs.getString("sector")), rs.getString("wereda"),
                rs.getShort("tranche_no"), rs.getDate("planned_date").toLocalDate(), rs.getBigDecimal("amount_etb"), rs.getString("funding_source"), rs.getString("status"), rs.getLong("lag")));
        List<VarianceItem> variance = jdbc.query("""
            SELECT p.id, p.code, p.name, p.sector, p.total_budget_etb, p.expended_etb, p.physical_progress_pct, p.cpi,
                   (SELECT f.forecast_cost_etb FROM project_forecast f WHERE f.project_id = p.id ORDER BY f.computed_at DESC LIMIT 1) fc
            FROM project p JOIN wereda w ON w.id = p.wereda_id
            WHERE p.status = 'ACTIVE' AND p.cpi IS NOT NULL AND p.cpi < 0.95 AND p.physical_progress_pct >= 10
              AND (:sector IS NULL OR p.sector = :sector) AND (:zoneId IS NULL OR w.zone_id = :zoneId)
            ORDER BY p.cpi ASC LIMIT 25
            """, p, (rs, i) -> new VarianceItem(rs.getLong("id"), rs.getString("code"), rs.getString("name"), Sector.valueOf(rs.getString("sector")), rs.getBigDecimal("total_budget_etb"),
                rs.getBigDecimal("expended_etb"), rs.getBigDecimal("physical_progress_pct"), rs.getBigDecimal("cpi"), rs.getBigDecimal("fc")));
        return new FinanceOverview(queries.budgetBy("sector", s, zoneId, null), queries.budgetBy("funding_source", s, zoneId, null), queries.budgetBy("status", s, zoneId, null),
            byZone, pipeline, variance);
    }
}
