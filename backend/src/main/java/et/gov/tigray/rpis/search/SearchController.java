package et.gov.tigray.rpis.search;

import et.gov.tigray.rpis.facility.FacilityRepository;
import et.gov.tigray.rpis.geo.WeredaRepository;
import et.gov.tigray.rpis.project.ProjectRepositories;
import et.gov.tigray.rpis.security.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;

@RestController
@RequestMapping("/api/v1/search")
@RequiredArgsConstructor
@Validated
@Tag(name = "Search")
public class SearchController {
    private final ProjectRepositories.Projects projects;
    private final FacilityRepository facilities;
    private final WeredaRepository weredas;

    public record Hit(String type, Long id, String code, String title, String subtitle, String sector) {}

    @GetMapping
    @Operation(summary = "Global command search across weredas, facilities and projects")
    @Transactional(readOnly = true)
    public List<Hit> search(@RequestParam @Size(min = 2, max = 80) String q) {
        var user = CurrentUser.get().orElse(null);
        List<Hit> hits = new ArrayList<>();
        String lq = q.toLowerCase();
        weredas.findAllByOrderByNameEnAsc().stream()
            .filter(w -> w.getNameEn().toLowerCase().contains(lq) || (w.getNameTi() != null && w.getNameTi().contains(q)) || (w.getNameAm() != null && w.getNameAm().contains(q)))
            .limit(5).forEach(w -> hits.add(new Hit("WEREDA", w.getId().longValue(), w.getCode(), w.getNameEn(), w.getZone().getNameEn() + " Zone", null)));
        projects.search(q, PageRequest.of(0, 8)).stream()
            .filter(p -> user == null || user.effectiveSectorFilter(null) == null || p.getSector() == user.effectiveSectorFilter(null))
            .forEach(p -> hits.add(new Hit("PROJECT", p.getId(), p.getCode(), p.getName(), p.getWereda().getNameEn() + " · " + p.getStatus(), p.getSector().name())));
        facilities.search(q, PageRequest.of(0, 8)).stream()
            .filter(f -> user == null || user.effectiveSectorFilter(null) == null || f.getSector() == user.effectiveSectorFilter(null))
            .forEach(f -> hits.add(new Hit("FACILITY", f.getId(), f.getCode(), f.getName(), f.getWereda().getNameEn() + " · " + f.getFacilityType(), f.getSector().name())));
        return hits;
    }
}
