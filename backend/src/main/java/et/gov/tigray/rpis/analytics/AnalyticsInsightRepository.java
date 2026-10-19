package et.gov.tigray.rpis.analytics;

import et.gov.tigray.rpis.common.Enums.EntityType;
import et.gov.tigray.rpis.common.Enums.InsightKind;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface AnalyticsInsightRepository extends JpaRepository<AnalyticsInsight, Long>, JpaSpecificationExecutor<AnalyticsInsight> {
    @Query("select i from AnalyticsInsight i where i.kind = :kind and i.entityType = :type and i.entityId = :id and i.status = 'ACTIVE'")
    Optional<AnalyticsInsight> findActive(InsightKind kind, EntityType type, Long id);

    @Query("select i from AnalyticsInsight i where i.entityType = :type and i.entityId = :id and i.status in ('ACTIVE','ACTIONED') order by i.severity asc, i.computedAt desc")
    List<AnalyticsInsight> findForEntity(EntityType type, Long id);

    @Query("select i from AnalyticsInsight i where i.status = 'ACTIVE'")
    List<AnalyticsInsight> findAllActive();
}
