package et.gov.tigray.rpis.analytics;

import et.gov.tigray.rpis.common.Enums.*;
import et.gov.tigray.rpis.common.Sector;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;

/**
 * One explainable analytics result (risk score, delay prediction, anomaly, recommendation, …).
 * Rule-based providers write `basis = RULE` today; trained models write `basis = MODEL` to the same row shape.
 */
@Entity @Table(name = "analytics_insight")
@Getter @Setter @NoArgsConstructor
public class AnalyticsInsight {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 32) private InsightKind kind;
    @Enumerated(EnumType.STRING) @Column(name = "entity_type", nullable = false, length = 16) private EntityType entityType;
    @Column(name = "entity_id", nullable = false) private Long entityId;
    @Enumerated(EnumType.STRING) @Column(length = 32) private Sector sector;
    @Column(name = "wereda_id") private Integer weredaId;
    @Column(nullable = false, length = 48) private String provider;
    @Column(name = "model_version", length = 32) private String modelVersion;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 8) private InsightBasis basis = InsightBasis.RULE;
    @Column(name = "computed_at", nullable = false) private Instant computedAt = Instant.now();
    @Enumerated(EnumType.STRING) @Column(length = 10) private AlertSeverity severity;
    @Column(precision = 6, scale = 2) private BigDecimal score;
    @Column(precision = 4, scale = 3) private BigDecimal confidence;
    @Column(name = "horizon_days") private Integer horizonDays;
    @Column(nullable = false, length = 220) private String title;
    @Column(columnDefinition = "text") private String summary;
    @JdbcTypeCode(SqlTypes.JSON) @Column(columnDefinition = "jsonb") private Map<String, Object> explanation;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 16) private InsightStatus status = InsightStatus.ACTIVE;
    @Column(name = "reviewed_by_user_id") private Long reviewedByUserId;
    @Column(name = "reviewed_by_name", length = 160) private String reviewedByName;
    @Column(name = "reviewed_at") private Instant reviewedAt;
    @Column(name = "review_note", columnDefinition = "text") private String reviewNote;
}
