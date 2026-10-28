package et.gov.tigray.rpis.damage;

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

public final class DamageDtos {
    private DamageDtos() {}

    public record FacilityRef(Long id, String code, String name, Sector sector, FacilityType facilityType, GeoDtos.WeredaRef wereda) {}

    public record AssessmentSummary(Long id, FacilityRef facility, LocalDate assessedOn, String assessorName, DamageSeverity severity,
                                    int structuralImpactScore, Integer inventoryLossPct, Integer functionalCapacityPct,
                                    BigDecimal estimatedRepairCostEtb, BigDecimal estimatedReplacementCostEtb,
                                    DataSource source, Instant syncedAt, Instant createdAt, int photoCount,
                                    AssessmentStatus status, Long campaignId, String campaignCode, Long taskId,
                                    Intervention recommendedIntervention, NeedPriority interventionPriority, Integer beneficiariesAffected,
                                    Instant submittedAt, Instant verifiedAt, Long projectId) {}

    public record Photo(Long id, String url, String caption, Instant takenAt, GeoPoint location) {}

    public record Component(String component, DamageSeverity condition, BigDecimal repairCostEtb, String note) {}

    public record ProjectLink(Long id, String code, String name) {}
    public record CampaignLink(Long id, String code, String name) {}

    public record HistoryEntry(String kind, Instant occurredAt, String actorName, String note) {}

    /** What the signed-in user may do with the assessment, with the reason when review is not possible. */
    public record Permissions(boolean canReview, String cannotReviewReason, boolean canRevise, boolean canCreateProject) {}

    public record AssessmentDetail(AssessmentSummary summary, String notes, String audioNoteUrl, GeoPoint location, List<Photo> photos,
                                   int revision, AccessStatus accessStatus, CurrentUse currentUse, boolean uxoSuspected, List<DamageCause> damageCauses,
                                   BigDecimal equipmentLossEtb, List<Component> components, BigDecimal componentRepairTotalEtb,
                                   String submittedByName, String verifiedByName, String reviewNote,
                                   CampaignLink campaign, ProjectLink project, List<HistoryEntry> history, Permissions permissions) {}

    /**
     * Web data-entry and field-app sync payload. `clientReference` makes retries idempotent per device.
     * `taskId` ties the record to a campaign site task; without it the assessment is ad hoc but still needs verification.
     */
    public record CreateAssessmentRequest(
        @NotNull Long facilityId,
        @Size(max = 64) String clientReference,
        @NotNull @PastOrPresent LocalDate assessedOn,
        @NotBlank @Size(max = 160) String assessorName,
        @NotNull DamageSeverity severity,
        @Min(0) @Max(100) int structuralImpactScore,
        @Min(0) @Max(100) Integer inventoryLossPct,
        @Min(0) @Max(100) Integer functionalCapacityPct,
        @DecimalMin("0") BigDecimal estimatedRepairCostEtb,
        @DecimalMin("0") BigDecimal estimatedReplacementCostEtb,
        @Size(max = 4000) String notes,
        @Size(max = 512) String audioNoteUrl,
        GeoPoint location,
        @Valid @Size(max = 40) List<PhotoInput> photos,
        Long taskId,
        AccessStatus accessStatus,
        CurrentUse currentUse,
        Boolean uxoSuspected,
        @Size(max = 9) List<DamageCause> damageCauses,
        Intervention recommendedIntervention,
        NeedPriority interventionPriority,
        @Min(0) @Max(10_000_000) Integer beneficiariesAffected,
        @DecimalMin("0") BigDecimal equipmentLossEtb,
        @Valid @Size(max = 40) List<ComponentInput> components) {

        /** The original (pre-campaign) payload, still used by the demo simulator and older field-app builds. */
        public static CreateAssessmentRequest basic(Long facilityId, String clientReference, LocalDate assessedOn, String assessorName, DamageSeverity severity,
                                                    int score, Integer inventoryLossPct, Integer functionalCapacityPct, BigDecimal repair, BigDecimal replacement,
                                                    String notes, GeoPoint location) {
            return new CreateAssessmentRequest(facilityId, clientReference, assessedOn, assessorName, severity, score, inventoryLossPct, functionalCapacityPct,
                repair, replacement, notes, null, location, null, null, null, null, null, null, null, null, null, null, null);
        }
    }

    public record PhotoInput(@NotBlank @Size(max = 512) String url, @Size(max = 255) String caption, Instant takenAt, GeoPoint location) {}

    public record ComponentInput(@NotBlank @Size(max = 32) @Pattern(regexp = "^[A-Z][A-Z0-9_]{1,31}$") String component, @NotNull DamageSeverity condition,
                                 @DecimalMin("0") BigDecimal repairCostEtb, @Size(max = 500) String note) {}

    public record ReviewRequest(@NotNull ReviewDecision decision, @Size(max = 4000) String note) {}

    /** Verified need not yet covered by a project: the hand-over point from assessment to project registration. */
    public record Need(AssessmentSummary assessment, String campaignName, BigDecimal estimateEtb, int ageDays) {}

    public record NeedsSummary(long count, BigDecimal totalEstimateEtb, long urgent, long beneficiaries) {}
    public record NeedsResponse(NeedsSummary summary, List<Need> items) {}
}
