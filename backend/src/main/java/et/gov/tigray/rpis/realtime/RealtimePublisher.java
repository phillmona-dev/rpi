package et.gov.tigray.rpis.realtime;

import et.gov.tigray.rpis.config.RpisProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.CacheManager;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/** Fans domain events out to STOMP topics after the owning transaction commits, and evicts dashboard caches. */
@Slf4j
@Component
@RequiredArgsConstructor
public class RealtimePublisher {
    public static final String TOPIC_DASHBOARD = "/topic/dashboard";
    public static final String TOPIC_ALERTS = "/topic/alerts";
    public static final String TOPIC_PROJECT_PREFIX = "/topic/projects.";

    private final SimpMessagingTemplate messaging;
    private final RpisProperties props;
    private final CacheManager cacheManager;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void on(DomainEvent event) {
        cacheManager.getCacheNames().forEach(n -> { var c = cacheManager.getCache(n); if (c != null) c.clear(); });
        if (!props.getRealtime().isEnabled()) return;
        try {
            messaging.convertAndSend(TOPIC_DASHBOARD, event);
            if (event.type().startsWith("ALERT_")) messaging.convertAndSend(TOPIC_ALERTS, event);
            if ("PROJECT".equals(event.entityType()) && event.entityId() != null) messaging.convertAndSend(TOPIC_PROJECT_PREFIX + event.entityId(), event);
        } catch (Exception e) {
            log.warn("Realtime broadcast failed for {}: {}", event.type(), e.getMessage());
        }
    }
}
