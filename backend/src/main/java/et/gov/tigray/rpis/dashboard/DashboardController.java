package et.gov.tigray.rpis.dashboard;

import et.gov.tigray.rpis.common.Sector;
import et.gov.tigray.rpis.security.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/dashboard")
@RequiredArgsConstructor
@Validated
@Tag(name = "Executive Dashboard")
public class DashboardController {
    private final DashboardService service;

    @GetMapping("/overview")
    @Operation(summary = "Single-window executive overview, scoped by sector / zone / wereda")
    public DashboardDtos.Overview overview(@RequestParam(required = false) Sector sector, @RequestParam(required = false) Short zoneId, @RequestParam(required = false) Integer weredaId) {
        return service.overview(scoped(sector), zoneId, weredaId);
    }

    @GetMapping("/trend")
    public List<DashboardDtos.TrendPoint> trend(@RequestParam(required = false) Sector sector, @RequestParam(required = false) Short zoneId, @RequestParam(required = false) Integer weredaId,
                                                @RequestParam(defaultValue = "12") @Min(3) @Max(36) int months) {
        return service.trend(scoped(sector), zoneId, weredaId, months);
    }

    @GetMapping("/stream")
    @Operation(summary = "Daily incident & progress stream (assessments, progress reports, alerts)")
    public List<DashboardDtos.StreamItem> stream(@RequestParam(required = false) Sector sector, @RequestParam(required = false) Short zoneId, @RequestParam(required = false) Integer weredaId,
                                                 @RequestParam(defaultValue = "30") @Min(1) @Max(200) int limit) {
        return service.stream(scoped(sector), zoneId, weredaId, limit);
    }

    @GetMapping("/sectors")
    public List<DashboardDtos.SectorSummary> sectors(@RequestParam(required = false) Short zoneId, @RequestParam(required = false) Integer weredaId) {
        return service.sectors(zoneId, weredaId);
    }

    private static Sector scoped(Sector requested) { return CurrentUser.get().map(u -> u.effectiveSectorFilter(requested)).orElse(requested); }
}
