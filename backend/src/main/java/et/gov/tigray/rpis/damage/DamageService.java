package et.gov.tigray.rpis.damage;

import et.gov.tigray.rpis.audit.Audited;
import et.gov.tigray.rpis.common.BusinessException;
import et.gov.tigray.rpis.common.Enums.*;
import et.gov.tigray.rpis.common.GeoPoint;
import et.gov.tigray.rpis.common.NotFoundException;
import et.gov.tigray.rpis.common.Sector;
import et.gov.tigray.rpis.facility.Facility;
import et.gov.tigray.rpis.facility.FacilityRepository;
import et.gov.tigray.rpis.geo.GeoDtos;
import et.gov.tigray.rpis.geo.Wereda;
import et.gov.tigray.rpis.realtime.DomainEvent;
import et.gov.tigray.rpis.security.CurrentUser;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.Types;
import java.time.Instant;
import java.time.LocalDate;
import java.util.*;

import static et.gov.tigray.rpis.damage.AssessmentSupport.blankToNull;
import static et.gov.tigray.rpis.damage.AssessmentSupport.data;

/**
 * Damage assessments and their review. A submitted assessment counts only once someone other than its author has
 * verified it: verification updates the facility register (latest severity, operational status, replacement estimate)
 * and makes the assessment's need available to project registration. Returned assessments go back to the assessor
 * for revision; rejected ones are void and free their campaign task for a fresh visit.
 */
@Service
@RequiredArgsConstructor
public class DamageService {
    private final DamageAssessmentRepository assessments;
    private final FacilityRepository facilities;
    private final ApplicationEventPublisher events;
    private final NamedParameterJdbcTemplate jdbc;
    private final AssessmentSupport support;

    private static final int MIN_REASON = 10;

    /** Campaign task facts needed to authorise and route an assessment. */
    record TaskInfo(Long id, Long campaignId, String campaignCode, String campaignName, CampaignStatus campaignStatus, Sector campaignSector, Long facilityId,
                    TaskStatus status, Long assessorAgentId, Long verifierAgentId, Long assessmentId, Long coordinatorUserId) {}

    // ── queries ──────────────────────────────────────────────────────────
    @Transactional(readOnly = true)
    public Page<DamageDtos.AssessmentSummary> search(Sector sector, Short zoneId, Integer weredaId, DamageSeverity severity,
                                                     LocalDate from, LocalDate to, AssessmentStatus status, Long campaignId, Long facilityId, Pageable pageable) {
        Specification<DamageAssessment> spec = (root, q, cb) -> {
            List<Predicate> ps = new ArrayList<>();
            var facility = root.join("facility");
            if (sector != null) ps.add(cb.equal(facility.get("sector"), sector));
            if (weredaId != null) ps.add(cb.equal(facility.get("wereda").get("id"), weredaId));
            if (zoneId != null) ps.add(cb.equal(facility.get("wereda").get("zone").get("id"), zoneId));
            if (severity != null) ps.add(cb.equal(root.get("severity"), severity));
            if (from != null) ps.add(cb.greaterThanOrEqualTo(root.get("assessedOn"), from));
            if (to != null) ps.add(cb.lessThanOrEqualTo(root.get("assessedOn"), to));
            if (status != null) ps.add(cb.equal(root.get("status"), status));
            if (campaignId != null) ps.add(cb.equal(root.get("campaignId"), campaignId));
            if (facilityId != null) ps.add(cb.equal(facility.get("id"), facilityId));
            if (q.getResultType() != Long.class) { root.fetch("facility").fetch("wereda").fetch("zone"); }
            return cb.and(ps.toArray(Predicate[]::new));
        };
        Page<DamageAssessment> page = assessments.findAll(spec, pageable);
        Map<Long, String> codes = campaignCodes(page.getContent());
        return page.map(a -> summary(a, codes));
    }

    @Transactional(readOnly = true)
    public DamageDtos.AssessmentDetail get(Long id) {
        DamageAssessment a = assessments.findDetailById(id).orElseThrow(() -> new NotFoundException("Damage assessment", id));
        CurrentUser u = CurrentUser.get().orElse(null);
        if (u != null && u.has("SECTOR_HEAD") && u.sectorScope() != null && u.sectorScope() != a.getFacility().getSector())
            throw BusinessException.forbidden("out_of_scope", "This assessment is outside your sector");
        return detail(a, a.getTaskId() == null ? null : task(a.getTaskId()), u);
    }

    @Transactional(readOnly = true)
    public List<DamageDtos.AssessmentSummary> forFacility(Long facilityId) {
        List<DamageAssessment> list = assessments.findByFacilityIdOrderByAssessedOnDesc(facilityId);
        Map<Long, String> codes = campaignCodes(list);
        return list.stream().map(a -> summary(a, codes)).toList();
    }

    /**
     * Verified needs that no project covers yet: the latest verified assessment of each damaged facility that is not
     * linked to a live project, highest priority first. This is the starting point for project registration.
     */
    @Transactional(readOnly = true)
    public DamageDtos.NeedsResponse needs(Sector requestedSector, Short zoneId, Integer weredaId, NeedPriority priority) {
        Sector sector = CurrentUser.get().map(u -> u.effectiveSectorFilter(requestedSector)).orElse(requestedSector);
        MapSqlParameterSource p = new MapSqlParameterSource().addValue("sector", sector == null ? null : sector.name(), Types.VARCHAR)
            .addValue("zone", zoneId, Types.SMALLINT).addValue("wereda", weredaId, Types.INTEGER).addValue("priority", priority == null ? null : priority.name(), Types.VARCHAR);
        List<Object[]> rows = jdbc.query("""
            SELECT a.id, c.name campaign_name, (current_date - a.assessed_on) age,
                   CASE WHEN a.recommended_intervention IN ('RECONSTRUCTION', 'RELOCATION') THEN coalesce(a.estimated_replacement_cost_etb, a.estimated_repair_cost_etb)
                        ELSE coalesce(a.estimated_repair_cost_etb, a.estimated_replacement_cost_etb) END estimate
            FROM damage_assessment a
            JOIN facility f ON f.id = a.facility_id AND f.latest_assessment_id = a.id
            JOIN wereda w ON w.id = f.wereda_id
            LEFT JOIN assessment_campaign c ON c.id = a.campaign_id
            WHERE a.status = 'VERIFIED' AND a.project_id IS NULL AND a.severity <> 'NONE'
              AND coalesce(a.recommended_intervention, 'REHABILITATION') <> 'NO_ACTION'
              AND NOT EXISTS (SELECT 1 FROM project_facility pf JOIN project pr ON pr.id = pf.project_id WHERE pf.facility_id = f.id AND pr.status <> 'CANCELLED')
              AND (CAST(:sector AS varchar) IS NULL OR f.sector = :sector)
              AND (CAST(:zone AS smallint) IS NULL OR w.zone_id = :zone)
              AND (CAST(:wereda AS int) IS NULL OR f.wereda_id = :wereda)
              AND (CAST(:priority AS varchar) IS NULL OR a.intervention_priority = :priority)
            ORDER BY CASE a.intervention_priority WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 WHEN 'LOW' THEN 3 ELSE 2 END,
                     CASE a.severity WHEN 'DESTROYED' THEN 0 WHEN 'SEVERE' THEN 1 WHEN 'MODERATE' THEN 2 ELSE 3 END, coalesce(a.beneficiaries_affected, f.beneficiaries, 0) DESC
            LIMIT 300
            """, p, (rs, i) -> new Object[]{rs.getLong("id"), rs.getString("campaign_name"), rs.getInt("age"), rs.getBigDecimal("estimate")});
        Map<Long, DamageAssessment> byId = new HashMap<>();
        assessments.findAllById(rows.stream().map(r -> (Long) r[0]).toList()).forEach(a -> byId.put(a.getId(), a));
        Map<Long, String> codes = campaignCodes(byId.values());
        List<DamageDtos.Need> items = new ArrayList<>();
        long urgent = 0, beneficiaries = 0;
        BigDecimal total = BigDecimal.ZERO;
        for (Object[] r : rows) {
            DamageAssessment a = byId.get((Long) r[0]);
            if (a == null) continue;
            BigDecimal est = (BigDecimal) r[3];
            items.add(new DamageDtos.Need(summary(a, codes), (String) r[1], est, (Integer) r[2]));
            if (est != null) total = total.add(est);
            if (a.getInterventionPriority() == NeedPriority.URGENT) urgent++;
            Integer b = a.getBeneficiariesAffected() != null ? a.getBeneficiariesAffected() : a.getFacility().getBeneficiaries();
            if (b != null) beneficiaries += b;
        }
        return new DamageDtos.NeedsResponse(new DamageDtos.NeedsSummary(items.size(), total, urgent, beneficiaries), items);
    }

    // ── recording ────────────────────────────────────────────────────────
    /**
     * Records an assessment. Campaign tasks are recorded by their assessor (or a team lead, or an analyst entering a paper
     * form on their behalf) and wait for verification. System feeds without a signed-in person (demo simulator, imports)
     * are taken as verified, as before the workflow existed.
     */
    @Audited(action = "ASSESSMENT_CREATE", entityType = "DAMAGE_ASSESSMENT")
    @Transactional
    public DamageDtos.AssessmentSummary create(DamageDtos.CreateAssessmentRequest req, DataSource source, FieldDevice device, Long actorUserId) {
        if (device != null && req.clientReference() != null) {
            Optional<DamageAssessment> dup = assessments.findByDeviceIdAndClientReference(device.getId(), req.clientReference());
            if (dup.isPresent()) return summary(dup.get(), campaignCodes(List.of(dup.get())));
        }
        Facility f = facilities.findWithWeredaById(req.facilityId()).orElseThrow(() -> new NotFoundException("Facility", req.facilityId()));
        CurrentUser actor = CurrentUser.get().orElse(null);
        TaskInfo t = null;
        if (req.taskId() != null) {
            t = task(req.taskId());
            requireRecordable(t, f, actor);
        } else if (actor != null && actor.sectorScope() != null && actor.sectorScope() != f.getSector()) {
            throw BusinessException.forbidden("out_of_scope", "This facility is outside your sector");
        }
        boolean system = (actorUserId == null && t == null) || source == DataSource.SIMULATED || source == DataSource.IMPORT;

        DamageAssessment a = new DamageAssessment();
        a.setFacility(f);
        a.setClientReference(req.clientReference());
        a.setDevice(device);
        a.setAssessorUserId(actorUserId);
        a.setSource(source);
        a.setSyncedAt(source == DataSource.FIELD_APP ? Instant.now() : null);
        if (t != null) { a.setCampaignId(t.campaignId()); a.setTaskId(t.id()); }
        fill(a, req);
        Instant now = Instant.now();
        a.setSubmittedAt(now);
        a.setSubmittedByUserId(actorUserId);
        a.setSubmittedByName(actor == null ? req.assessorName() : actor.fullName());
        if (system) {
            a.setStatus(AssessmentStatus.VERIFIED);
            a.setVerifiedAt(now);
            a.setVerifiedByName("System feed");
        } else {
            a.setStatus(AssessmentStatus.SUBMITTED);
        }
        DamageAssessment saved = assessments.saveAndFlush(a);

        if (system) {
            applyToFacility(f, saved);
            recorded(f, saved, source);
        } else {
            if (t != null) {
                jdbc.update("UPDATE assessment_task SET status = 'SUBMITTED', assessment_id = :a, submitted_at = now(), started_at = coalesce(started_at, now()), updated_at = now() WHERE id = :t",
                    new MapSqlParameterSource("a", saved.getId()).addValue("t", t.id()));
            }
            support.log(t == null ? null : t.campaignId(), t == null ? null : t.id(), saved.getId(), "SUBMITTED",
                null, data("facility", f.getName(), "severity", saved.getSeverity().name(), "source", source.name()));
            notifyReviewers(t, f, saved, "ASSESSMENT_SUBMITTED");
        }
        return summary(saved, campaignCodes(List.of(saved)));
    }

    /** Revises a submitted or returned assessment; it goes (back) to review as a new revision. */
    @Audited(action = "ASSESSMENT_REVISE", entityType = "DAMAGE_ASSESSMENT")
    @Transactional
    public DamageDtos.AssessmentDetail revise(Long id, DamageDtos.CreateAssessmentRequest req) {
        DamageAssessment a = assessments.findDetailById(id).orElseThrow(() -> new NotFoundException("Damage assessment", id));
        CurrentUser u = CurrentUser.get().orElse(null);
        TaskInfo t = a.getTaskId() == null ? null : task(a.getTaskId());
        String reason = cannotReviseReason(a, t, u);
        if (reason != null) throw BusinessException.conflict("cannot_revise", reason);
        if (!a.getFacility().getId().equals(req.facilityId())) throw BusinessException.badRequest("facility_mismatch", "A revision must describe the same facility");
        boolean wasReturned = a.getStatus() == AssessmentStatus.RETURNED;
        fill(a, req);
        a.setRevision((short) (a.getRevision() + 1));
        a.setStatus(AssessmentStatus.SUBMITTED);
        a.setSubmittedAt(Instant.now());
        if (u != null) { a.setSubmittedByUserId(u.id()); a.setSubmittedByName(u.fullName()); }
        DamageAssessment saved = assessments.saveAndFlush(a);
        if (t != null) jdbc.update("UPDATE assessment_task SET status = 'SUBMITTED', submitted_at = now(), updated_at = now() WHERE id = :t", new MapSqlParameterSource("t", t.id()));
        support.log(saved.getCampaignId(), saved.getTaskId(), saved.getId(), wasReturned ? "RESUBMITTED" : "REVISED", null, data("revision", (int) saved.getRevision()));
        notifyReviewers(t, saved.getFacility(), saved, "ASSESSMENT_RESUBMITTED");
        return detail(saved, t, u);
    }

    /** Verify, return for revision, or reject a submitted assessment. The author never reviews their own work. */
    @Audited(action = "ASSESSMENT_REVIEW", entityType = "DAMAGE_ASSESSMENT")
    @Transactional
    public DamageDtos.AssessmentDetail review(Long id, DamageDtos.ReviewRequest req) {
        DamageAssessment a = assessments.findDetailById(id).orElseThrow(() -> new NotFoundException("Damage assessment", id));
        CurrentUser u = CurrentUser.get().orElse(null);
        TaskInfo t = a.getTaskId() == null ? null : task(a.getTaskId());
        String reason = cannotReviewReason(a, t, u);
        if (reason != null) throw BusinessException.conflict("cannot_review", reason);
        String note = blankToNull(req.note());
        if (req.decision() != ReviewDecision.VERIFY && (note == null || note.length() < MIN_REASON))
            throw BusinessException.invalid("A reason is required", List.of(Map.of("field", "note", "message", "Explain what must change in at least " + MIN_REASON + " characters")));

        Facility f = a.getFacility();
        a.setReviewNote(note);
        String noticeType;
        String severity;
        switch (req.decision()) {
            case VERIFY -> {
                a.setStatus(AssessmentStatus.VERIFIED);
                a.setVerifiedAt(Instant.now());
                a.setVerifiedByUserId(u.id());
                a.setVerifiedByName(u.fullName());
                if (isNewestVerified(f, a)) applyToFacility(f, a);
                if (t != null) jdbc.update("UPDATE assessment_task SET status = 'VERIFIED', verified_at = now(), updated_at = now() WHERE id = :t", new MapSqlParameterSource("t", t.id()));
                noticeType = "ASSESSMENT_VERIFIED"; severity = "SUCCESS";
            }
            case RETURN -> {
                a.setStatus(AssessmentStatus.RETURNED);
                if (t != null) jdbc.update("UPDATE assessment_task SET status = 'RETURNED', status_note = :n, updated_at = now() WHERE id = :t", new MapSqlParameterSource("t", t.id()).addValue("n", note));
                noticeType = "ASSESSMENT_RETURNED"; severity = "WARNING";
            }
            case REJECT -> {
                a.setStatus(AssessmentStatus.REJECTED);
                a.setTaskId(null);  // the task is free for a fresh visit; the rejected record stays in the campaign's history
                if (t != null) jdbc.update("""
                    UPDATE assessment_task SET assessment_id = NULL, status = CASE WHEN assessor_agent_id IS NULL THEN 'PLANNED' ELSE 'ASSIGNED' END,
                           status_note = :n, submitted_at = NULL, updated_at = now() WHERE id = :t
                    """, new MapSqlParameterSource("t", t.id()).addValue("n", note));
                noticeType = "ASSESSMENT_REJECTED"; severity = "CRITICAL";
            }
            default -> throw new IllegalStateException();
        }
        DamageAssessment saved = assessments.saveAndFlush(a);
        if (saved.getStatus() == AssessmentStatus.VERIFIED) recorded(f, saved, saved.getSource());
        support.log(saved.getCampaignId(), t == null ? null : t.id(), saved.getId(), saved.getStatus().name(), note, null);
        Set<Long> to = new LinkedHashSet<>();
        to.add(saved.getSubmittedByUserId());
        to.add(saved.getAssessorUserId());
        if (t != null) to.add(support.userOfAgent(t.assessorAgentId()));
        support.notice(to, noticeType, severity, "/damage/assessments/" + saved.getId(),
            data("assessmentId", saved.getId(), "name", f.getName(), "code", t == null ? null : t.campaignCode(), "excerpt", note));
        return detail(saved, t == null ? null : task(t.id()), u);
    }

    // ── authorisation ────────────────────────────────────────────────────
    private void requireRecordable(TaskInfo t, Facility f, CurrentUser actor) {
        if (!t.facilityId().equals(f.getId())) throw BusinessException.badRequest("facility_mismatch", "The task is for a different facility");
        if (t.campaignStatus() != CampaignStatus.ACTIVE) throw BusinessException.conflict("campaign_not_active", "Site visits for this assessment round are not under way");
        switch (t.status()) {
            case SUBMITTED, VERIFIED -> throw BusinessException.conflict("already_submitted", "This site already has an assessment; open it to revise it");
            case RETURNED -> throw BusinessException.conflict("returned_revise", "The assessment was returned; revise the existing record instead of creating a new one");
            case PLANNED -> throw BusinessException.conflict("task_not_assigned", "The site has no assessor yet");
            case INACCESSIBLE, CANCELLED -> throw BusinessException.conflict("task_closed", "This site has been closed (it could not be reached or was removed)");
            default -> { }
        }
        if (actor == null) throw BusinessException.unauthorized("unauthenticated", "Sign in required");
        if (actor.has("ANALYST") || actor.has("ADMIN")) return;
        Long me = support.agentOfUser(actor.id());
        if (me != null && (me.equals(t.assessorAgentId()) || isActiveMember(t.campaignId(), me, CampaignRole.TEAM_LEAD))) return;
        throw BusinessException.forbidden("not_assessor", "Only the assigned assessor, a team lead or an analyst can record this site");
    }

    String cannotReviewReason(DamageAssessment a, TaskInfo t, CurrentUser u) {
        if (u == null) return "Sign in required";
        if (a.getStatus() != AssessmentStatus.SUBMITTED) return "This assessment is not waiting to be checked";
        Long me = support.agentOfUser(u.id());
        boolean author = u.id() != null && (u.id().equals(a.getSubmittedByUserId()) || u.id().equals(a.getAssessorUserId()))
            || (t != null && me != null && me.equals(t.assessorAgentId()));
        if (author) return "You recorded this assessment; another person must check it";
        boolean oversight = u.has("ANALYST") || u.has("ADMIN")
            || (u.has("SECTOR_HEAD") && (u.sectorScope() == null || u.sectorScope() == a.getFacility().getSector()));
        boolean verifier = t != null && me != null && (me.equals(t.verifierAgentId())
            || isActiveMember(t.campaignId(), me, CampaignRole.VERIFIER) || isActiveMember(t.campaignId(), me, CampaignRole.TEAM_LEAD));
        if (!oversight && !verifier) return "Only the site's checker, an assessment round checker or team lead, an analyst or the sector head can check";
        return null;
    }

    private String cannotReviseReason(DamageAssessment a, TaskInfo t, CurrentUser u) {
        if (u == null) return "Sign in required";
        if (a.getStatus() != AssessmentStatus.SUBMITTED && a.getStatus() != AssessmentStatus.RETURNED) return "Only assessments waiting to be checked or sent back can be changed";
        if (t != null && t.campaignStatus() != CampaignStatus.ACTIVE) return "Site visits for this assessment round are not under way";
        if (u.has("ANALYST") || u.has("ADMIN")) return null;
        if (u.id() != null && u.id().equals(a.getSubmittedByUserId())) return null;
        Long me = support.agentOfUser(u.id());
        if (t != null && me != null && (me.equals(t.assessorAgentId()) || isActiveMember(t.campaignId(), me, CampaignRole.TEAM_LEAD))) return null;
        return "Only the assessor, a team lead or an analyst can revise this assessment";
    }

    boolean isActiveMember(Long campaignId, Long agentId, CampaignRole role) {
        Long n = jdbc.queryForObject("SELECT count(*) FROM assessment_campaign_member WHERE campaign_id = :c AND agent_id = :a AND role = :r AND active",
            new MapSqlParameterSource("c", campaignId).addValue("a", agentId).addValue("r", role.name()), Long.class);
        return n != null && n > 0;
    }

    // ── helpers ──────────────────────────────────────────────────────────
    private void fill(DamageAssessment a, DamageDtos.CreateAssessmentRequest req) {
        a.setAssessedOn(req.assessedOn());
        a.setAssessorName(req.assessorName().trim());
        a.setSeverity(req.severity());
        a.setStructuralImpactScore((short) req.structuralImpactScore());
        a.setInventoryLossPct(req.inventoryLossPct() == null ? null : req.inventoryLossPct().shortValue());
        a.setFunctionalCapacityPct(req.functionalCapacityPct() == null ? null : req.functionalCapacityPct().shortValue());
        a.setEstimatedReplacementCostEtb(req.estimatedReplacementCostEtb());
        a.setNotes(blankToNull(req.notes()));
        a.setAudioNoteUrl(blankToNull(req.audioNoteUrl()));
        a.setLocation(req.location() == null ? null : req.location().toJts());
        a.setAccessStatus(req.accessStatus());
        a.setCurrentUse(req.currentUse());
        a.setUxoSuspected(Boolean.TRUE.equals(req.uxoSuspected()));
        a.setDamageCauses(req.damageCauses() == null ? new ArrayList<>() : new ArrayList<>(new LinkedHashSet<>(req.damageCauses().stream().map(Enum::name).toList())));
        a.setRecommendedIntervention(req.recommendedIntervention());
        a.setInterventionPriority(req.interventionPriority());
        a.setBeneficiariesAffected(req.beneficiariesAffected());
        a.setEquipmentLossEtb(req.equipmentLossEtb());

        if (req.components() != null) {
            Set<String> seen = new HashSet<>();
            for (var c : req.components()) if (!seen.add(c.component())) throw BusinessException.badRequest("duplicate_component", "Component " + c.component() + " is listed twice");
            a.getComponents().clear();
            for (var c : req.components()) {
                AssessmentComponent ac = new AssessmentComponent();
                ac.setAssessment(a); ac.setComponent(c.component()); ac.setCondition(c.condition()); ac.setRepairCostEtb(c.repairCostEtb()); ac.setNote(blankToNull(c.note()));
                a.getComponents().add(ac);
            }
        }
        // Repair estimate: as entered, otherwise the sum of the component estimates.
        BigDecimal componentTotal = a.getComponents().stream().map(AssessmentComponent::getRepairCostEtb).filter(Objects::nonNull).reduce(BigDecimal.ZERO, BigDecimal::add);
        a.setEstimatedRepairCostEtb(req.estimatedRepairCostEtb() != null ? req.estimatedRepairCostEtb() : componentTotal.signum() > 0 ? componentTotal : null);

        if (req.photos() != null) {
            a.getPhotos().clear();
            req.photos().forEach(p -> {
                AssessmentPhoto ph = new AssessmentPhoto();
                ph.setAssessment(a); ph.setUrl(p.url()); ph.setCaption(p.caption()); ph.setTakenAt(p.takenAt());
                ph.setLocation(p.location() == null ? null : p.location().toJts());
                a.getPhotos().add(ph);
            });
        }
    }

    /** A late verification of an older visit must not overwrite the facility's more recent picture. */
    private boolean isNewestVerified(Facility f, DamageAssessment a) {
        if (f.getLatestAssessmentId() == null || f.getLatestAssessmentId().equals(a.getId())) return true;
        LocalDate latest = jdbc.queryForObject("SELECT assessed_on FROM damage_assessment WHERE id = :id", new MapSqlParameterSource("id", f.getLatestAssessmentId()), LocalDate.class);
        return latest == null || !a.getAssessedOn().isBefore(latest);
    }

    private void recorded(Facility f, DamageAssessment saved, DataSource source) {
        events.publishEvent(DomainEvent.of("ASSESSMENT_RECORDED", "FACILITY", f.getId(), f.getSector(), f.getWereda().getId(),
            Map.of("facilityName", f.getName(), "severity", saved.getSeverity().name(), "impactScore", saved.getStructuralImpactScore(),
                   "assessedOn", saved.getAssessedOn().toString(), "source", source.name())));
    }

    /** The site's verifier, else the campaign coordinator; ad hoc assessments go to the analysts. */
    private void notifyReviewers(TaskInfo t, Facility f, DamageAssessment a, String type) {
        Collection<Long> to;
        if (t != null) {
            Long verifier = support.userOfAgent(t.verifierAgentId());
            to = verifier != null ? List.of(verifier) : t.coordinatorUserId() != null ? List.of(t.coordinatorUserId()) : support.usersWithRole("ANALYST", f.getSector().name());
        } else {
            to = support.usersWithRole("ANALYST", f.getSector().name());
        }
        support.notice(to, type, "INFO", "/damage/assessments/" + a.getId(),
            data("assessmentId", a.getId(), "name", f.getName(), "code", t == null ? null : t.campaignCode(), "severity", a.getSeverity().name()));
    }

    TaskInfo task(Long taskId) {
        List<TaskInfo> rows = jdbc.query("""
            SELECT t.id, t.campaign_id, c.code, c.name, c.status cstatus, c.sector, t.facility_id, t.status, t.assessor_agent_id, t.verifier_agent_id, t.assessment_id, c.coordinator_user_id
            FROM assessment_task t JOIN assessment_campaign c ON c.id = t.campaign_id WHERE t.id = :id
            """, new MapSqlParameterSource("id", taskId), (rs, i) -> new TaskInfo(rs.getLong("id"), rs.getLong("campaign_id"), rs.getString("code"), rs.getString("name"),
                CampaignStatus.valueOf(rs.getString("cstatus")), rs.getString("sector") == null ? null : Sector.valueOf(rs.getString("sector")), rs.getLong("facility_id"),
                TaskStatus.valueOf(rs.getString("status")), (Long) rs.getObject("assessor_agent_id"), (Long) rs.getObject("verifier_agent_id"),
                (Long) rs.getObject("assessment_id"), (Long) rs.getObject("coordinator_user_id")));
        if (rows.isEmpty()) throw new NotFoundException("Assessment task", taskId);
        return rows.get(0);
    }

    public static void applyToFacility(Facility f, DamageAssessment latest) {
        f.setLatestAssessmentId(latest.getId());
        f.setLatestSeverity(latest.getSeverity());
        if (latest.getEstimatedReplacementCostEtb() != null) f.setReplacementEstimateEtb(latest.getEstimatedReplacementCostEtb());
        Short cap = latest.getFunctionalCapacityPct();
        if (cap != null) f.setOperationalStatus(cap == 0 ? OperationalStatus.NON_FUNCTIONAL : cap < 80 ? OperationalStatus.PARTIALLY_FUNCTIONAL : OperationalStatus.FUNCTIONAL);
        else if (latest.getSeverity() == DamageSeverity.DESTROYED || latest.getSeverity() == DamageSeverity.SEVERE) f.setOperationalStatus(OperationalStatus.NON_FUNCTIONAL);
    }

    public static DamageDtos.FacilityRef facilityRef(Facility f) {
        Wereda w = f.getWereda();
        return new DamageDtos.FacilityRef(f.getId(), f.getCode(), f.getName(), f.getSector(), f.getFacilityType(),
            new GeoDtos.WeredaRef(w.getId(), w.getCode(), new GeoDtos.LocalizedName(w.getNameEn(), w.getNameTi(), w.getNameAm()),
                w.getZone().getId(), w.getZone().getCode(), new GeoDtos.LocalizedName(w.getZone().getNameEn(), w.getZone().getNameTi(), w.getZone().getNameAm())));
    }

    private Map<Long, String> campaignCodes(Collection<DamageAssessment> list) {
        Set<Long> ids = new HashSet<>();
        list.forEach(a -> { if (a.getCampaignId() != null) ids.add(a.getCampaignId()); });
        if (ids.isEmpty()) return Map.of();
        Map<Long, String> out = new HashMap<>();
        jdbc.query("SELECT id, code FROM assessment_campaign WHERE id IN (:ids)", new MapSqlParameterSource("ids", ids), rs -> { out.put(rs.getLong("id"), rs.getString("code")); });
        return out;
    }

    public static DamageDtos.AssessmentSummary summary(DamageAssessment a, Map<Long, String> campaignCodes) {
        return new DamageDtos.AssessmentSummary(a.getId(), facilityRef(a.getFacility()), a.getAssessedOn(), a.getAssessorName(), a.getSeverity(),
            a.getStructuralImpactScore(), a.getInventoryLossPct() == null ? null : (int) a.getInventoryLossPct(),
            a.getFunctionalCapacityPct() == null ? null : (int) a.getFunctionalCapacityPct(),
            a.getEstimatedRepairCostEtb(), a.getEstimatedReplacementCostEtb(), a.getSource(), a.getSyncedAt(), a.getCreatedAt(), a.getPhotos().size(),
            a.getStatus(), a.getCampaignId(), a.getCampaignId() == null ? null : campaignCodes.get(a.getCampaignId()), a.getTaskId(),
            a.getRecommendedIntervention(), a.getInterventionPriority(), a.getBeneficiariesAffected(), a.getSubmittedAt(), a.getVerifiedAt(), a.getProjectId());
    }

    private DamageDtos.AssessmentDetail detail(DamageAssessment a, TaskInfo t, CurrentUser u) {
        String reviewReason = cannotReviewReason(a, t, u);
        boolean canRevise = cannotReviseReason(a, t, u) == null;
        boolean canProject = a.getStatus() == AssessmentStatus.VERIFIED && a.getProjectId() == null && a.getRecommendedIntervention() != Intervention.NO_ACTION
            && u != null && (u.has("ANALYST") || u.has("ADMIN"));
        DamageDtos.CampaignLink campaign = a.getCampaignId() == null ? null : jdbc.query("SELECT id, code, name FROM assessment_campaign WHERE id = :id",
            new MapSqlParameterSource("id", a.getCampaignId()), (rs, i) -> new DamageDtos.CampaignLink(rs.getLong("id"), rs.getString("code"), rs.getString("name"))).stream().findFirst().orElse(null);
        DamageDtos.ProjectLink project = a.getProjectId() == null ? null : jdbc.query("SELECT id, code, name FROM project WHERE id = :id",
            new MapSqlParameterSource("id", a.getProjectId()), (rs, i) -> new DamageDtos.ProjectLink(rs.getLong("id"), rs.getString("code"), rs.getString("name"))).stream().findFirst().orElse(null);
        List<DamageDtos.HistoryEntry> history = jdbc.query("""
            SELECT kind, occurred_at, actor_name, note FROM assessment_event WHERE assessment_id = :id ORDER BY occurred_at, id
            """, new MapSqlParameterSource("id", a.getId()), (rs, i) -> new DamageDtos.HistoryEntry(rs.getString("kind"), rs.getTimestamp("occurred_at").toInstant(), rs.getString("actor_name"), rs.getString("note")));
        List<DamageDtos.Component> components = a.getComponents().stream().map(c -> new DamageDtos.Component(c.getComponent(), c.getCondition(), c.getRepairCostEtb(), c.getNote())).toList();
        BigDecimal componentTotal = components.stream().map(DamageDtos.Component::repairCostEtb).filter(Objects::nonNull).reduce(BigDecimal.ZERO, BigDecimal::add);
        List<DamageCause> causes = a.getDamageCauses().stream().map(DamageCause::valueOf).toList();
        return new DamageDtos.AssessmentDetail(summary(a, campaign == null ? Map.of() : Map.of(campaign.id(), campaign.code())), a.getNotes(), a.getAudioNoteUrl(), GeoPoint.of(a.getLocation()),
            a.getPhotos().stream().map(p -> new DamageDtos.Photo(p.getId(), p.getUrl(), p.getCaption(), p.getTakenAt(), GeoPoint.of(p.getLocation()))).toList(),
            a.getRevision(), a.getAccessStatus(), a.getCurrentUse(), a.isUxoSuspected(), causes, a.getEquipmentLossEtb(), components, componentTotal,
            a.getSubmittedByName(), a.getVerifiedByName(), a.getReviewNote(), campaign, project, history,
            new DamageDtos.Permissions(reviewReason == null, reviewReason, canRevise, canProject));
    }
}
