package et.gov.tigray.rpis.fieldteam;

import et.gov.tigray.rpis.audit.Audited;
import et.gov.tigray.rpis.common.BusinessException;
import et.gov.tigray.rpis.common.Enums.*;
import et.gov.tigray.rpis.common.NotFoundException;
import et.gov.tigray.rpis.project.Project;
import et.gov.tigray.rpis.project.ProjectDtos;
import et.gov.tigray.rpis.project.ProjectRepositories;
import et.gov.tigray.rpis.realtime.DomainEvent;
import et.gov.tigray.rpis.security.CurrentUser;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.*;

/**
 * Assigns approved projects to field team members. One rule set serves the candidate ranking, the dry-run check and
 * the real assignment. Errors block; warnings may be overridden only with a written justification that is kept.
 */
@Service
@RequiredArgsConstructor
public class AssignmentService {
    private final FieldTeamRepositories.Assignments assignments;
    private final FieldTeamRepositories.Agents agents;
    private final ProjectRepositories.Projects projects;
    private final FieldTeamQueries queries;
    private final FieldAgentService agentService;
    private final ApplicationEventPublisher events;

    private static final int BACKDATE_DAYS = 30;

    // ── ranking ──────────────────────────────────────────────────────────
    @Transactional(readOnly = true)
    public List<FieldTeamDtos.Candidate> candidates(Long projectId, AssignmentRole role) {
        Project p = projects.findWithWeredaById(projectId).orElseThrow(() -> new NotFoundException("Project", projectId));
        Map<Long, FieldTeamQueries.CandidateFacts> facts = queries.candidateFacts(projectId);
        List<FieldTeamDtos.Candidate> out = new ArrayList<>();
        for (var a : queries.agents(new FieldTeamQueries.AgentFilter(null, null, AgentStatus.ACTIVE, null, null, null, null, null, null))) {
            var f = facts.get(a.id());
            if (f != null) out.add(score(a, f, role == null ? AssignmentRole.DATA_COLLECTOR : role, p));
        }
        // Eligible members with spare capacity first; overloaded members stay visible but below them.
        out.sort(Comparator.comparing((FieldTeamDtos.Candidate c) -> !c.eligible()).thenComparing(c -> c.flags().contains("AT_CAPACITY"))
            .thenComparing(c -> -c.score()).thenComparing(c -> c.agent().fullName()));
        return out;
    }

    private FieldTeamDtos.Candidate score(FieldTeamDtos.AgentSummary a, FieldTeamQueries.CandidateFacts f, AssignmentRole role, Project p) {
        List<FieldTeamDtos.ScorePart> parts = new ArrayList<>();
        List<String> flags = new ArrayList<>();
        int area = f.coversWereda() ? 35 : f.coversZone() ? 18 : 0;
        parts.add(new FieldTeamDtos.ScorePart("AREA", area, 35));
        if (!f.coversWereda()) flags.add(f.coversZone() ? "NEARBY_AREA" : "OUT_OF_AREA");
        parts.add(new FieldTeamDtos.ScorePart("SECTOR", f.sectorMatch() ? 20 : 0, 20));
        if (!f.sectorMatch()) flags.add("NO_SECTOR_MATCH");
        int free = Math.max(0, a.maxActiveAssignments() - a.activeAssignments());
        parts.add(new FieldTeamDtos.ScorePart("CAPACITY", (int) Math.round(20.0 * free / Math.max(1, a.maxActiveAssignments())), 20));
        if (free == 0) flags.add("AT_CAPACITY");
        parts.add(new FieldTeamDtos.ScorePart("QUALITY", a.acceptanceRate90d() == null ? 8 : (int) Math.round(15 * a.acceptanceRate90d() / 100.0), 15));
        Double km = f.distanceKm();
        parts.add(new FieldTeamDtos.ScorePart("PROXIMITY", km == null ? 0 : km <= 30 ? 10 : km <= 80 ? 6 : km <= 150 ? 3 : 0, 10));
        if (a.overdueVisits() > 0) flags.add("HAS_OVERDUE");
        if (!a.hasAccount()) flags.add("NO_ACCOUNT");
        if (a.contractEnd() != null && a.contractEnd().isBefore(LocalDate.now(ZoneOffset.UTC).plusDays(30))) flags.add("CONTRACT_ENDING");
        if (roleMismatch(role, a.agentType())) flags.add("ROLE_MISMATCH");
        if (f.alreadyAssigned()) flags.add("ALREADY_ASSIGNED");
        if (f.conflict()) flags.add("CONFLICT_OF_INTEREST");
        int total = parts.stream().mapToInt(FieldTeamDtos.ScorePart::points).sum();
        return new FieldTeamDtos.Candidate(a, total, parts, flags, !f.alreadyAssigned() && !f.conflict(), km);
    }

    /** Verification needs an analyst's independence and skills; collectors may lead small teams but not verify. */
    private static boolean roleMismatch(AssignmentRole role, AgentType type) {
        return (role == AssignmentRole.VERIFIER || role == AssignmentRole.FIELD_ANALYST) && type == AgentType.DATA_COLLECTOR;
    }

    // ── validation ───────────────────────────────────────────────────────
    @Transactional(readOnly = true)
    public FieldTeamDtos.CheckResult check(FieldTeamDtos.AssignmentRequest r) {
        List<ProjectDtos.FieldIssue> errors = new ArrayList<>(), warnings = new ArrayList<>();
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        Project p = projects.findWithWeredaById(r.projectId()).orElse(null);
        FieldAgent a = agents.findById(r.agentId()).orElse(null);
        if (p == null) errors.add(issue("projectId", "Unknown project"));
        if (a == null) errors.add(issue("agentId", "Unknown team member"));
        if (p == null || a == null) return new FieldTeamDtos.CheckResult(false, errors, warnings);

        if (!p.isApproved()) errors.add(issue("projectId", "The project has not been approved by the Chief Executive (" + p.getApprovalStatus() + ")"));
        if (p.getStatus() == ProjectStatus.CANCELLED || p.getStatus() == ProjectStatus.COMPLETED) errors.add(issue("projectId", "The project is " + p.getStatus().name().toLowerCase(Locale.ROOT)));
        if (a.getStatus() != AgentStatus.ACTIVE) errors.add(issue("agentId", a.getFullName() + " is not active (" + a.getStatus() + ")"));

        var f = queries.candidateFacts(p.getId()).get(a.getId());
        var summary = queries.agents(FieldTeamQueries.AgentFilter.byId(a.getId())).get(0);
        if (f.alreadyAssigned()) errors.add(issue("agentId", a.getFullName() + " is already assigned to this project"));
        if (f.conflict()) errors.add(issue("agentId", a.getFullName() + "'s organisation is the project contractor; verification must be independent"));
        if (r.role() == AssignmentRole.LEAD && queries.assignments(new FieldTeamQueries.AssignmentFilter(null, p.getId(), AssignmentStatus.ACTIVE, false, null, null))
            .stream().anyMatch(x -> x.role() == AssignmentRole.LEAD)) errors.add(issue("role", "The project already has a lead; release the current lead first"));

        if (r.startOn().isBefore(today.minusDays(BACKDATE_DAYS))) errors.add(issue("startOn", "Cannot start more than " + BACKDATE_DAYS + " days in the past"));
        if (r.endOn() != null && r.endOn().isBefore(r.startOn())) errors.add(issue("endOn", "End must be on or after the start"));
        if (a.getContractEnd() != null && a.getContractEnd().isBefore(r.startOn())) errors.add(issue("startOn", a.getFullName() + "'s contract ends on " + a.getContractEnd()));

        if (!f.coversWereda()) warnings.add(issue("agentId", p.getWereda().getNameEn() + " is outside " + a.getFullName() + "'s coverage area" + (f.coversZone() ? " (same zone)" : "")));
        if (!f.sectorMatch()) warnings.add(issue("agentId", a.getFullName() + " is not registered for the " + p.getSector().name().toLowerCase(Locale.ROOT) + " sector"));
        if (summary.activeAssignments() >= summary.maxActiveAssignments())
            warnings.add(issue("agentId", a.getFullName() + " already holds " + summary.activeAssignments() + " of " + summary.maxActiveAssignments() + " assignments"));
        if (summary.overdueVisits() > 0) warnings.add(issue("agentId", a.getFullName() + " has " + summary.overdueVisits() + " overdue visit(s) on other projects"));
        if (roleMismatch(r.role(), a.getAgentType())) warnings.add(issue("role", "Verification is normally done by a field analyst; " + a.getFullName() + " is a data collector"));
        if (a.getUserId() == null) warnings.add(issue("agentId", a.getFullName() + " has no field app account and cannot submit inspections until access is granted"));
        if (a.getContractEnd() != null && !a.getContractEnd().isBefore(r.startOn())
            && (r.endOn() != null ? a.getContractEnd().isBefore(r.endOn()) : a.getContractEnd().isBefore(today.plusDays(60))))
            warnings.add(issue("endOn", a.getFullName() + "'s contract ends on " + a.getContractEnd() + (r.endOn() != null ? ", before the assignment ends" : "; plan a handover")));
        if (r.role() != AssignmentRole.LEAD && queries.assignments(new FieldTeamQueries.AssignmentFilter(null, p.getId(), AssignmentStatus.ACTIVE, false, null, null))
            .stream().noneMatch(x -> x.role() == AssignmentRole.LEAD)) warnings.add(issue("role", "The project has no lead yet; consider assigning one"));
        if (p.getStatus() != ProjectStatus.ACTIVE && p.getStatus() != ProjectStatus.SUSPENDED && r.visitFrequencyDays() < 30)
            warnings.add(issue("visitFrequencyDays", "Works have not started (" + p.getStatus().name().toLowerCase(Locale.ROOT) + "); a monthly cadence is usually enough"));
        return new FieldTeamDtos.CheckResult(errors.isEmpty(), errors, warnings);
    }

    // ── commands ─────────────────────────────────────────────────────────
    @Audited(action = "ASSIGNMENT_CREATE", entityType = "PROJECT")
    @Transactional
    public FieldTeamDtos.AssignmentDto assign(FieldTeamDtos.AssignmentRequest r) {
        FieldTeamDtos.CheckResult c = check(r);
        if (!c.valid()) throw BusinessException.invalid("The assignment could not be made: " + c.errors().size() + " problem(s)",
            c.errors().stream().map(e -> Map.of("field", e.field(), "message", e.message())).toList());
        String override = blank(r.overrideNote());
        if (!c.warnings().isEmpty() && (override == null || override.length() < 10))
            throw BusinessException.invalid("Warnings need a justification", List.of(Map.of("field", "overrideNote", "message", "Explain in at least 10 characters why the assignment should proceed despite the warnings")));
        Project p = projects.findWithWeredaById(r.projectId()).orElseThrow();
        FieldAgent a = agents.findById(r.agentId()).orElseThrow();
        CurrentUser actor = CurrentUser.get().orElse(null);
        ProjectAssignment pa = new ProjectAssignment();
        pa.setProject(p); pa.setAgent(a); pa.setRole(r.role()); pa.setPriority(r.priority() == null ? AssignmentPriority.NORMAL : r.priority());
        pa.setStartOn(r.startOn()); pa.setEndOn(r.endOn()); pa.setVisitFrequencyDays(r.visitFrequencyDays());
        pa.setRequiredInspectionTypes(r.requiredInspectionTypes() == null ? new ArrayList<>() : r.requiredInspectionTypes().stream().distinct().map(Enum::name).toList());
        pa.setInstructions(blank(r.instructions()));
        pa.setOverrideNote(c.warnings().isEmpty() ? null : override);
        pa.setAssignedAt(Instant.now());
        if (actor != null) { pa.setAssignedByUserId(actor.id()); pa.setAssignedByName(actor.fullName()); }
        ProjectAssignment saved = assignments.saveAndFlush(pa);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("assignmentId", saved.getId()); data.put("projectId", p.getId()); data.put("projectCode", p.getCode()); data.put("role", r.role().name());
        agentService.record(a.getId(), "ASSIGNED", actor, p.getCode() + " · " + p.getName(), data);
        events.publishEvent(DomainEvent.of("ASSIGNMENT_CREATED", "PROJECT", p.getId(), p.getSector(), p.getWereda().getId(),
            Map.of("projectName", p.getName(), "projectCode", p.getCode(), "agentName", a.getFullName(), "role", r.role().name(),
                   "actor", actor == null ? "system" : actor.fullName(), "weredaName", p.getWereda().getNameEn(), "agentId", a.getId(), "assignmentId", saved.getId())));
        return get(saved.getId());
    }

    @Audited(action = "ASSIGNMENT_CLOSE", entityType = "PROJECT")
    @Transactional
    public FieldTeamDtos.AssignmentDto close(Long id, FieldTeamDtos.CloseRequest r) {
        ProjectAssignment pa = assignments.findDetailedById(id).orElseThrow(() -> new NotFoundException("Assignment", id));
        if (pa.getStatus() != AssignmentStatus.ACTIVE) throw BusinessException.conflict("not_active", "The assignment is already " + pa.getStatus().name().toLowerCase(Locale.ROOT));
        if (r.outcome() == AssignmentStatus.ACTIVE) throw BusinessException.badRequest("bad_outcome", "Choose COMPLETED or RELEASED");
        String reason = blank(r.reason());
        if (r.outcome() == AssignmentStatus.RELEASED && (reason == null || reason.length() < 5))
            throw BusinessException.invalid("A reason is required", List.of(Map.of("field", "reason", "message", "State why the member is being released")));
        CurrentUser actor = CurrentUser.get().orElse(null);
        pa.setStatus(r.outcome()); pa.setClosedAt(Instant.now()); pa.setCloseReason(reason); pa.setClosedByName(actor == null ? "system" : actor.fullName());
        assignments.saveAndFlush(pa); // the read model below is plain SQL
        agentService.record(pa.getAgent().getId(), r.outcome() == AssignmentStatus.COMPLETED ? "ASSIGNMENT_COMPLETED" : "ASSIGNMENT_RELEASED", actor,
            pa.getProject().getCode() + (reason == null ? "" : " · " + reason), Map.of("assignmentId", id, "projectId", pa.getProject().getId()));
        return get(id);
    }

    @Transactional(readOnly = true)
    public FieldTeamDtos.AssignmentDto get(Long id) {
        return queries.assignments(new FieldTeamQueries.AssignmentFilter(null, null, null, false, id, null)).stream().findFirst()
            .orElseThrow(() -> new NotFoundException("Assignment", id));
    }

    private static ProjectDtos.FieldIssue issue(String field, String message) { return new ProjectDtos.FieldIssue(field, message); }
    private static String blank(String s) { return s == null || s.isBlank() ? null : s.trim(); }
}
