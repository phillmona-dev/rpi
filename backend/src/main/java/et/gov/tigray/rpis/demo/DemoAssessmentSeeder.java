package et.gov.tigray.rpis.demo;

import et.gov.tigray.rpis.common.Enums.*;
import et.gov.tigray.rpis.common.Sector;
import et.gov.tigray.rpis.damage.AssessmentComponent;
import et.gov.tigray.rpis.damage.DamageAssessment;
import et.gov.tigray.rpis.damage.DamageAssessmentRepository;
import et.gov.tigray.rpis.damage.DamageService;
import et.gov.tigray.rpis.facility.Facility;
import et.gov.tigray.rpis.facility.FacilityRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * Demo profile · V7 data. Three damage assessment campaigns at different stages so every screen has content:
 * an endorsed health campaign (its verified needs feed project registration), an education campaign in fieldwork
 * with sites in every state (the demo field officer has sites to record and one returned for revision), and an
 * agriculture campaign still being planned. Idempotent: skips when any campaign exists.
 */
@Slf4j
@Component
@Order(40)
@ConditionalOnProperty(prefix = "rpis.demo", name = "enabled", havingValue = "true")
@RequiredArgsConstructor
public class DemoAssessmentSeeder implements ApplicationRunner {
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final FacilityRepository facilities;
    private final DamageAssessmentRepository assessments;

    private static final LocalDate TODAY = LocalDate.now(ZoneOffset.UTC);
    private final Random rnd = new Random(7);

    static final Map<Sector, List<String>> COMPONENTS = Map.of(
        Sector.EDUCATION, List.of("STRUCTURE", "ROOF", "WALLS", "DOORS_WINDOWS", "CLASSROOMS", "SANITATION", "WATER_SUPPLY", "FURNITURE", "TEACHING_MATERIALS"),
        Sector.HEALTH, List.of("STRUCTURE", "ROOF", "ELECTRICAL", "WATER_SUPPLY", "MEDICAL_EQUIPMENT", "COLD_CHAIN", "PHARMACY_STOCK", "MATERNITY_WARD", "LABORATORY"),
        Sector.MANUFACTURING, List.of("STRUCTURE", "ROOF", "MACHINERY", "PRODUCTION_LINE", "POWER_SUPPLY", "STORAGE"),
        Sector.AGRICULTURE, List.of("CANALS_STRUCTURES", "PUMPS_MOTORS", "STORAGE", "EQUIPMENT", "FENCE_COMPOUND"));

    @Override
    public void run(ApplicationArguments args) {
        Long campaigns = jdbc.queryForObject("SELECT count(*) FROM assessment_campaign", Long.class);
        Long agents = jdbc.queryForObject("SELECT count(*) FROM field_agent", Long.class);
        if (campaigns == null || campaigns > 0 || agents == null || agents == 0) return;
        tx.executeWithoutResult(s -> seedHealth());
        tx.executeWithoutResult(s -> seedEducation());
        tx.executeWithoutResult(s -> seedAgriculture());
        log.info("Demo V7 data ready: {} campaigns, {} sites", jdbc.queryForObject("SELECT count(*) FROM assessment_campaign", Long.class),
            jdbc.queryForObject("SELECT count(*) FROM assessment_task", Long.class));
    }

    /** Completed and endorsed: severely damaged health facilities, some not yet covered by any project. */
    private void seedHealth() {
        List<Long> fids = jdbc.queryForList("""
            SELECT f.id FROM facility f
            WHERE f.sector = 'HEALTH' AND f.latest_severity IN ('SEVERE', 'DESTROYED', 'MODERATE')
            ORDER BY (SELECT count(*) FROM project_facility pf WHERE pf.facility_id = f.id), f.latest_severity DESC, f.id LIMIT 9
            """, Long.class);
        if (fids.isEmpty()) return;
        Long c = campaign("Post-conflict health facility damage assessment", Sector.HEALTH, CampaignStatus.COMPLETED, TODAY.minusDays(95), TODAY.minusDays(40),
            "Establish the verified extent of damage to health posts, health centres and hospitals so that reconstruction can be planned and funded.",
            "Two-person site visits using the regional health facility checklist; structural engineer for hospitals; every site verified by a field analyst.");
        scope(c, fids);
        Long lead = agent("Freweini Gebre"), engineer = agent("Haile Gebremariam"), verifier = agent("Yohannes Teklu");
        List<Long> assessors = List.of(agent("Selam Tesfay"), agent("Mulu Abraha"));
        member(c, lead, CampaignRole.TEAM_LEAD, 95); member(c, engineer, CampaignRole.ENGINEER, 95); member(c, verifier, CampaignRole.VERIFIER, 95);
        assessors.forEach(a -> member(c, a, CampaignRole.ASSESSOR, 94));
        int i = 0;
        for (Long fid : fids) {
            Long assessor = i % 3 == 2 ? engineer : assessors.get(i % 2);
            Long task = task(c, fid, i < 3 ? AssignmentPriority.URGENT : AssignmentPriority.NORMAL, TODAY.minusDays(45), assessor, verifier, TaskStatus.VERIFIED, 92);
            LocalDate on = TODAY.minusDays(80 - i * 4L);
            DamageAssessment a = assessment(fid, c, task, on, name(assessor), AssessmentStatus.VERIFIED, userOf(assessor), "Yohannes Teklu", userOf(verifier));
            event(c, task, a.getId(), "SUBMITTED", name(assessor), null, on.plusDays(1));
            event(c, task, a.getId(), "VERIFIED", "Yohannes Teklu", i == 1 ? "Checked against the 2025 woreda health office inventory." : null, on.plusDays(3));
            i++;
        }
        event(c, null, null, "FIELDWORK_CLOSED", "Planning Analyst (Demo)", null, TODAY.minusDays(42));
        jdbc.update("""
            UPDATE assessment_campaign SET started_at = ?, fieldwork_closed_at = ?, endorsed_at = ?, endorsed_by_user_id = (SELECT id FROM app_user WHERE username = 'executive'),
                   endorsed_by_name = 'Chief Executive (Demo)', endorsement_reference = ?, endorsement_note = ? WHERE id = ?
            """, ts(TODAY.minusDays(92)), ts(TODAY.minusDays(42)), ts(TODAY.minusDays(38)),
            "EN-%d-%04d".formatted(TODAY.getYear(), jdbc.queryForObject("SELECT nextval('assessment_endorsement_seq')", Long.class)),
            "Findings endorsed. Destroyed hospitals to be prioritised in the next financing round.", c);
        event(c, null, null, "ENDORSED", "Chief Executive (Demo)", "Findings endorsed. Destroyed hospitals to be prioritised in the next financing round.", TODAY.minusDays(38));
    }

    /** In fieldwork: education facilities around the demo field officer's area, sites in every state. */
    private void seedEducation() {
        Long officer = agent("Field Officer (Demo)");
        List<Long> fids = jdbc.queryForList("""
            SELECT f.id FROM facility f
            WHERE f.sector = 'EDUCATION'
            ORDER BY (f.wereda_id IN (SELECT wereda_id FROM field_agent_coverage WHERE agent_id = ?)) DESC, f.latest_severity DESC NULLS FIRST, f.id LIMIT 13
            """, Long.class, officer);
        if (fids.size() < 6) return;
        Long c = campaign("Rapid assessment of schools used as shelters", Sector.EDUCATION, CampaignStatus.ACTIVE, TODAY.minusDays(21), TODAY.plusDays(24),
            "Assess schools that hosted displaced families or were occupied, so classrooms can reopen for the new academic year.",
            "One assessor per school with the education bureau checklist; photos of every block; verifier visits a sample and reviews all submissions.");
        scope(c, fids);
        Long lead = agent("Tsige Hagos"), kidane = agent("Kidane Berhe"), hiwet = agent("Hiwet Kahsay"), berhane = agent("Berhane Kahsay"), yohannes = agent("Yohannes Teklu");
        member(c, lead, CampaignRole.TEAM_LEAD, 25); member(c, berhane, CampaignRole.VERIFIER, 25); member(c, yohannes, CampaignRole.VERIFIER, 25);
        member(c, officer, CampaignRole.ASSESSOR, 24); member(c, kidane, CampaignRole.ASSESSOR, 24); member(c, hiwet, CampaignRole.ASSESSOR, 24);
        event(c, null, null, "STARTED", "Planning Analyst (Demo)", null, TODAY.minusDays(21));

        // index → (assessor, verifier, status)
        Object[][] plan = {
            {kidane, berhane, TaskStatus.VERIFIED}, {kidane, berhane, TaskStatus.VERIFIED}, {hiwet, berhane, TaskStatus.VERIFIED},
            {officer, yohannes, TaskStatus.SUBMITTED}, {kidane, berhane, TaskStatus.SUBMITTED},
            {officer, yohannes, TaskStatus.RETURNED},
            {officer, yohannes, TaskStatus.ASSIGNED}, {officer, yohannes, TaskStatus.ASSIGNED}, {officer, berhane, TaskStatus.ASSIGNED},
            {hiwet, berhane, TaskStatus.IN_PROGRESS}, {hiwet, yohannes, TaskStatus.INACCESSIBLE},
            {kidane, yohannes, TaskStatus.ASSIGNED}, {kidane, berhane, TaskStatus.ASSIGNED}};
        for (int i = 0; i < fids.size() && i < plan.length; i++) {
            Long assessor = (Long) plan[i][0], verifier = (Long) plan[i][1];
            TaskStatus st = (TaskStatus) plan[i][2];
            LocalDate due = i == 6 ? TODAY.minusDays(2) : TODAY.plusDays(5 + i * 2L);
            Long task = task(c, fids.get(i), i % 4 == 0 ? AssignmentPriority.HIGH : AssignmentPriority.NORMAL, due, assessor, verifier, st, 20);
            event(c, task, null, "ASSIGNED", "Planning Analyst (Demo)", null, TODAY.minusDays(20));
            switch (st) {
                case VERIFIED, SUBMITTED, RETURNED -> {
                    LocalDate on = TODAY.minusDays(16 - i);
                    AssessmentStatus as = st == TaskStatus.VERIFIED ? AssessmentStatus.VERIFIED : st == TaskStatus.SUBMITTED ? AssessmentStatus.SUBMITTED : AssessmentStatus.RETURNED;
                    DamageAssessment a = assessment(fids.get(i), c, task, on, name(assessor), as, userOf(assessor),
                        as == AssessmentStatus.VERIFIED ? name(verifier) : null, as == AssessmentStatus.VERIFIED ? userOf(verifier) : null);
                    event(c, task, a.getId(), "SUBMITTED", name(assessor), null, on);
                    if (as == AssessmentStatus.VERIFIED) event(c, task, a.getId(), "VERIFIED", name(verifier), null, on.plusDays(2));
                    if (as == AssessmentStatus.RETURNED) {
                        String note = "Roof photos are missing and the classroom count does not match the school register (8 vs 12). Please revisit block B.";
                        jdbc.update("UPDATE damage_assessment SET review_note = ? WHERE id = ?", note, a.getId());
                        jdbc.update("UPDATE assessment_task SET status_note = ? WHERE id = ?", note, task);
                        event(c, task, a.getId(), "RETURNED", name(verifier), note, on.plusDays(1));
                    }
                }
                case IN_PROGRESS -> jdbc.update("UPDATE assessment_task SET started_at = ? WHERE id = ?", ts(TODAY.minusDays(1)), task);
                case INACCESSIBLE -> {
                    String note = "Road closed beyond the river crossing after the rains; the kebele administration advises waiting two weeks.";
                    jdbc.update("UPDATE assessment_task SET status_note = ? WHERE id = ?", note, task);
                    event(c, task, null, "TASK_INACCESSIBLE", name(assessor), note, TODAY.minusDays(4));
                }
                default -> { }
            }
        }
        jdbc.update("UPDATE assessment_campaign SET started_at = ? WHERE id = ?", ts(TODAY.minusDays(21)), c);
    }

    /** Still being planned: scope and sites chosen, no team yet. */
    private void seedAgriculture() {
        List<Long> fids = jdbc.queryForList("SELECT id FROM facility WHERE sector = 'AGRICULTURE' AND facility_type IN ('IRRIGATION_SCHEME', 'FARMERS_TRAINING_CENTER') ORDER BY id LIMIT 6", Long.class);
        if (fids.isEmpty()) return;
        Long c = campaign("Irrigation schemes and farmer training centres — damage survey", Sector.AGRICULTURE, CampaignStatus.PLANNING, TODAY.plusDays(10), TODAY.plusDays(55),
            "Quantify damage to irrigation canals, headworks and pumps ahead of the dry-season planting.", null);
        scope(c, fids);
        for (Long fid : fids) task(c, fid, AssignmentPriority.NORMAL, TODAY.plusDays(50), null, null, TaskStatus.PLANNED, 2);
    }

    // ── builders ─────────────────────────────────────────────────────────
    private Long campaign(String name, Sector sector, CampaignStatus status, LocalDate start, LocalDate end, String objective, String methodology) {
        Long seq = jdbc.queryForObject("SELECT nextval('assessment_campaign_seq')", Long.class);
        Long id = jdbc.queryForObject("""
            INSERT INTO assessment_campaign(code, name, sector, objective, methodology, status, planned_start, planned_end, coordinator_user_id, coordinator_name,
                                            created_by_user_id, created_by_name, created_at)
            SELECT ?, ?, ?, ?, ?, ?, ?, ?, u.id, u.full_name, u.id, u.full_name, ? FROM app_user u WHERE u.username = 'analyst' RETURNING id
            """, Long.class, "DA-%d-%03d".formatted(TODAY.getYear(), seq), name, sector.name(), objective, methodology, status.name(), start, end, ts(start.minusDays(7)));
        event(id, null, null, "CREATED", "Planning Analyst (Demo)", null, start.minusDays(7));
        return id;
    }

    private void scope(Long campaign, List<Long> fids) {
        jdbc.update("INSERT INTO assessment_campaign_wereda(campaign_id, wereda_id) SELECT DISTINCT ?, wereda_id FROM facility WHERE id = ANY(?) ON CONFLICT DO NOTHING",
            campaign, fids.toArray(Long[]::new));
    }

    private void member(Long campaign, Long agent, CampaignRole role, int daysAgo) {
        if (agent == null) return;
        jdbc.update("INSERT INTO assessment_campaign_member(campaign_id, agent_id, role, added_at, added_by_name) VALUES (?, ?, ?, ?, 'Planning Analyst (Demo)')",
            campaign, agent, role.name(), ts(TODAY.minusDays(daysAgo)));
    }

    private Long task(Long campaign, Long facility, AssignmentPriority priority, LocalDate due, Long assessor, Long verifier, TaskStatus status, int assignedDaysAgo) {
        return jdbc.queryForObject("""
            INSERT INTO assessment_task(campaign_id, facility_id, status, priority, assessor_agent_id, verifier_agent_id, due_on, assigned_at, assigned_by_name)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
            """, Long.class, campaign, facility, status.name(), priority.name(), assessor, verifier, due,
            assessor == null ? null : ts(TODAY.minusDays(assignedDaysAgo)), assessor == null ? null : "Planning Analyst (Demo)");
    }

    private DamageAssessment assessment(Long facilityId, Long campaign, Long task, LocalDate on, String assessorName, AssessmentStatus status,
                                        Long assessorUser, String verifierName, Long verifierUser) {
        Facility f = facilities.findWithWeredaById(facilityId).orElseThrow();
        DamageSeverity sev = f.getLatestSeverity() == null || f.getLatestSeverity() == DamageSeverity.NONE ? DamageSeverity.MODERATE : f.getLatestSeverity();
        int score = switch (sev) { case NONE -> 4; case MINOR -> 16; case MODERATE -> 40 + rnd.nextInt(12); case SEVERE -> 62 + rnd.nextInt(12); case DESTROYED -> 85 + rnd.nextInt(12); };
        BigDecimal replacement = f.getReplacementEstimateEtb() != null ? f.getReplacementEstimateEtb() : BigDecimal.valueOf(25_000_000L + rnd.nextInt(40) * 1_000_000L);
        DamageAssessment a = new DamageAssessment();
        a.setFacility(f); a.setCampaignId(campaign); a.setTaskId(task); a.setAssessedOn(on); a.setAssessorName(assessorName); a.setAssessorUserId(assessorUser);
        a.setSeverity(sev); a.setStructuralImpactScore((short) Math.min(100, score));
        a.setInventoryLossPct((short) Math.min(100, score + 8)); a.setFunctionalCapacityPct((short) Math.max(0, 100 - score - 5));
        a.setEstimatedReplacementCostEtb(replacement.setScale(0, RoundingMode.HALF_UP));
        a.setLocation(f.getLocation()); a.setSource(DataSource.FIELD_APP); a.setSyncedAt(at(on, 18));
        a.setAccessStatus(rnd.nextInt(5) == 0 ? AccessStatus.PARTIAL : AccessStatus.ACCESSIBLE);
        a.setCurrentUse(f.getSector() == Sector.EDUCATION && rnd.nextBoolean() ? CurrentUse.IDP_SHELTER : sev == DamageSeverity.DESTROYED ? CurrentUse.ABANDONED : CurrentUse.PARTIAL_USE);
        a.setUxoSuspected(sev == DamageSeverity.DESTROYED && rnd.nextBoolean());
        List<String> causes = new ArrayList<>(List.of("LOOTING"));
        if (sev.ordinal() >= DamageSeverity.SEVERE.ordinal()) causes.add(rnd.nextBoolean() ? "SHELLING" : "AIRSTRIKE");
        if (a.getCurrentUse() == CurrentUse.IDP_SHELTER) causes.add("OCCUPATION");
        if (rnd.nextInt(3) == 0) causes.add("NEGLECT");
        a.setDamageCauses(causes);
        a.setRecommendedIntervention(switch (sev) { case DESTROYED -> Intervention.RECONSTRUCTION; case SEVERE -> rnd.nextBoolean() ? Intervention.RECONSTRUCTION : Intervention.REHABILITATION;
            case MODERATE -> Intervention.REHABILITATION; default -> Intervention.MINOR_REPAIR; });
        a.setInterventionPriority(sev == DamageSeverity.DESTROYED ? NeedPriority.URGENT : sev == DamageSeverity.SEVERE ? NeedPriority.HIGH : NeedPriority.MEDIUM);
        a.setBeneficiariesAffected(f.getBeneficiaries());
        a.setEquipmentLossEtb(replacement.multiply(BigDecimal.valueOf(0.08 + rnd.nextDouble() * 0.1)).setScale(0, RoundingMode.HALF_UP));
        BigDecimal repair = BigDecimal.ZERO;
        for (String code : COMPONENTS.get(f.getSector())) {
            DamageSeverity cond = DamageSeverity.values()[Math.max(0, Math.min(4, sev.ordinal() + rnd.nextInt(3) - 1))];
            BigDecimal cost = cond == DamageSeverity.NONE ? BigDecimal.ZERO
                : replacement.multiply(BigDecimal.valueOf(cond.ordinal() * (0.015 + rnd.nextDouble() * 0.02))).setScale(0, RoundingMode.HALF_UP);
            AssessmentComponent ac = new AssessmentComponent();
            ac.setAssessment(a); ac.setComponent(code); ac.setCondition(cond); ac.setRepairCostEtb(cost);
            ac.setNote(cond == DamageSeverity.DESTROYED ? "Total loss" : null);
            a.getComponents().add(ac);
            repair = repair.add(cost);
        }
        a.setEstimatedRepairCostEtb(repair);
        a.setNotes(switch (sev) {
            case DESTROYED -> "Main block collapsed; remaining structures unsafe. Equipment and records lost. Site cleared of debris only partially.";
            case SEVERE -> "Roof largely gone, load-bearing walls cracked, utilities destroyed. Usable only after major rehabilitation.";
            default -> "Doors, windows and furniture looted; roof leaks in two blocks; water and power disconnected.";
        });
        a.setStatus(status); a.setSubmittedAt(at(on, 18)); a.setSubmittedByName(assessorName); a.setSubmittedByUserId(assessorUser);
        if (status == AssessmentStatus.VERIFIED) { a.setVerifiedAt(at(on.plusDays(2), 10)); a.setVerifiedByName(verifierName); a.setVerifiedByUserId(verifierUser); }
        DamageAssessment saved = assessments.saveAndFlush(a);
        jdbc.update("UPDATE assessment_task SET assessment_id = ?, submitted_at = ?, verified_at = ?, started_at = ? WHERE id = ?",
            saved.getId(), ts(at(on, 18)), status == AssessmentStatus.VERIFIED ? ts(at(on.plusDays(2), 10)) : null, ts(at(on, 7)), task);
        jdbc.update("UPDATE damage_assessment SET created_at = ? WHERE id = ?", ts(at(on, 18)), saved.getId());
        // A verified campaign finding is the facility's authoritative picture, even when earlier ad hoc visits are dated later.
        if (status == AssessmentStatus.VERIFIED) { DamageService.applyToFacility(f, saved); facilities.save(f); }
        return saved;
    }

    private void event(Long campaign, Long task, Long assessment, String kind, String actor, String note, LocalDate on) {
        jdbc.update("INSERT INTO assessment_event(campaign_id, task_id, assessment_id, kind, actor_name, note, occurred_at, actor_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, (SELECT user_id FROM field_agent WHERE full_name = ? LIMIT 1))",
            campaign, task, assessment, kind, actor, note, ts(at(on, 9 + rnd.nextInt(8))), actor);
    }

    private Long agent(String name) {
        List<Long> ids = jdbc.queryForList("SELECT id FROM field_agent WHERE full_name = ?", Long.class, name);
        return ids.isEmpty() ? null : ids.get(0);
    }

    private String name(Long agent) { return jdbc.queryForObject("SELECT full_name FROM field_agent WHERE id = ?", String.class, agent); }

    private Long userOf(Long agent) {
        List<Long> ids = jdbc.queryForList("SELECT user_id FROM field_agent WHERE id = ? AND user_id IS NOT NULL", Long.class, agent);
        return ids.isEmpty() ? null : ids.get(0);
    }

    private static Instant at(LocalDate d, int hour) {
        Instant t = d.atStartOfDay().toInstant(ZoneOffset.UTC).plus(hour, ChronoUnit.HOURS);
        return t.isAfter(Instant.now()) ? Instant.now().minus(1, ChronoUnit.HOURS) : t;
    }

    private static Timestamp ts(LocalDate d) { return Timestamp.from(at(d, 8)); }
    private static Timestamp ts(Instant i) { return i == null ? null : Timestamp.from(i); }
}
