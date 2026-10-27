package et.gov.tigray.rpis.project;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

/** Repositories of the project aggregate, grouped for cohesion. */
public final class ProjectRepositories {
    private ProjectRepositories() {}

    @Repository
    public interface Projects extends JpaRepository<Project, Long>, JpaSpecificationExecutor<Project> {
        @EntityGraph(attributePaths = {"wereda", "wereda.zone"})
        Optional<Project> findWithWeredaById(Long id);

        @EntityGraph(attributePaths = {"wereda", "wereda.zone"})
        List<Project> findByStatusIn(List<et.gov.tigray.rpis.common.Enums.ProjectStatus> statuses);

        @EntityGraph(attributePaths = {"wereda", "wereda.zone"})
        @Query("select p from Project p where lower(p.name) like lower(concat('%', :q, '%')) or lower(p.code) like lower(concat('%', :q, '%')) order by p.name")
        List<Project> search(String q, org.springframework.data.domain.Pageable pageable);

        @Query("select p.id from Project p")
        List<Long> allIds();
    }

    @Repository
    public interface Milestones extends JpaRepository<Milestone, Long> {
        List<Milestone> findByProjectIdOrderBySequenceAsc(Long projectId);
        @Query("select m from Milestone m join fetch m.project p where m.status in ('PENDING','IN_PROGRESS','OVERDUE') and m.plannedDate < :cutoff and p.status = 'ACTIVE'")
        List<Milestone> findOverdue(LocalDate cutoff);
    }

    @Repository
    public interface ProgressLogs extends JpaRepository<ProgressLog, Long> {
        List<ProgressLog> findByProjectIdOrderByLogDateAsc(Long projectId);
        Optional<ProgressLog> findFirstByProjectIdOrderByLogDateDesc(Long projectId);
        Optional<ProgressLog> findByProjectIdAndLogDate(Long projectId, LocalDate logDate);
        @EntityGraph(attributePaths = {"project", "project.wereda"})
        List<ProgressLog> findTop50ByOrderByCreatedAtDesc();
    }

    @Repository
    public interface BudgetLines extends JpaRepository<BudgetLine, Long> { List<BudgetLine> findByProjectId(Long projectId); }

    @Repository
    public interface Disbursements extends JpaRepository<Disbursement, Long> {
        List<Disbursement> findByProjectIdOrderByTrancheNoAsc(Long projectId);
        @Query("select d from Disbursement d join fetch d.project p where d.status <> 'RELEASED' and d.plannedDate < :cutoff and p.status = 'ACTIVE'")
        List<Disbursement> findLagging(LocalDate cutoff);
    }

    @Repository
    public interface Expenditures extends JpaRepository<Expenditure, Long> { List<Expenditure> findByProjectIdOrderByPeriodStartAsc(Long projectId); }

    @Repository
    public interface Risks extends JpaRepository<ProjectRisk, Long> { List<ProjectRisk> findByProjectIdOrderByRaisedOnDesc(Long projectId); }

    @Repository
    public interface Issues extends JpaRepository<ProjectIssue, Long> { List<ProjectIssue> findByProjectIdOrderByRaisedOnDesc(Long projectId); }

    @Repository
    public interface Documents extends JpaRepository<ProjectDocument, Long> { List<ProjectDocument> findByProjectIdOrderByUploadedAtDesc(Long projectId); }

    @Repository
    public interface Forecasts extends JpaRepository<ProjectForecast, Long> { Optional<ProjectForecast> findFirstByProjectIdOrderByComputedAtDesc(Long projectId); }

    @Repository
    public interface StageEvents extends JpaRepository<ProjectStageEvent, Long> {
        List<ProjectStageEvent> findByProjectIdOrderByOccurredAtAsc(Long projectId);
    }

    @Repository
    public interface ApprovalEvents extends JpaRepository<ProjectApprovalEvent, Long> {
        List<ProjectApprovalEvent> findByProjectIdOrderByOccurredAtAsc(Long projectId);
    }

    @Repository
    public interface Organizations extends JpaRepository<Organization, Long> {
        Optional<Organization> findByCode(String code);
        Optional<Organization> findByNameIgnoreCase(String name);
    }

    @Repository
    public interface ProjectOrganizations extends JpaRepository<ProjectOrganization, ProjectOrganization.Key> {
        @Query("select po from ProjectOrganization po join fetch po.organization where po.project.id = :projectId")
        List<ProjectOrganization> findByProjectId(Long projectId);
    }

    @Repository
    public interface ProjectFacilities extends JpaRepository<ProjectFacility, ProjectFacility.Key> {
        @Query("select pf from ProjectFacility pf join fetch pf.project p join fetch p.wereda where pf.facility.id = :facilityId")
        List<ProjectFacility> findByFacilityId(Long facilityId);
        @Query("select count(pf) from ProjectFacility pf where pf.facility.id = :facilityId")
        int countByFacilityId(Long facilityId);
    }
}
