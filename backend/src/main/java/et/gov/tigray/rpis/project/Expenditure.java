package et.gov.tigray.rpis.project;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;

@Entity @Table(name = "expenditure")
@Getter @Setter @NoArgsConstructor
public class Expenditure {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "project_id") private Project project;
    @Column(name = "period_start", nullable = false) private LocalDate periodStart;
    @Column(name = "period_end", nullable = false) private LocalDate periodEnd;
    @Column(name = "amount_etb", nullable = false, precision = 18, scale = 2) private BigDecimal amountEtb;
    @Column(name = "certified_by", length = 160) private String certifiedBy;
    @Column(name = "certified_on") private LocalDate certifiedOn;
}
