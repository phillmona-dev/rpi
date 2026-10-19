package et.gov.tigray.rpis.geo;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.locationtech.jts.geom.MultiPolygon;
import org.locationtech.jts.geom.Point;

@Entity @Table(name = "wereda")
@Getter @Setter @NoArgsConstructor
public class Wereda {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Integer id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "zone_id") private Zone zone;
    @Column(nullable = false, unique = true, length = 16) private String code;
    @Column(name = "name_en", nullable = false) private String nameEn;
    @Column(name = "name_ti") private String nameTi;
    @Column(name = "name_am") private String nameAm;
    @Column(name = "is_urban", nullable = false) private boolean urban;
    private Integer population;
    @Column(nullable = false, columnDefinition = "geometry(Point,4326)") private Point centroid;
    @Column(columnDefinition = "geometry(MultiPolygon,4326)") private MultiPolygon boundary;
}
