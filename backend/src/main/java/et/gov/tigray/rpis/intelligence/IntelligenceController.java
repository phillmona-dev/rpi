package et.gov.tigray.rpis.intelligence;

import et.gov.tigray.rpis.common.Sector;
import et.gov.tigray.rpis.security.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/intelligence")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('EXECUTIVE','ANALYST','PMO_FEDERAL','ADMIN','SECTOR_HEAD')")
@Tag(name = "Executive Intelligence")
public class IntelligenceController {
    private final IntelligenceService service;

    @GetMapping("/briefing")
    @Operation(summary = "Executive decision-support briefing: early-warning signals, action cards, comparisons, funding priorities, risk register")
    public IntelligenceDtos.Briefing briefing(@RequestParam(required = false) Sector sector, @RequestParam(required = false) Short zoneId) {
        return service.briefing(CurrentUser.get().map(u -> u.effectiveSectorFilter(sector)).orElse(sector), zoneId);
    }
}
