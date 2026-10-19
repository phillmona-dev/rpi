package et.gov.tigray.rpis.alert;

import et.gov.tigray.rpis.audit.Audited;
import et.gov.tigray.rpis.common.BusinessException;
import et.gov.tigray.rpis.common.Enums.*;
import et.gov.tigray.rpis.common.NotFoundException;
import et.gov.tigray.rpis.common.Sector;
import et.gov.tigray.rpis.facility.FacilityRepository;
import et.gov.tigray.rpis.geo.WeredaRepository;
import et.gov.tigray.rpis.project.ProjectRepositories;
import et.gov.tigray.rpis.realtime.DomainEvent;
import et.gov.tigray.rpis.security.CurrentUser;
import et.gov.tigray.rpis.security.UserRepository;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.*;

@Service
@RequiredArgsConstructor
public class AlertService {
    private final AlertRepository alerts;
    private final AlertActionRepository actions;
    private final ProjectRepositories.Projects projects;
    private final FacilityRepository facilities;
    private final WeredaRepository weredas;
    private final UserRepository users;
    private final NamedParameterJdbcTemplate jdbc;
    private final ApplicationEventPublisher events;

    public record Filter(List<AlertStatus> statuses, List<AlertSeverity> severities, Sector sector, Integer weredaId, Short zoneId, EntityType entityType, Boolean decisionRequired) {}

    @Transactional(readOnly = true)
    public Page<AlertDtos.AlertSummary> search(Filter f, Pageable pageable) {
        Specification<Alert> spec = (root, q, cb) -> {
            List<Predicate> ps = new ArrayList<>();
            if (f.statuses() != null && !f.statuses().isEmpty()) ps.add(root.get("status").in(f.statuses()));
            if (f.severities() != null && !f.severities().isEmpty()) ps.add(root.get("severity").in(f.severities()));
            if (f.sector() != null) ps.add(cb.equal(root.get("sector"), f.sector()));
            if (f.weredaId() != null) ps.add(cb.equal(root.get("weredaId"), f.weredaId()));
            if (f.entityType() != null) ps.add(cb.equal(root.get("entityType"), f.entityType()));
            if (f.decisionRequired() != null) ps.add(cb.equal(root.get("decisionRequired"), f.decisionRequired()));
            if (f.zoneId() != null) {
                List<Integer> ids = weredas.findByZoneIdOrderByNameEnAsc(f.zoneId()).stream().map(w -> w.getId()).toList();
                ps.add(ids.isEmpty() ? cb.disjunction() : root.get("weredaId").in(ids));
            }
            return cb.and(ps.toArray(Predicate[]::new));
        };
        Page<Alert> page = alerts.findAll(spec, pageable);
        return page.map(this::summary);
    }

    @Transactional(readOnly = true)
    public AlertDtos.AlertDetail detail(Long id) {
        Alert a = alerts.findById(id).orElseThrow(() -> new NotFoundException("Alert", id));
        return new AlertDtos.AlertDetail(summary(a), actions.findByAlertIdOrderByCreatedAtAsc(id).stream()
            .map(x -> new AlertDtos.ActionDto(x.getId(), x.getAction(), x.getNote(), x.getActorName(), x.getCreatedAt())).toList());
    }

    @Transactional(readOnly = true)
    public AlertDtos.Counts counts(Sector sector) { return counts(sector, null, null); }

    @Transactional(readOnly = true)
    public AlertDtos.Counts counts(Sector sector, Short zoneId, Integer weredaId) {
        String sql = """
            SELECT count(*) FILTER (WHERE status IN ('OPEN','ACKNOWLEDGED','ASSIGNED')) AS open,
                   count(*) FILTER (WHERE status IN ('OPEN','ACKNOWLEDGED','ASSIGNED') AND severity='CRITICAL') AS critical,
                   count(*) FILTER (WHERE status IN ('OPEN','ACKNOWLEDGED','ASSIGNED') AND severity='HIGH') AS high,
                   count(*) FILTER (WHERE status IN ('OPEN','ACKNOWLEDGED','ASSIGNED') AND decision_required) AS decision_required,
                   count(*) FILTER (WHERE status='ACKNOWLEDGED') AS acknowledged,
                   count(*) FILTER (WHERE status='ASSIGNED') AS assigned,
                   count(*) FILTER (WHERE status='RESOLVED' AND resolved_at > now() - interval '7 days') AS resolved7
            FROM alert WHERE (:sector IS NULL OR sector = :sector) AND (:weredaId IS NULL OR wereda_id = :weredaId)
              AND (:zoneId IS NULL OR wereda_id IN (SELECT id FROM wereda WHERE zone_id = :zoneId))
            """;
        return jdbc.queryForObject(sql, et.gov.tigray.rpis.common.SqlParams.scope(sector, zoneId, weredaId), (rs, i) -> new AlertDtos.Counts(
            rs.getLong("open"), rs.getLong("critical"), rs.getLong("high"), rs.getLong("decision_required"), rs.getLong("acknowledged"), rs.getLong("assigned"), rs.getLong("resolved7")));
    }

    @Audited(action = "ALERT_ACTION", entityType = "ALERT")
    @Transactional
    public AlertDtos.AlertDetail act(Long id, AlertDtos.ActionRequest req) {
        Alert a = alerts.findById(id).orElseThrow(() -> new NotFoundException("Alert", id));
        CurrentUser actor = CurrentUser.get().orElseThrow(() -> BusinessException.unauthorized("no_actor", "No authenticated actor"));
        if (actor.isFederal()) throw BusinessException.forbidden("read_only", "Federal observers cannot act on alerts");
        if (actor.has("SECTOR_HEAD") && actor.sectorScope() != null && a.getSector() != null && a.getSector() != actor.sectorScope())
            throw BusinessException.forbidden("sector_scope", "Alert belongs to another sector");
        if (!a.isOpenLike() && req.action() != AlertAction.COMMENT) throw BusinessException.conflict("alert_closed", "Alert is already " + a.getStatus());

        Instant now = Instant.now();
        switch (req.action()) {
            case ACKNOWLEDGE -> { a.setStatus(AlertStatus.ACKNOWLEDGED); a.setAcknowledgedAt(now); }
            case ASSIGN -> {
                if (req.assigneeUserId() == null) throw BusinessException.badRequest("assignee_required", "assigneeUserId is required for ASSIGN");
                users.findById(req.assigneeUserId()).orElseThrow(() -> new NotFoundException("User", req.assigneeUserId()));
                a.setStatus(AlertStatus.ASSIGNED); a.setAssignedToUserId(req.assigneeUserId());
                if (a.getAcknowledgedAt() == null) a.setAcknowledgedAt(now);
            }
            case RESOLVE -> {
                if (req.note() == null || req.note().isBlank()) throw BusinessException.badRequest("note_required", "A resolution note is required");
                a.setStatus(AlertStatus.RESOLVED); a.setResolvedAt(now);
            }
            case DISMISS -> {
                if (req.note() == null || req.note().isBlank()) throw BusinessException.badRequest("note_required", "A justification note is required");
                a.setStatus(AlertStatus.DISMISSED); a.setResolvedAt(now);
            }
            case COMMENT -> {}
        }
        alerts.save(a);
        AlertActionEntity act = new AlertActionEntity();
        act.setAlert(a); act.setAction(req.action()); act.setNote(req.note()); act.setActorUserId(actor.id()); act.setActorName(actor.fullName());
        actions.save(act);
        events.publishEvent(DomainEvent.of("ALERT_UPDATED", a.getEntityType().name(), a.getEntityId(), a.getSector(), a.getWeredaId(),
            Map.of("alertId", a.getId(), "title", a.getTitle(), "status", a.getStatus().name(), "severity", a.getSeverity().name(), "action", req.action().name(), "actor", actor.fullName())));
        return detail(id);
    }

    AlertDtos.AlertSummary summary(Alert a) {
        String name = null, code = null, weredaName = null, assignee = null;
        switch (a.getEntityType()) {
            case PROJECT -> { var p = projects.findById(a.getEntityId()).orElse(null); if (p != null) { name = p.getName(); code = p.getCode(); } }
            case FACILITY -> { var f = facilities.findById(a.getEntityId()).orElse(null); if (f != null) { name = f.getName(); code = f.getCode(); } }
            case WEREDA -> { var w = weredas.findById(a.getEntityId().intValue()).orElse(null); if (w != null) { name = w.getNameEn(); code = w.getCode(); } }
        }
        if (a.getWeredaId() != null) weredaName = weredas.findById(a.getWeredaId()).map(w -> w.getNameEn()).orElse(null);
        if (a.getAssignedToUserId() != null) assignee = users.findById(a.getAssignedToUserId()).map(u -> u.getFullName()).orElse(null);
        long age = Duration.between(a.getTriggeredAt(), Instant.now()).toHours();
        return new AlertDtos.AlertSummary(a.getId(), a.getRule(), a.getSeverity(), a.getStatus(), a.getTitle(), a.getDetail(), a.getEntityType(), a.getEntityId(),
            name, code, a.getSector(), a.getWeredaId(), weredaName, a.getTriggeredAt(), a.getAcknowledgedAt(), a.getAssignedToUserId(), assignee,
            a.getResolvedAt(), a.isDecisionRequired(), age, a.getMetrics());
    }
}
