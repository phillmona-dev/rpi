package et.gov.tigray.rpis.geo;

import et.gov.tigray.rpis.common.Sector;
import et.gov.tigray.rpis.security.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/geo")
@RequiredArgsConstructor
@Tag(name = "Geography")
public class GeoController {
    private final GeoService geo;

    @GetMapping("/zones")
    public List<GeoDtos.ZoneSummary> zones() { return geo.zones(); }

    @GetMapping("/weredas")
    @Operation(summary = "All weredas (lightweight references for navigation and filters)")
    public List<GeoDtos.WeredaRef> weredas() { return geo.weredaRefs(); }

    @GetMapping("/weredas/metrics")
    @Operation(summary = "Weredas with aggregate indicators for the map and heat table")
    public List<GeoDtos.WeredaMetrics> weredaMetrics(@RequestParam(required = false) Sector sector, @RequestParam(required = false) Short zoneId) {
        return geo.weredaMetrics(scoped(sector), zoneId, null);
    }

    @GetMapping("/weredas/{id}")
    public GeoDtos.WeredaDetail wereda(@PathVariable Integer id) { return geo.weredaDetail(id); }

    @GetMapping(value = "/weredas.geojson", produces = "application/geo+json")
    @Operation(summary = "GeoJSON FeatureCollection of wereda centroids with indicator properties")
    public GeoDtos.FeatureCollection geojson(@RequestParam(required = false) Sector sector, @RequestParam(required = false) Short zoneId) {
        return geo.weredaGeoJson(scoped(sector), zoneId);
    }

    @GetMapping(value = "/projects.geojson", produces = "application/geo+json")
    @Operation(summary = "Project points with status, health, progress, risk and alert attributes (geospatial command layer)")
    public GeoDtos.FeatureCollection projects(@RequestParam(required = false) Sector sector, @RequestParam(required = false) Short zoneId, @RequestParam(required = false) Integer weredaId,
                                              @RequestParam(required = false) List<String> status, @RequestParam(required = false) List<String> health, @RequestParam(required = false) Integer minRiskScore) {
        return geo.projectGeoJson(scoped(sector), zoneId, weredaId, status, health, minRiskScore);
    }

    @GetMapping(value = "/facilities.geojson", produces = "application/geo+json")
    @Operation(summary = "Facility points with damage severity, operational status and linked-project attributes")
    public GeoDtos.FeatureCollection facilities(@RequestParam(required = false) Sector sector, @RequestParam(required = false) Short zoneId, @RequestParam(required = false) Integer weredaId,
                                                @RequestParam(required = false) List<String> severity, @RequestParam(required = false) String operationalStatus, @RequestParam(required = false) Boolean unaddressed) {
        return geo.facilityGeoJson(scoped(sector), zoneId, weredaId, severity, operationalStatus, unaddressed);
    }

    @GetMapping(value = "/evidence.geojson", produces = "application/geo+json")
    @Operation(summary = "Geotagged inspections and media for a project, facility or wereda")
    public GeoDtos.FeatureCollection evidence(@RequestParam(required = false) Long projectId, @RequestParam(required = false) Long facilityId, @RequestParam(required = false) Integer weredaId) {
        return geo.evidenceGeoJson(projectId, facilityId, weredaId);
    }

    @GetMapping(value = "/boundaries.geojson", produces = "application/geo+json")
    @Operation(summary = "Zone or wereda boundary polygons where official geometry is loaded (empty collection otherwise)")
    public GeoDtos.FeatureCollection boundaries(@RequestParam(defaultValue = "wereda") String level, @RequestParam(required = false) Short zoneId) {
        return geo.boundaries(level, zoneId);
    }

    private static Sector scoped(Sector requested) {
        return CurrentUser.get().map(u -> u.effectiveSectorFilter(requested)).orElse(requested);
    }
}
