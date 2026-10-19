package et.gov.tigray.rpis.alert;

import et.gov.tigray.rpis.common.Enums.AlertRule;
import et.gov.tigray.rpis.common.Enums.AlertSeverity;
import et.gov.tigray.rpis.common.Enums.AlertStatus;
import et.gov.tigray.rpis.common.Enums.EntityType;
import et.gov.tigray.rpis.common.Sector;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Map;

@Entity @Table(name = "alert")
@Getter @Setter @NoArgsConstructor
public class Alert {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 40) private AlertRule rule;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 10) private AlertSeverity severity;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 16) private AlertStatus status = AlertStatus.OPEN;
    @Column(nullable = false, length = 220) private String title;
    @Column(columnDefinition = "text") private String detail;
    @Enumerated(EnumType.STRING) @Column(name = "entity_type", nullable = false, length = 16) private EntityType entityType;
    @Column(name = "entity_id", nullable = false) private Long entityId;
    @Enumerated(EnumType.STRING) @Column(length = 32) private Sector sector;
    @Column(name = "wereda_id") private Integer weredaId;
    @Column(name = "triggered_at", nullable = false) private Instant triggeredAt = Instant.now();
    @Column(name = "last_evaluated_at", nullable = false) private Instant lastEvaluatedAt = Instant.now();
    @Column(name = "acknowledged_at") private Instant acknowledgedAt;
    @Column(name = "assigned_to_user_id") private Long assignedToUserId;
    @Column(name = "resolved_at") private Instant resolvedAt;
    @Column(name = "decision_required", nullable = false) private boolean decisionRequired;
    @JdbcTypeCode(SqlTypes.JSON) @Column(columnDefinition = "jsonb") private Map<String, Object> metrics;
    public boolean isOpenLike() { return status == AlertStatus.OPEN || status == AlertStatus.ACKNOWLEDGED || status == AlertStatus.ASSIGNED; }
}
