package et.gov.tigray.rpis.project;

import et.gov.tigray.rpis.common.Enums.IssueStatus;
import et.gov.tigray.rpis.common.Enums.Level;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDate;

@Entity @Table(name = "project_issue")
@Getter @Setter @NoArgsConstructor
public class ProjectIssue {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "project_id") private Project project;
    @Column(nullable = false, length = 200) private String title;
    @Column(columnDefinition = "text") private String description;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 8) private Level severity;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 16) private IssueStatus status = IssueStatus.OPEN;
    @Column(name = "raised_on", nullable = false) private LocalDate raisedOn;
    @Column(name = "resolved_on") private LocalDate resolvedOn;
    @Column(length = 160) private String owner;
}
