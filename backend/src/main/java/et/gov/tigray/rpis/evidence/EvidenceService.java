package et.gov.tigray.rpis.evidence;

import et.gov.tigray.rpis.audit.Audited;
import et.gov.tigray.rpis.common.BusinessException;
import et.gov.tigray.rpis.common.Enums.*;
import et.gov.tigray.rpis.common.GeoPoint;
import et.gov.tigray.rpis.common.NotFoundException;
import et.gov.tigray.rpis.common.Sector;
import et.gov.tigray.rpis.config.RpisProperties;
import et.gov.tigray.rpis.damage.FieldDevice;
import et.gov.tigray.rpis.facility.Facility;
import et.gov.tigray.rpis.facility.FacilityRepository;
import et.gov.tigray.rpis.geo.GeoDtos;
import et.gov.tigray.rpis.geo.Wereda;
import et.gov.tigray.rpis.project.Project;
import et.gov.tigray.rpis.project.ProjectDtos;
import et.gov.tigray.rpis.project.ProjectRepositories;
import et.gov.tigray.rpis.realtime.DomainEvent;
import et.gov.tigray.rpis.security.CurrentUser;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import org.locationtech.jts.geom.Point;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * Field evidence: inspections, geotagged media and the verification workflow that lets executives trust
 * remote data (GEMS pattern). Read models union inspection media with legacy assessment photos.
 */
@Service
@RequiredArgsConstructor
public class EvidenceService {
    private final EvidenceRepositories.Inspections inspections;
    private final EvidenceRepositories.Media media;
    private final ProjectRepositories.Projects projects;
    private final FacilityRepository facilities;
    private final RpisProperties props;
    private final NamedParameterJdbcTemplate jdbc;
    private final ApplicationEventPublisher events;

    public record Filter(Sector sector, Short zoneId, Integer weredaId, Long projectId, Long facilityId, InspectionType type, VerificationStatus status, LocalDate from, LocalDate to) {}

    @Transactional(readOnly = true)
    public Page<EvidenceDtos.InspectionSummary> search(Filter f, Pageable pageable) {
        Specification<FieldInspection> spec = (root, q, cb) -> {
            List<Predicate> ps = new ArrayList<>();
            if (f.projectId() != null) ps.add(cb.equal(root.get("project").get("id"), f.projectId()));
            if (f.facilityId() != null) ps.add(cb.equal(root.get("facility").get("id"), f.facilityId()));
            if (f.weredaId() != null) ps.add(cb.equal(root.get("wereda").get("id"), f.weredaId()));
            if (f.zoneId() != null) ps.add(cb.equal(root.get("wereda").get("zone").get("id"), f.zoneId()));
            if (f.type() != null) ps.add(cb.equal(root.get("inspectionType"), f.type()));
            if (f.status() != null) ps.add(cb.equal(root.get("verificationStatus"), f.status()));
            if (f.from() != null) ps.add(cb.greaterThanOrEqualTo(root.get("visitedOn"), f.from()));
            if (f.to() != null) ps.add(cb.lessThanOrEqualTo(root.get("visitedOn"), f.to()));
            if (f.sector() != null) {
                var p = root.join("project", jakarta.persistence.criteria.JoinType.LEFT);
                var fa = root.join("facility", jakarta.persistence.criteria.JoinType.LEFT);
                ps.add(cb.or(cb.equal(p.get("sector"), f.sector()), cb.equal(fa.get("sector"), f.sector())));
            }
            if (q.getResultType() != Long.class) { root.fetch("wereda").fetch("zone"); root.fetch("project", jakarta.persistence.criteria.JoinType.LEFT); root.fetch("facility", jakarta.persistence.criteria.JoinType.LEFT); q.distinct(true); }
            return cb.and(ps.toArray(Predicate[]::new));
        };
        return inspections.findAll(spec, pageable).map(this::summary);
    }

    @Transactional(readOnly = true)
    public EvidenceDtos.InspectionDetail detail(Long id) {
        FieldInspection i = inspections.findDetailById(id).orElseThrow(() -> new NotFoundException("Inspection", id));
        String subject = i.getProject() != null ? i.getProject().getName() : i.getFacility() != null ? i.getFacility().getName() : null;
        return new EvidenceDtos.InspectionDetail(summary(i), i.getFindings(), i.getRecommendedAction(), i.getVerificationNote(),
            i.getMedia().stream().sorted(Comparator.comparing(EvidenceMedia::getCapturedAt, Comparator.nullsLast(Comparator.naturalOrder()))).map(m -> mediaDto(m, "INSPECTION", subject)).toList());
    }

    /** Create from web or field app. Idempotent per (device, clientReference). */
    @Audited(action = "INSPECTION_CREATE", entityType = "INSPECTION")
    @Transactional
    public EvidenceDtos.InspectionSummary create(EvidenceDtos.CreateInspectionRequest req, DataSource source, FieldDevice device, Long actorUserId) {
        if (device != null && req.clientReference() != null) {
            var dup = inspections.findByDeviceIdAndClientReference(device.getId(), req.clientReference());
            if (dup.isPresent()) return summary(dup.get());
        }
        if (req.projectId() == null && req.facilityId() == null) throw BusinessException.badRequest("subject_required", "projectId or facilityId is required");
        Project p = req.projectId() == null ? null : projects.findWithWeredaById(req.projectId()).orElseThrow(() -> new NotFoundException("Project", req.projectId()));
        Facility f = req.facilityId() == null ? null : facilities.findWithWeredaById(req.facilityId()).orElseThrow(() -> new NotFoundException("Facility", req.facilityId()));
        Wereda w = p != null ? p.getWereda() : f.getWereda();
        Point site = p != null && p.getLocation() != null ? p.getLocation() : f != null ? f.getLocation() : null;

        FieldInspection i = new FieldInspection();
        i.setProject(p); i.setFacility(f); i.setWereda(w); i.setInspectionType(req.inspectionType()); i.setVisitedOn(req.visitedOn());
        i.setStartedAt(req.startedAt()); i.setEndedAt(req.endedAt()); i.setInspectorName(req.inspectorName()); i.setInspectorUserId(actorUserId); i.setOrganization(req.organization());
        i.setLocation(req.location() == null ? null : req.location().toJts()); i.setGpsAccuracyM(req.gpsAccuracyM());
        if (req.location() != null && site != null) i.setDistanceFromSiteM(BigDecimal.valueOf(haversineM(req.location().lat(), req.location().lng(), site.getY(), site.getX())).setScale(1, RoundingMode.HALF_UP));
        i.setObservedProgressPct(req.observedProgressPct());
        i.setReportedProgressPct(p == null ? null : p.getPhysicalProgressPct());
        i.setWorkforceObserved(req.workforceObserved()); i.setQualityRating(req.qualityRating()); i.setSafetyRating(req.safetyRating());
        i.setFindings(req.findings()); i.setRecommendedAction(req.recommendedAction());
        i.setDevice(device); i.setClientReference(req.clientReference()); i.setSource(source); i.setSyncedAt(source == DataSource.FIELD_APP || source == DataSource.SITE_APP ? Instant.now() : null);
        if (req.media() != null) for (EvidenceDtos.MediaInput m : req.media()) i.getMedia().add(toMedia(m, i, p, f, device));
        FieldInspection saved = inspections.save(i);

        Sector sector = p != null ? p.getSector() : f.getSector();
        Long entityId = p != null ? p.getId() : f.getId();
        events.publishEvent(DomainEvent.of("INSPECTION_RECORDED", p != null ? "PROJECT" : "FACILITY", entityId, sector, w.getId(),
            Map.of("subjectName", p != null ? p.getName() : f.getName(), "inspectionType", req.inspectionType().name(), "inspector", req.inspectorName(),
                   "mediaCount", saved.getMedia().size(), "source", source.name(), "weredaName", w.getNameEn())));
        return summary(saved);
    }

    @Audited(action = "INSPECTION_VERIFY", entityType = "INSPECTION")
    @Transactional
    public EvidenceDtos.InspectionDetail verify(Long id, EvidenceDtos.VerifyRequest req) {
        FieldInspection i = inspections.findDetailById(id).orElseThrow(() -> new NotFoundException("Inspection", id));
        CurrentUser u = CurrentUser.get().orElseThrow(() -> BusinessException.unauthorized("no_actor", "No authenticated actor"));
        if (u.isFederal()) throw BusinessException.forbidden("read_only", "Federal observers cannot verify evidence");
        if (req.status() == VerificationStatus.UNVERIFIED) throw BusinessException.badRequest("invalid_status", "Use VERIFIED, DISPUTED or REJECTED");
        if (req.status() != VerificationStatus.VERIFIED && (req.note() == null || req.note().isBlank())) throw BusinessException.badRequest("note_required", "A note is required when disputing or rejecting evidence");
        i.setVerificationStatus(req.status()); i.setVerifiedAt(Instant.now()); i.setVerifiedByUserId(u.id()); i.setVerifiedByName(u.fullName()); i.setVerificationNote(req.note());
        i.getMedia().forEach(m -> m.setVerificationStatus(req.status()));
        inspections.save(i);
        if (i.getProject() != null && req.status() == VerificationStatus.VERIFIED) {
            Project p = i.getProject();
            if (p.getLastVerifiedAt() == null || p.getLastVerifiedAt().isBefore(i.getVerifiedAt())) { p.setLastVerifiedAt(i.getVerifiedAt()); projects.save(p); }
        }
        Sector sector = i.getProject() != null ? i.getProject().getSector() : i.getFacility() != null ? i.getFacility().getSector() : null;
        events.publishEvent(DomainEvent.of("INSPECTION_VERIFIED", i.getProject() != null ? "PROJECT" : "FACILITY", i.getProject() != null ? i.getProject().getId() : i.getFacility().getId(), sector, i.getWereda().getId(),
            Map.of("inspectionId", i.getId(), "status", req.status().name(), "actor", u.fullName())));
        return detail(id);
    }

    /** Gallery: inspection media plus assessment photos for a project or facility (newest first). */
    @Transactional(readOnly = true)
    public Page<EvidenceDtos.MediaDto> gallery(Long projectId, Long facilityId, Integer weredaId, Sector sector, MediaKind kind, VerificationStatus status, Boolean geotagged, Pageable pageable) {
        String where = """
            WHERE (:projectId IS NULL OR m.project_id = :projectId)
              AND (:facilityId IS NULL OR m.facility_id = :facilityId)
              AND (:weredaId IS NULL OR m.wereda_id = :weredaId)
              AND (:sector IS NULL OR m.sector = :sector)
              AND (:kind IS NULL OR m.kind = :kind)
              AND (:status IS NULL OR m.verification_status = :status)
              AND (:geotagged IS NULL OR (m.lat IS NOT NULL) = :geotagged)
            """;
        String base = """
            WITH m AS (
              SELECT em.id, em.kind, em.url, em.thumbnail_url, em.media_type, em.size_bytes, em.width, em.height, em.duration_seconds, em.caption, em.captured_at,
                     ST_Y(em.location) lat, ST_X(em.location) lng, em.gps_accuracy_m, em.captured_by, em.verification_status, em.inspection_id, em.assessment_id,
                     em.project_id, em.facility_id, 'INSPECTION' origin,
                     coalesce(p.name, f.name) subject, coalesce(p.wereda_id, f.wereda_id) wereda_id, coalesce(p.sector, f.sector) sector
              FROM evidence_media em LEFT JOIN project p ON p.id = em.project_id LEFT JOIN facility f ON f.id = em.facility_id
              UNION ALL
              SELECT -ap.id, 'PHOTO', ap.url, NULL, 'image/*', NULL, NULL, NULL, NULL, ap.caption, ap.taken_at,
                     ST_Y(ap.location), ST_X(ap.location), NULL, a.assessor_name, 'UNVERIFIED', NULL, a.id,
                     (SELECT min(pf.project_id) FROM project_facility pf WHERE pf.facility_id = f.id), f.id, 'ASSESSMENT', f.name, f.wereda_id, f.sector
              FROM assessment_photo ap JOIN damage_assessment a ON a.id = ap.assessment_id JOIN facility f ON f.id = a.facility_id)
            """;
        var params = new MapSqlParameterSource()
            .addValue("projectId", projectId, Types.BIGINT).addValue("facilityId", facilityId, Types.BIGINT).addValue("weredaId", weredaId, Types.INTEGER)
            .addValue("sector", sector == null ? null : sector.name(), Types.VARCHAR).addValue("kind", kind == null ? null : kind.name(), Types.VARCHAR)
            .addValue("status", status == null ? null : status.name(), Types.VARCHAR).addValue("geotagged", geotagged, Types.BOOLEAN)
            .addValue("limit", pageable.getPageSize(), Types.INTEGER).addValue("offset", (int) pageable.getOffset(), Types.INTEGER);
        Long total = jdbc.queryForObject(base + "SELECT count(*) FROM m " + where, params, Long.class);
        List<EvidenceDtos.MediaDto> rows = jdbc.query(base + "SELECT * FROM m " + where + " ORDER BY captured_at DESC NULLS LAST, id DESC LIMIT :limit OFFSET :offset", params, (rs, i) -> {
            Double lat = (Double) rs.getObject("lat"), lng = (Double) rs.getObject("lng");
            Timestamp cap = rs.getTimestamp("captured_at");
            return new EvidenceDtos.MediaDto(rs.getLong("id"), MediaKind.valueOf(rs.getString("kind")), rs.getString("url"), rs.getString("thumbnail_url"), rs.getString("media_type"),
                (Long) rs.getObject("size_bytes"), (Integer) rs.getObject("width"), (Integer) rs.getObject("height"), (Integer) rs.getObject("duration_seconds"), rs.getString("caption"),
                cap == null ? null : cap.toInstant(), lat == null ? null : new GeoPoint(lat, lng), rs.getBigDecimal("gps_accuracy_m"), rs.getString("captured_by"),
                VerificationStatus.valueOf(rs.getString("verification_status")), (Long) rs.getObject("inspection_id"), (Long) rs.getObject("assessment_id"),
                (Long) rs.getObject("project_id"), (Long) rs.getObject("facility_id"), rs.getString("origin"), rs.getString("subject"), lat != null, cap != null);
        });
        return new org.springframework.data.domain.PageImpl<>(rows, pageable, total == null ? 0 : total);
    }

    @Transactional(readOnly = true)
    public EvidenceDtos.EvidenceSummary summary(Long projectId, Long facilityId) {
        var p = new MapSqlParameterSource().addValue("p", projectId, Types.BIGINT).addValue("f", facilityId, Types.BIGINT);
        Map<String, Object> r = jdbc.queryForMap("""
            SELECT (SELECT count(*) FROM field_inspection i WHERE (:p IS NULL OR i.project_id = :p) AND (:f IS NULL OR i.facility_id = :f)) inspections,
                   (SELECT count(*) FROM field_inspection i WHERE (:p IS NULL OR i.project_id = :p) AND (:f IS NULL OR i.facility_id = :f) AND i.verification_status = 'VERIFIED') verified,
                   (SELECT count(*) FROM field_inspection i WHERE (:p IS NULL OR i.project_id = :p) AND (:f IS NULL OR i.facility_id = :f) AND i.verification_status = 'DISPUTED') disputed,
                   (SELECT count(*) FROM field_inspection i WHERE (:p IS NULL OR i.project_id = :p) AND (:f IS NULL OR i.facility_id = :f) AND i.verification_status = 'UNVERIFIED') unverified,
                   (SELECT count(*) FROM evidence_media m WHERE (:p IS NULL OR m.project_id = :p) AND (:f IS NULL OR m.facility_id = :f)) +
                   (SELECT count(*) FROM assessment_photo ap JOIN damage_assessment a ON a.id = ap.assessment_id WHERE :f IS NOT NULL AND a.facility_id = :f) media_items,
                   (SELECT count(*) FROM evidence_media m WHERE (:p IS NULL OR m.project_id = :p) AND (:f IS NULL OR m.facility_id = :f) AND m.kind = 'PHOTO') +
                   (SELECT count(*) FROM assessment_photo ap JOIN damage_assessment a ON a.id = ap.assessment_id WHERE :f IS NOT NULL AND a.facility_id = :f) photos,
                   (SELECT count(*) FROM evidence_media m WHERE (:p IS NULL OR m.project_id = :p) AND (:f IS NULL OR m.facility_id = :f) AND m.kind = 'VIDEO') videos,
                   (SELECT max(coalesce(i.started_at, (i.visited_on::timestamp AT TIME ZONE 'UTC'))) FROM field_inspection i WHERE (:p IS NULL OR i.project_id = :p) AND (:f IS NULL OR i.facility_id = :f)) last_inspection,
                   (SELECT max(i.verified_at) FROM field_inspection i WHERE (:p IS NULL OR i.project_id = :p) AND (:f IS NULL OR i.facility_id = :f) AND i.verification_status = 'VERIFIED') last_verified
            """, p);
        Timestamp li = (Timestamp) r.get("last_inspection"), lv = (Timestamp) r.get("last_verified");
        Integer days = li == null ? null : (int) ChronoUnit.DAYS.between(li.toInstant().atZone(ZoneOffset.UTC).toLocalDate(), LocalDate.now(ZoneOffset.UTC));
        String coverage = days == null ? "NONE" : days > props.getMedia().getEvidenceStaleDays() ? "STALE" : "RECENT";
        return new EvidenceDtos.EvidenceSummary(((Number) r.get("inspections")).longValue(), ((Number) r.get("verified")).longValue(), ((Number) r.get("disputed")).longValue(),
            ((Number) r.get("unverified")).longValue(), ((Number) r.get("media_items")).longValue(), ((Number) r.get("photos")).longValue(), ((Number) r.get("videos")).longValue(),
            li == null ? null : li.toInstant(), lv == null ? null : lv.toInstant(), days, coverage);
    }

    /** Project-facing snapshot used by the project dossier (same figures, project DTO shape). */
    @Transactional(readOnly = true)
    public ProjectDtos.EvidenceSnapshot snapshotForProject(Long projectId) {
        var s = summary(projectId, null);
        return new ProjectDtos.EvidenceSnapshot(s.inspections(), s.verified(), s.disputed(), s.unverified(), s.mediaItems(), s.photos(), s.videos(), s.lastInspectionAt(), s.lastVerifiedAt(), s.daysSinceEvidence(), s.coverage());
    }

    // ── mapping ───────────────────────────────────────────────────────────
    EvidenceDtos.InspectionSummary summary(FieldInspection i) {
        Project p = i.getProject(); Facility f = i.getFacility(); Wereda w = i.getWereda();
        BigDecimal gap = i.getObservedProgressPct() == null || i.getReportedProgressPct() == null ? null : i.getObservedProgressPct().subtract(i.getReportedProgressPct());
        boolean far = i.getDistanceFromSiteM() != null && i.getDistanceFromSiteM().doubleValue() > props.getMedia().getSiteDistanceWarningM();
        int mediaCount = i.getMedia().size(), photos = (int) i.getMedia().stream().filter(m -> m.getKind() == MediaKind.PHOTO).count();
        return new EvidenceDtos.InspectionSummary(i.getId(), i.getInspectionType(), i.getVisitedOn(), i.getStartedAt(), i.getEndedAt(), i.getInspectorName(), i.getOrganization(),
            p == null ? null : p.getId(), p == null ? null : p.getCode(), p == null ? null : p.getName(), f == null ? null : f.getId(), f == null ? null : f.getName(),
            p != null ? p.getSector() : f != null ? f.getSector() : null,
            new GeoDtos.WeredaRef(w.getId(), w.getCode(), new GeoDtos.LocalizedName(w.getNameEn(), w.getNameTi(), w.getNameAm()), w.getZone().getId(), w.getZone().getCode(),
                new GeoDtos.LocalizedName(w.getZone().getNameEn(), w.getZone().getNameTi(), w.getZone().getNameAm())),
            GeoPoint.of(i.getLocation()), i.getGpsAccuracyM(), i.getDistanceFromSiteM(), far, i.getObservedProgressPct(), i.getReportedProgressPct(), gap, i.getWorkforceObserved(),
            i.getQualityRating(), i.getSafetyRating(), i.getVerificationStatus(), i.getVerifiedByName(), i.getVerifiedAt(), i.getSource(), i.getSyncedAt(), i.getCreatedAt(), mediaCount, photos);
    }

    static EvidenceDtos.MediaDto mediaDto(EvidenceMedia m, String origin, String subject) {
        return new EvidenceDtos.MediaDto(m.getId(), m.getKind(), m.getUrl(), m.getThumbnailUrl(), m.getMediaType(), m.getSizeBytes(), m.getWidth(), m.getHeight(), m.getDurationSeconds(),
            m.getCaption(), m.getCapturedAt(), GeoPoint.of(m.getLocation()), m.getGpsAccuracyM(), m.getCapturedBy(), m.getVerificationStatus(),
            m.getInspection() == null ? null : m.getInspection().getId(), m.getAssessmentId(), m.getProjectId(), m.getFacilityId(), origin, subject, m.getLocation() != null, m.getCapturedAt() != null);
    }

    static EvidenceMedia toMedia(EvidenceDtos.MediaInput in, FieldInspection i, Project p, Facility f, FieldDevice device) {
        EvidenceMedia m = new EvidenceMedia();
        m.setKind(in.kind()); m.setInspection(i); m.setProjectId(p == null ? null : p.getId()); m.setFacilityId(f == null ? null : f.getId());
        m.setUrl(in.url()); m.setThumbnailUrl(in.thumbnailUrl()); m.setMediaType(in.mediaType()); m.setSizeBytes(in.sizeBytes()); m.setSha256(in.sha256());
        m.setWidth(in.width()); m.setHeight(in.height()); m.setDurationSeconds(in.durationSeconds()); m.setCaption(in.caption()); m.setCapturedAt(in.capturedAt());
        m.setLocation(in.location() == null ? null : in.location().toJts()); m.setGpsAccuracyM(in.gpsAccuracyM()); m.setHeadingDeg(in.headingDeg());
        m.setCapturedBy(i.getInspectorName()); m.setDeviceId(device == null ? null : device.getId()); m.setClientReference(in.clientReference());
        String prefix = "/api/v1/media/files/";
        if (in.url().startsWith(prefix)) m.setStorageKey(in.url().substring(prefix.length()));
        return m;
    }

    static double haversineM(double lat1, double lon1, double lat2, double lon2) {
        double r = 6_371_000, dLat = Math.toRadians(lat2 - lat1), dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
}
