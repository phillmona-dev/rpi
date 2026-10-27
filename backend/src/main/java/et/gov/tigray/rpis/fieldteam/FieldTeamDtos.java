package et.gov.tigray.rpis.fieldteam;

import et.gov.tigray.rpis.common.Enums.*;
import et.gov.tigray.rpis.common.Sector;
import et.gov.tigray.rpis.geo.GeoDtos;
import et.gov.tigray.rpis.project.ProjectDtos;
import jakarta.validation.constraints.*;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

public final class FieldTeamDtos {
    private FieldTeamDtos() {}

    // ── people ───────────────────────────────────────────────────────────
    public record AgentRef(Long id, String code, String fullName, AgentType agentType, AgentStatus status) {}
    public record WeredaLite(Integer id, GeoDtos.LocalizedName name, Short zoneId, GeoDtos.LocalizedName zoneName) {}

    public record AgentSummary(Long id, String code, String fullName, AgentType agentType, AgentStatus status, String phone, String email,
                               String organizationName, WeredaLite homeWereda, int coverageWeredas, List<String> coverageZones, List<Sector> sectors,
                               int activeAssignments, int maxActiveAssignments, int overdueVisits, int inspections30d, Double acceptanceRate90d,
                               LocalDate lastInspectionOn, Instant lastSyncAt, boolean hasAccount, String username, boolean onboarded,
                               LocalDate contractEnd, String supervisorName) {}

    public record Performance(long inspectionsTotal, long inspections30d, long inspections90d, long verified90d, long disputed90d, long rejected90d,
                              Double acceptanceRate90d, Double avgDistanceFromSiteM, Double avgGpsAccuracyM, Double onScheduleRate,
                              List<MonthCount> monthly) {}
    public record MonthCount(String month, long count) {}
    public record RecentInspection(Long id, LocalDate visitedOn, InspectionType inspectionType, Long projectId, String subjectName,
                                   VerificationStatus verificationStatus, Double distanceFromSiteM) {}
    public record AgentEventDto(Long id, String kind, Instant occurredAt, String actorName, String note, Map<String, Object> data) {}
    public record DeviceDto(Long id, String deviceUid, String label, String platform, String appVersion, Instant lastSyncAt, boolean enabled) {}
    public record OrganizationRef(Long id, String code, String name) {}

    public record AgentDetail(AgentSummary summary, String gender, String altPhone, String nationalId, String employeeNumber, EmploymentType employmentType,
                              OrganizationRef organization, AgentRef supervisor, String educationLevel, Short yearsExperience, List<String> skills,
                              List<String> languages, LocalDate contractStart, LocalDate trainingCompletedOn, LocalDate codeOfConductSignedOn,
                              LocalDate backgroundCheckOn, String emergencyContactName, String emergencyContactPhone, String notes, String statusReason,
                              Instant statusChangedAt, String registeredByName, Instant createdAt, List<WeredaLite> coverage, List<AgentRef> team,
                              List<AssignmentDto> assignments, Performance performance, List<RecentInspection> recentInspections,
                              List<AgentEventDto> events, DeviceDto device, List<AgentStatus> allowedTransitions) {}

    public record AgentRequest(
        @NotBlank @Size(min = 3, max = 160) String fullName,
        @Pattern(regexp = "FEMALE|MALE") String gender,
        @NotBlank @Size(max = 20) String phone,
        @Size(max = 20) String altPhone,
        @Email @Size(max = 160) String email,
        @Size(max = 40) String nationalId,
        @Size(max = 40) String employeeNumber,
        @NotNull AgentType agentType,
        Long organizationId,
        EmploymentType employmentType,
        Integer homeWeredaId,
        Long supervisorId,
        @Size(max = 24) String educationLevel,
        @Min(0) @Max(60) Short yearsExperience,
        @NotEmpty List<Sector> sectors,
        List<@Size(max = 40) String> skills,
        List<@Size(max = 16) String> languages,
        @Min(1) @Max(20) Short maxActiveAssignments,
        LocalDate contractStart,
        LocalDate contractEnd,
        @PastOrPresent LocalDate trainingCompletedOn,
        @PastOrPresent LocalDate codeOfConductSignedOn,
        @PastOrPresent LocalDate backgroundCheckOn,
        @Size(max = 160) String emergencyContactName,
        @Size(max = 20) String emergencyContactPhone,
        @NotEmpty List<Integer> coverageWeredaIds,
        @Size(max = 4000) String notes,
        Boolean createAccount,
        @Pattern(regexp = "^[a-z0-9._-]{3,64}$", message = "3–64 lowercase letters, digits, dot, dash or underscore") String username) {}

    public record StatusChangeRequest(@NotNull AgentStatus status, @Size(max = 2000) String reason, Boolean releaseAssignments) {}
    public record AccessResponse(String username, String temporaryPassword, boolean created) {}
    public record RegisterResponse(AgentDetail agent, AccessResponse access) {}

    public record TeamSummary(long totalAgents, long active, long pendingOnboarding, long onLeave, long suspended, Map<String, Long> activeByType,
                              long activeAssignments, long overdueVisits, long projectsNeedingCoverage, long projectsWithoutTeam, long projectsWithoutLead,
                              Double coveragePct, long availableSlots, long agentsAtCapacity, long contractsEndingSoon, long withoutAccount) {}

    // ── assignments ──────────────────────────────────────────────────────
    public record ProjectRef(Long id, String code, String name, Sector sector, String weredaName, String zoneName, LifecycleStage lifecycleStage,
                             ProjectStatus status, ProjectHealth health, ApprovalStatus approvalStatus, Short riskScore) {}

    public record AssignmentDto(Long id, ProjectRef project, AgentRef agent, AssignmentRole role, AssignmentStatus status, AssignmentPriority priority,
                                LocalDate startOn, LocalDate endOn, int visitFrequencyDays, List<String> requiredInspectionTypes, String instructions,
                                String overrideNote, String assignedByName, Instant assignedAt, long visits, LocalDate lastVisitOn, LocalDate nextDueOn,
                                Integer overdueDays, Instant closedAt, String closedByName, String closeReason) {}

    public record AssignmentRequest(@NotNull Long projectId, @NotNull Long agentId, @NotNull AssignmentRole role, AssignmentPriority priority,
                                    @NotNull LocalDate startOn, LocalDate endOn, @NotNull @Min(1) @Max(90) Short visitFrequencyDays,
                                    List<InspectionType> requiredInspectionTypes, @Size(max = 4000) String instructions,
                                    @Size(max = 2000) String overrideNote) {}

    public record CheckResult(boolean valid, List<ProjectDtos.FieldIssue> errors, List<ProjectDtos.FieldIssue> warnings) {}
    public record CloseRequest(@NotNull AssignmentStatus outcome, @Size(max = 2000) String reason) {}

    public record ScorePart(String code, int points, int max) {}
    public record Candidate(AgentSummary agent, int score, List<ScorePart> parts, List<String> flags, boolean eligible, Double distanceKm) {}

    public record CoverageRow(ProjectRef project, Instant lastVerifiedAt, Integer daysSinceVerified, boolean needsCoverage, String gap,
                              List<AssignmentDto> team, int overdue) {}
}
