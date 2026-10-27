package et.gov.tigray.rpis.fieldteam;

import et.gov.tigray.rpis.common.Enums.AssignmentPriority;
import et.gov.tigray.rpis.common.Enums.AssignmentRole;
import et.gov.tigray.rpis.common.Enums.AssignmentStatus;
import et.gov.tigray.rpis.project.Project;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/** A field team member's responsibility for collecting or verifying data on one project, with a visit cadence. */
@Entity @Table(name = "project_assignment")
@Getter @Setter @NoArgsConstructor
public class ProjectAssignment {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "project_id") private Project project;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "agent_id") private FieldAgent agent;
    @Enumerated(EnumType.STRING) @Column(name = "assignment_role", nullable = false, length = 16) private AssignmentRole role;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 12) private AssignmentStatus status = AssignmentStatus.ACTIVE;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 8) private AssignmentPriority priority = AssignmentPriority.NORMAL;
    @Column(name = "start_on", nullable = false) private LocalDate startOn;
    @Column(name = "end_on") private LocalDate endOn;
    @Column(name = "visit_frequency_days", nullable = false) private short visitFrequencyDays = 14;
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "required_inspection_types", columnDefinition = "jsonb", nullable = false) private List<String> requiredInspectionTypes = new ArrayList<>();
    @Column(columnDefinition = "text") private String instructions;
    @Column(name = "override_note", columnDefinition = "text") private String overrideNote;
    @Column(name = "assigned_by_user_id") private Long assignedByUserId;
    @Column(name = "assigned_by_name", length = 160) private String assignedByName;
    @Column(name = "assigned_at", nullable = false) private Instant assignedAt = Instant.now();
    @Column(name = "closed_at") private Instant closedAt;
    @Column(name = "closed_by_name", length = 160) private String closedByName;
    @Column(name = "close_reason", columnDefinition = "text") private String closeReason;
}
