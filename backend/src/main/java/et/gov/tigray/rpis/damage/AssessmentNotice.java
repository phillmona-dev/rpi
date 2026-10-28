package et.gov.tigray.rpis.damage;

import java.util.Collection;
import java.util.Map;

/**
 * Personal notification produced by the assessment workflow. Recipients are resolved by the workflow (task assessor,
 * verifier, coordinator, endorsers), so this travels as its own event instead of a broadcast {@link et.gov.tigray.rpis.realtime.DomainEvent}.
 */
public record AssessmentNotice(Collection<Long> userIds, Long actorUserId, String actorName, String type, String severity, String link, Map<String, Object> data) {}
