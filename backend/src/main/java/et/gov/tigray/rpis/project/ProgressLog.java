package et.gov.tigray.rpis.project;

import et.gov.tigray.rpis.common.Enums.DataSource;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

@Entity @Table(name = "progress_log")
@Getter @Setter @NoArgsConstructor
public class ProgressLog {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "project_id") private Project project;
    @Column(name = "log_date", nullable = false) private LocalDate logDate;
    @Column(name = "physical_progress_pct", nullable = false, precision = 5, scale = 2) private BigDecimal physicalProgressPct;
    @Column(name = "planned_progress_pct", nullable = false, precision = 5, scale = 2) private BigDecimal plannedProgressPct = BigDecimal.ZERO;
    @Column(name = "workforce_count") private Integer workforceCount;
    @Column(columnDefinition = "text") private String notes;
    @Column(name = "reported_by", length = 160) private String reportedBy;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 16) private DataSource source = DataSource.WEB;
    @CreationTimestamp @Column(name = "created_at", updatable = false) private Instant createdAt;
}
