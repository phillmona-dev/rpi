package et.gov.tigray.rpis.geo;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface WeredaRepository extends JpaRepository<Wereda, Integer> {
    @EntityGraph(attributePaths = "zone")
    List<Wereda> findAllByOrderByNameEnAsc();
    @EntityGraph(attributePaths = "zone")
    List<Wereda> findByZoneIdOrderByNameEnAsc(Short zoneId);
    @EntityGraph(attributePaths = "zone")
    Optional<Wereda> findWithZoneById(Integer id);
    Optional<Wereda> findByCode(String code);
}
