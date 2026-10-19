package et.gov.tigray.rpis.project;

import et.gov.tigray.rpis.audit.Audited;
import et.gov.tigray.rpis.common.BusinessException;
import et.gov.tigray.rpis.common.Enums.LifecycleStage;
import et.gov.tigray.rpis.common.Enums.ProjectStatus;
import et.gov.tigray.rpis.common.NotFoundException;
import et.gov.tigray.rpis.realtime.DomainEvent;
import et.gov.tigray.rpis.security.CurrentUser;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;

/**
 * Governance lifecycle of a project (DREAM-style passport). Transitions are explicit, validated,
 * audited and published; the operational {@link ProjectStatus} is kept consistent where it follows.
 */
@Service
@RequiredArgsConstructor
public class ProjectLifecycleService {
    private final ProjectRepositories.Projects projects;
    private final ProjectRepositories.StageEvents stageEvents;
    private final ApplicationEventPublisher events;

    private static final Map<LifecycleStage, List<LifecycleStage>> TRANSITIONS = Map.of(
        LifecycleStage.PLANNING,       List.of(LifecycleStage.APPROVAL, LifecycleStage.CANCELLED),
        LifecycleStage.APPROVAL,       List.of(LifecycleStage.FUNDING, LifecycleStage.PLANNING, LifecycleStage.CANCELLED),
        LifecycleStage.FUNDING,        List.of(LifecycleStage.PROCUREMENT, LifecycleStage.APPROVAL, LifecycleStage.CANCELLED),
        LifecycleStage.PROCUREMENT,    List.of(LifecycleStage.IMPLEMENTATION, LifecycleStage.FUNDING, LifecycleStage.CANCELLED),
        LifecycleStage.IMPLEMENTATION, List.of(LifecycleStage.MONITORING, LifecycleStage.COMPLETION, LifecycleStage.CANCELLED),
        LifecycleStage.MONITORING,     List.of(LifecycleStage.IMPLEMENTATION, LifecycleStage.COMPLETION, LifecycleStage.CANCELLED),
        LifecycleStage.COMPLETION,     List.of(LifecycleStage.MONITORING),
        LifecycleStage.CANCELLED,      List.of(LifecycleStage.PLANNING));

    public static List<LifecycleStage> allowedTransitions(LifecycleStage from) { return TRANSITIONS.getOrDefault(from, List.of()); }

    @Audited(action = "STAGE_TRANSITION", entityType = "PROJECT")
    @Transactional
    public ProjectDtos.ProjectSummary transition(Long projectId, ProjectDtos.StageTransitionRequest req) {
        Project p = projects.findWithWeredaById(projectId).orElseThrow(() -> new NotFoundException("Project", projectId));
        LifecycleStage from = p.getLifecycleStage(), to = req.toStage();
        if (from == to) throw BusinessException.conflict("same_stage", "Project is already in stage " + to);
        if (!allowedTransitions(from).contains(to)) throw BusinessException.badRequest("illegal_transition", "Cannot move from " + from + " to " + to);
        if ((to == LifecycleStage.COMPLETION) && p.getPhysicalProgressPct().doubleValue() < 100 && (req.note() == null || req.note().isBlank()))
            throw BusinessException.badRequest("note_required", "Completion below 100% physical progress requires a justification note");
        CurrentUser actor = CurrentUser.get().orElse(null);
        LocalDate on = req.effectiveOn() != null ? req.effectiveOn() : LocalDate.now(ZoneOffset.UTC);

        p.setLifecycleStage(to);
        switch (to) {
            case APPROVAL -> {}
            case FUNDING -> { if (p.getApprovedOn() == null) p.setApprovedOn(on); if (req.reference() != null) p.setApprovalReference(req.reference()); }
            case PROCUREMENT -> { if (p.getFundingSecuredOn() == null) p.setFundingSecuredOn(on); if (p.getStatus() == ProjectStatus.PLANNED) p.setStatus(ProjectStatus.PROCUREMENT); }
            case IMPLEMENTATION -> {
                if (p.getContractSignedOn() == null) p.setContractSignedOn(on);
                if (p.getStatus() == ProjectStatus.PLANNED || p.getStatus() == ProjectStatus.PROCUREMENT || p.getStatus() == ProjectStatus.SUSPENDED) p.setStatus(ProjectStatus.ACTIVE);
                if (p.getActualStart() == null) p.setActualStart(on);
            }
            case MONITORING -> {}
            case COMPLETION -> { if (p.getHandoverOn() == null) p.setHandoverOn(on); if (p.getDefectsLiabilityEnd() == null) p.setDefectsLiabilityEnd(on.plusYears(1)); p.setStatus(ProjectStatus.COMPLETED); if (p.getActualEnd() == null) p.setActualEnd(on); }
            case CANCELLED -> p.setStatus(ProjectStatus.CANCELLED);
            case PLANNING -> { if (p.getStatus() == ProjectStatus.CANCELLED) p.setStatus(ProjectStatus.PLANNED); }
        }
        Project saved = projects.save(p);

        ProjectStageEvent e = new ProjectStageEvent();
        e.setProject(saved); e.setFromStage(from); e.setToStage(to); e.setNote(req.note()); e.setReference(req.reference());
        e.setOccurredAt(Instant.now());
        if (actor != null) { e.setActorUserId(actor.id()); e.setActorName(actor.fullName()); }
        stageEvents.save(e);

        events.publishEvent(DomainEvent.of("STAGE_CHANGED", "PROJECT", saved.getId(), saved.getSector(), saved.getWereda().getId(),
            Map.of("projectName", saved.getName(), "projectCode", saved.getCode(), "fromStage", from.name(), "toStage", to.name(),
                   "actor", actor == null ? "system" : actor.fullName(), "weredaName", saved.getWereda().getNameEn())));
        return ProjectService.summary(saved);
    }
}
