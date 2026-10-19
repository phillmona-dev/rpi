package et.gov.tigray.rpis.project;

import et.gov.tigray.rpis.common.Enums.OrganizationRole;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.io.Serializable;
import java.util.Objects;

/** Responsible organisation on a project, by role (implementing agency, contractor, funder, …). */
@Entity @Table(name = "project_organization")
@Getter @Setter @NoArgsConstructor
@IdClass(ProjectOrganization.Key.class)
public class ProjectOrganization {
    @Id @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "project_id") private Project project;
    @Id @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "organization_id") private Organization organization;
    @Id @Enumerated(EnumType.STRING) @Column(nullable = false, length = 32) private OrganizationRole role;

    public ProjectOrganization(Project p, Organization o, OrganizationRole r) { this.project = p; this.organization = o; this.role = r; }

    @Getter @Setter @NoArgsConstructor
    public static class Key implements Serializable {
        private Long project;
        private Long organization;
        private OrganizationRole role;
        @Override public boolean equals(Object o) { return o instanceof Key k && Objects.equals(project, k.project) && Objects.equals(organization, k.organization) && role == k.role; }
        @Override public int hashCode() { return Objects.hash(project, organization, role); }
    }
}
