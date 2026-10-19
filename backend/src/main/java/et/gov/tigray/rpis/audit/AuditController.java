package et.gov.tigray.rpis.audit;

import et.gov.tigray.rpis.common.PageResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/admin/audit")
@RequiredArgsConstructor
@Tag(name = "Administration · Audit")
public class AuditController {
    private final AuditLogRepository repo;

    public record AuditEntry(Long id, Instant occurredAt, String actor, String roles, String action, String entityType, String entityId,
                             String httpMethod, String path, String ip, String correlationId, Map<String, Object> detail) {}

    @GetMapping
    public PageResponse<AuditEntry> search(@RequestParam(required = false) String actor,
                                           @RequestParam(required = false) String action,
                                           @RequestParam(required = false) String entityType,
                                           @RequestParam(required = false) String entityId,
                                           @ParameterObject @PageableDefault(size = 50) Pageable pageable) {
        String fa = blank(actor), ac = blank(action), et = blank(entityType), ei = blank(entityId);
        org.springframework.data.jpa.domain.Specification<AuditLog> spec = (root, q, cb) -> {
            java.util.List<jakarta.persistence.criteria.Predicate> ps = new java.util.ArrayList<>();
            if (fa != null) ps.add(cb.like(cb.lower(root.get("actorUsername")), "%" + fa.toLowerCase() + "%"));
            if (ac != null) ps.add(cb.equal(root.get("action"), ac));
            if (et != null) ps.add(cb.equal(root.get("entityType"), et));
            if (ei != null) ps.add(cb.equal(root.get("entityId"), ei));
            return cb.and(ps.toArray(jakarta.persistence.criteria.Predicate[]::new));
        };
        Pageable sorted = pageable.getSort().isSorted() ? pageable : org.springframework.data.domain.PageRequest.of(pageable.getPageNumber(), pageable.getPageSize(), org.springframework.data.domain.Sort.by("occurredAt").descending());
        return PageResponse.of(repo.findAll(spec, sorted),
            a -> new AuditEntry(a.getId(), a.getOccurredAt(), a.getActorUsername(), a.getActorRoles(), a.getAction(), a.getEntityType(),
                a.getEntityId(), a.getHttpMethod(), a.getPath(), a.getIpAddress(), a.getCorrelationId(), a.getDetail()));
    }

    private static String blank(String s) { return s == null || s.isBlank() ? null : s; }
}
