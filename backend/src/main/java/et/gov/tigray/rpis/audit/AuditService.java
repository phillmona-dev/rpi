package et.gov.tigray.rpis.audit;

import et.gov.tigray.rpis.common.CorrelationIdFilter;
import et.gov.tigray.rpis.security.CurrentUser;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.MDC;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.util.Map;

/** Append-only audit trail. Written in a separate transaction so a failed business operation still leaves evidence. */
@Slf4j
@Service
@RequiredArgsConstructor
public class AuditService {
    private final AuditLogRepository repo;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(String action, String entityType, Object entityId, Map<String, Object> detail) {
        try {
            AuditLog a = new AuditLog();
            a.setAction(action);
            a.setEntityType(entityType);
            a.setEntityId(entityId == null ? null : String.valueOf(entityId));
            a.setDetail(detail);
            a.setCorrelationId(MDC.get(CorrelationIdFilter.MDC_KEY));
            CurrentUser.get().ifPresent(u -> { a.setActorUsername(u.username()); a.setActorRoles(String.join(",", u.roles())); });
            if (a.getActorUsername() == null && entityType != null && entityType.equals("USER") && action.startsWith("LOGIN")) a.setActorUsername(String.valueOf(entityId));
            if (RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attrs) {
                HttpServletRequest req = attrs.getRequest();
                a.setHttpMethod(req.getMethod());
                a.setPath(req.getRequestURI());
                String fwd = req.getHeader("X-Forwarded-For");
                a.setIpAddress(fwd != null ? fwd.split(",")[0].trim() : req.getRemoteAddr());
            }
            repo.save(a);
        } catch (Exception e) {
            log.error("Audit write failed for action {}", action, e);
        }
    }
}
