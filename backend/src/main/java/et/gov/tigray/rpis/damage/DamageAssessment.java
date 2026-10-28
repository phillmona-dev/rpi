package et.gov.tigray.rpis.damage;

import et.gov.tigray.rpis.common.Enums.*;
import et.gov.tigray.rpis.facility.Facility;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
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

    // ── V7 · campaign workflow, needs and components ────────────────────────
    @Column(name = "campaign_id") private Long campaignId;
    @Column(name = "task_id") private Long taskId;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 12) private AssessmentStatus status = AssessmentStatus.VERIFIED;  // seeders and imports; workflow submissions set SUBMITTED
    @Column(nullable = false) private short revision = 1;
    @Enumerated(EnumType.STRING) @Column(name = "access_status", length = 12) private AccessStatus accessStatus;
    @Enumerated(EnumType.STRING) @Column(name = "current_use", length = 16) private CurrentUse currentUse;
    @Column(name = "uxo_suspected", nullable = false) private boolean uxoSuspected;
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "damage_causes", columnDefinition = "jsonb", nullable = false) private List<String> damageCauses = new ArrayList<>();
    @Enumerated(EnumType.STRING) @Column(name = "recommended_intervention", length = 16) private Intervention recommendedIntervention;
    @Enumerated(EnumType.STRING) @Column(name = "intervention_priority", length = 8) private NeedPriority interventionPriority;
    @Column(name = "beneficiaries_affected") private Integer beneficiariesAffected;
    @Column(name = "equipment_loss_etb", precision = 18, scale = 2) private BigDecimal equipmentLossEtb;
    @Column(name = "submitted_by_user_id") private Long submittedByUserId;
    @Column(name = "submitted_by_name", length = 160) private String submittedByName;
    @Column(name = "submitted_at") private Instant submittedAt;
    @Column(name = "verified_by_user_id") private Long verifiedByUserId;
    @Column(name = "verified_by_name", length = 160) private String verifiedByName;
    @Column(name = "verified_at") private Instant verifiedAt;
    @Column(name = "review_note", columnDefinition = "text") private String reviewNote;
    @Column(name = "project_id") private Long projectId;
    @Column(name = "project_linked_at") private Instant projectLinkedAt;
    @OneToMany(mappedBy = "assessment", cascade = CascadeType.ALL, orphanRemoval = true) @OrderBy("id") private List<AssessmentComponent> components = new ArrayList<>();
}
