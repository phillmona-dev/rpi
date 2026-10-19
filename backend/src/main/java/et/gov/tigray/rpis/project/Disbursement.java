package et.gov.tigray.rpis.project;

import et.gov.tigray.rpis.common.Enums.DisbursementStatus;
import et.gov.tigray.rpis.common.Enums.FundingSource;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;

@Entity @Table(name = "disbursement")
@Getter @Setter @NoArgsConstructor
public class Disbursement {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "project_id") private Project project;
    @Column(name = "tranche_no", nullable = false) private short trancheNo;
    @Column(name = "planned_date", nullable = false) private LocalDate plannedDate;
    @Column(name = "released_date") private LocalDate releasedDate;
    @Column(name = "amount_etb", nullable = false, precision = 18, scale = 2) private BigDecimal amountEtb;
    @Enumerated(EnumType.STRING) @Column(name = "funding_source", nullable = false, length = 32) private FundingSource fundingSource;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 16) private DisbursementStatus status = DisbursementStatus.PLANNED;
}
