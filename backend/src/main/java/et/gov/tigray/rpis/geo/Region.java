package et.gov.tigray.rpis.geo;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity @Table(name = "region")
@Getter @Setter @NoArgsConstructor
public class Region {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Short id;
    @Column(nullable = false, unique = true, length = 16) private String code;
    @Column(name = "name_en", nullable = false) private String nameEn;
    @Column(name = "name_ti") private String nameTi;
    @Column(name = "name_am") private String nameAm;
}
