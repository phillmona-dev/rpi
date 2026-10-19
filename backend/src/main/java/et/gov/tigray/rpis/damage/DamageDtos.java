package et.gov.tigray.rpis.damage;

import et.gov.tigray.rpis.common.Enums.DamageSeverity;
import et.gov.tigray.rpis.common.Enums.DataSource;
import et.gov.tigray.rpis.common.Enums.FacilityType;
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
                                    DataSource source, Instant syncedAt, Instant createdAt, int photoCount) {}

    public record Photo(Long id, String url, String caption, Instant takenAt, GeoPoint location) {}

    public record AssessmentDetail(AssessmentSummary summary, String notes, String audioNoteUrl, GeoPoint location, List<Photo> photos) {}

    /** Web data-entry and field-app sync payload. `clientReference` makes retries idempotent per device. */
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
        @Valid List<PhotoInput> photos) {}

    public record PhotoInput(@NotBlank @Size(max = 512) String url, @Size(max = 255) String caption, Instant takenAt, GeoPoint location) {}
}
