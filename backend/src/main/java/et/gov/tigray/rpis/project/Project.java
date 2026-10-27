package et.gov.tigray.rpis.project;

import et.gov.tigray.rpis.common.Enums.ApprovalStatus;
import et.gov.tigray.rpis.common.Enums.FundingSource;
import et.gov.tigray.rpis.common.Enums.LifecycleStage;
import et.gov.tigray.rpis.common.Enums.ProjectHealth;
import et.gov.tigray.rpis.common.Enums.ProjectStatus;
import et.gov.tigray.rpis.common.Sector;
import et.gov.tigray.rpis.geo.Wereda;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;
import org.locationtech.jts.geom.Point;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;

@Entity @Table(name = "project")
@Getter @Setter @NoArgsConstructor
public class Project {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(nullable = false, unique = true, length = 32) private String code;
    @Column(nullable = false, length = 220) private String name;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 32) private Sector sector;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "wereda_id") private Wereda wereda;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 24) private ProjectStatus status;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 24) private ProjectHealth health = ProjectHealth.NOT_STARTED;
    @Column(name = "contractor_name", length = 200) private String contractorName;
    @Column(name = "implementing_agency", length = 200) private String implementingAgency;
    @Column(columnDefinition = "text") private String description;
    @Column(name = "planned_start", nullable = false) private LocalDate plannedStart;
    @Column(name = "planned_end", nullable = false) private LocalDate plannedEnd;
    @Column(name = "actual_start") private LocalDate actualStart;
    @Column(name = "actual_end") private LocalDate actualEnd;
    @Column(name = "revised_end") private LocalDate revisedEnd;
    @Column(name = "forecast_end") private LocalDate forecastEnd;
    @Column(name = "forecast_provider", length = 48) private String forecastProvider;
    @Column(name = "total_budget_etb", nullable = false, precision = 18, scale = 2) private BigDecimal totalBudgetEtb;
    @Column(nullable = false, length = 3) private String currency = "ETB";
    @Enumerated(EnumType.STRING) @Column(name = "funding_source", nullable = false, length = 32) private FundingSource fundingSource;
    @Column(name = "physical_progress_pct", nullable = false, precision = 5, scale = 2) private BigDecimal physicalProgressPct = BigDecimal.ZERO;
    @Column(name = "planned_progress_pct", nullable = false, precision = 5, scale = 2) private BigDecimal plannedProgressPct = BigDecimal.ZERO;
    @Column(name = "schedule_variance_pp", nullable = false, precision = 6, scale = 2) private BigDecimal scheduleVariancePp = BigDecimal.ZERO;
    @Column(precision = 6, scale = 3) private BigDecimal spi;
    @Column(precision = 6, scale = 3) private BigDecimal cpi;
    @Column(name = "disbursed_etb", nullable = false, precision = 18, scale = 2) private BigDecimal disbursedEtb = BigDecimal.ZERO;
    @Column(name = "expended_etb", nullable = false, precision = 18, scale = 2) private BigDecimal expendedEtb = BigDecimal.ZERO;
    @Column(name = "last_progress_report_at") private Instant lastProgressReportAt;
    private Integer beneficiaries;
    @Column(columnDefinition = "geometry(Point,4326)") private Point location;
    @CreationTimestamp @Column(name = "created_at", updatable = false) private Instant createdAt;
    @UpdateTimestamp @Column(name = "updated_at") private Instant updatedAt;

    // ── V3 · lifecycle, governance, risk ───────────────────────────────────
    @Enumerated(EnumType.STRING) @Column(name = "lifecycle_stage", nullable = false, length = 24) private LifecycleStage lifecycleStage = LifecycleStage.PLANNING;
    @Column(name = "approved_on") private LocalDate approvedOn;
    @Column(name = "approval_reference", length = 120) private String approvalReference;
    @Column(name = "funding_secured_on") private LocalDate fundingSecuredOn;
    @Column(name = "contract_signed_on") private LocalDate contractSignedOn;
    @Column(name = "contract_value_etb", precision = 18, scale = 2) private BigDecimal contractValueEtb;
    @Column(name = "procurement_method", length = 32) private String procurementMethod;
    @Column(name = "handover_on") private LocalDate handoverOn;
    @Column(name = "defects_liability_end") private LocalDate defectsLiabilityEnd;
    @Column(name = "risk_score") private Short riskScore;
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "risk_components", columnDefinition = "jsonb") private Map<String, Object> riskComponents;
    @Column(name = "risk_computed_at") private Instant riskComputedAt;
    @Column(name = "last_verified_at") private Instant lastVerifiedAt;

    // ── V4 · executive approval ────────────────────────────────────────────
    @Enumerated(EnumType.STRING) @Column(name = "approval_status", nullable = false, length = 16) private ApprovalStatus approvalStatus = ApprovalStatus.APPROVED;
    @Column(name = "submitted_at") private Instant submittedAt;
    @Column(name = "submitted_by_user_id") private Long submittedByUserId;
    @Column(name = "submitted_by_name", length = 160) private String submittedByName;
    @Column(name = "approval_decided_at") private Instant approvalDecidedAt;
    @Column(name = "approval_decided_by_name", length = 160) private String approvalDecidedByName;
    @Column(name = "approval_decision_ref", length = 40) private String approvalDecisionRef;
    @Column(name = "approval_conditions", columnDefinition = "text") private String approvalConditions;

    public boolean isApproved() { return approvalStatus == ApprovalStatus.APPROVED; }
}
