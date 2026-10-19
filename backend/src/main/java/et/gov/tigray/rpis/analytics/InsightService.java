package et.gov.tigray.rpis.analytics;

import et.gov.tigray.rpis.audit.Audited;
import et.gov.tigray.rpis.common.BusinessException;
import et.gov.tigray.rpis.common.Enums.*;
import et.gov.tigray.rpis.common.NotFoundException;
import et.gov.tigray.rpis.common.Sector;
import et.gov.tigray.rpis.security.CurrentUser;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** Persists explainable insights; supersedes the previous active insight of the same kind for the same entity. */
@Service
@RequiredArgsConstructor
public class InsightService {
    private final AnalyticsInsightRepository repo;

    public record Draft(InsightKind kind, EntityType entityType, Long entityId, Sector sector, Integer weredaId, String provider, InsightBasis basis,
                        AlertSeverity severity, Double score, Double confidence, Integer horizonDays, String title, String summary, Map<String, Object> explanation) {}

    @Transactional
    public AnalyticsInsight upsert(Draft d) {
        AnalyticsInsight existing = repo.findActive(d.kind(), d.entityType(), d.entityId()).orElse(null);
        if (existing != null) {
            boolean same = existing.getTitle().equals(d.title()) && sameNum(existing.getScore(), d.score()) && existing.getSeverity() == d.severity();
            if (same) { existing.setComputedAt(Instant.now()); existing.setExplanation(d.explanation()); existing.setSummary(d.summary()); return repo.save(existing); }
            existing.setStatus(InsightStatus.SUPERSEDED);
            repo.save(existing);
        }
        AnalyticsInsight i = new AnalyticsInsight();
        i.setKind(d.kind()); i.setEntityType(d.entityType()); i.setEntityId(d.entityId()); i.setSector(d.sector()); i.setWeredaId(d.weredaId());
        i.setProvider(d.provider()); i.setBasis(d.basis()); i.setModelVersion("1.0"); i.setSeverity(d.severity());
        i.setScore(d.score() == null ? null : BigDecimal.valueOf(d.score()).setScale(2, java.math.RoundingMode.HALF_UP));
        i.setConfidence(d.confidence() == null ? null : BigDecimal.valueOf(d.confidence()).setScale(3, java.math.RoundingMode.HALF_UP));
        i.setHorizonDays(d.horizonDays()); i.setTitle(d.title()); i.setSummary(d.summary()); i.setExplanation(d.explanation());
        return repo.save(i);
    }

    /** Clears an active insight whose condition no longer holds. */
    @Transactional
    public void resolve(InsightKind kind, EntityType type, Long id) {
        repo.findActive(kind, type, id).ifPresent(i -> { i.setStatus(InsightStatus.SUPERSEDED); repo.save(i); });
    }

    @Transactional(readOnly = true)
    public Page<AnalyticsInsight> search(InsightKind kind, EntityType type, Long entityId, Sector sector, Integer weredaId, List<InsightStatus> statuses, AlertSeverity minSeverity, Pageable pageable) {
        Specification<AnalyticsInsight> spec = (root, q, cb) -> {
            List<Predicate> ps = new ArrayList<>();
            if (kind != null) ps.add(cb.equal(root.get("kind"), kind));
            if (type != null) ps.add(cb.equal(root.get("entityType"), type));
            if (entityId != null) ps.add(cb.equal(root.get("entityId"), entityId));
            if (sector != null) ps.add(cb.equal(root.get("sector"), sector));
            if (weredaId != null) ps.add(cb.equal(root.get("weredaId"), weredaId));
            ps.add(root.get("status").in(statuses == null || statuses.isEmpty() ? List.of(InsightStatus.ACTIVE) : statuses));
            if (minSeverity != null) {
                List<AlertSeverity> allowed = new ArrayList<>();
                for (AlertSeverity s : AlertSeverity.values()) if (s.ordinal() <= minSeverity.ordinal()) allowed.add(s);
                ps.add(root.get("severity").in(allowed));
            }
            return cb.and(ps.toArray(Predicate[]::new));
        };
        return repo.findAll(spec, pageable);
    }

    @Transactional(readOnly = true)
    public List<AnalyticsInsight> forEntity(EntityType type, Long id) { return repo.findForEntity(type, id); }

    @Audited(action = "INSIGHT_REVIEW", entityType = "INSIGHT")
    @Transactional
    public AnalyticsInsight review(Long id, InsightStatus status, String note) {
        if (status != InsightStatus.DISMISSED && status != InsightStatus.ACTIONED && status != InsightStatus.ACTIVE)
            throw BusinessException.badRequest("invalid_review", "Review status must be DISMISSED, ACTIONED or ACTIVE");
        AnalyticsInsight i = repo.findById(id).orElseThrow(() -> new NotFoundException("Insight", id));
        CurrentUser u = CurrentUser.get().orElseThrow(() -> BusinessException.unauthorized("no_actor", "No authenticated actor"));
        if (u.isFederal()) throw BusinessException.forbidden("read_only", "Federal observers cannot review insights");
        if ((status == InsightStatus.DISMISSED) && (note == null || note.isBlank())) throw BusinessException.badRequest("note_required", "Dismissing an insight requires a note");
        i.setStatus(status); i.setReviewedAt(Instant.now()); i.setReviewedByUserId(u.id()); i.setReviewedByName(u.fullName()); i.setReviewNote(note);
        return repo.save(i);
    }

    private static boolean sameNum(BigDecimal a, Double b) {
        if (a == null && b == null) return true;
        if (a == null || b == null) return false;
        return Math.abs(a.doubleValue() - b) < 0.5;
    }
}
