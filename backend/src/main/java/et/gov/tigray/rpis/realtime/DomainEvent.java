package et.gov.tigray.rpis.realtime;

import et.gov.tigray.rpis.common.Sector;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * Application-level domain event. Published in-process (Spring events) and, after commit,
 * broadcast to STOMP subscribers so executive dashboards update without refresh.
 */
public record DomainEvent(String id, String type, String entityType, Long entityId, Sector sector, Integer weredaId,
                          Instant occurredAt, Map<String, Object> payload) {
    public static DomainEvent of(String type, String entityType, Long entityId, Sector sector, Integer weredaId, Map<String, Object> payload) {
        return new DomainEvent(UUID.randomUUID().toString(), type, entityType, entityId, sector, weredaId, Instant.now(), payload);
    }
}
