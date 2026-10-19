package et.gov.tigray.rpis.project;

import et.gov.tigray.rpis.facility.Facility;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.io.Serializable;
import java.util.Objects;

@Entity @Table(name = "project_facility")
@IdClass(ProjectFacility.Key.class)
@Getter @Setter @NoArgsConstructor
public class ProjectFacility {
    @Id @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "project_id") private Project project;
    @Id @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "facility_id") private Facility facility;

    public ProjectFacility(Project p, Facility f) { this.project = p; this.facility = f; }

    public static class Key implements Serializable {
        private Long project; private Long facility;
        public Key() {}
        public Key(Long project, Long facility) { this.project = project; this.facility = facility; }
        @Override public boolean equals(Object o) { return o instanceof Key k && Objects.equals(project, k.project) && Objects.equals(facility, k.facility); }
        @Override public int hashCode() { return Objects.hash(project, facility); }
    }
}
