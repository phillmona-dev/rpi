package et.gov.tigray.rpis.report;

import et.gov.tigray.rpis.common.Enums.ReportFormat;
import et.gov.tigray.rpis.common.Enums.ReportPeriod;
import et.gov.tigray.rpis.common.Enums.ReportType;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Map;

/** Accountability record: every generated or exported report, with a digest of its content. */
@Entity @Table(name = "report_run")
@Getter @Setter @NoArgsConstructor
public class ReportRun {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Enumerated(EnumType.STRING) @Column(name = "report_type", nullable = false, length = 32) private ReportType reportType;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 16) private ReportPeriod period;
    @Column(nullable = false, length = 220) private String title;
    @JdbcTypeCode(SqlTypes.JSON) @Column(columnDefinition = "jsonb") private Map<String, Object> scope;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 8) private ReportFormat format;
    @Column(name = "generated_at", nullable = false) private Instant generatedAt = Instant.now();
    @Column(name = "generated_by", length = 64) private String generatedBy;
    @Column(name = "row_count") private Integer rowCount;
    @Column(length = 64) private String sha256;
    @Column(name = "correlation_id", length = 64) private String correlationId;
}
