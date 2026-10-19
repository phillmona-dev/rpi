package et.gov.tigray.rpis.project;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

@Entity @Table(name = "project_forecast")
@Getter @Setter @NoArgsConstructor
public class ProjectForecast {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "project_id") private Project project;
    @Column(name = "computed_at", nullable = false) private Instant computedAt = Instant.now();
    @Column(nullable = false, length = 48) private String provider;
    @Column(name = "forecast_end") private LocalDate forecastEnd;
    @Column(name = "forecast_cost_etb", precision = 18, scale = 2) private BigDecimal forecastCostEtb;
    @Column(precision = 4, scale = 3) private BigDecimal confidence;
    @Column(columnDefinition = "text") private String rationale;
}
