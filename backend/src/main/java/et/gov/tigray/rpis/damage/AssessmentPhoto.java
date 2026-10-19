package et.gov.tigray.rpis.damage;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.locationtech.jts.geom.Point;

import java.time.Instant;

@Entity @Table(name = "assessment_photo")
@Getter @Setter @NoArgsConstructor
public class AssessmentPhoto {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "assessment_id") private DamageAssessment assessment;
    @Column(nullable = false, length = 512) private String url;
    @Column(length = 255) private String caption;
    @Column(name = "taken_at") private Instant takenAt;
    @Column(columnDefinition = "geometry(Point,4326)") private Point location;
}
