package et.gov.tigray.rpis.project;

import et.gov.tigray.rpis.common.Enums.ApprovalStatus;
import et.gov.tigray.rpis.common.PageResponse;
import et.gov.tigray.rpis.common.Sector;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/approvals")
@RequiredArgsConstructor
@Tag(name = "Project approvals")
@PreAuthorize("hasAnyRole('EXECUTIVE','SECTOR_HEAD','ANALYST','ADMIN')")
public class ApprovalController {
    private final ProjectApprovalService service;

    @GetMapping
    @Operation(summary = "Approval queue: pending (oldest first), returned, or decided (latest first)")
    public PageResponse<ApprovalDtos.QueueItem> queue(@RequestParam(required = false) List<ApprovalStatus> status, @RequestParam(required = false) Sector sector,
                                                      @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "25") int size) {
        return PageResponse.of(service.queue(status, sector, Math.max(0, page), Math.max(1, size)));
    }

    @GetMapping("/counts")
    public ApprovalDtos.Counts counts(@RequestParam(required = false) Sector sector) { return service.counts(sector); }

    @GetMapping("/{projectId}")
    @Operation(summary = "Approval dossier: full project record, readiness checklist, portfolio context, possible duplicates")
    public ApprovalDtos.Dossier dossier(@PathVariable Long projectId) { return service.dossier(projectId); }

    @PostMapping("/{projectId}/decision")
    @PreAuthorize("hasRole('EXECUTIVE')")
    @Operation(summary = "Approve, return for revision, or reject a pending project (audited, numbered decision)")
    public ApprovalDtos.QueueItem decide(@PathVariable Long projectId, @Valid @RequestBody ApprovalDtos.DecisionRequest req) { return service.decide(projectId, req); }

    @PostMapping("/{projectId}/resubmit")
    @PreAuthorize("hasAnyRole('ANALYST','ADMIN')")
    @Operation(summary = "Resubmit a returned project with a response to the executive's comments")
    public ApprovalDtos.QueueItem resubmit(@PathVariable Long projectId, @Valid @RequestBody ApprovalDtos.ResubmitRequest req) { return service.resubmit(projectId, req); }
}
