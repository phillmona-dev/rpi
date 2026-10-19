package et.gov.tigray.rpis.evidence;

import et.gov.tigray.rpis.common.Enums.MediaKind;
import et.gov.tigray.rpis.common.Enums.VerificationStatus;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.locationtech.jts.geom.Point;

import java.math.BigDecimal;
import java.time.Instant;

/** Geotagged, time-stamped field media (photo / video / audio / document) linked to an inspection, assessment or progress log. */
@Entity @Table(name = "evidence_media")
@Getter @Setter @NoArgsConstructor
public class EvidenceMedia {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 12) private MediaKind kind;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "inspection_id") private FieldInspection inspection;
    @Column(name = "assessment_id") private Long assessmentId;
    @Column(name = "progress_log_id") private Long progressLogId;
    @Column(name = "project_id") private Long projectId;
    @Column(name = "facility_id") private Long facilityId;
    @Column(nullable = false, length = 512) private String url;
    @Column(name = "thumbnail_url", length = 512) private String thumbnailUrl;
    @Column(name = "storage_key", length = 255) private String storageKey;
    @Column(name = "media_type", length = 64) private String mediaType;
    @Column(name = "size_bytes") private Long sizeBytes;
    @Column(length = 64) private String sha256;
    private Integer width;
    private Integer height;
    @Column(name = "duration_seconds") private Integer durationSeconds;
    @Column(length = 255) private String caption;
    @Column(name = "captured_at") private Instant capturedAt;
    @Column(columnDefinition = "geometry(Point,4326)") private Point location;
    @Column(name = "gps_accuracy_m", precision = 7, scale = 1) private BigDecimal gpsAccuracyM;
    @Column(name = "heading_deg") private Short headingDeg;
    @Column(name = "captured_by", length = 160) private String capturedBy;
    @Column(name = "device_id") private Long deviceId;
    @Column(name = "client_reference", length = 64) private String clientReference;
    @Enumerated(EnumType.STRING) @Column(name = "verification_status", nullable = false, length = 16) private VerificationStatus verificationStatus = VerificationStatus.UNVERIFIED;
    @CreationTimestamp @Column(name = "created_at", updatable = false) private Instant createdAt;
}
