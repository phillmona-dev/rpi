package et.gov.tigray.rpis.geo;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.locationtech.jts.geom.Point;

@Entity @Table(name = "zone")
@Getter @Setter @NoArgsConstructor
public class Zone {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Short id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "region_id") private Region region;
    @Column(nullable = false, unique = true, length = 16) private String code;
    @Column(name = "name_en", nullable = false) private String nameEn;
    @Column(name = "name_ti") private String nameTi;
    @Column(name = "name_am") private String nameAm;
    @Column(columnDefinition = "geometry(Point,4326)") private Point centroid;
}
