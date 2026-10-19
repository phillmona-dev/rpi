package et.gov.tigray.rpis.damage;

import et.gov.tigray.rpis.audit.Audited;
import et.gov.tigray.rpis.common.Enums.DamageSeverity;
import et.gov.tigray.rpis.common.Enums.DataSource;
import et.gov.tigray.rpis.common.Enums.OperationalStatus;
import et.gov.tigray.rpis.common.GeoPoint;
import et.gov.tigray.rpis.common.NotFoundException;
import et.gov.tigray.rpis.common.Sector;
import et.gov.tigray.rpis.facility.Facility;
import et.gov.tigray.rpis.facility.FacilityRepository;
import et.gov.tigray.rpis.geo.GeoDtos;
import et.gov.tigray.rpis.geo.Wereda;
import et.gov.tigray.rpis.realtime.DomainEvent;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class DamageService {
    private final DamageAssessmentRepository assessments;
    private final FacilityRepository facilities;
    private final ApplicationEventPublisher events;

    @Transactional(readOnly = true)
    public Page<DamageDtos.AssessmentSummary> search(Sector sector, Short zoneId, Integer weredaId, DamageSeverity severity,
                                                     LocalDate from, LocalDate to, Pageable pageable) {
        Specification<DamageAssessment> spec = (root, q, cb) -> {
            List<Predicate> ps = new ArrayList<>();
            var facility = root.join("facility");
            if (sector != null) ps.add(cb.equal(facility.get("sector"), sector));
            if (weredaId != null) ps.add(cb.equal(facility.get("wereda").get("id"), weredaId));
            if (zoneId != null) ps.add(cb.equal(facility.get("wereda").get("zone").get("id"), zoneId));
            if (severity != null) ps.add(cb.equal(root.get("severity"), severity));
            if (from != null) ps.add(cb.greaterThanOrEqualTo(root.get("assessedOn"), from));
            if (to != null) ps.add(cb.lessThanOrEqualTo(root.get("assessedOn"), to));
            if (q.getResultType() != Long.class) { root.fetch("facility").fetch("wereda").fetch("zone"); }
            return cb.and(ps.toArray(Predicate[]::new));
        };
        return assessments.findAll(spec, pageable).map(DamageService::summary);
    }

    @Transactional(readOnly = true)
    public DamageDtos.AssessmentDetail get(Long id) {
        DamageAssessment a = assessments.findDetailById(id).orElseThrow(() -> new NotFoundException("Damage assessment", id));
        return detail(a);
    }

    @Transactional(readOnly = true)
    public List<DamageDtos.AssessmentSummary> forFacility(Long facilityId) {
        return assessments.findByFacilityIdOrderByAssessedOnDesc(facilityId).stream().map(DamageService::summary).toList();
    }

    /** Creates an assessment and refreshes the facility's latest-damage denormalised fields. */
    @Audited(action = "ASSESSMENT_CREATE", entityType = "DAMAGE_ASSESSMENT")
    @Transactional
    public DamageDtos.AssessmentSummary create(DamageDtos.CreateAssessmentRequest req, DataSource source, FieldDevice device, Long actorUserId) {
        if (device != null && req.clientReference() != null) {
            Optional<DamageAssessment> dup = assessments.findByDeviceIdAndClientReference(device.getId(), req.clientReference());
            if (dup.isPresent()) return summary(dup.get());
        }
        Facility f = facilities.findWithWeredaById(req.facilityId()).orElseThrow(() -> new NotFoundException("Facility", req.facilityId()));
        DamageAssessment a = new DamageAssessment();
        a.setFacility(f);
        a.setClientReference(req.clientReference());
        a.setDevice(device);
        a.setAssessedOn(req.assessedOn());
        a.setAssessorName(req.assessorName());
        a.setAssessorUserId(actorUserId);
        a.setSeverity(req.severity());
        a.setStructuralImpactScore((short) req.structuralImpactScore());
        a.setInventoryLossPct(req.inventoryLossPct() == null ? null : req.inventoryLossPct().shortValue());
        a.setFunctionalCapacityPct(req.functionalCapacityPct() == null ? null : req.functionalCapacityPct().shortValue());
        a.setEstimatedRepairCostEtb(req.estimatedRepairCostEtb());
        a.setEstimatedReplacementCostEtb(req.estimatedReplacementCostEtb());
        a.setNotes(req.notes());
        a.setAudioNoteUrl(req.audioNoteUrl());
        a.setLocation(req.location() == null ? null : req.location().toJts());
        a.setSource(source);
        a.setSyncedAt(source == DataSource.FIELD_APP ? Instant.now() : null);
        if (req.photos() != null) req.photos().forEach(p -> {
            AssessmentPhoto ph = new AssessmentPhoto();
            ph.setAssessment(a); ph.setUrl(p.url()); ph.setCaption(p.caption()); ph.setTakenAt(p.takenAt());
            ph.setLocation(p.location() == null ? null : p.location().toJts());
            a.getPhotos().add(ph);
        });
        DamageAssessment saved = assessments.save(a);
        applyToFacility(f, saved);
        events.publishEvent(DomainEvent.of("ASSESSMENT_RECORDED", "FACILITY", f.getId(), f.getSector(), f.getWereda().getId(),
            Map.of("facilityName", f.getName(), "severity", saved.getSeverity().name(), "impactScore", saved.getStructuralImpactScore(),
                   "assessedOn", saved.getAssessedOn().toString(), "source", source.name())));
        return summary(saved);
    }

    static void applyToFacility(Facility f, DamageAssessment latest) {
        f.setLatestAssessmentId(latest.getId());
        f.setLatestSeverity(latest.getSeverity());
        if (latest.getEstimatedReplacementCostEtb() != null) f.setReplacementEstimateEtb(latest.getEstimatedReplacementCostEtb());
        Short cap = latest.getFunctionalCapacityPct();
        if (cap != null) f.setOperationalStatus(cap == 0 ? OperationalStatus.NON_FUNCTIONAL : cap < 80 ? OperationalStatus.PARTIALLY_FUNCTIONAL : OperationalStatus.FUNCTIONAL);
        else if (latest.getSeverity() == DamageSeverity.DESTROYED || latest.getSeverity() == DamageSeverity.SEVERE) f.setOperationalStatus(OperationalStatus.NON_FUNCTIONAL);
    }

    public static DamageDtos.FacilityRef facilityRef(Facility f) {
        Wereda w = f.getWereda();
        return new DamageDtos.FacilityRef(f.getId(), f.getCode(), f.getName(), f.getSector(), f.getFacilityType(),
            new GeoDtos.WeredaRef(w.getId(), w.getCode(), new GeoDtos.LocalizedName(w.getNameEn(), w.getNameTi(), w.getNameAm()),
                w.getZone().getId(), w.getZone().getCode(), new GeoDtos.LocalizedName(w.getZone().getNameEn(), w.getZone().getNameTi(), w.getZone().getNameAm())));
    }

    public static DamageDtos.AssessmentSummary summary(DamageAssessment a) {
        return new DamageDtos.AssessmentSummary(a.getId(), facilityRef(a.getFacility()), a.getAssessedOn(), a.getAssessorName(), a.getSeverity(),
            a.getStructuralImpactScore(), a.getInventoryLossPct() == null ? null : (int) a.getInventoryLossPct(),
            a.getFunctionalCapacityPct() == null ? null : (int) a.getFunctionalCapacityPct(),
            a.getEstimatedRepairCostEtb(), a.getEstimatedReplacementCostEtb(), a.getSource(), a.getSyncedAt(), a.getCreatedAt(), a.getPhotos().size());
    }

    static DamageDtos.AssessmentDetail detail(DamageAssessment a) {
        return new DamageDtos.AssessmentDetail(summary(a), a.getNotes(), a.getAudioNoteUrl(), GeoPoint.of(a.getLocation()),
            a.getPhotos().stream().map(p -> new DamageDtos.Photo(p.getId(), p.getUrl(), p.getCaption(), p.getTakenAt(), GeoPoint.of(p.getLocation()))).toList());
    }
}
