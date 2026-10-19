package et.gov.tigray.rpis.project;

import et.gov.tigray.rpis.common.Enums.BudgetCategory;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;

@Entity @Table(name = "budget_line")
@Getter @Setter @NoArgsConstructor
public class BudgetLine {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "project_id") private Project project;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 24) private BudgetCategory category;
    @Column(name = "allocated_etb", nullable = false, precision = 18, scale = 2) private BigDecimal allocatedEtb;
}
