package et.gov.tigray.rpis.project;

import et.gov.tigray.rpis.audit.Audited;
import et.gov.tigray.rpis.common.BusinessException;
import et.gov.tigray.rpis.common.Enums.*;
import et.gov.tigray.rpis.common.NotFoundException;
import et.gov.tigray.rpis.common.Sector;
import et.gov.tigray.rpis.realtime.DomainEvent;
import et.gov.tigray.rpis.security.CurrentUser;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * Executive approval gate. Every project registered in RPIS waits here until the Chief Executive approves,
 * returns or rejects it. While not approved a project is held at operational status PLANNED, so it fires no
 * alerts, accepts no progress or stage changes, and cannot be assigned to the field team.
 * Separation of duties: the person who registered or resubmitted a project cannot decide on it.
 */
@Service
@RequiredArgsConstructor
public class ProjectApprovalService {
    private final ProjectRepositories.Projects projects;
    private final ProjectRepositories.ApprovalEvents approvalEvents;
    private final ProjectRepositories.StageEvents stageEvents;
    private final ProjectService projectService;
    private final ProjectCreationService creation;
    private final ProjectMetricsService metrics;
    private final NamedParameterJdbcTemplate jdbc;
    private final ApplicationEventPublisher events;

    private static final int MIN_REASON = 10;

    // ── queries ──────────────────────────────────────────────────────────
    @Transactional(readOnly = true)
    public Page<ApprovalDtos.QueueItem> queue(List<ApprovalStatus> statuses, Sector requestedSector, int page, int size) {
        Sector sector = CurrentUser.get().map(u -> u.effectiveSectorFilter(requestedSector)).orElse(requestedSector);
        List<ApprovalStatus> st = statuses == null || statuses.isEmpty() ? List.of(ApprovalStatus.PENDING) : statuses;
        boolean decided = st.stream().anyMatch(s -> s == ApprovalStatus.APPROVED || s == ApprovalStatus.REJECTED);
        Specification<Project> spec = (root, q, cb) -> {
            List<Predicate> ps = new ArrayList<>();
            ps.add(root.get("approvalStatus").in(st));
            // Projects approved before the gate existed have no decision on record and are not part of the history.
            if (decided) ps.add(cb.isNotNull(root.get("approvalDecidedAt")));
            if (sector != null) ps.add(cb.equal(root.get("sector"), sector));
            if (q.getResultType() != Long.class) root.fetch("wereda").fetch("zone");
            return cb.and(ps.toArray(Predicate[]::new));
        };
        Sort sort = decided ? Sort.by(Sort.Direction.DESC, "approvalDecidedAt") : Sort.by(Sort.Direction.ASC, "submittedAt");
        return projects.findAll(spec, PageRequest.of(page, Math.min(size, 100), sort)).map(this::queueItem);
    }

    @Transactional(readOnly = true)
    public ApprovalDtos.Counts counts(Sector requestedSector) {
        Sector sector = CurrentUser.get().map(u -> u.effectiveSectorFilter(requestedSector)).orElse(requestedSector);
        MapSqlParameterSource p = new MapSqlParameterSource("sector", sector == null ? null : sector.name());
        return jdbc.queryForObject("""
            SELECT count(*) FILTER (WHERE approval_status = 'PENDING') pending,
                   count(*) FILTER (WHERE approval_status = 'RETURNED') returned,
                   count(*) FILTER (WHERE approval_status = 'APPROVED' AND approval_decided_at > now() - interval '30 days') approved30,
                   count(*) FILTER (WHERE approval_status = 'REJECTED' AND approval_decided_at > now() - interval '30 days') rejected30,
                   (SELECT count(*) FROM project_approval_event e JOIN project x ON x.id = e.project_id
                     WHERE e.action = 'RETURNED' AND e.occurred_at > now() - interval '30 days' AND (CAST(:sector AS varchar) IS NULL OR x.sector = :sector)) returned30,
                   max(CASE WHEN approval_status = 'PENDING' THEN current_date - submitted_at::date END) oldest,
                   coalesce(sum(total_budget_etb) FILTER (WHERE approval_status = 'PENDING'), 0) pending_budget,
                   percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM approval_decided_at - submitted_at) / 86400.0)
                       FILTER (WHERE approval_decided_at IS NOT NULL AND submitted_at IS NOT NULL) median_days
            FROM project WHERE (CAST(:sector AS varchar) IS NULL OR sector = :sector)
            """, p, (rs, i) -> new ApprovalDtos.Counts(rs.getLong("pending"), rs.getLong("returned"), rs.getLong("approved30"), rs.getLong("rejected30"),
                rs.getLong("returned30"), (Integer) rs.getObject("oldest"), rs.getBigDecimal("pending_budget"),
                rs.getObject("median_days") == null ? null : Math.round(rs.getDouble("median_days") * 10) / 10.0));
    }

    @Transactional(readOnly = true)
    public ApprovalDtos.Dossier dossier(Long projectId) {
        Project p = projects.findWithWeredaById(projectId).orElseThrow(() -> new NotFoundException("Project", projectId));
        CurrentUser u = CurrentUser.get().orElse(null);
        if (u != null && u.has("SECTOR_HEAD") && u.sectorScope() != null && u.sectorScope() != p.getSector())
            throw BusinessException.forbidden("out_of_scope", "This project is outside your sector");
        ProjectDtos.ProjectDetail detail = projectService.detail(projectId);
        String reason = cannotDecideReason(p, u);
        boolean canResubmit = p.getApprovalStatus() == ApprovalStatus.RETURNED && u != null && (u.has("ANALYST") || u.has("ADMIN"));
        List<ProjectDtos.SimilarProject> similar = creation.similar(p.getName(), p.getWereda().getId()).stream().filter(s -> !s.id().equals(p.getId())).toList();
        return new ApprovalDtos.Dossier(detail, readiness(p, detail, similar.size()), context(p), similar, reason == null, reason, canResubmit);
    }

    // ── decisions ────────────────────────────────────────────────────────
    @Audited(action = "PROJECT_APPROVAL_DECISION", entityType = "PROJECT")
    @Transactional
    public ApprovalDtos.QueueItem decide(Long projectId, ApprovalDtos.DecisionRequest req) {
        Project p = projects.findWithWeredaById(projectId).orElseThrow(() -> new NotFoundException("Project", projectId));
        CurrentUser actor = CurrentUser.get().orElse(null);
        String reason = cannotDecideReason(p, actor);
        if (reason != null) throw BusinessException.conflict("cannot_decide", reason);
        String note = blankToNull(req.note());
        if (req.decision() != ApprovalDecision.APPROVE && (note == null || note.length() < MIN_REASON))
            throw BusinessException.invalid("A reason is required", List.of(Map.of("field", "note", "message", "Explain the decision in at least " + MIN_REASON + " characters so the analyst can act on it")));

        Instant now = Instant.now();
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        String ref = nextDecisionReference(today);
        ApprovalAction action;
        switch (req.decision()) {
            case APPROVE -> {
                action = ApprovalAction.APPROVED;
                p.setApprovalStatus(ApprovalStatus.APPROVED);
                p.setApprovalConditions(blankToNull(req.conditions()));
                if (p.getApprovedOn() == null) p.setApprovedOn(today);
                if (p.getApprovalReference() == null) p.setApprovalReference(blankToNull(req.externalReference()) != null ? req.externalReference().trim() : ref);
                // Release the operational hold according to the governance stage the project was registered in.
                p.setStatus(switch (p.getLifecycleStage()) {
                    case PROCUREMENT -> ProjectStatus.PROCUREMENT;
                    case IMPLEMENTATION, MONITORING -> ProjectStatus.ACTIVE;
                    default -> ProjectStatus.PLANNED;
                });
                if (p.getLifecycleStage() == LifecycleStage.APPROVAL) moveStage(p, LifecycleStage.FUNDING, actor, "Approved by executive decision " + ref, ref);
            }
            case RETURN -> { action = ApprovalAction.RETURNED; p.setApprovalStatus(ApprovalStatus.RETURNED); }
            case REJECT -> {
                action = ApprovalAction.REJECTED;
                p.setApprovalStatus(ApprovalStatus.REJECTED);
                p.setStatus(ProjectStatus.CANCELLED);
                if (p.getLifecycleStage() != LifecycleStage.CANCELLED) moveStage(p, LifecycleStage.CANCELLED, actor, "Rejected by executive decision " + ref + ": " + note, ref);
            }
            default -> throw new IllegalStateException();
        }
        p.setApprovalDecidedAt(now);
        p.setApprovalDecidedByName(actor == null ? "system" : actor.fullName());
        p.setApprovalDecisionRef(ref);
        Project saved = projects.save(p);
        event(saved, action, actor, note, req.decision() == ApprovalDecision.APPROVE ? blankToNull(req.conditions()) : null, ref);
        Project computed = metrics.recompute(saved, today);

        events.publishEvent(DomainEvent.of("PROJECT_" + action.name(), "PROJECT", computed.getId(), computed.getSector(), computed.getWereda().getId(),
            Map.of("projectName", computed.getName(), "projectCode", computed.getCode(), "decision", action.name(), "reference", ref,
                   "actor", actor == null ? "system" : actor.fullName(), "weredaName", computed.getWereda().getNameEn())));
        return queueItem(computed);
    }

    @Audited(action = "PROJECT_RESUBMIT", entityType = "PROJECT")
    @Transactional
    public ApprovalDtos.QueueItem resubmit(Long projectId, ApprovalDtos.ResubmitRequest req) {
        Project p = projects.findWithWeredaById(projectId).orElseThrow(() -> new NotFoundException("Project", projectId));
        if (p.getApprovalStatus() != ApprovalStatus.RETURNED) throw BusinessException.conflict("not_returned", "Only projects returned for revision can be resubmitted");
        CurrentUser actor = CurrentUser.get().orElse(null);
        if (actor != null && actor.sectorScope() != null && actor.sectorScope() != p.getSector()) throw BusinessException.forbidden("out_of_scope", "This project is outside your sector");
        List<String> changes = new ArrayList<>();
        if (blankToNull(req.name()) != null && !req.name().trim().equals(p.getName())) { changes.add("name"); p.setName(req.name().trim()); }
        if (req.description() != null && !Objects.equals(blankToNull(req.description()), p.getDescription())) { changes.add("description"); p.setDescription(blankToNull(req.description())); }
        if (req.beneficiaries() != null && !req.beneficiaries().equals(p.getBeneficiaries())) { changes.add("beneficiaries"); p.setBeneficiaries(req.beneficiaries()); }
        p.setApprovalStatus(ApprovalStatus.PENDING);
        p.setSubmittedAt(Instant.now());
        if (actor != null) { p.setSubmittedByUserId(actor.id()); p.setSubmittedByName(actor.fullName()); }
        Project saved = projects.save(p);
        String note = req.note().trim() + (changes.isEmpty() ? "" : "\n\nRevised: " + String.join(", ", changes));
        event(saved, ApprovalAction.RESUBMITTED, actor, note, null, null);
        events.publishEvent(DomainEvent.of("PROJECT_RESUBMITTED", "PROJECT", saved.getId(), saved.getSector(), saved.getWereda().getId(),
            Map.of("projectName", saved.getName(), "projectCode", saved.getCode(), "actor", actor == null ? "system" : actor.fullName(), "weredaName", saved.getWereda().getNameEn())));
        return queueItem(saved);
    }

    // ── helpers ──────────────────────────────────────────────────────────
    private String cannotDecideReason(Project p, CurrentUser u) {
        if (u == null || !u.has("EXECUTIVE")) return "Only the Chief Executive can decide on project approval";
        if (p.getApprovalStatus() != ApprovalStatus.PENDING) return "The project is not awaiting a decision (" + p.getApprovalStatus() + ")";
        if (u.id() != null && u.id().equals(p.getSubmittedByUserId())) return "You submitted this project; another executive must decide (separation of duties)";
        return null;
    }

    private void moveStage(Project p, LifecycleStage to, CurrentUser actor, String note, String ref) {
        ProjectStageEvent e = new ProjectStageEvent();
        e.setProject(p); e.setFromStage(p.getLifecycleStage()); e.setToStage(to); e.setNote(note); e.setReference(ref); e.setOccurredAt(Instant.now());
        if (actor != null) { e.setActorUserId(actor.id()); e.setActorName(actor.fullName()); }
        p.setLifecycleStage(to);
        stageEvents.save(e);
    }

    private void event(Project p, ApprovalAction action, CurrentUser actor, String note, String conditions, String ref) {
        ProjectApprovalEvent e = new ProjectApprovalEvent();
        e.setProject(p); e.setAction(action); e.setOccurredAt(Instant.now()); e.setNote(note); e.setConditions(conditions); e.setReference(ref);
        if (actor != null) { e.setActorUserId(actor.id()); e.setActorName(actor.fullName()); }
        approvalEvents.save(e);
    }

    private String nextDecisionReference(LocalDate today) {
        Long n = jdbc.queryForObject("SELECT nextval('approval_decision_seq')", new MapSqlParameterSource(), Long.class);
        return "CE-%d-%04d".formatted(today.getYear(), n);
    }

    private ApprovalDtos.QueueItem queueItem(Project p) {
        Integer waiting = p.getApprovalStatus() == ApprovalStatus.PENDING && p.getSubmittedAt() != null
            ? (int) ChronoUnit.DAYS.between(p.getSubmittedAt().atZone(ZoneOffset.UTC).toLocalDate(), LocalDate.now(ZoneOffset.UTC)) : null;
        var row = jdbc.queryForMap("""
            SELECT count(*) FILTER (WHERE action = 'RESUBMITTED') resub,
                   (SELECT note FROM project_approval_event WHERE project_id = :id AND note IS NOT NULL ORDER BY occurred_at DESC LIMIT 1) last_note
            FROM project_approval_event WHERE project_id = :id
            """, new MapSqlParameterSource("id", p.getId()));
        return new ApprovalDtos.QueueItem(ProjectService.summary(p), p.getApprovalStatus(), p.getSubmittedAt(), p.getSubmittedByName(), waiting,
            p.getApprovalDecidedAt(), p.getApprovalDecidedByName(), p.getApprovalDecisionRef(), (String) row.get("last_note"),
            ((Number) row.get("resub")).intValue(), quickReadiness(p));
    }

    /** Lightweight readiness for the queue (counts only, from SQL); the dossier computes the full checklist. */
    private ApprovalDtos.Readiness quickReadiness(Project p) {
        var r = jdbc.queryForMap("""
            SELECT (SELECT coalesce(sum(allocated_etb), 0) FROM budget_line WHERE project_id = :id) lines,
                   (SELECT coalesce(sum(amount_etb), 0) FROM disbursement WHERE project_id = :id) tranches,
                   (SELECT count(*) FROM milestone WHERE project_id = :id) milestones,
                   (SELECT count(*) FROM project_risk WHERE project_id = :id) risks,
                   (SELECT count(*) FROM project_facility WHERE project_id = :id) facilities,
                   %s assessed
            """.formatted(ASSESSED_SQL), new MapSqlParameterSource("id", p.getId()));
        return checks(p, (BigDecimal) r.get("lines"), (BigDecimal) r.get("tranches"), ((Number) r.get("milestones")).intValue(),
            ((Number) r.get("risks")).intValue(), ((Number) r.get("facilities")).intValue(), ((Number) r.get("assessed")).intValue(), -1);
    }

    private ApprovalDtos.Readiness readiness(Project p, ProjectDtos.ProjectDetail d, int similar) {
        return checks(p, d.finance().allocatedLinesEtb(), d.finance().disbursements().stream().map(ProjectDtos.DisbursementDto::amountEtb).reduce(BigDecimal.ZERO, BigDecimal::add),
            d.milestones().size(), d.risks().size(), d.facilities().size(),
            jdbc.queryForObject("SELECT " + ASSESSED_SQL, new MapSqlParameterSource("id", p.getId()), Integer.class), similar);
    }

    /** Linked facilities whose damage has a verified assessment (the evidence base of a reconstruction project). */
    private static final String ASSESSED_SQL = """
        (SELECT count(*) FROM project_facility pf WHERE pf.project_id = :id
           AND EXISTS (SELECT 1 FROM damage_assessment a WHERE a.facility_id = pf.facility_id AND a.status = 'VERIFIED'))""";

    private ApprovalDtos.Readiness checks(Project p, BigDecimal lines, BigDecimal tranches, int milestones, int risks, int facilities, int assessed, int similar) {
        BigDecimal total = p.getTotalBudgetEtb();
        boolean pastProcurement = p.getLifecycleStage().ordinal() >= LifecycleStage.PROCUREMENT.ordinal();
        List<ApprovalDtos.ReadinessCheck> c = new ArrayList<>();
        c.add(check("DESCRIPTION", p.getDescription() != null && p.getDescription().length() >= 40, "WARN", p.getDescription() == null ? "No description" : p.getDescription().length() + " characters"));
        c.add(check("BENEFICIARIES", p.getBeneficiaries() != null && p.getBeneficiaries() > 0, "WARN", p.getBeneficiaries() == null ? "Not recorded" : String.format("%,d people", p.getBeneficiaries())));
        c.add(check("IMPLEMENTING_AGENCY", p.getImplementingAgency() != null, "WARN", p.getImplementingAgency()));
        if (pastProcurement) c.add(check("CONTRACTOR", p.getContractorName() != null, "WARN", p.getContractorName()));
        c.add(check("BUDGET_BREAKDOWN", lines.subtract(total).abs().compareTo(BigDecimal.ONE) <= 0, "WARN", "ETB %,.0f of %,.0f broken down".formatted(lines, total)));
        c.add(check("DISBURSEMENT_SCHEDULE", tranches.compareTo(total.subtract(BigDecimal.ONE)) >= 0, "WARN", "ETB %,.0f of %,.0f scheduled".formatted(tranches, total)));
        c.add(check("MILESTONES", milestones >= 2, "WARN", milestones + " milestone" + (milestones == 1 ? "" : "s")));
        c.add(check("RISKS", risks >= 1, "WARN", risks + " registered"));
        c.add(check("FACILITY_LINKED", facilities >= 1, "INFO", facilities + " linked"));
        c.add(check("DAMAGE_ASSESSED", facilities >= 1 && assessed == facilities, "WARN", assessed + " of " + facilities + " with a verified damage assessment"));
        if (similar >= 0) c.add(check("NO_DUPLICATES", similar == 0, "WARN", similar == 0 ? "None found" : similar + " similar project" + (similar == 1 ? "" : "s")));
        int passed = (int) c.stream().filter(ApprovalDtos.ReadinessCheck::passed).count();
        int warnings = (int) c.stream().filter(x -> !x.passed() && x.severity().equals("WARN")).count();
        return new ApprovalDtos.Readiness(passed, c.size(), warnings, c);
    }

    private ApprovalDtos.Context context(Project p) {
        var r = jdbc.queryForMap("""
            SELECT (SELECT count(*) FROM project WHERE sector = :sector AND approval_status = 'APPROVED' AND status <> 'CANCELLED') n,
                   (SELECT coalesce(sum(total_budget_etb), 0) FROM project WHERE sector = :sector AND approval_status = 'APPROVED' AND status <> 'CANCELLED') budget,
                   (SELECT count(*) FROM project WHERE wereda_id = :wereda AND approval_status = 'APPROVED' AND status IN ('ACTIVE', 'PROCUREMENT')) wereda_active,
                   (SELECT count(*) FROM facility WHERE wereda_id = :wereda AND latest_severity IN ('SEVERE', 'DESTROYED')) severe,
                   (SELECT count(*) FROM project WHERE CAST(:contractor AS varchar) IS NOT NULL AND lower(contractor_name) = lower(:contractor) AND status = 'ACTIVE' AND id <> :id) same_contractor
            """, new MapSqlParameterSource("sector", p.getSector().name()).addValue("wereda", p.getWereda().getId()).addValue("id", p.getId())
                .addValue("contractor", p.getContractorName(), java.sql.Types.VARCHAR));
        BigDecimal budget = (BigDecimal) r.get("budget");
        BigDecimal share = budget.signum() == 0 ? null : p.getTotalBudgetEtb().multiply(BigDecimal.valueOf(100)).divide(budget.add(p.getTotalBudgetEtb()), 1, RoundingMode.HALF_UP);
        return new ApprovalDtos.Context(((Number) r.get("n")).longValue(), budget, share, ((Number) r.get("wereda_active")).longValue(),
            ((Number) r.get("severe")).longValue(), ((Number) r.get("same_contractor")).longValue(), p.getContractorName());
    }

    private static ApprovalDtos.ReadinessCheck check(String code, boolean ok, String severity, String detail) { return new ApprovalDtos.ReadinessCheck(code, ok, severity, detail); }
    private static String blankToNull(String s) { return s == null || s.isBlank() ? null : s.trim(); }
}
