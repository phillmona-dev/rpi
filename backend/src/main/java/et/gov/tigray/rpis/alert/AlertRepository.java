package et.gov.tigray.rpis.alert;

import et.gov.tigray.rpis.common.Enums.AlertRule;
import et.gov.tigray.rpis.common.Enums.AlertStatus;
import et.gov.tigray.rpis.common.Enums.EntityType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface AlertRepository extends JpaRepository<Alert, Long>, JpaSpecificationExecutor<Alert> {
    @Query("select a from Alert a where a.rule = :rule and a.entityType = :type and a.entityId = :id and a.status in ('OPEN','ACKNOWLEDGED','ASSIGNED')")
    Optional<Alert> findOpen(AlertRule rule, EntityType type, Long id);

    @Query("select a from Alert a where a.status in ('OPEN','ACKNOWLEDGED','ASSIGNED')")
    List<Alert> findAllOpen();

    @Query("select count(a) from Alert a where a.entityType = :type and a.entityId = :id and a.status in ('OPEN','ACKNOWLEDGED','ASSIGNED')")
    int countOpenForEntity(EntityType type, Long id);

    List<Alert> findByStatusInOrderBySeverityAscTriggeredAtDesc(List<AlertStatus> statuses);
}
