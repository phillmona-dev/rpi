package et.gov.tigray.rpis.fieldteam;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Map;

/** Append-only history of a field team member: registration, status changes, access, assignments. */
@Entity @Table(name = "field_agent_event")
@Getter @Setter @NoArgsConstructor
public class FieldAgentEvent {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "agent_id", nullable = false) private Long agentId;
    @Column(nullable = false, length = 24) private String kind;
    @Column(name = "occurred_at", nullable = false) private Instant occurredAt = Instant.now();
    @Column(name = "actor_user_id") private Long actorUserId;
    @Column(name = "actor_name", length = 160) private String actorName;
    @Column(columnDefinition = "text") private String note;
    @JdbcTypeCode(SqlTypes.JSON) @Column(columnDefinition = "jsonb") private Map<String, Object> data;
}
