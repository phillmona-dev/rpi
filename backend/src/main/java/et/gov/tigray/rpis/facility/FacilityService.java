package et.gov.tigray.rpis.facility;

import et.gov.tigray.rpis.common.Enums.DamageSeverity;
import et.gov.tigray.rpis.common.Enums.FacilityType;
import et.gov.tigray.rpis.common.Enums.OperationalStatus;
import et.gov.tigray.rpis.common.GeoPoint;
import et.gov.tigray.rpis.common.NotFoundException;
import et.gov.tigray.rpis.common.Sector;
import et.gov.tigray.rpis.common.Enums.AssessmentStatus;
import et.gov.tigray.rpis.damage.DamageDtos;
import et.gov.tigray.rpis.damage.DamageService;
import et.gov.tigray.rpis.project.ProjectRepositories;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class FacilityService {
    private final FacilityRepository facilities;
    private final DamageService damage;
    private final ProjectRepositories.ProjectFacilities projectFacilities;

    public record Filter(Sector sector, FacilityType type, Short zoneId, Integer weredaId, DamageSeverity severity, OperationalStatus status, String q) {}

    public Page<FacilityDtos.FacilitySummary> search(Filter f, Pageable pageable) {
        Specification<Facility> spec = (root, q, cb) -> {
            List<Predicate> ps = new ArrayList<>();
            if (f.sector() != null) ps.add(cb.equal(root.get("sector"), f.sector()));
            if (f.type() != null) ps.add(cb.equal(root.get("facilityType"), f.type()));
            if (f.weredaId() != null) ps.add(cb.equal(root.get("wereda").get("id"), f.weredaId()));
            if (f.zoneId() != null) ps.add(cb.equal(root.get("wereda").get("zone").get("id"), f.zoneId()));
            if (f.severity() != null) ps.add(cb.equal(root.get("latestSeverity"), f.severity()));
            if (f.status() != null) ps.add(cb.equal(root.get("operationalStatus"), f.status()));
            if (f.q() != null && !f.q().isBlank()) {
                String like = "%" + f.q().toLowerCase() + "%";
                ps.add(cb.or(cb.like(cb.lower(root.get("name")), like), cb.like(cb.lower(root.get("code")), like)));
            }
            if (q.getResultType() != Long.class) root.fetch("wereda").fetch("zone");
            return cb.and(ps.toArray(Predicate[]::new));
        };
        Page<Facility> page = facilities.findAll(spec, pageable);
        Map<Long, DamageDtos.AssessmentSummary> latest = latestFor(page.getContent());
        return page.map(fa -> summary(fa, latest.get(fa.getId()), projectFacilities.countByFacilityId(fa.getId())));
    }

    public FacilityDtos.FacilityDetail detail(Long id) {
        Facility f = facilities.findWithWeredaById(id).orElseThrow(() -> new NotFoundException("Facility", id));
        List<DamageDtos.AssessmentSummary> history = damage.forFacility(id);
        // The register reflects verified findings only; submissions awaiting review stay in the history.
        DamageDtos.AssessmentSummary latest = history.stream().filter(a -> a.status() == AssessmentStatus.VERIFIED).findFirst().orElse(null);
        List<FacilityDtos.LinkedProject> projects = projectFacilities.findByFacilityId(id).stream().map(pf -> pf.getProject()).map(p ->
            new FacilityDtos.LinkedProject(p.getId(), p.getCode(), p.getName(), p.getStatus().name(), p.getHealth().name(), p.getPhysicalProgressPct(), p.getPlannedEnd())).toList();
        return new FacilityDtos.FacilityDetail(summary(f, latest, projects.size()), latest, history, projects);
    }

    private Map<Long, DamageDtos.AssessmentSummary> latestFor(List<Facility> list) {
        return list.stream().filter(f -> f.getLatestAssessmentId() != null)
            .collect(Collectors.toMap(Facility::getId, f -> damage.forFacility(f.getId()).stream().filter(a -> a.status() == AssessmentStatus.VERIFIED).findFirst().orElse(null), (a, b) -> a))
            .entrySet().stream().filter(e -> e.getValue() != null).collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
    }

    static FacilityDtos.FacilitySummary summary(Facility f, DamageDtos.AssessmentSummary latest, int linkedProjects) {
        return new FacilityDtos.FacilitySummary(f.getId(), f.getCode(), f.getName(), f.getSector(), f.getFacilityType(),
            DamageService.facilityRef(f).wereda(), f.getKebele(), GeoPoint.of(f.getLocation()), f.getOperationalStatus(), f.getLatestSeverity(),
            latest == null ? null : latest.structuralImpactScore(), latest == null ? null : latest.assessedOn(), f.getReplacementEstimateEtb(),
            f.getPreCrisisCapacity(), f.getCapacityUnit(), f.getBeneficiaries(), linkedProjects);
    }
}
