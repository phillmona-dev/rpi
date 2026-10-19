package et.gov.tigray.rpis.alert;

import et.gov.tigray.rpis.common.Enums.AlertAction;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity @Table(name = "alert_action")
@Getter @Setter @NoArgsConstructor
public class AlertActionEntity {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "alert_id") private Alert alert;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 16) private AlertAction action;
    @Column(columnDefinition = "text") private String note;
    @Column(name = "actor_user_id") private Long actorUserId;
    @Column(name = "actor_name", length = 160) private String actorName;
    @Column(name = "created_at", nullable = false) private Instant createdAt = Instant.now();
}
