package et.gov.tigray.rpis.report;

import et.gov.tigray.rpis.common.Enums.ReportFormat;
import et.gov.tigray.rpis.common.Enums.ReportPeriod;
import et.gov.tigray.rpis.common.Enums.ReportType;
import et.gov.tigray.rpis.common.Sector;
import et.gov.tigray.rpis.security.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/v1/reports")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('EXECUTIVE','ANALYST','PMO_FEDERAL','ADMIN','SECTOR_HEAD')")
@Tag(name = "Reports")
public class ReportController {
    private final DailyBriefService brief;
    private final ReportService reports;

    @GetMapping("/daily-brief")
    @Operation(summary = "Executive daily brief model (printable page; PMO digest source)")
    public DailyBriefService.DailyBrief dailyBrief(@RequestParam(required = false) Sector sector) {
        return brief.build(CurrentUser.get().map(u -> u.effectiveSectorFilter(sector)).orElse(sector));
    }

    @GetMapping("/catalog")
    @Operation(summary = "Available report types, periods, scopes and formats")
    public List<ReportDtos.CatalogEntry> catalog() { return reports.catalog(); }

    @GetMapping("/runs")
    @Operation(summary = "Report generation / export history (accountability)")
    public List<ReportDtos.RunDto> runs(@RequestParam(defaultValue = "50") int size) { return reports.runs(Math.min(200, Math.max(1, size))); }

    @PostMapping("/runs")
    @PreAuthorize("hasAnyRole('EXECUTIVE','ANALYST','ADMIN','SECTOR_HEAD')")
    @Operation(summary = "Record a print / PDF run initiated from the browser")
    public ReportDtos.RunDto recordRun(@RequestBody ReportDtos.RecordRunRequest req) { return reports.recordRun(req); }

    @GetMapping("/{type}")
    @Operation(summary = "Build a typed report for a period and scope (JSON model rendered by the UI)")
    public ReportDtos.Report report(@PathVariable ReportType type, @RequestParam(defaultValue = "WEEKLY") ReportPeriod period,
                                    @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from, @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                    @RequestParam(required = false) Sector sector, @RequestParam(required = false) Short zoneId, @RequestParam(required = false) Integer weredaId, @RequestParam(required = false) Long projectId) {
        return reports.build(type, period, from, to, CurrentUser.get().map(u -> u.effectiveSectorFilter(sector)).orElse(sector), zoneId, weredaId, projectId);
    }

    @GetMapping("/{type}/export")
    @PreAuthorize("hasAnyRole('EXECUTIVE','ANALYST','ADMIN','SECTOR_HEAD')")
    @Operation(summary = "Export the report (CSV opens in Excel); the run is recorded with a content digest")
    public ResponseEntity<byte[]> export(@PathVariable ReportType type, @RequestParam(defaultValue = "CSV") ReportFormat format, @RequestParam(defaultValue = "WEEKLY") ReportPeriod period,
                                         @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from, @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                         @RequestParam(required = false) Sector sector, @RequestParam(required = false) Short zoneId, @RequestParam(required = false) Integer weredaId, @RequestParam(required = false) Long projectId) {
        ReportDtos.Report r = reports.build(type, period, from, to, CurrentUser.get().map(u -> u.effectiveSectorFilter(sector)).orElse(sector), zoneId, weredaId, projectId);
        byte[] body = reports.export(r, format);
        String name = "rpis-" + type.name().toLowerCase().replace('_', '-') + "-" + r.to() + (format == ReportFormat.CSV ? ".csv" : ".json");
        return ResponseEntity.ok().header(HttpHeaders.CONTENT_TYPE, format == ReportFormat.CSV ? "text/csv; charset=utf-8" : "application/json")
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + name + "\"").body(body);
    }
}
