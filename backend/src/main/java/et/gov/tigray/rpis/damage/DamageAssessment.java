package et.gov.tigray.rpis.damage;

import et.gov.tigray.rpis.common.Enums.DamageSeverity;
import et.gov.tigray.rpis.common.Enums.DataSource;
import et.gov.tigray.rpis.facility.Facility;
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

@Entity @Table(name = "damage_assessment")
@Getter @Setter @NoArgsConstructor
public class DamageAssessment {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "facility_id") private Facility facility;
    @Column(name = "client_reference", length = 64) private String clientReference;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "device_id") private FieldDevice device;
    @Column(name = "assessed_on", nullable = false) private LocalDate assessedOn;
    @Column(name = "assessor_name", nullable = false, length = 160) private String assessorName;
    @Column(name = "assessor_user_id") private Long assessorUserId;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 16) private DamageSeverity severity;
    @Column(name = "structural_impact_score", nullable = false) private short structuralImpactScore;
    @Column(name = "inventory_loss_pct") private Short inventoryLossPct;
    @Column(name = "estimated_repair_cost_etb", precision = 18, scale = 2) private BigDecimal estimatedRepairCostEtb;
    @Column(name = "estimated_replacement_cost_etb", precision = 18, scale = 2) private BigDecimal estimatedReplacementCostEtb;
    @Column(name = "functional_capacity_pct") private Short functionalCapacityPct;
    @Column(columnDefinition = "text") private String notes;
    @Column(name = "audio_note_url", length = 512) private String audioNoteUrl;
    @Column(columnDefinition = "geometry(Point,4326)") private Point location;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 16) private DataSource source = DataSource.WEB;
    @Column(name = "synced_at") private Instant syncedAt;
    @CreationTimestamp @Column(name = "created_at", updatable = false) private Instant createdAt;
    @OneToMany(mappedBy = "assessment", cascade = CascadeType.ALL, orphanRemoval = true) private List<AssessmentPhoto> photos = new ArrayList<>();
}
