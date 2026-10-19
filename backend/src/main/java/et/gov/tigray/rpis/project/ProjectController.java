package et.gov.tigray.rpis.project;

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
@RequestMapping("/api/v1/projects")
@RequiredArgsConstructor
@Tag(name = "Projects")
public class ProjectController {
    private final ProjectService service;
    private final ProjectLifecycleService lifecycle;
    private final ProjectTimelineService timeline;

    @GetMapping
    @Operation(summary = "Search projects with sector / geography / status / health filters")
    public PageResponse<ProjectDtos.ProjectSummary> search(
        @RequestParam(required = false) Sector sector, @RequestParam(required = false) Short zoneId, @RequestParam(required = false) Integer weredaId,
        @RequestParam(required = false) List<ProjectStatus> status, @RequestParam(required = false) List<ProjectHealth> health,
        @RequestParam(required = false) FundingSource fundingSource, @RequestParam(required = false) String q,
        @RequestParam(required = false) List<LifecycleStage> stage, @RequestParam(required = false) Integer minRiskScore, @RequestParam(required = false) String contractor,
        @ParameterObject @PageableDefault(size = 25, sort = "updatedAt", direction = Sort.Direction.DESC) Pageable pageable) {
        Sector scoped = CurrentUser.get().map(u -> u.effectiveSectorFilter(sector)).orElse(sector);
        return PageResponse.of(service.search(new ProjectService.Filter(scoped, zoneId, weredaId, status, health, fundingSource, q, stage, minRiskScore, contractor), pageable));
    }

    @GetMapping("/{id}/timeline")
    @Operation(summary = "Unified project passport timeline: stages, milestones, reports, disbursements, alerts, decisions, inspections, documents")
    public List<ProjectDtos.TimelineEvent> timeline(@PathVariable Long id, @RequestParam(defaultValue = "200") int limit) {
        return timeline.timeline(id, Math.max(1, Math.min(limit, 1000)));
    }

    @PostMapping("/{id}/stage")
    @PreAuthorize("hasAnyRole('EXECUTIVE','ANALYST','ADMIN','SECTOR_HEAD')")
    @Operation(summary = "Move the project to the next lifecycle stage (validated, audited, published)")
    public ProjectDtos.ProjectSummary stage(@PathVariable Long id, @Valid @RequestBody ProjectDtos.StageTransitionRequest req) {
        return lifecycle.transition(id, req);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Full project dossier: milestones, progress, finance, risks, issues, documents, forecast")
    public ProjectDtos.ProjectDetail detail(@PathVariable Long id) { return service.detail(id); }

    @PostMapping("/{id}/progress")
    @PreAuthorize("hasAnyRole('ANALYST','SITE_MANAGER','ADMIN')")
    @Operation(summary = "Record a physical progress report")
    public ProjectDtos.ProjectSummary progress(@PathVariable Long id, @Valid @RequestBody ProjectDtos.ProgressEntryRequest req) {
        String by = CurrentUser.get().map(CurrentUser::fullName).orElse("system");
        return service.recordProgress(id, req, by, DataSource.WEB);
    }
}
