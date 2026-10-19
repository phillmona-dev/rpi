package et.gov.tigray.rpis.geo;

import et.gov.tigray.rpis.common.GeoPoint;
import et.gov.tigray.rpis.common.NotFoundException;
import et.gov.tigray.rpis.common.Sector;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeoService {
    private final ZoneRepository zones;
    private final WeredaRepository weredas;
    private final GeoQueryRepository queries;

    public List<GeoDtos.ZoneSummary> zones() {
        Map<Short, Long> counts = new LinkedHashMap<>();
        weredas.findAll().forEach(w -> counts.merge(w.getZone().getId(), 1L, Long::sum));
        return zones.findAll().stream().sorted((a, b) -> a.getNameEn().compareTo(b.getNameEn()))
            .map(z -> new GeoDtos.ZoneSummary(z.getId(), z.getCode(), name(z.getNameEn(), z.getNameTi(), z.getNameAm()),
                GeoPoint.of(z.getCentroid()), counts.getOrDefault(z.getId(), 0L).intValue())).toList();
    }

    public List<GeoDtos.WeredaRef> weredaRefs() {
        return weredas.findAllByOrderByNameEnAsc().stream().map(GeoService::ref).toList();
    }

    @Cacheable(cacheNames = "weredaMetrics", key = "#sector + ':' + #zoneId + ':' + #weredaId")
    public List<GeoDtos.WeredaMetrics> weredaMetrics(Sector sector, Short zoneId, Integer weredaId) {
        return queries.weredaMetrics(sector, zoneId, weredaId);
    }

    public GeoDtos.WeredaDetail weredaDetail(Integer id) {
        List<GeoDtos.WeredaMetrics> m = queries.weredaMetrics(null, null, id);
        if (m.isEmpty()) throw new NotFoundException("Wereda", id);
        return new GeoDtos.WeredaDetail(m.get(0), queries.sectorSlices(id));
    }

    public GeoDtos.FeatureCollection weredaGeoJson(Sector sector, Short zoneId) {
        return GeoDtos.FeatureCollection.of(weredaMetrics(sector, zoneId, null).stream().map(w -> {
            Map<String, Object> props = new LinkedHashMap<>();
            props.put("code", w.code());
            props.put("name", w.name().en());
            props.put("nameTi", w.name().ti());
            props.put("nameAm", w.name().am());
            props.put("zoneId", w.zoneId());
            props.put("zoneName", w.zoneName().en());
            props.put("facilitiesTotal", w.facilitiesTotal());
            props.put("facilitiesSevere", w.facilitiesSevere());
            props.put("avgImpactScore", w.avgImpactScore());
            props.put("projectsTotal", w.projectsTotal());
            props.put("projectsDelayed", w.projectsDelayed());
            props.put("avgProgressPct", w.avgProgressPct());
            props.put("budgetEtb", w.budgetEtb());
            props.put("openAlerts", w.openAlerts());
            props.put("criticalAlerts", w.criticalAlerts());
            return GeoDtos.Feature.point(w.id(), w.centroid(), props);
        }).toList());
    }

    @Cacheable(cacheNames = "geoProjects", key = "#sector + ':' + #zoneId + ':' + #weredaId + ':' + #statuses + ':' + #healths + ':' + #minRisk")
    public GeoDtos.FeatureCollection projectGeoJson(Sector sector, Short zoneId, Integer weredaId, List<String> statuses, List<String> healths, Integer minRisk) {
        return GeoDtos.FeatureCollection.of(queries.projectFeatures(sector, zoneId, weredaId, statuses, healths, minRisk));
    }
    @Cacheable(cacheNames = "geoFacilities", key = "#sector + ':' + #zoneId + ':' + #weredaId + ':' + #severities + ':' + #operational + ':' + #unaddressed")
    public GeoDtos.FeatureCollection facilityGeoJson(Sector sector, Short zoneId, Integer weredaId, List<String> severities, String operational, Boolean unaddressed) {
        return GeoDtos.FeatureCollection.of(queries.facilityFeatures(sector, zoneId, weredaId, severities, operational, unaddressed));
    }
    public GeoDtos.FeatureCollection evidenceGeoJson(Long projectId, Long facilityId, Integer weredaId) { return GeoDtos.FeatureCollection.of(queries.evidenceFeatures(projectId, facilityId, weredaId)); }
    @Cacheable(cacheNames = "geoBoundaries", key = "#level + ':' + #zoneId")
    public GeoDtos.FeatureCollection boundaries(String level, Short zoneId) { return GeoDtos.FeatureCollection.of(queries.boundaryFeatures(level, zoneId)); }

    static GeoDtos.WeredaRef ref(Wereda w) {
        return new GeoDtos.WeredaRef(w.getId(), w.getCode(), name(w.getNameEn(), w.getNameTi(), w.getNameAm()),
            w.getZone().getId(), w.getZone().getCode(), name(w.getZone().getNameEn(), w.getZone().getNameTi(), w.getZone().getNameAm()));
    }
    static GeoDtos.LocalizedName name(String en, String ti, String am) { return new GeoDtos.LocalizedName(en, ti, am); }
}
