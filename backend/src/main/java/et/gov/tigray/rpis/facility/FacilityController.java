package et.gov.tigray.rpis.facility;

import et.gov.tigray.rpis.common.Enums.DamageSeverity;
import et.gov.tigray.rpis.common.Enums.FacilityType;
import et.gov.tigray.rpis.common.Enums.OperationalStatus;
import et.gov.tigray.rpis.common.PageResponse;
import et.gov.tigray.rpis.common.Sector;
import et.gov.tigray.rpis.damage.DamageDtos;
import et.gov.tigray.rpis.damage.DamageService;
import et.gov.tigray.rpis.security.CurrentUser;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/facilities")
@RequiredArgsConstructor
@Tag(name = "Facilities")
public class FacilityController {
    private final FacilityService service;
    private final DamageService damage;

    @GetMapping
    public PageResponse<FacilityDtos.FacilitySummary> search(
        @RequestParam(required = false) Sector sector, @RequestParam(required = false) FacilityType type,
        @RequestParam(required = false) Short zoneId, @RequestParam(required = false) Integer weredaId,
        @RequestParam(required = false) DamageSeverity severity, @RequestParam(required = false) OperationalStatus status,
        @RequestParam(required = false) String q,
        @ParameterObject @PageableDefault(size = 25, sort = "name", direction = Sort.Direction.ASC) Pageable pageable) {
        Sector scoped = CurrentUser.get().map(u -> u.effectiveSectorFilter(sector)).orElse(sector);
        return PageResponse.of(service.search(new FacilityService.Filter(scoped, type, zoneId, weredaId, severity, status, q), pageable));
    }

    @GetMapping("/{id}")
    public FacilityDtos.FacilityDetail detail(@PathVariable Long id) { return service.detail(id); }

    @GetMapping("/{id}/assessments")
    public List<DamageDtos.AssessmentSummary> assessments(@PathVariable Long id) { return damage.forFacility(id); }
}
