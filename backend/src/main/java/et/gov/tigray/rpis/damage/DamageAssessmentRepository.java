package et.gov.tigray.rpis.damage;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;
import java.util.Optional;

public interface DamageAssessmentRepository extends JpaRepository<DamageAssessment, Long>, JpaSpecificationExecutor<DamageAssessment> {
    @EntityGraph(attributePaths = {"facility", "facility.wereda", "facility.wereda.zone", "photos"})
    Optional<DamageAssessment> findDetailById(Long id);

    @EntityGraph(attributePaths = {"facility", "facility.wereda"})
    List<DamageAssessment> findByFacilityIdOrderByAssessedOnDesc(Long facilityId);

    Optional<DamageAssessment> findByDeviceIdAndClientReference(Long deviceId, String clientReference);
}
