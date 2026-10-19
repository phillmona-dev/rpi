package et.gov.tigray.rpis.facility;

import et.gov.tigray.rpis.common.Enums.DamageSeverity;
import et.gov.tigray.rpis.common.Enums.FacilityType;
import et.gov.tigray.rpis.common.Enums.OperationalStatus;
import et.gov.tigray.rpis.common.Sector;
import et.gov.tigray.rpis.geo.Wereda;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import org.locationtech.jts.geom.Point;

import java.math.BigDecimal;
import java.time.Instant;

@Entity @Table(name = "facility")
@Getter @Setter @NoArgsConstructor
public class Facility {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(nullable = false, unique = true, length = 32) private String code;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 32) private Sector sector;
    @Enumerated(EnumType.STRING) @Column(name = "facility_type", nullable = false, length = 48) private FacilityType facilityType;
    @Column(nullable = false, length = 200) private String name;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "wereda_id") private Wereda wereda;
    @Column(length = 120) private String kebele;
    @Column(columnDefinition = "geometry(Point,4326)") private Point location;
    @Column(name = "pre_crisis_capacity") private Integer preCrisisCapacity;
    @Column(name = "capacity_unit", length = 32) private String capacityUnit;
    @Enumerated(EnumType.STRING) @Column(name = "operational_status", nullable = false, length = 32) private OperationalStatus operationalStatus = OperationalStatus.NON_FUNCTIONAL;
    @Enumerated(EnumType.STRING) @Column(name = "latest_severity", length = 16) private DamageSeverity latestSeverity;
    @Column(name = "latest_assessment_id") private Long latestAssessmentId;
    @Column(name = "replacement_estimate_etb", precision = 18, scale = 2) private BigDecimal replacementEstimateEtb;
    private Integer beneficiaries;
    @CreationTimestamp @Column(name = "created_at", updatable = false) private Instant createdAt;
    @UpdateTimestamp @Column(name = "updated_at") private Instant updatedAt;
}
