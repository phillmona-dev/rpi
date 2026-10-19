package et.gov.tigray.rpis.geo;

import et.gov.tigray.rpis.common.GeoPoint;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

public final class GeoDtos {
    private GeoDtos() {}

    public record LocalizedName(String en, String ti, String am) {}

    public record ZoneSummary(Short id, String code, LocalizedName name, GeoPoint centroid, int weredaCount) {}

    public record WeredaRef(Integer id, String code, LocalizedName name, Short zoneId, String zoneCode, LocalizedName zoneName) {}

    /** Wereda row enriched with the aggregate indicators that drive the map and heat table. */
    public record WeredaMetrics(Integer id, String code, LocalizedName name, Short zoneId, LocalizedName zoneName, boolean urban,
                                Integer population, GeoPoint centroid, boolean hasBoundary,
                                int facilitiesTotal, int facilitiesSevere, int facilitiesFunctional, BigDecimal avgImpactScore,
                                BigDecimal replacementEstimateEtb,
                                int projectsTotal, int projectsActive, int projectsDelayed, int projectsCompleted,
                                BigDecimal avgProgressPct, BigDecimal budgetEtb, BigDecimal disbursedEtb, int openAlerts, int criticalAlerts) {}

    public record WeredaDetail(WeredaMetrics metrics, Map<String, SectorSlice> bySector) {}
    public record SectorSlice(int facilities, int facilitiesSevere, int projects, int projectsDelayed, BigDecimal avgProgressPct, BigDecimal budgetEtb) {}

    /** Minimal GeoJSON FeatureCollection; properties carry the metric values for the client to style. */
    public record FeatureCollection(String type, List<Feature> features) {
        public static FeatureCollection of(List<Feature> f) { return new FeatureCollection("FeatureCollection", f); }
    }
    public record Feature(String type, Object id, Map<String, Object> geometry, Map<String, Object> properties) {
        public static Feature point(Object id, GeoPoint p, Map<String, Object> props) {
            return new Feature("Feature", id, Map.of("type", "Point", "coordinates", List.of(p.lng(), p.lat())), props);
        }
    }
}
