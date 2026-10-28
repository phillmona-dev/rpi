package et.gov.tigray.rpis.damage;

import et.gov.tigray.rpis.common.Enums.*;
import et.gov.tigray.rpis.common.Sector;
import et.gov.tigray.rpis.geo.GeoDtos;
import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

public final class CampaignDtos {
    private CampaignDtos() {}

    /** Task counts by status plus derived progress (verified or closed sites over all live sites). */
    public record Progress(int total, int planned, int assigned, int inProgress, int submitted, int returned, int verified, int inaccessible, int cancelled,
                           int overdue, double completionPct) {}

    public record CampaignSummary(Long id, String code, String name, Sector sector, CampaignStatus status, LocalDate plannedStart, LocalDate plannedEnd,
                                  String coordinatorName, int weredaCount, int memberCount, Progress progress, BigDecimal verifiedEstimateEtb,
                                  Instant endorsedAt, String endorsementReference, Integer daysLeft) {}

    public record Member(Long id, Long agentId, String agentCode, String fullName, AgentType agentType, CampaignRole role, String phone, boolean hasLogin,
                         boolean coversScope, int openTasks, int verifiedTasks, int pendingReviews, boolean active, Instant addedAt, String addedByName,
                         Instant releasedAt, String releaseReason) {}

    /** What the signed-in user may do; reasons explain disabled actions. */
    public record CampaignPermissions(boolean canManage, boolean canStart, String cannotStartReason, boolean canCloseFieldwork, String cannotCloseReason,
                                      boolean canEndorse, String cannotEndorseReason, boolean canCancel) {}

    public record CampaignDetail(CampaignSummary summary, String objective, String methodology, List<GeoDtos.WeredaRef> weredas,
                                 Long coordinatorUserId, String createdByName, Instant createdAt, Instant startedAt, Instant fieldworkClosedAt,
                                 String endorsedByName, String endorsementNote, String cancelReason, List<Member> members, CampaignPermissions permissions) {}

    public record CampaignRequest(@NotBlank @Size(min = 5, max = 200) String name, Sector sector, @Size(max = 4000) String objective,
                                  @Size(max = 4000) String methodology, @NotNull LocalDate plannedStart, @NotNull LocalDate plannedEnd,
                                  Long coordinatorUserId, @NotEmpty @Size(max = 120) List<Integer> weredaIds) {}

    public record EndorseRequest(@NotNull ApprovalDecision decision, @Size(max = 4000) String note) {}
    public record ReasonRequest(@NotBlank @Size(min = 10, max = 2000) String reason) {}

    // ── team ─────────────────────────────────────────────────────────────
    public record MemberRequest(@NotNull Long agentId, @NotNull CampaignRole role) {}

    public record MemberCandidate(Long agentId, String code, String fullName, AgentType agentType, List<String> sectors, boolean hasLogin,
                                  int coveredWeredas, int openTasks, List<CampaignRole> currentRoles, boolean eligible, String ineligibleReason) {}

    // ── sites and tasks ──────────────────────────────────────────────────
    public record Person(Long agentId, String fullName, Long userId) {}

    public record TaskRow(Long id, Long campaignId, String campaignCode, String campaignName, CampaignStatus campaignStatus, DamageDtos.FacilityRef facility,
                          TaskStatus status, AssignmentPriority priority, Person assessor, Person verifier, LocalDate dueOn, boolean overdue,
                          String instructions, String statusNote, Long assessmentId, AssessmentStatus assessmentStatus, DamageSeverity severity,
                          BigDecimal replacementEstimateEtb, DamageSeverity previousSeverity, LocalDate previousAssessedOn, Instant assignedAt, Instant submittedAt,
                          Instant verifiedAt, Double latitude, Double longitude) {}

    public record SiteCandidate(Long facilityId, String code, String name, Sector sector, FacilityType facilityType, GeoDtos.WeredaRef wereda,
                                DamageSeverity latestSeverity, LocalDate lastAssessedOn, Integer beneficiaries, String inOtherCampaign) {}

    public record AddSitesRequest(@NotEmpty @Size(max = 500) List<Long> facilityIds, AssignmentPriority priority, LocalDate dueOn) {}

    public record NewFacilityRequest(@NotBlank @Size(min = 3, max = 200) String name, @NotNull FacilityType facilityType, @NotNull Integer weredaId,
                                     @Size(max = 120) String kebele, @DecimalMin("-90") @DecimalMax("90") Double latitude,
                                     @DecimalMin("-180") @DecimalMax("180") Double longitude, @Min(0) Integer preCrisisCapacity,
                                     @Size(max = 32) String capacityUnit, @Min(0) @Max(10_000_000) Integer beneficiaries, AssignmentPriority priority) {}

    public record AssignRequest(@NotEmpty @Size(max = 500) List<Long> taskIds, Long assessorAgentId, Long verifierAgentId, LocalDate dueOn,
                                AssignmentPriority priority, @Size(max = 2000) String instructions) {}

    public record TaskStatusRequest(@NotNull TaskStatus status, @Size(max = 2000) String note) {}

    public record BulkResult(int updated, List<String> skipped) {}

    // ── results and activity ─────────────────────────────────────────────
    public record Bucket(String key, long sites, BigDecimal estimateEtb, long beneficiaries) {}

    public record CampaignResults(Progress progress, long assessed, BigDecimal repairEstimateEtb, BigDecimal replacementEstimateEtb, BigDecimal equipmentLossEtb,
                                  long beneficiariesAffected, long uxoSites, long idpShelterSites, List<Bucket> bySeverity, List<Bucket> byIntervention,
                                  List<Bucket> byPriority, List<Bucket> byWereda, List<Bucket> byFacilityType, List<Bucket> byCause, List<Bucket> componentsDamaged,
                                  long needsLinkedToProjects) {}

    public record Activity(Long id, String kind, Instant occurredAt, String actorName, String note, Long taskId, Long assessmentId, String facilityName,
                           Map<String, Object> data) {}

    // ── overview for the damage assessment hub ───────────────────────────
    public record MyQueue(int toAssess, int returned, int toReview) {}

    public record Overview(long campaignsPlanning, long campaignsActive, long campaignsInReview, long campaignsCompleted,
                           long sitesTotal, long sitesVerified, long sitesOutstanding, long sitesInaccessible,
                           long awaitingReview, Integer oldestAwaitingDays, long returned,
                           Map<String, Long> facilitiesBySeverity, long facilitiesAssessed, long facilitiesNeverAssessed,
                           BigDecimal verifiedReplacementEtb, long needsAwaitingProject, BigDecimal needsEstimateEtb, MyQueue mine) {}
}
