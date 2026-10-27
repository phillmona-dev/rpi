package et.gov.tigray.rpis.messaging;

import et.gov.tigray.rpis.config.RpisProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.web.socket.messaging.SessionConnectedEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import java.security.Principal;
import java.util.Collection;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Live delivery for messaging and notifications. Frames go to each recipient's private queue (/user/queue/chat) after the
 * owning transaction commits, so a client never sees a message that was rolled back. Also tracks which users
 * have a live connection, for the online indicator.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ChatRealtime {
    public static final String USER_QUEUE = "/queue/chat";
    public static final String TOPIC_PRESENCE = "/topic/presence";
    public static final String NOTIFICATION_QUEUE = "/queue/notifications";

    private final SimpMessagingTemplate messaging;
    private final RpisProperties props;
    private final Map<String, Integer> sessions = new ConcurrentHashMap<>();

    /** In-process event; fanned out after commit to each user's private queue (chat by default). */
    public record Outbound(Collection<String> usernames, Object frame, String queue) {
        public Outbound(Collection<String> usernames, MessagingDtos.ChatFrame frame) { this(usernames, frame, USER_QUEUE); }
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void deliver(Outbound out) {
        if (!props.getRealtime().isEnabled()) return;
        for (String u : out.usernames()) {
            try { messaging.convertAndSendToUser(u, out.queue(), out.frame()); }
            catch (Exception e) { log.warn("Chat delivery to {} failed: {}", u, e.getMessage()); }
        }
    }

    public boolean isOnline(String username) { return username != null && sessions.getOrDefault(username, 0) > 0; }

    @EventListener
    public void connected(SessionConnectedEvent e) { change(e.getUser(), +1); }

    @EventListener
    public void disconnected(SessionDisconnectEvent e) { change(e.getUser(), -1); }

    private void change(Principal user, int delta) {
        if (user == null) return;
        String name = user.getName();
        int after = sessions.merge(name, delta, (a, b) -> Math.max(0, a + b));
        if (after == 0) sessions.remove(name);
        // Only the first connection and the last disconnection change what others see.
        if ((delta > 0 && after == 1) || (delta < 0 && after == 0)) {
            try { messaging.convertAndSend(TOPIC_PRESENCE, Map.of("username", name, "online", after > 0)); }
            catch (Exception ex) { log.debug("Presence broadcast failed: {}", ex.getMessage()); }
        }
    }
}
