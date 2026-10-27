package et.gov.tigray.rpis.project;

import et.gov.tigray.rpis.common.Enums.ApprovalAction;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

/** One step in the executive approval trail: submission, resubmission or decision. Append-only. */
@Entity @Table(name = "project_approval_event")
@Getter @Setter @NoArgsConstructor
public class ProjectApprovalEvent {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "project_id") private Project project;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 16) private ApprovalAction action;
    @Column(name = "occurred_at", nullable = false) private Instant occurredAt = Instant.now();
    @Column(name = "actor_user_id") private Long actorUserId;
    @Column(name = "actor_name", length = 160) private String actorName;
    @Column(columnDefinition = "text") private String note;
    @Column(columnDefinition = "text") private String conditions;
    @Column(length = 40) private String reference;
}
