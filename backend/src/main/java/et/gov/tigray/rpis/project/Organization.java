package et.gov.tigray.rpis.project;

import et.gov.tigray.rpis.common.Enums.OrganizationType;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;

@Entity @Table(name = "organization")
@Getter @Setter @NoArgsConstructor
public class Organization {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(nullable = false, unique = true, length = 32) private String code;
    @Column(nullable = false, length = 200) private String name;
    @Enumerated(EnumType.STRING) @Column(name = "org_type", nullable = false, length = 24) private OrganizationType orgType;
    @Column(length = 200) private String contact;
    @CreationTimestamp @Column(name = "created_at", updatable = false) private Instant createdAt;
}
