package et.gov.tigray.rpis.project;

import et.gov.tigray.rpis.common.Enums.*;
import et.gov.tigray.rpis.common.GeoPoint;
import et.gov.tigray.rpis.common.Sector;
import et.gov.tigray.rpis.geo.GeoDtos;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

public final class ProjectDtos {
    private ProjectDtos() {}

    public record ProjectSummary(Long id, String code, String name, Sector sector, GeoDtos.WeredaRef wereda, ProjectStatus status, ProjectHealth health,
                                 String contractorName, String implementingAgency, LocalDate plannedStart, LocalDate plannedEnd, LocalDate revisedEnd,
                                 LocalDate forecastEnd, LocalDate actualStart, LocalDate actualEnd,
                                 BigDecimal totalBudgetEtb, FundingSource fundingSource, BigDecimal physicalProgressPct, BigDecimal plannedProgressPct,
                                 BigDecimal scheduleVariancePp, BigDecimal spi, BigDecimal cpi, BigDecimal disbursedEtb, BigDecimal expendedEtb,
                                 Instant lastProgressReportAt, Integer daysSinceReport, Integer beneficiaries, GeoPoint location,
                                 LifecycleStage lifecycleStage, Short riskScore, Instant lastVerifiedAt) {}

    public record MilestoneDto(Long id, short sequence, String name, LocalDate plannedDate, LocalDate actualDate, BigDecimal weightPct, MilestoneStatus status, Integer slipDays) {}
    public record ProgressPoint(LocalDate date, BigDecimal physicalPct, BigDecimal plannedPct, Integer workforce, String notes, String reportedBy, DataSource source) {}
    public record BudgetLineDto(BudgetCategory category, BigDecimal allocatedEtb) {}
    public record DisbursementDto(Long id, short trancheNo, LocalDate plannedDate, LocalDate releasedDate, BigDecimal amountEtb, FundingSource fundingSource, DisbursementStatus status, Integer lagDays) {}
    public record ExpenditureDto(Long id, LocalDate periodStart, LocalDate periodEnd, BigDecimal amountEtb, String certifiedBy, LocalDate certifiedOn) {}
    public record RiskDto(Long id, String title, String category, Level likelihood, Level impact, String mitigation, String owner, RiskStatus status, LocalDate raisedOn) {}
    public record IssueDto(Long id, String title, String description, Level severity, IssueStatus status, LocalDate raisedOn, LocalDate resolvedOn, String owner) {}
    public record DocumentDto(Long id, DocumentType docType, String title, String url, String mediaType, String uploadedBy, Instant uploadedAt, Long sizeBytes) {}
    public record ForecastDto(String provider, Instant computedAt, LocalDate forecastEnd, BigDecimal forecastCostEtb, BigDecimal confidence, String rationale) {}
    public record LinkedFacility(Long id, String code, String name, FacilityType facilityType, DamageSeverity latestSeverity, OperationalStatus operationalStatus) {}

    public record FinanceSummary(BigDecimal budgetEtb, BigDecimal allocatedLinesEtb, BigDecimal disbursedEtb, BigDecimal expendedEtb,
                                 BigDecimal disbursementPct, BigDecimal expenditurePct, BigDecimal earnedValueEtb, BigDecimal costVarianceEtb,
                                 BigDecimal forecastCostEtb, List<BudgetLineDto> budgetLines, List<DisbursementDto> disbursements, List<ExpenditureDto> expenditures) {}

    public record ProjectDetail(ProjectSummary project, String description, List<MilestoneDto> milestones, List<ProgressPoint> progress,
                                FinanceSummary finance, List<RiskDto> risks, List<IssueDto> issues, List<DocumentDto> documents,
                                List<LinkedFacility> facilities, ForecastDto forecast, int openAlerts,
                                Governance governance, RiskProfile risk, EvidenceSnapshot evidence) {}

    // ── V3 · lifecycle, governance, risk, evidence, timeline ───────────────
    public record StageEventDto(Long id, LifecycleStage fromStage, LifecycleStage toStage, Instant occurredAt, String actorName, String note, String reference) {}
    public record OrganizationDto(Long id, String code, String name, OrganizationType orgType, OrganizationRole role, String contact) {}
    public record Governance(LifecycleStage stage, List<LifecycleStage> allowedTransitions, LocalDate approvedOn, String approvalReference, LocalDate fundingSecuredOn,
                             LocalDate contractSignedOn, BigDecimal contractValueEtb, String procurementMethod, LocalDate handoverOn, LocalDate defectsLiabilityEnd,
                             List<StageEventDto> stageEvents, List<OrganizationDto> organizations) {}
    public record RiskProfile(Short score, String band, Instant computedAt, Map<String, Object> components) {}
    public record EvidenceSnapshot(long inspections, long verified, long disputed, long unverified, long mediaItems, long photos, long videos,
                                   Instant lastInspectionAt, Instant lastVerifiedAt, Integer daysSinceEvidence, String coverage) {}
    public record TimelineEvent(String id, String kind, Instant occurredAt, String title, String detail, String actor, String tone, Map<String, Object> data) {}
    public record StageTransitionRequest(@NotNull LifecycleStage toStage, @Size(max = 2000) String note, @Size(max = 120) String reference, LocalDate effectiveOn) {}

    public record ProgressEntryRequest(@NotNull @PastOrPresent LocalDate logDate,
                                       @NotNull @DecimalMin("0") @DecimalMax("100") BigDecimal physicalProgressPct,
                                       @Min(0) Integer workforceCount, @Size(max = 2000) String notes) {}

    // ── Registration ──────────────────────────────────────────────────────
    /** Initial stages a project may be registered in; later stages are reached through audited transitions. */
    public static final List<LifecycleStage> REGISTRABLE_STAGES = List.of(LifecycleStage.PLANNING, LifecycleStage.APPROVAL, LifecycleStage.FUNDING, LifecycleStage.PROCUREMENT, LifecycleStage.IMPLEMENTATION);

    public record CreateProjectRequest(
        @Size(max = 32) String code,
        @NotBlank @Size(min = 5, max = 220) String name,
        @NotNull Sector sector,
        @NotNull Integer weredaId,
        @Size(max = 5000) String description,
        @Min(0) @Max(10_000_000) Integer beneficiaries,
        @DecimalMin("-90") @DecimalMax("90") Double latitude,
        @DecimalMin("-180") @DecimalMax("180") Double longitude,
        @NotNull LifecycleStage initialStage,
        @NotNull LocalDate plannedStart,
        @NotNull LocalDate plannedEnd,
        LocalDate actualStart,
        @NotNull @DecimalMin(value = "1000") @DecimalMax("100000000000") BigDecimal totalBudgetEtb,
        @NotNull FundingSource fundingSource,
        @Size(max = 32) String procurementMethod,
        @DecimalMin("0") BigDecimal contractValueEtb,
        LocalDate approvedOn,
        @Size(max = 120) String approvalReference,
        LocalDate fundingSecuredOn,
        LocalDate contractSignedOn,
        @Size(max = 2000) String registrationNote,
        @Valid @Size(max = 12) List<OrganizationAssignment> organizations,
        @Valid @Size(max = 40) List<MilestoneInput> milestones,
        @Valid @Size(max = 10) List<BudgetLineInput> budgetLines,
        @Valid @Size(max = 24) List<TrancheInput> tranches,
        @Size(max = 30) List<Long> facilityIds,
        @Valid @Size(max = 30) List<RiskInput> risks) {}

    /** Either an existing organisation (organizationId) or a new one (newName + newType). */
    public record OrganizationAssignment(@NotNull OrganizationRole role, Long organizationId, @Size(max = 200) String newName, OrganizationType newType, @Size(max = 200) String newContact) {}
    public record MilestoneInput(@NotBlank @Size(max = 200) String name, @NotNull LocalDate plannedDate, @NotNull @DecimalMin("0") @DecimalMax("100") BigDecimal weightPct) {}
    public record BudgetLineInput(@NotNull BudgetCategory category, @NotNull @DecimalMin("0") BigDecimal allocatedEtb) {}
    public record TrancheInput(@NotNull LocalDate plannedDate, @NotNull @DecimalMin("0.01") BigDecimal amountEtb, FundingSource fundingSource) {}
    public record RiskInput(@NotBlank @Size(max = 200) String title, @NotBlank @Size(max = 32) String category, @NotNull Level likelihood, @NotNull Level impact,
                            @Size(max = 2000) String mitigation, @Size(max = 160) String owner) {}

    public record FieldIssue(String field, String message) {}
    public record ValidationResult(boolean valid, String suggestedCode, List<FieldIssue> errors, List<FieldIssue> warnings) {}
    public record CodeSuggestion(String code) {}
    public record SimilarProject(Long id, String code, String name, String weredaName, ProjectStatus status) {}
    public record OrganizationOption(Long id, String code, String name, OrganizationType orgType, String contact, long projects) {}

    public record StatusCounts(long planned, long procurement, long active, long suspended, long completed, long cancelled) {}
}
