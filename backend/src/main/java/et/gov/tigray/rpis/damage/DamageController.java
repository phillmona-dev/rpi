package et.gov.tigray.rpis.damage;

import et.gov.tigray.rpis.common.Enums.DamageSeverity;
import et.gov.tigray.rpis.common.Enums.DataSource;
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
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;

@RestController
@RequestMapping("/api/v1/damage/assessments")
@RequiredArgsConstructor
@Tag(name = "Damage Assessments")
public class DamageController {
    private final DamageService service;

    @GetMapping
    @Operation(summary = "Search damage assessments (the executive 'incident stream' source)")
    public PageResponse<DamageDtos.AssessmentSummary> search(
        @RequestParam(required = false) Sector sector, @RequestParam(required = false) Short zoneId, @RequestParam(required = false) Integer weredaId,
        @RequestParam(required = false) DamageSeverity severity,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
        @ParameterObject @PageableDefault(size = 25, sort = "assessedOn", direction = Sort.Direction.DESC) Pageable pageable) {
        Sector scoped = CurrentUser.get().map(u -> u.effectiveSectorFilter(sector)).orElse(sector);
        return PageResponse.of(service.search(scoped, zoneId, weredaId, severity, from, to, pageable));
    }

    @GetMapping("/{id}")
    public DamageDtos.AssessmentDetail get(@PathVariable Long id) { return service.get(id); }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('ANALYST','FIELD_OFFICER','ADMIN')")
    @Operation(summary = "Record an assessment from the web (field app uses /sync)")
    public DamageDtos.AssessmentSummary create(@Valid @RequestBody DamageDtos.CreateAssessmentRequest req) {
        Long uid = CurrentUser.get().map(CurrentUser::id).orElse(null);
        return service.create(req, DataSource.WEB, null, uid);
    }
}
