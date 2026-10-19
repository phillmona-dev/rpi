package et.gov.tigray.rpis.analytics;

import et.gov.tigray.rpis.common.Enums.*;
import et.gov.tigray.rpis.common.PageResponse;
import et.gov.tigray.rpis.common.Sector;
import et.gov.tigray.rpis.facility.FacilityRepository;
import et.gov.tigray.rpis.geo.WeredaRepository;
import et.gov.tigray.rpis.project.ProjectRepositories;
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
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/analytics")
@RequiredArgsConstructor
@Tag(name = "Analytics · Decision support (advisory)")
public class AnalyticsController {
    private final InsightService insights;
    private final InsightEngine engine;
    private final ProjectRepositories.Projects projects;
    private final ProjectRepositories.Forecasts forecasts;
    private final FacilityRepository facilities;
    private final WeredaRepository weredas;

    public static final String DISCLAIMER = "Advisory analytics. Figures are produced by transparent rule-based providers (or labelled AI models) from recorded field and finance data; they inform, and never replace, decisions taken by accountable officials.";

    @GetMapping("/insights")
    @Operation(summary = "Search explainable insights (risk scores, delay predictions, cost / supply risk, anomalies, funding priorities)")
    @Transactional(readOnly = true)
    public PageResponse<AnalyticsDtos.InsightDto> search(@RequestParam(required = false) InsightKind kind, @RequestParam(required = false) EntityType entityType,
                                                        @RequestParam(required = false) Long entityId, @RequestParam(required = false) Sector sector, @RequestParam(required = false) Integer weredaId,
                                                        @RequestParam(required = false) List<InsightStatus> status, @RequestParam(required = false) AlertSeverity minSeverity,
                                                        @ParameterObject @PageableDefault(size = 25, sort = {"severity", "computedAt"}, direction = Sort.Direction.ASC) Pageable pageable) {
        Sector scoped = CurrentUser.get().map(u -> u.effectiveSectorFilter(sector)).orElse(sector);
        return PageResponse.of(insights.search(kind, entityType, entityId, scoped, weredaId, status, minSeverity, pageable), this::dto);
    }

    @GetMapping("/projects/{id}")
    @Operation(summary = "Project intelligence: risk breakdown, active insights, forecast history")
    @Transactional(readOnly = true)
    public AnalyticsDtos.ProjectIntelligence project(@PathVariable Long id) {
        var p = projects.findWithWeredaById(id).orElseThrow(() -> new et.gov.tigray.rpis.common.NotFoundException("Project", id));
        List<AnalyticsDtos.InsightDto> list = insights.forEntity(EntityType.PROJECT, id).stream().map(this::dto).toList();
        List<AnalyticsDtos.ForecastPoint> hist = forecasts.findAll(org.springframework.data.domain.PageRequest.of(0, 2000, Sort.by("computedAt").descending())).getContent().stream()
            .filter(f -> f.getProject().getId().equals(id)).limit(30)
            .map(f -> new AnalyticsDtos.ForecastPoint(f.getComputedAt(), f.getProvider(), f.getForecastEnd(), f.getForecastCostEtb(), f.getConfidence())).toList();
        List<String> providers = list.stream().map(AnalyticsDtos.InsightDto::provider).distinct().toList();
        return new AnalyticsDtos.ProjectIntelligence(id, p.getRiskScore(), RiskScoringService.band(p.getRiskScore()), p.getRiskComputedAt(), p.getRiskComponents(),
            list, hist, new AnalyticsDtos.Disclaimer(DISCLAIMER, providers));
    }

    @PostMapping("/insights/{id}/review")
    @PreAuthorize("hasAnyRole('EXECUTIVE','SECTOR_HEAD','ANALYST','ADMIN')")
    @Operation(summary = "Record the human review of an insight (actioned / dismissed), audited")
    @Transactional
    public AnalyticsDtos.InsightDto review(@PathVariable Long id, @Valid @RequestBody AnalyticsDtos.ReviewRequest req) { return dto(insights.review(id, req.status(), req.note())); }

    @PostMapping("/evaluate")
    @PreAuthorize("hasAnyRole('ADMIN','ANALYST')")
    @Operation(summary = "Run the insight engine now (normally scheduled)")
    public java.util.Map<String, Integer> evaluate() { return java.util.Map.of("insights", engine.evaluateAll()); }

    private AnalyticsDtos.InsightDto dto(AnalyticsInsight i) {
        String name = null, code = null, wereda = null;
        switch (i.getEntityType()) {
            case PROJECT -> { var p = projects.findById(i.getEntityId()).orElse(null); if (p != null) { name = p.getName(); code = p.getCode(); } }
            case FACILITY -> { var f = facilities.findById(i.getEntityId()).orElse(null); if (f != null) { name = f.getName(); code = f.getCode(); } }
            case WEREDA -> { var w = weredas.findById(i.getEntityId().intValue()).orElse(null); if (w != null) { name = w.getNameEn(); code = w.getCode(); } }
        }
        if (i.getWeredaId() != null) wereda = weredas.findById(i.getWeredaId()).map(w -> w.getNameEn()).orElse(null);
        return AnalyticsDtos.dto(i, name, code, wereda);
    }
}
