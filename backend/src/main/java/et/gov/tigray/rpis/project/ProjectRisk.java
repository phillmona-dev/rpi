package et.gov.tigray.rpis.project;

import et.gov.tigray.rpis.common.Enums.Level;
import et.gov.tigray.rpis.common.Enums.RiskStatus;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;
import java.time.LocalDate;

@Entity @Table(name = "project_risk")
@Getter @Setter @NoArgsConstructor
public class ProjectRisk {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "project_id") private Project project;
    @Column(nullable = false, length = 200) private String title;
    @Column(nullable = false, length = 32) private String category;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 8) private Level likelihood;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 8) private Level impact;
    @Column(columnDefinition = "text") private String mitigation;
    @Column(length = 160) private String owner;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 16) private RiskStatus status = RiskStatus.OPEN;
    @Column(name = "raised_on", nullable = false) private LocalDate raisedOn;
    @UpdateTimestamp @Column(name = "updated_at") private Instant updatedAt;
}
