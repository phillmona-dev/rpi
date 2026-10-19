package et.gov.tigray.rpis.project;

import et.gov.tigray.rpis.common.Enums.LifecycleStage;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

/** One governance transition in the project passport (who moved it, when, on what authority). */
@Entity @Table(name = "project_stage_event")
@Getter @Setter @NoArgsConstructor
public class ProjectStageEvent {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "project_id") private Project project;
    @Enumerated(EnumType.STRING) @Column(name = "from_stage", length = 24) private LifecycleStage fromStage;
    @Enumerated(EnumType.STRING) @Column(name = "to_stage", nullable = false, length = 24) private LifecycleStage toStage;
    @Column(name = "occurred_at", nullable = false) private Instant occurredAt = Instant.now();
    @Column(name = "actor_user_id") private Long actorUserId;
    @Column(name = "actor_name", length = 160) private String actorName;
    @Column(columnDefinition = "text") private String note;
    @Column(length = 120) private String reference;
}
