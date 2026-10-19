package et.gov.tigray.rpis.evidence;

import et.gov.tigray.rpis.common.Enums.DataSource;
import et.gov.tigray.rpis.common.Enums.InspectionType;
import et.gov.tigray.rpis.common.Enums.VerificationStatus;
import et.gov.tigray.rpis.damage.FieldDevice;
import et.gov.tigray.rpis.facility.Facility;
import et.gov.tigray.rpis.geo.Wereda;
import et.gov.tigray.rpis.project.Project;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.locationtech.jts.geom.Point;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * A site inspection or verification visit recorded in the field (GEMS-style remote supervision record).
 * Carries GPS, timing, observed vs reported progress, ratings and a verification workflow.
 */
@Entity @Table(name = "field_inspection")
@Getter @Setter @NoArgsConstructor
public class FieldInspection {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "project_id") private Project project;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "facility_id") private Facility facility;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "wereda_id") private Wereda wereda;
    @Enumerated(EnumType.STRING) @Column(name = "inspection_type", nullable = false, length = 24) private InspectionType inspectionType;
    @Column(name = "visited_on", nullable = false) private LocalDate visitedOn;
    @Column(name = "started_at") private Instant startedAt;
    @Column(name = "ended_at") private Instant endedAt;
    @Column(name = "inspector_name", nullable = false, length = 160) private String inspectorName;
    @Column(name = "inspector_user_id") private Long inspectorUserId;
    @Column(length = 200) private String organization;
    @Column(columnDefinition = "geometry(Point,4326)") private Point location;
    @Column(name = "gps_accuracy_m", precision = 7, scale = 1) private BigDecimal gpsAccuracyM;
    @Column(name = "distance_from_site_m", precision = 9, scale = 1) private BigDecimal distanceFromSiteM;
    @Column(name = "observed_progress_pct", precision = 5, scale = 2) private BigDecimal observedProgressPct;
    @Column(name = "reported_progress_pct", precision = 5, scale = 2) private BigDecimal reportedProgressPct;
    @Column(name = "workforce_observed") private Integer workforceObserved;
    @Column(name = "quality_rating") private Short qualityRating;
    @Column(name = "safety_rating") private Short safetyRating;
    @Column(columnDefinition = "text") private String findings;
    @Column(name = "recommended_action", columnDefinition = "text") private String recommendedAction;
    @Enumerated(EnumType.STRING) @Column(name = "verification_status", nullable = false, length = 16) private VerificationStatus verificationStatus = VerificationStatus.UNVERIFIED;
    @Column(name = "verified_by_user_id") private Long verifiedByUserId;
    @Column(name = "verified_by_name", length = 160) private String verifiedByName;
    @Column(name = "verified_at") private Instant verifiedAt;
    @Column(name = "verification_note", columnDefinition = "text") private String verificationNote;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "device_id") private FieldDevice device;
    @Column(name = "client_reference", length = 64) private String clientReference;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 16) private DataSource source = DataSource.WEB;
    @Column(name = "synced_at") private Instant syncedAt;
    @CreationTimestamp @Column(name = "created_at", updatable = false) private Instant createdAt;
    @OneToMany(mappedBy = "inspection", cascade = CascadeType.ALL, orphanRemoval = true) private List<EvidenceMedia> media = new ArrayList<>();
}
