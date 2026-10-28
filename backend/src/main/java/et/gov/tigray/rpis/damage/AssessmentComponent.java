package et.gov.tigray.rpis.damage;

import et.gov.tigray.rpis.common.Enums.DamageSeverity;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;

/** Condition and repair estimate of one building element, utility or equipment group of an assessed facility. */
@Entity @Table(name = "assessment_component")
@Getter @Setter @NoArgsConstructor
public class AssessmentComponent {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "assessment_id") private DamageAssessment assessment;
    @Column(nullable = false, length = 32) private String component;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 16) private DamageSeverity condition;
    @Column(name = "repair_cost_etb", precision = 18, scale = 2) private BigDecimal repairCostEtb;
    @Column(length = 500) private String note;
}
