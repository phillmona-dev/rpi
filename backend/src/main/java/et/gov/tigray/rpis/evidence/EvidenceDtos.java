package et.gov.tigray.rpis.evidence;

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

public final class EvidenceDtos {
    private EvidenceDtos() {}

    public record InspectionSummary(Long id, InspectionType inspectionType, LocalDate visitedOn, Instant startedAt, Instant endedAt, String inspectorName, String organization,
                                    Long projectId, String projectCode, String projectName, Long facilityId, String facilityName, Sector sector, GeoDtos.WeredaRef wereda,
                                    GeoPoint location, BigDecimal gpsAccuracyM, BigDecimal distanceFromSiteM, boolean farFromSite,
                                    BigDecimal observedProgressPct, BigDecimal reportedProgressPct, BigDecimal progressGapPp, Integer workforceObserved,
                                    Short qualityRating, Short safetyRating, VerificationStatus verificationStatus, String verifiedByName, Instant verifiedAt,
                                    DataSource source, Instant syncedAt, Instant createdAt, int mediaCount, int photoCount) {}

    public record InspectionDetail(InspectionSummary summary, String findings, String recommendedAction, String verificationNote, List<MediaDto> media) {}

    public record MediaDto(Long id, MediaKind kind, String url, String thumbnailUrl, String mediaType, Long sizeBytes, Integer width, Integer height, Integer durationSeconds,
                           String caption, Instant capturedAt, GeoPoint location, BigDecimal gpsAccuracyM, String capturedBy, VerificationStatus verificationStatus,
                           Long inspectionId, Long assessmentId, Long projectId, Long facilityId, String origin, String subjectName, boolean geotagged, boolean timestamped) {}

    public record MediaInput(@NotNull MediaKind kind, @NotBlank @Size(max = 512) String url, @Size(max = 512) String thumbnailUrl, @Size(max = 64) String mediaType,
                             Long sizeBytes, @Size(max = 64) String sha256, Integer width, Integer height, Integer durationSeconds, @Size(max = 255) String caption,
                             Instant capturedAt, GeoPoint location, BigDecimal gpsAccuracyM, Short headingDeg, @Size(max = 64) String clientReference) {}

    public record CreateInspectionRequest(Long projectId, Long facilityId, @NotNull InspectionType inspectionType, @NotNull @PastOrPresent LocalDate visitedOn,
                                          Instant startedAt, Instant endedAt, @NotBlank @Size(max = 160) String inspectorName, @Size(max = 200) String organization,
                                          GeoPoint location, @DecimalMin("0") BigDecimal gpsAccuracyM,
                                          @DecimalMin("0") @DecimalMax("100") BigDecimal observedProgressPct, @Min(0) Integer workforceObserved,
                                          @Min(1) @Max(5) Short qualityRating, @Min(1) @Max(5) Short safetyRating,
                                          @Size(max = 4000) String findings, @Size(max = 2000) String recommendedAction,
                                          @Size(max = 64) String clientReference, @Valid List<MediaInput> media) {}

    public record VerifyRequest(@NotNull VerificationStatus status, @Size(max = 2000) String note) {}

    public record EvidenceSummary(long inspections, long verified, long disputed, long unverified, long mediaItems, long photos, long videos,
                                  Instant lastInspectionAt, Instant lastVerifiedAt, Integer daysSinceEvidence, String coverage) {}

    public record UploadUrlRequest(@Size(max = 128) String deviceUid, @Size(max = 64) String clientReference, @NotNull MediaKind kind,
                                   @NotBlank @Size(max = 64) String mediaType, @Min(1) long sizeBytes, @Size(max = 64) String sha256) {}
    public record UploadUrlResponse(String token, String uploadUrl, String publicUrl, Instant expiresAt, long maxBytes) {}
    public record UploadResult(String url, String storageKey, String sha256, long sizeBytes, String mediaType) {}
}
