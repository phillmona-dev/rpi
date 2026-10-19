package et.gov.tigray.rpis.alert;

import et.gov.tigray.rpis.common.Enums.*;
import et.gov.tigray.rpis.common.PageResponse;
import et.gov.tigray.rpis.common.Sector;
import et.gov.tigray.rpis.security.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/alerts")
@RequiredArgsConstructor
@Tag(name = "Alerts · Decision Queue")
public class AlertController {
    private final AlertService service;
    private final AlertRuleEngine engine;

    @GetMapping
    public PageResponse<AlertDtos.AlertSummary> search(
        @RequestParam(required = false) List<AlertStatus> status, @RequestParam(required = false) List<AlertSeverity> severity,
        @RequestParam(required = false) Sector sector, @RequestParam(required = false) Integer weredaId, @RequestParam(required = false) Short zoneId,
        @RequestParam(required = false) EntityType entityType, @RequestParam(required = false) Boolean decisionRequired,
        @ParameterObject @PageableDefault(size = 25, sort = {"severity", "triggeredAt"}, direction = Sort.Direction.ASC) Pageable pageable) {
        Sector scoped = CurrentUser.get().map(u -> u.effectiveSectorFilter(sector)).orElse(sector);
        List<AlertStatus> st = status == null || status.isEmpty() ? List.of(AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED, AlertStatus.ASSIGNED) : status;
        return PageResponse.of(service.search(new AlertService.Filter(st, severity, scoped, weredaId, zoneId, entityType, decisionRequired), pageable));
    }

    @GetMapping("/counts")
    public AlertDtos.Counts counts(@RequestParam(required = false) Sector sector) {
        return service.counts(CurrentUser.get().map(u -> u.effectiveSectorFilter(sector)).orElse(sector));
    }

    @GetMapping("/{id}")
    public AlertDtos.AlertDetail detail(@PathVariable Long id) { return service.detail(id); }

    @PostMapping("/{id}/actions")
    @PreAuthorize("hasAnyRole('EXECUTIVE','SECTOR_HEAD','ANALYST','ADMIN')")
    @Operation(summary = "Acknowledge, assign, resolve, dismiss or comment on an alert (audited)")
    public AlertDtos.AlertDetail act(@PathVariable Long id, @Valid @RequestBody AlertDtos.ActionRequest req) { return service.act(id, req); }

    @PostMapping("/evaluate")
    @PreAuthorize("hasAnyRole('ADMIN','ANALYST')")
    @Operation(summary = "Run the alert rule engine now (normally scheduled)")
    public java.util.Map<String, Integer> evaluate() { return java.util.Map.of("created", engine.evaluateAll()); }
}
