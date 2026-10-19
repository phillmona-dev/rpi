package et.gov.tigray.rpis.evidence;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public final class EvidenceRepositories {
    private EvidenceRepositories() {}

    @Repository
    public interface Inspections extends JpaRepository<FieldInspection, Long>, JpaSpecificationExecutor<FieldInspection> {
        @EntityGraph(attributePaths = {"wereda", "wereda.zone", "project", "facility", "media"})
        Optional<FieldInspection> findDetailById(Long id);
        Optional<FieldInspection> findByDeviceIdAndClientReference(Long deviceId, String clientReference);
        @Query("select max(i.verifiedAt) from FieldInspection i where i.project.id = :projectId and i.verificationStatus = 'VERIFIED'")
        Instant lastVerifiedForProject(Long projectId);
        long countByProjectId(Long projectId);
        long countByFacilityId(Long facilityId);
    }

    @Repository
    public interface Media extends JpaRepository<EvidenceMedia, Long>, JpaSpecificationExecutor<EvidenceMedia> {
        List<EvidenceMedia> findByInspectionIdOrderByCapturedAtAsc(Long inspectionId);
        long countByProjectId(Long projectId);
        long countByFacilityId(Long facilityId);
    }

    @Repository
    public interface UploadTickets extends JpaRepository<MediaUploadTicket, UUID> {}
}
