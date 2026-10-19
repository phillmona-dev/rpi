package et.gov.tigray.rpis.alert;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface AlertActionRepository extends JpaRepository<AlertActionEntity, Long> {
    List<AlertActionEntity> findByAlertIdOrderByCreatedAtAsc(Long alertId);
}
