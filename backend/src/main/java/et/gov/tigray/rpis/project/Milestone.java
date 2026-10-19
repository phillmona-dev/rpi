package et.gov.tigray.rpis.project;

import et.gov.tigray.rpis.common.Enums.MilestoneStatus;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;

@Entity @Table(name = "milestone")
@Getter @Setter @NoArgsConstructor
public class Milestone {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "project_id") private Project project;
    @Column(nullable = false) private short sequence;
    @Column(nullable = false, length = 200) private String name;
    @Column(name = "planned_date", nullable = false) private LocalDate plannedDate;
    @Column(name = "actual_date") private LocalDate actualDate;
    @Column(name = "weight_pct", nullable = false, precision = 5, scale = 2) private BigDecimal weightPct = BigDecimal.ZERO;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 16) private MilestoneStatus status = MilestoneStatus.PENDING;
}
