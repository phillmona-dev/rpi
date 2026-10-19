package et.gov.tigray.rpis.audit;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Map;

@Entity @Table(name = "audit_log")
@Getter @Setter @NoArgsConstructor
public class AuditLog {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "occurred_at", nullable = false) private Instant occurredAt = Instant.now();
    @Column(name = "actor_username", length = 64) private String actorUsername;
    @Column(name = "actor_roles") private String actorRoles;
    @Column(nullable = false, length = 64) private String action;
    @Column(name = "entity_type", length = 48) private String entityType;
    @Column(name = "entity_id", length = 64) private String entityId;
    @Column(name = "http_method", length = 8) private String httpMethod;
    @Column(length = 512) private String path;
    @Column(name = "status_code") private Integer statusCode;
    @Column(name = "ip_address", length = 64) private String ipAddress;
    @Column(name = "correlation_id", length = 64) private String correlationId;
    @JdbcTypeCode(SqlTypes.JSON) @Column(columnDefinition = "jsonb") private Map<String, Object> detail;
}
