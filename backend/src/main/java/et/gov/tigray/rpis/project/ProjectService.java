package et.gov.tigray.rpis.project;

import et.gov.tigray.rpis.alert.AlertRepository;
import et.gov.tigray.rpis.audit.Audited;
import et.gov.tigray.rpis.common.BusinessException;
import et.gov.tigray.rpis.common.Enums.*;
import et.gov.tigray.rpis.common.GeoPoint;
import et.gov.tigray.rpis.common.Money;
import et.gov.tigray.rpis.common.NotFoundException;
import et.gov.tigray.rpis.common.Sector;
import et.gov.tigray.rpis.facility.Facility;
import et.gov.tigray.rpis.facility.FacilityRepository;
import et.gov.tigray.rpis.geo.GeoDtos;
import et.gov.tigray.rpis.geo.Wereda;
import et.gov.tigray.rpis.realtime.DomainEvent;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class ProjectService {
    private final ProjectRepositories.Projects projects;
    private final ProjectRepositories.Milestones milestones;
    private final ProjectRepositories.ProgressLogs progressLogs;
    private final ProjectRepositories.BudgetLines budgetLines;
    private final ProjectRepositories.Disbursements disbursements;
    private final ProjectRepositories.Expenditures expenditures;
    private final ProjectRepositories.Risks risks;
    private final ProjectRepositories.Issues issues;
    private final ProjectRepositories.Documents documents;
    private final ProjectRepositories.Forecasts forecasts;
    private final ProjectRepositories.StageEvents stageEvents;
    private final ProjectRepositories.ProjectOrganizations projectOrganizations;
    private final FacilityRepository facilities;
    private final AlertRepository alerts;
    private final ProjectMetricsService metrics;
    private final et.gov.tigray.rpis.evidence.EvidenceService evidence;
    private final ApplicationEventPublisher events;

    public record Filter(Sector sector, Short zoneId, Integer weredaId, List<ProjectStatus> statuses, List<ProjectHealth> healths,
                         FundingSource fundingSource, String q, List<LifecycleStage> stages, Integer minRiskScore, String contractor) {
        public Filter(Sector sector, Short zoneId, Integer weredaId, List<ProjectStatus> statuses, List<ProjectHealth> healths, FundingSource fundingSource, String q) {
            this(sector, zoneId, weredaId, statuses, healths, fundingSource, q, null, null, null);
        }
    }

    @Transactional(readOnly = true)
    public Page<ProjectDtos.ProjectSummary> search(Filter f, Pageable pageable) {
        Specification<Project> spec = (root, q, cb) -> {
            List<Predicate> ps = new ArrayList<>();
            if (f.sector() != null) ps.add(cb.equal(root.get("sector"), f.sector()));
            if (f.weredaId() != null) ps.add(cb.equal(root.get("wereda").get("id"), f.weredaId()));
            if (f.zoneId() != null) ps.add(cb.equal(root.get("wereda").get("zone").get("id"), f.zoneId()));
            if (f.statuses() != null && !f.statuses().isEmpty()) ps.add(root.get("status").in(f.statuses()));
            if (f.healths() != null && !f.healths().isEmpty()) ps.add(root.get("health").in(f.healths()));
            if (f.fundingSource() != null) ps.add(cb.equal(root.get("fundingSource"), f.fundingSource()));
            if (f.stages() != null && !f.stages().isEmpty()) ps.add(root.get("lifecycleStage").in(f.stages()));
            if (f.minRiskScore() != null) ps.add(cb.greaterThanOrEqualTo(root.get("riskScore"), f.minRiskScore().shortValue()));
            if (f.contractor() != null && !f.contractor().isBlank()) ps.add(cb.equal(cb.lower(root.get("contractorName")), f.contractor().toLowerCase()));
            if (f.q() != null && !f.q().isBlank()) {
                String like = "%" + f.q().toLowerCase() + "%";
                ps.add(cb.or(cb.like(cb.lower(root.get("name")), like), cb.like(cb.lower(root.get("code")), like),
                             cb.like(cb.lower(root.get("contractorName")), like)));
            }
            if (q.getResultType() != Long.class) root.fetch("wereda").fetch("zone");
            return cb.and(ps.toArray(Predicate[]::new));
        };
        return projects.findAll(spec, pageable).map(ProjectService::summary);
    }

    @Transactional(readOnly = true)
    public ProjectDtos.ProjectDetail detail(Long id) {
        Project p = projects.findWithWeredaById(id).orElseThrow(() -> new NotFoundException("Project", id));
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        List<ProjectDtos.MilestoneDto> ms = milestones.findByProjectIdOrderBySequenceAsc(id).stream().map(m -> new ProjectDtos.MilestoneDto(
            m.getId(), m.getSequence(), m.getName(), m.getPlannedDate(), m.getActualDate(), m.getWeightPct(), m.getStatus(),
            slip(m.getPlannedDate(), m.getActualDate(), today))).toList();
        List<ProjectDtos.ProgressPoint> progress = progressLogs.findByProjectIdOrderByLogDateAsc(id).stream().map(l ->
            new ProjectDtos.ProgressPoint(l.getLogDate(), l.getPhysicalProgressPct(), l.getPlannedProgressPct(), l.getWorkforceCount(), l.getNotes(), l.getReportedBy(), l.getSource())).toList();
        List<ProjectDtos.BudgetLineDto> lines = budgetLines.findByProjectId(id).stream().map(b -> new ProjectDtos.BudgetLineDto(b.getCategory(), b.getAllocatedEtb())).toList();
        List<ProjectDtos.DisbursementDto> disb = disbursements.findByProjectIdOrderByTrancheNoAsc(id).stream().map(d -> new ProjectDtos.DisbursementDto(
            d.getId(), d.getTrancheNo(), d.getPlannedDate(), d.getReleasedDate(), d.getAmountEtb(), d.getFundingSource(), d.getStatus(),
            slip(d.getPlannedDate(), d.getReleasedDate(), today))).toList();
        List<ProjectDtos.ExpenditureDto> exp = expenditures.findByProjectIdOrderByPeriodStartAsc(id).stream().map(e ->
            new ProjectDtos.ExpenditureDto(e.getId(), e.getPeriodStart(), e.getPeriodEnd(), e.getAmountEtb(), e.getCertifiedBy(), e.getCertifiedOn())).toList();
        BigDecimal allocated = lines.stream().map(ProjectDtos.BudgetLineDto::allocatedEtb).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal ev = Money.nz(p.getTotalBudgetEtb()).multiply(p.getPhysicalProgressPct()).divide(BigDecimal.valueOf(100), 2, java.math.RoundingMode.HALF_UP);
        var fc = forecasts.findFirstByProjectIdOrderByComputedAtDesc(id).orElse(null);
        ProjectDtos.FinanceSummary finance = new ProjectDtos.FinanceSummary(p.getTotalBudgetEtb(), allocated, p.getDisbursedEtb(), p.getExpendedEtb(),
            Money.pct(p.getDisbursedEtb(), p.getTotalBudgetEtb()), Money.pct(p.getExpendedEtb(), p.getTotalBudgetEtb()), ev, ev.subtract(p.getExpendedEtb()),
            fc == null ? null : fc.getForecastCostEtb(), lines, disb, exp);
        List<ProjectDtos.RiskDto> rs = risks.findByProjectIdOrderByRaisedOnDesc(id).stream().map(r -> new ProjectDtos.RiskDto(r.getId(), r.getTitle(), r.getCategory(),
            r.getLikelihood(), r.getImpact(), r.getMitigation(), r.getOwner(), r.getStatus(), r.getRaisedOn())).toList();
        List<ProjectDtos.IssueDto> is = issues.findByProjectIdOrderByRaisedOnDesc(id).stream().map(i -> new ProjectDtos.IssueDto(i.getId(), i.getTitle(), i.getDescription(),
            i.getSeverity(), i.getStatus(), i.getRaisedOn(), i.getResolvedOn(), i.getOwner())).toList();
        List<ProjectDtos.DocumentDto> docs = documents.findByProjectIdOrderByUploadedAtDesc(id).stream().map(d -> new ProjectDtos.DocumentDto(d.getId(), d.getDocType(),
            d.getTitle(), d.getUrl(), d.getMediaType(), d.getUploadedBy(), d.getUploadedAt(), d.getSizeBytes())).toList();
        List<ProjectDtos.LinkedFacility> facs = facilities.findByProjectId(id).stream().map(f -> new ProjectDtos.LinkedFacility(f.getId(), f.getCode(), f.getName(),
            f.getFacilityType(), f.getLatestSeverity(), f.getOperationalStatus())).toList();
        ProjectDtos.ForecastDto fdto = fc == null ? null : new ProjectDtos.ForecastDto(fc.getProvider(), fc.getComputedAt(), fc.getForecastEnd(), fc.getForecastCostEtb(), fc.getConfidence(), fc.getRationale());
        int openAlerts = alerts.countOpenForEntity(EntityType.PROJECT, id);
        List<ProjectDtos.StageEventDto> stages = stageEvents.findByProjectIdOrderByOccurredAtAsc(id).stream().map(e ->
            new ProjectDtos.StageEventDto(e.getId(), e.getFromStage(), e.getToStage(), e.getOccurredAt(), e.getActorName(), e.getNote(), e.getReference())).toList();
        List<ProjectDtos.OrganizationDto> orgs = projectOrganizations.findByProjectId(id).stream().map(po -> new ProjectDtos.OrganizationDto(
            po.getOrganization().getId(), po.getOrganization().getCode(), po.getOrganization().getName(), po.getOrganization().getOrgType(), po.getRole(), po.getOrganization().getContact())).toList();
        ProjectDtos.Governance gov = new ProjectDtos.Governance(p.getLifecycleStage(), ProjectLifecycleService.allowedTransitions(p.getLifecycleStage()),
            p.getApprovedOn(), p.getApprovalReference(), p.getFundingSecuredOn(), p.getContractSignedOn(), p.getContractValueEtb(), p.getProcurementMethod(),
            p.getHandoverOn(), p.getDefectsLiabilityEnd(), stages, orgs);
        ProjectDtos.RiskProfile risk = new ProjectDtos.RiskProfile(p.getRiskScore(), et.gov.tigray.rpis.analytics.RiskScoringService.band(p.getRiskScore()), p.getRiskComputedAt(), p.getRiskComponents());
        ProjectDtos.EvidenceSnapshot evidenceSnapshot = evidence.snapshotForProject(id);
        return new ProjectDtos.ProjectDetail(summary(p), p.getDescription(), ms, progress, finance, rs, is, docs, facs, fdto, openAlerts, gov, risk, evidenceSnapshot);
    }

    /** Web progress entry (site-manager app will post the same shape through /sync). */
    @Audited(action = "PROGRESS_LOG", entityType = "PROJECT")
    @Transactional
    public ProjectDtos.ProjectSummary recordProgress(Long projectId, ProjectDtos.ProgressEntryRequest req, String reportedBy, DataSource source) {
        Project p = projects.findWithWeredaById(projectId).orElseThrow(() -> new NotFoundException("Project", projectId));
        if (p.getStatus() != ProjectStatus.ACTIVE) throw BusinessException.conflict("project_not_active", "Progress can only be logged on ACTIVE projects");
        var latest = progressLogs.findFirstByProjectIdOrderByLogDateDesc(projectId);
        if (latest.isPresent() && req.logDate().isBefore(latest.get().getLogDate()))
            throw BusinessException.badRequest("backdated_log", "Log date is earlier than the latest report (" + latest.get().getLogDate() + ")");
        if (latest.isPresent() && req.physicalProgressPct().compareTo(latest.get().getPhysicalProgressPct()) < 0)
            throw BusinessException.badRequest("progress_regression", "Physical progress cannot decrease without a formal re-baseline");

        ProgressLog log = progressLogs.findByProjectIdAndLogDate(projectId, req.logDate()).orElseGet(ProgressLog::new);
        log.setProject(p);
        log.setLogDate(req.logDate());
        log.setPhysicalProgressPct(req.physicalProgressPct());
        log.setPlannedProgressPct(p.getPlannedProgressPct());
        log.setWorkforceCount(req.workforceCount());
        log.setNotes(req.notes());
        log.setReportedBy(reportedBy);
        log.setSource(source);
        progressLogs.save(log);

        p.setPhysicalProgressPct(req.physicalProgressPct());
        p.setLastProgressReportAt(Instant.now());
        if (p.getActualStart() == null) p.setActualStart(req.logDate());
        if (req.physicalProgressPct().compareTo(BigDecimal.valueOf(100)) >= 0) {
            p.setStatus(ProjectStatus.COMPLETED);
            p.setActualEnd(req.logDate());
        }
        Project saved = metrics.recompute(p, LocalDate.now(ZoneOffset.UTC));
        events.publishEvent(DomainEvent.of("PROGRESS_REPORTED", "PROJECT", saved.getId(), saved.getSector(), saved.getWereda().getId(),
            Map.of("projectName", saved.getName(), "projectCode", saved.getCode(), "physicalPct", saved.getPhysicalProgressPct(),
                   "plannedPct", saved.getPlannedProgressPct(), "health", saved.getHealth().name(), "source", source.name(),
                   "weredaName", saved.getWereda().getNameEn())));
        return summary(saved);
    }

    /** Days late (positive) or early (negative) vs plan; null when not yet due and not done. Boxed explicitly to avoid ternary unboxing. */
    static Integer slip(LocalDate planned, LocalDate actual, LocalDate today) {
        if (actual != null) return Integer.valueOf((int) ChronoUnit.DAYS.between(planned, actual));
        if (planned.isBefore(today)) return Integer.valueOf((int) ChronoUnit.DAYS.between(planned, today));
        return null;
    }

    public static ProjectDtos.ProjectSummary summary(Project p) {
        Wereda w = p.getWereda();
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        Integer daysSince = p.getLastProgressReportAt() == null ? null : (int) ChronoUnit.DAYS.between(p.getLastProgressReportAt().atZone(ZoneOffset.UTC).toLocalDate(), today);
        return new ProjectDtos.ProjectSummary(p.getId(), p.getCode(), p.getName(), p.getSector(),
            new GeoDtos.WeredaRef(w.getId(), w.getCode(), new GeoDtos.LocalizedName(w.getNameEn(), w.getNameTi(), w.getNameAm()),
                w.getZone().getId(), w.getZone().getCode(), new GeoDtos.LocalizedName(w.getZone().getNameEn(), w.getZone().getNameTi(), w.getZone().getNameAm())),
            p.getStatus(), p.getHealth(), p.getContractorName(), p.getImplementingAgency(), p.getPlannedStart(), p.getPlannedEnd(), p.getRevisedEnd(),
            p.getForecastEnd(), p.getActualStart(), p.getActualEnd(), p.getTotalBudgetEtb(), p.getFundingSource(), p.getPhysicalProgressPct(),
            p.getPlannedProgressPct(), p.getScheduleVariancePp(), p.getSpi(), p.getCpi(), p.getDisbursedEtb(), p.getExpendedEtb(),
            p.getLastProgressReportAt(), daysSince, p.getBeneficiaries(), GeoPoint.of(p.getLocation()),
            p.getLifecycleStage(), p.getRiskScore(), p.getLastVerifiedAt());
    }
}
