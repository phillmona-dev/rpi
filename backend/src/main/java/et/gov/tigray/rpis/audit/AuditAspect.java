package et.gov.tigray.rpis.audit;

import lombok.RequiredArgsConstructor;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

@Aspect
@Component
@RequiredArgsConstructor
public class AuditAspect {
    private final AuditService audit;

    @Around("@annotation(audited)")
    public Object around(ProceedingJoinPoint pjp, Audited audited) throws Throwable {
        Object[] args = pjp.getArgs();
        Object entityId = args.length > 0 && (args[0] instanceof Long || args[0] instanceof Integer || args[0] instanceof String) ? args[0] : null;
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("method", pjp.getSignature().toShortString());
        try {
            Object result = pjp.proceed();
            if (entityId == null) entityId = extractId(result);
            detail.put("outcome", "SUCCESS");
            audit.record(audited.action(), audited.entityType(), entityId, detail);
            return result;
        } catch (Throwable t) {
            detail.put("outcome", "FAILED");
            detail.put("error", t.getClass().getSimpleName());
            audit.record(audited.action(), audited.entityType(), entityId, detail);
            throw t;
        }
    }

    private static Object extractId(Object result) {
        if (result == null) return null;
        try {
            var m = result.getClass().getMethod("id");
            return m.invoke(result);
        } catch (Exception ignored) {
            try { return result.getClass().getMethod("getId").invoke(result); } catch (Exception e) { return null; }
        }
    }
}
