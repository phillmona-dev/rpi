package et.gov.tigray.rpis.facility;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface FacilityRepository extends JpaRepository<Facility, Long>, JpaSpecificationExecutor<Facility> {
    @EntityGraph(attributePaths = {"wereda", "wereda.zone"})
    Optional<Facility> findWithWeredaById(Long id);

    @Query("select f from Facility f join fetch f.wereda w join fetch w.zone where f.id in (select pf.facility.id from ProjectFacility pf where pf.project.id = :projectId)")
    List<Facility> findByProjectId(Long projectId);

    @Query("select f from Facility f join fetch f.wereda where lower(f.name) like lower(concat('%', :q, '%')) or lower(f.code) like lower(concat('%', :q, '%')) order by f.name")
    List<Facility> search(String q, org.springframework.data.domain.Pageable pageable);
}
