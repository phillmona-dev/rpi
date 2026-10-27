package et.gov.tigray.rpis.fieldteam;

import et.gov.tigray.rpis.common.Enums.AssignmentStatus;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

public final class FieldTeamRepositories {
    private FieldTeamRepositories() {}

    @Repository
    public interface Agents extends JpaRepository<FieldAgent, Long> {
        @EntityGraph(attributePaths = {"organization", "homeWereda", "homeWereda.zone", "supervisor", "device", "coverageWeredaIds"})
        Optional<FieldAgent> findDetailedById(Long id);
        Optional<FieldAgent> findByUserId(Long userId);
        boolean existsByPhone(String phone);
        boolean existsByPhoneAndIdNot(String phone, Long id);
        boolean existsByNationalIdIgnoreCase(String nationalId);
        boolean existsByNationalIdIgnoreCaseAndIdNot(String nationalId, Long id);
        List<FieldAgent> findBySupervisorIdOrderByFullNameAsc(Long supervisorId);
    }

    @Repository
    public interface Events extends JpaRepository<FieldAgentEvent, Long> {
        List<FieldAgentEvent> findTop50ByAgentIdOrderByOccurredAtDesc(Long agentId);
    }

    @Repository
    public interface Assignments extends JpaRepository<ProjectAssignment, Long> {
        @EntityGraph(attributePaths = {"project", "project.wereda", "agent"})
        Optional<ProjectAssignment> findDetailedById(Long id);
        List<ProjectAssignment> findByAgentIdAndStatus(Long agentId, AssignmentStatus status);
        long countByAgentIdAndStatus(Long agentId, AssignmentStatus status);
    }
}
