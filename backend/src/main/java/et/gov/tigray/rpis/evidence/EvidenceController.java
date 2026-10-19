package et.gov.tigray.rpis.evidence;

import et.gov.tigray.rpis.common.Enums.*;
import et.gov.tigray.rpis.common.PageResponse;
import et.gov.tigray.rpis.common.Sector;
import et.gov.tigray.rpis.security.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;

@RestController
@RequestMapping("/api/v1/evidence")
@RequiredArgsConstructor
@Tag(name = "Field Evidence")
public class EvidenceController {
    private final EvidenceService service;

    @GetMapping("/inspections")
    @Operation(summary = "Search field inspections / site visits with verification status")
    public PageResponse<EvidenceDtos.InspectionSummary> inspections(
        @RequestParam(required = false) Sector sector, @RequestParam(required = false) Short zoneId, @RequestParam(required = false) Integer weredaId,
        @RequestParam(required = false) Long projectId, @RequestParam(required = false) Long facilityId,
        @RequestParam(required = false) InspectionType type, @RequestParam(required = false) VerificationStatus status,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from, @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
        @ParameterObject @PageableDefault(size = 25, sort = "visitedOn", direction = Sort.Direction.DESC) Pageable pageable) {
        Sector scoped = CurrentUser.get().map(u -> u.effectiveSectorFilter(sector)).orElse(sector);
        return PageResponse.of(service.search(new EvidenceService.Filter(scoped, zoneId, weredaId, projectId, facilityId, type, status, from, to), pageable));
    }

    @GetMapping("/inspections/{id}")
    public EvidenceDtos.InspectionDetail inspection(@PathVariable Long id) { return service.detail(id); }

    @PostMapping("/inspections")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('ANALYST','FIELD_OFFICER','SITE_MANAGER','ADMIN')")
    @Operation(summary = "Record an inspection from the web (field app uses /sync/inspections)")
    public EvidenceDtos.InspectionSummary create(@Valid @RequestBody EvidenceDtos.CreateInspectionRequest req) {
        Long uid = CurrentUser.get().map(CurrentUser::id).orElse(null);
        return service.create(req, DataSource.WEB, null, uid);
    }

    @PostMapping("/inspections/{id}/verify")
    @PreAuthorize("hasAnyRole('EXECUTIVE','SECTOR_HEAD','ANALYST','ADMIN')")
    @Operation(summary = "Verify, dispute or reject an inspection and its media (audited)")
    public EvidenceDtos.InspectionDetail verify(@PathVariable Long id, @Valid @RequestBody EvidenceDtos.VerifyRequest req) { return service.verify(id, req); }

    @GetMapping("/media")
    @Operation(summary = "Evidence gallery: inspection media and assessment photos, newest first")
    public PageResponse<EvidenceDtos.MediaDto> media(@RequestParam(required = false) Long projectId, @RequestParam(required = false) Long facilityId,
                                                     @RequestParam(required = false) Integer weredaId, @RequestParam(required = false) Sector sector,
                                                     @RequestParam(required = false) MediaKind kind, @RequestParam(required = false) VerificationStatus status,
                                                     @RequestParam(required = false) Boolean geotagged,
                                                     @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "24") int size) {
        Sector scoped = CurrentUser.get().map(u -> u.effectiveSectorFilter(sector)).orElse(sector);
        return PageResponse.of(service.gallery(projectId, facilityId, weredaId, scoped, kind, status, geotagged, PageRequest.of(Math.max(0, page), Math.min(200, Math.max(1, size)))));
    }

    @GetMapping("/summary")
    @Operation(summary = "Evidence coverage for a project or facility")
    public EvidenceDtos.EvidenceSummary summary(@RequestParam(required = false) Long projectId, @RequestParam(required = false) Long facilityId) {
        return service.summary(projectId, facilityId);
    }
}
