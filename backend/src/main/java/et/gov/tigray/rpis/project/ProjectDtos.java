package et.gov.tigray.rpis.project;

import et.gov.tigray.rpis.common.Enums.*;
import et.gov.tigray.rpis.common.GeoPoint;
import et.gov.tigray.rpis.common.Sector;
import et.gov.tigray.rpis.geo.GeoDtos;
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

    public record StatusCounts(long planned, long procurement, long active, long suspended, long completed, long cancelled) {}
}
