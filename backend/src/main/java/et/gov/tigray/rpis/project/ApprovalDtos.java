package et.gov.tigray.rpis.project;

import et.gov.tigray.rpis.common.Enums.ApprovalDecision;
import et.gov.tigray.rpis.common.Enums.ApprovalStatus;
import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public final class ApprovalDtos {
    private ApprovalDtos() {}

    /** One readiness check on the approval dossier. The code is translated client-side; detail carries the figures. */
    public record ReadinessCheck(String code, boolean passed, String severity, String detail) {}
    public record Readiness(int passed, int total, int warnings, List<ReadinessCheck> checks) {}

    public record QueueItem(ProjectDtos.ProjectSummary project, ApprovalStatus status, Instant submittedAt, String submittedByName, Integer waitingDays,
                            Instant decidedAt, String decidedByName, String decisionReference, String lastNote, int resubmissions, Readiness readiness) {}

    public record Counts(long pending, long returned, long approvedLast30, long rejectedLast30, long returnedLast30, Integer oldestPendingDays,
                         BigDecimal pendingBudgetEtb, Double medianDecisionDays) {}

    /** Portfolio context the executive weighs the request against. */
    public record Context(long sectorApprovedProjects, BigDecimal sectorApprovedBudgetEtb, BigDecimal shareOfSectorBudgetPct,
                          long weredaActiveProjects, long weredaSevereFacilities, long sameContractorActiveProjects, String contractorName) {}

    public record Dossier(ProjectDtos.ProjectDetail detail, Readiness readiness, Context context, List<ProjectDtos.SimilarProject> similar,
                          boolean canDecide, String cannotDecideReason, boolean canResubmit) {}

    public record DecisionRequest(@NotNull ApprovalDecision decision, @Size(max = 4000) String note, @Size(max = 4000) String conditions,
                                  @Size(max = 120) String externalReference) {}

    public record ResubmitRequest(@NotBlank @Size(min = 10, max = 4000) String note,
                                  @Size(min = 5, max = 220) String name, @Size(max = 5000) String description,
                                  @Min(0) @Max(10_000_000) Integer beneficiaries) {}
}
