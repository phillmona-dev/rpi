package et.gov.tigray.rpis.damage;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface FieldDeviceRepository extends JpaRepository<FieldDevice, Long> {
    Optional<FieldDevice> findByDeviceUid(String deviceUid);
}
