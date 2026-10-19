package et.gov.tigray.rpis.geo;

import et.gov.tigray.rpis.common.GeoPoint;
import et.gov.tigray.rpis.common.Sector;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Read-model SQL for wereda indicators. Kept as plain SQL for transparency and PostGIS access. */
@Repository
@RequiredArgsConstructor
public class GeoQueryRepository {
    private final NamedParameterJdbcTemplate jdbc;

    private static final String METRICS_SQL = """
        WITH f AS (
          SELECT wereda_id,
                 count(*)                                                   AS facilities_total,
                 count(*) FILTER (WHERE latest_severity IN ('SEVERE','DESTROYED')) AS facilities_severe,
                 count(*) FILTER (WHERE operational_status = 'FUNCTIONAL') AS facilities_functional,
                 coalesce(sum(replacement_estimate_etb),0)                 AS replacement_estimate,
                 avg(a.structural_impact_score)                            AS avg_impact
          FROM facility fa LEFT JOIN damage_assessment a ON a.id = fa.latest_assessment_id
          WHERE (:sector IS NULL OR fa.sector = :sector)
          GROUP BY wereda_id),
        p AS (
          SELECT wereda_id,
                 count(*) AS projects_total,
                 count(*) FILTER (WHERE status = 'ACTIVE')                       AS projects_active,
                 count(*) FILTER (WHERE health IN ('DELAYED','STALLED'))         AS projects_delayed,
                 count(*) FILTER (WHERE status = 'COMPLETED')                    AS projects_completed,
                 avg(physical_progress_pct) FILTER (WHERE status IN ('ACTIVE','COMPLETED')) AS avg_progress,
                 coalesce(sum(total_budget_etb),0) AS budget,
                 coalesce(sum(disbursed_etb),0)    AS disbursed
          FROM project
          WHERE status <> 'CANCELLED' AND (:sector IS NULL OR sector = :sector)
          GROUP BY wereda_id),
        al AS (
          SELECT wereda_id,
                 count(*) AS open_alerts,
                 count(*) FILTER (WHERE severity = 'CRITICAL') AS critical_alerts
          FROM alert WHERE status IN ('OPEN','ACKNOWLEDGED','ASSIGNED') AND (:sector IS NULL OR sector = :sector)
          GROUP BY wereda_id)
        SELECT w.id, w.code, w.name_en, w.name_ti, w.name_am, w.is_urban, w.population,
               ST_Y(w.centroid) AS lat, ST_X(w.centroid) AS lng, (w.boundary IS NOT NULL) AS has_boundary,
               z.id AS zone_id, z.name_en AS zone_en, z.name_ti AS zone_ti, z.name_am AS zone_am,
               coalesce(f.facilities_total,0) facilities_total, coalesce(f.facilities_severe,0) facilities_severe,
               coalesce(f.facilities_functional,0) facilities_functional, f.avg_impact, coalesce(f.replacement_estimate,0) replacement_estimate,
               coalesce(p.projects_total,0) projects_total, coalesce(p.projects_active,0) projects_active,
               coalesce(p.projects_delayed,0) projects_delayed, coalesce(p.projects_completed,0) projects_completed,
               p.avg_progress, coalesce(p.budget,0) budget, coalesce(p.disbursed,0) disbursed,
               coalesce(al.open_alerts,0) open_alerts, coalesce(al.critical_alerts,0) critical_alerts
        FROM wereda w
        JOIN zone z ON z.id = w.zone_id
        LEFT JOIN f  ON f.wereda_id  = w.id
        LEFT JOIN p  ON p.wereda_id  = w.id
        LEFT JOIN al ON al.wereda_id = w.id
        WHERE (:zoneId IS NULL OR w.zone_id = :zoneId) AND (:weredaId IS NULL OR w.id = :weredaId)
        ORDER BY w.name_en
        """;

    public List<GeoDtos.WeredaMetrics> weredaMetrics(Sector sector, Short zoneId, Integer weredaId) {
        var params = et.gov.tigray.rpis.common.SqlParams.scope(sector, zoneId, weredaId);
        return jdbc.query(METRICS_SQL, params, (rs, i) -> new GeoDtos.WeredaMetrics(
            rs.getInt("id"), rs.getString("code"),
            new GeoDtos.LocalizedName(rs.getString("name_en"), rs.getString("name_ti"), rs.getString("name_am")),
            rs.getShort("zone_id"), new GeoDtos.LocalizedName(rs.getString("zone_en"), rs.getString("zone_ti"), rs.getString("zone_am")),
            rs.getBoolean("is_urban"), (Integer) rs.getObject("population"),
            new GeoPoint(rs.getDouble("lat"), rs.getDouble("lng")), rs.getBoolean("has_boundary"),
            rs.getInt("facilities_total"), rs.getInt("facilities_severe"), rs.getInt("facilities_functional"),
            scale(rs.getBigDecimal("avg_impact"), 1), rs.getBigDecimal("replacement_estimate"),
            rs.getInt("projects_total"), rs.getInt("projects_active"), rs.getInt("projects_delayed"), rs.getInt("projects_completed"),
            scale(rs.getBigDecimal("avg_progress"), 1), rs.getBigDecimal("budget"), rs.getBigDecimal("disbursed"),
            rs.getInt("open_alerts"), rs.getInt("critical_alerts")));
    }

    public Map<String, GeoDtos.SectorSlice> sectorSlices(Integer weredaId) {
        String sql = """
            SELECT s.sector,
              (SELECT count(*) FROM facility f WHERE f.wereda_id = :w AND f.sector = s.sector) AS facilities,
              (SELECT count(*) FROM facility f WHERE f.wereda_id = :w AND f.sector = s.sector AND f.latest_severity IN ('SEVERE','DESTROYED')) AS facilities_severe,
              (SELECT count(*) FROM project p WHERE p.wereda_id = :w AND p.sector = s.sector AND p.status <> 'CANCELLED') AS projects,
              (SELECT count(*) FROM project p WHERE p.wereda_id = :w AND p.sector = s.sector AND p.health IN ('DELAYED','STALLED')) AS projects_delayed,
              (SELECT avg(physical_progress_pct) FROM project p WHERE p.wereda_id = :w AND p.sector = s.sector AND p.status IN ('ACTIVE','COMPLETED')) AS avg_progress,
              (SELECT coalesce(sum(total_budget_etb),0) FROM project p WHERE p.wereda_id = :w AND p.sector = s.sector AND p.status <> 'CANCELLED') AS budget
            FROM (VALUES ('EDUCATION'),('HEALTH'),('MANUFACTURING'),('AGRICULTURE')) AS s(sector)
            """;
        Map<String, GeoDtos.SectorSlice> out = new LinkedHashMap<>();
        jdbc.query(sql, new MapSqlParameterSource().addValue("w", weredaId, java.sql.Types.INTEGER), rs -> {
            out.put(rs.getString("sector"), new GeoDtos.SectorSlice(rs.getInt("facilities"), rs.getInt("facilities_severe"),
                rs.getInt("projects"), rs.getInt("projects_delayed"), scale(rs.getBigDecimal("avg_progress"), 1), rs.getBigDecimal("budget")));
        });
        return out;
    }

    /** Project points for the geospatial command layer, with the attributes the client styles on. */
    public List<GeoDtos.Feature> projectFeatures(Sector sector, Short zoneId, Integer weredaId, List<String> statuses, List<String> healths, Integer minRisk) {
        String sql = """
            SELECT p.id, p.code, p.name, p.sector, p.status, p.health, p.lifecycle_stage, p.physical_progress_pct, p.planned_progress_pct, p.schedule_variance_pp, p.total_budget_etb, p.disbursed_etb,
                   p.risk_score, p.contractor_name, p.planned_end, p.forecast_end, p.last_progress_report_at, p.last_verified_at, w.id wereda_id, w.name_en wereda, z.name_en zone,
                   ST_Y(coalesce(p.location, w.centroid)) lat, ST_X(coalesce(p.location, w.centroid)) lng,
                   (SELECT count(*) FROM alert a WHERE a.entity_type = 'PROJECT' AND a.entity_id = p.id AND a.status IN ('OPEN','ACKNOWLEDGED','ASSIGNED')) open_alerts,
                   (SELECT max(f.latest_severity) FROM facility f JOIN project_facility pf ON pf.facility_id = f.id WHERE pf.project_id = p.id) severity
            FROM project p JOIN wereda w ON w.id = p.wereda_id JOIN zone z ON z.id = w.zone_id
            WHERE p.status <> 'CANCELLED' AND (:sector IS NULL OR p.sector = :sector) AND (:weredaId IS NULL OR p.wereda_id = :weredaId) AND (:zoneId IS NULL OR w.zone_id = :zoneId)
              AND (:minRisk IS NULL OR p.risk_score >= :minRisk) %s %s
            """.formatted(statuses == null || statuses.isEmpty() ? "" : "AND p.status IN (:statuses)", healths == null || healths.isEmpty() ? "" : "AND p.health IN (:healths)");
        var params = et.gov.tigray.rpis.common.SqlParams.scope(sector, zoneId, weredaId)
            .addValue("statuses", statuses == null || statuses.isEmpty() ? null : statuses)
            .addValue("healths", healths == null || healths.isEmpty() ? null : healths)
            .addValue("minRisk", minRisk, java.sql.Types.INTEGER);
        return jdbc.query(sql, params, (rs, i) -> {
            Map<String, Object> props = new LinkedHashMap<>();
            props.put("kind", "PROJECT"); props.put("code", rs.getString("code")); props.put("name", rs.getString("name")); props.put("sector", rs.getString("sector"));
            props.put("status", rs.getString("status")); props.put("health", rs.getString("health")); props.put("stage", rs.getString("lifecycle_stage"));
            props.put("physicalPct", rs.getBigDecimal("physical_progress_pct")); props.put("plannedPct", rs.getBigDecimal("planned_progress_pct")); props.put("variancePp", rs.getBigDecimal("schedule_variance_pp"));
            props.put("budgetEtb", rs.getBigDecimal("total_budget_etb")); props.put("disbursedEtb", rs.getBigDecimal("disbursed_etb")); props.put("riskScore", rs.getObject("risk_score"));
            props.put("contractor", rs.getString("contractor_name")); props.put("plannedEnd", rs.getDate("planned_end") == null ? null : rs.getDate("planned_end").toString());
            props.put("forecastEnd", rs.getDate("forecast_end") == null ? null : rs.getDate("forecast_end").toString());
            props.put("lastReportAt", rs.getTimestamp("last_progress_report_at") == null ? null : rs.getTimestamp("last_progress_report_at").toInstant().toString());
            props.put("lastVerifiedAt", rs.getTimestamp("last_verified_at") == null ? null : rs.getTimestamp("last_verified_at").toInstant().toString());
            props.put("weredaId", rs.getInt("wereda_id")); props.put("wereda", rs.getString("wereda")); props.put("zone", rs.getString("zone"));
            props.put("openAlerts", rs.getLong("open_alerts")); props.put("severity", rs.getString("severity"));
            return GeoDtos.Feature.point(rs.getLong("id"), new GeoPoint(rs.getDouble("lat"), rs.getDouble("lng")), props);
        });
    }

    public List<GeoDtos.Feature> facilityFeatures(Sector sector, Short zoneId, Integer weredaId, List<String> severities, String operational, Boolean unaddressed) {
        String sql = """
            SELECT f.id, f.code, f.name, f.sector, f.facility_type, f.operational_status, f.latest_severity, f.replacement_estimate_etb, f.beneficiaries, a.structural_impact_score impact, a.assessed_on,
                   w.id wereda_id, w.name_en wereda, z.name_en zone, ST_Y(coalesce(f.location, w.centroid)) lat, ST_X(coalesce(f.location, w.centroid)) lng,
                   (SELECT count(*) FROM project_facility pf WHERE pf.facility_id = f.id) projects,
                   (SELECT count(*) FROM evidence_media m WHERE m.facility_id = f.id) + (SELECT count(*) FROM assessment_photo ap JOIN damage_assessment da ON da.id = ap.assessment_id WHERE da.facility_id = f.id) media
            FROM facility f JOIN wereda w ON w.id = f.wereda_id JOIN zone z ON z.id = w.zone_id LEFT JOIN damage_assessment a ON a.id = f.latest_assessment_id
            WHERE (:sector IS NULL OR f.sector = :sector) AND (:weredaId IS NULL OR f.wereda_id = :weredaId) AND (:zoneId IS NULL OR w.zone_id = :zoneId)
              AND (:operational IS NULL OR f.operational_status = :operational) %s %s
            """.formatted(severities == null || severities.isEmpty() ? "" : "AND f.latest_severity IN (:severities)",
                unaddressed == null ? "" : unaddressed ? "AND (SELECT count(*) FROM project_facility pf WHERE pf.facility_id = f.id) = 0 AND f.latest_severity IN ('SEVERE','DESTROYED')"
                                                       : "AND NOT ((SELECT count(*) FROM project_facility pf WHERE pf.facility_id = f.id) = 0 AND f.latest_severity IN ('SEVERE','DESTROYED'))");
        var params = et.gov.tigray.rpis.common.SqlParams.scope(sector, zoneId, weredaId)
            .addValue("severities", severities == null || severities.isEmpty() ? null : severities)
            .addValue("operational", operational, java.sql.Types.VARCHAR);
        return jdbc.query(sql, params, (rs, i) -> {
            Map<String, Object> props = new LinkedHashMap<>();
            props.put("kind", "FACILITY"); props.put("code", rs.getString("code")); props.put("name", rs.getString("name")); props.put("sector", rs.getString("sector"));
            props.put("facilityType", rs.getString("facility_type")); props.put("operationalStatus", rs.getString("operational_status")); props.put("severity", rs.getString("latest_severity"));
            props.put("impactScore", rs.getObject("impact")); props.put("assessedOn", rs.getDate("assessed_on") == null ? null : rs.getDate("assessed_on").toString());
            props.put("replacementEstimateEtb", rs.getBigDecimal("replacement_estimate_etb")); props.put("beneficiaries", rs.getObject("beneficiaries"));
            props.put("weredaId", rs.getInt("wereda_id")); props.put("wereda", rs.getString("wereda")); props.put("zone", rs.getString("zone"));
            props.put("projects", rs.getLong("projects")); props.put("media", rs.getLong("media")); props.put("unaddressed", rs.getLong("projects") == 0 && rs.getString("latest_severity") != null && (rs.getString("latest_severity").equals("SEVERE") || rs.getString("latest_severity").equals("DESTROYED")));
            return GeoDtos.Feature.point(rs.getLong("id"), new GeoPoint(rs.getDouble("lat"), rs.getDouble("lng")), props);
        });
    }

    /** Geotagged evidence points (inspections and media) for a project, facility or wereda. */
    public List<GeoDtos.Feature> evidenceFeatures(Long projectId, Long facilityId, Integer weredaId) {
        String sql = """
            SELECT 'I' || i.id id, 'INSPECTION' kind, i.inspection_type type, i.visited_on::text at, i.inspector_name who, i.verification_status status, i.distance_from_site_m distance, NULL url,
                   coalesce(p.name, f.name) subject, i.project_id, i.facility_id, ST_Y(i.location) lat, ST_X(i.location) lng, i.id ref
            FROM field_inspection i LEFT JOIN project p ON p.id = i.project_id LEFT JOIN facility f ON f.id = i.facility_id
            WHERE i.location IS NOT NULL AND (:p IS NULL OR i.project_id = :p) AND (:f IS NULL OR i.facility_id = :f) AND (:w IS NULL OR i.wereda_id = :w)
            UNION ALL
            SELECT 'M' || m.id, 'MEDIA', m.kind, m.captured_at::text, m.captured_by, m.verification_status, m.gps_accuracy_m, m.url,
                   coalesce(p.name, f.name), m.project_id, m.facility_id, ST_Y(m.location), ST_X(m.location), m.inspection_id
            FROM evidence_media m LEFT JOIN project p ON p.id = m.project_id LEFT JOIN facility f ON f.id = m.facility_id
            WHERE m.location IS NOT NULL AND (:p IS NULL OR m.project_id = :p) AND (:f IS NULL OR m.facility_id = :f) AND (:w IS NULL OR coalesce(p.wereda_id, f.wereda_id) = :w)
            LIMIT 2000
            """;
        var params = new MapSqlParameterSource().addValue("p", projectId, java.sql.Types.BIGINT).addValue("f", facilityId, java.sql.Types.BIGINT).addValue("w", weredaId, java.sql.Types.INTEGER);
        return jdbc.query(sql, params, (rs, i) -> {
            Map<String, Object> props = new LinkedHashMap<>();
            props.put("kind", rs.getString("kind")); props.put("type", rs.getString("type")); props.put("at", rs.getString("at")); props.put("who", rs.getString("who"));
            props.put("verificationStatus", rs.getString("status")); props.put("distanceOrAccuracyM", rs.getBigDecimal("distance")); props.put("url", rs.getString("url"));
            props.put("subject", rs.getString("subject")); props.put("projectId", rs.getObject("project_id")); props.put("facilityId", rs.getObject("facility_id")); props.put("ref", rs.getObject("ref"));
            return GeoDtos.Feature.point(rs.getString("id"), new GeoPoint(rs.getDouble("lat"), rs.getDouble("lng")), props);
        });
    }

    /** Administrative boundaries as simplified GeoJSON polygons (only rows where official geometry has been loaded). */
    public List<GeoDtos.Feature> boundaryFeatures(String level, Short zoneId) {
        boolean zone = "zone".equalsIgnoreCase(level);
        String sql = zone
            ? "SELECT z.id, z.code, z.name_en name, NULL::int zone_id, NULL zone, ST_AsGeoJSON(ST_SimplifyPreserveTopology(z.boundary, 0.002)) geom FROM zone z WHERE z.boundary IS NOT NULL AND (:zoneId IS NULL OR z.id = :zoneId)"
            : "SELECT w.id, w.code, w.name_en name, w.zone_id, z.name_en zone, ST_AsGeoJSON(ST_SimplifyPreserveTopology(w.boundary, 0.001)) geom FROM wereda w JOIN zone z ON z.id = w.zone_id WHERE w.boundary IS NOT NULL AND (:zoneId IS NULL OR w.zone_id = :zoneId)";
        var params = new MapSqlParameterSource().addValue("zoneId", zoneId, java.sql.Types.SMALLINT);
        com.fasterxml.jackson.databind.ObjectMapper om = new com.fasterxml.jackson.databind.ObjectMapper();
        return jdbc.query(sql, params, (rs, i) -> {
            Map<String, Object> props = new LinkedHashMap<>();
            props.put("kind", zone ? "ZONE" : "WEREDA"); props.put("code", rs.getString("code")); props.put("name", rs.getString("name")); props.put("zoneId", rs.getObject("zone_id")); props.put("zone", rs.getString("zone"));
            Map<String, Object> geometry;
            try { geometry = om.readValue(rs.getString("geom"), new com.fasterxml.jackson.core.type.TypeReference<LinkedHashMap<String, Object>>() {}); } catch (Exception e) { geometry = Map.of(); }
            return new GeoDtos.Feature("Feature", rs.getInt("id"), geometry, props);
        });
    }

    static BigDecimal scale(BigDecimal v, int s) { return v == null ? null : v.setScale(s, java.math.RoundingMode.HALF_UP); }
}
