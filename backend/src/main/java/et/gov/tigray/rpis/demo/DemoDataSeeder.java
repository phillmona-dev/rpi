package et.gov.tigray.rpis.demo;

import et.gov.tigray.rpis.alert.Alert;
import et.gov.tigray.rpis.alert.AlertActionEntity;
import et.gov.tigray.rpis.alert.AlertActionRepository;
import et.gov.tigray.rpis.alert.AlertRepository;
import et.gov.tigray.rpis.alert.AlertRuleEngine;
import et.gov.tigray.rpis.analytics.ScheduleBaseline;
import et.gov.tigray.rpis.common.Enums.*;
import et.gov.tigray.rpis.common.GeoPoint;
import et.gov.tigray.rpis.common.Sector;
import et.gov.tigray.rpis.config.RpisProperties;
import et.gov.tigray.rpis.damage.DamageAssessment;
import et.gov.tigray.rpis.damage.DamageAssessmentRepository;
import et.gov.tigray.rpis.damage.FieldDevice;
import et.gov.tigray.rpis.damage.FieldDeviceRepository;
import et.gov.tigray.rpis.facility.Facility;
import et.gov.tigray.rpis.facility.FacilityRepository;
import et.gov.tigray.rpis.geo.Wereda;
import et.gov.tigray.rpis.geo.WeredaRepository;
import et.gov.tigray.rpis.project.*;
import et.gov.tigray.rpis.security.AppUser;
import et.gov.tigray.rpis.security.Role;
import et.gov.tigray.rpis.security.RoleRepository;
import et.gov.tigray.rpis.security.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.annotation.Order;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.*;
import java.util.*;

/**
 * Seeds the demo profile with a coherent, realistic dataset (users, facilities, assessments, projects,
 * finance, progress history) and then runs the metrics + alert engines so every derived field is consistent.
 * Idempotent: skips when data already exists.
 */
@Slf4j
@Component
@Order(10)
@ConditionalOnProperty(prefix = "rpis.demo", name = "enabled", havingValue = "true")
@RequiredArgsConstructor
public class DemoDataSeeder implements ApplicationRunner {
    private final RpisProperties props;
    private final PasswordEncoder encoder;
    private final UserRepository users;
    private final RoleRepository roles;
    private final WeredaRepository weredas;
    private final FacilityRepository facilities;
    private final DamageAssessmentRepository assessments;
    private final FieldDeviceRepository devices;
    private final ProjectRepositories.Projects projects;
    private final ProjectRepositories.Milestones milestones;
    private final ProjectRepositories.ProgressLogs progressLogs;
    private final ProjectRepositories.BudgetLines budgetLines;
    private final ProjectRepositories.Disbursements disbursements;
    private final ProjectRepositories.Expenditures expenditures;
    private final ProjectRepositories.Risks risks;
    private final ProjectRepositories.Issues issues;
    private final ProjectRepositories.Documents documents;
    private final ProjectRepositories.ProjectFacilities projectFacilities;
    private final AlertRepository alerts;
    private final AlertActionRepository alertActions;
    private final AlertRuleEngine alertEngine;
    private final TransactionTemplate tx;
    private final org.springframework.jdbc.core.JdbcTemplate jdbcTemplate;

    private final Random rnd = new Random(20261019L);
    private static final LocalDate TODAY = LocalDate.now(ZoneOffset.UTC);

    @Override
    public void run(ApplicationArguments args) {
        if (users.count() == 0) tx.executeWithoutResult(s -> seedUsers());
        if (facilities.count() == 0) {
            tx.executeWithoutResult(s -> seedFacilities());
            tx.executeWithoutResult(s -> seedProjects());
            backdateTimestamps();
            int created = alertEngine.evaluateAll();
            tx.executeWithoutResult(s -> { backdateAlerts(); seedDecisions(); });
            log.info("Demo dataset ready: {} facilities, {} projects, {} alerts raised", facilities.count(), projects.count(), created);
        }
    }

    // ───────────────────────────── users ─────────────────────────────
    private void seedUsers() {
        String pw = encoder.encode(props.getDemo().getPassword());
        user("executive", "Chief Executive (Demo)", "Chief Executive, Economic Affairs & Reconstruction", "executive@rpis.demo", pw, null, "EXECUTIVE");
        user("edu.head", "Bureau Head – Education (Demo)", "Head, Tigray Education Bureau", "edu.head@rpis.demo", pw, Sector.EDUCATION, "SECTOR_HEAD");
        user("health.head", "Bureau Head – Health (Demo)", "Head, Tigray Health Bureau", "health.head@rpis.demo", pw, Sector.HEALTH, "SECTOR_HEAD");
        user("industry.head", "Bureau Head – Industry (Demo)", "Head, Tigray Bureau of Industry", "industry.head@rpis.demo", pw, Sector.MANUFACTURING, "SECTOR_HEAD");
        user("agri.head", "Bureau Head – Agriculture (Demo)", "Head, Tigray Bureau of Agriculture", "agri.head@rpis.demo", pw, Sector.AGRICULTURE, "SECTOR_HEAD");
        user("analyst", "Planning Analyst (Demo)", "Senior M&E Analyst, Reconstruction PMO", "analyst@rpis.demo", pw, null, "ANALYST");
        user("pmo.observer", "Federal Observer (Demo)", "Director, PM Office Delivery Unit", "pmo@rpis.demo", pw, null, "PMO_FEDERAL");
        user("field.officer", "Field Officer (Demo)", "Damage Assessment Officer", "field@rpis.demo", pw, null, "FIELD_OFFICER");
        user("site.manager", "Site Manager (Demo)", "Resident Engineer", "site@rpis.demo", pw, null, "SITE_MANAGER");
        user("admin", "System Administrator (Demo)", "RPIS Platform Administrator", "admin@rpis.demo", pw, null, "ADMIN");
        log.info("Seeded demo users (password from RPIS_DEMO_PASSWORD)");
    }

    private void user(String username, String name, String title, String email, String hash, Sector scope, String... roleCodes) {
        AppUser u = new AppUser();
        u.setUsername(username); u.setFullName(name); u.setTitle(title); u.setEmail(email); u.setPasswordHash(hash); u.setSectorScope(scope);
        Set<Role> rs = new HashSet<>();
        for (String c : roleCodes) rs.add(roles.findByCode(c).orElseThrow());
        u.setRoles(rs);
        users.save(u);
    }

    // ─────────────────────────── facilities ───────────────────────────
    private void seedFacilities() {
        Map<String, Wereda> byCode = new HashMap<>();
        weredas.findAllByOrderByNameEnAsc().forEach(w -> byCode.put(w.getCode(), w));
        FieldDevice dev = new FieldDevice();
        dev.setDeviceUid("demo-tablet-01"); dev.setLabel("Field tablet 01 (demo)"); dev.setPlatform("android"); dev.setAppVersion("0.0.0-contract");
        dev = devices.save(dev);

        Map<Sector, Integer> seq = new EnumMap<>(Sector.class);
        for (DemoCatalog.Fac spec : DemoCatalog.FACILITIES) {
            Wereda w = byCode.get(spec.wereda());
            if (w == null) throw new IllegalStateException("Unknown wereda code " + spec.wereda());
            Facility f = new Facility();
            int n = seq.merge(spec.type().sector, 1, Integer::sum);
            f.setCode(spec.type().sector.name().substring(0, 3) + "-" + String.format("%03d", n));
            f.setSector(spec.type().sector); f.setFacilityType(spec.type()); f.setName(spec.name()); f.setWereda(w);
            f.setLocation(GeoPoint.jts(w.getCentroid().getY() + jitter(0.025), w.getCentroid().getX() + jitter(0.025)));
            f.setPreCrisisCapacity(spec.capacity()); f.setCapacityUnit(spec.unit()); f.setBeneficiaries(spec.beneficiaries());
            f = facilities.save(f);

            DamageSeverity sev = DamageSeverity.values()[spec.severity()];
            int score = switch (sev) { case NONE -> 3 + rnd.nextInt(8); case MINOR -> 12 + rnd.nextInt(14); case MODERATE -> 30 + rnd.nextInt(22);
                                       case SEVERE -> 55 + rnd.nextInt(25); case DESTROYED -> 82 + rnd.nextInt(18); };
            BigDecimal unit = unitReplacementCost(spec.type());
            BigDecimal replacement = unit.multiply(BigDecimal.valueOf(score / 100.0)).setScale(0, RoundingMode.HALF_UP);
            LocalDate assessed = LocalDate.of(2025, 11, 1).plusDays(rnd.nextInt(300));
            DamageAssessment a = assessment(f, dev, assessed, sev, score, replacement);
            // A second, more recent re-assessment for a third of facilities (shows history)
            if (rnd.nextInt(3) == 0) {
                LocalDate again = assessed.plusDays(60 + rnd.nextInt(90));
                if (again.isAfter(TODAY.minusDays(1))) again = TODAY.minusDays(1 + rnd.nextInt(20));
                DamageAssessment a2 = assessment(f, dev, again, sev, Math.max(0, score - rnd.nextInt(6)), replacement);
                a = a2.getAssessedOn().isAfter(a.getAssessedOn()) ? a2 : a;
            }
            f.setLatestAssessmentId(a.getId()); f.setLatestSeverity(a.getSeverity()); f.setReplacementEstimateEtb(a.getEstimatedReplacementCostEtb());
            short cap = a.getFunctionalCapacityPct();
            f.setOperationalStatus(cap == 0 ? OperationalStatus.NON_FUNCTIONAL : cap < 80 ? OperationalStatus.PARTIALLY_FUNCTIONAL : OperationalStatus.FUNCTIONAL);
            facilities.save(f);
        }
        log.info("Seeded {} facilities", facilities.count());
    }

    private DamageAssessment assessment(Facility f, FieldDevice dev, LocalDate date, DamageSeverity sev, int score, BigDecimal replacement) {
        DamageAssessment a = new DamageAssessment();
        a.setFacility(f); a.setDevice(dev); a.setClientReference(UUID.nameUUIDFromBytes((f.getCode() + date).getBytes()).toString());
        a.setAssessedOn(date); a.setAssessorName(pick(DemoCatalog.ASSESSORS)); a.setSeverity(sev);
        a.setStructuralImpactScore((short) score);
        a.setInventoryLossPct((short) Math.min(100, score + rnd.nextInt(15)));
        a.setFunctionalCapacityPct((short) Math.max(0, 100 - score - rnd.nextInt(10)));
        a.setEstimatedReplacementCostEtb(replacement);
        a.setEstimatedRepairCostEtb(replacement.multiply(BigDecimal.valueOf(0.55 + rnd.nextDouble() * 0.3)).setScale(0, RoundingMode.HALF_UP));
        a.setNotes(sev.ordinal() >= 3 ? "Roof and load-bearing walls compromised; equipment looted or destroyed. Not safe for occupation."
                 : sev == DamageSeverity.MODERATE ? "Partial roof loss, broken doors/windows, electrical and water systems non-functional." : "Superficial damage; furniture and records missing.");
        a.setLocation(f.getLocation()); a.setSource(DataSource.FIELD_APP);
        Instant synced = date.plusDays(1 + rnd.nextInt(9)).atStartOfDay().toInstant(ZoneOffset.UTC);
        a.setSyncedAt(synced.isAfter(Instant.now()) ? Instant.now().minusSeconds(3600L * (1 + rnd.nextInt(20))) : synced);
        a.setSubmittedAt(a.getSyncedAt()); a.setVerifiedAt(a.getSyncedAt()); a.setVerifiedByName("Recorded before verification workflow");
        return assessments.save(a);
    }

    private BigDecimal unitReplacementCost(FacilityType t) {
        double m = switch (t) {
            case UNIVERSITY -> 1800; case REFERRAL_HOSPITAL -> 2400; case GENERAL_HOSPITAL -> 900; case PRIMARY_HOSPITAL -> 320; case HEALTH_CENTER -> 90; case HEALTH_POST -> 14;
            case SECONDARY_SCHOOL -> 160; case PRIMARY_SCHOOL -> 55; case TVET_COLLEGE -> 260;
            case INDUSTRIAL_PARK -> 2200; case FACTORY -> 1500; case AGRO_PROCESSING_PLANT -> 520; case WAREHOUSE -> 260;
            case IRRIGATION_SCHEME -> 700; case VETERINARY_CLINIC -> 28; case SEED_MULTIPLICATION_CENTER -> 95; case FARMERS_TRAINING_CENTER -> 32; case AGRICULTURAL_RESEARCH_CENTER -> 180;
        };
        return BigDecimal.valueOf(m * 1_000_000 * (0.85 + rnd.nextDouble() * 0.3));
    }

    // ───────────────────────────── projects ─────────────────────────────
    private void seedProjects() {
        Map<String, Facility> byName = new HashMap<>();
        facilities.findAll().forEach(f -> byName.put(f.getName(), f));
        Map<Sector, Integer> seq = new EnumMap<>(Sector.class);
        for (DemoCatalog.Proj spec : DemoCatalog.PROJECTS) {
            Facility f = byName.get(spec.facility());
            if (f == null) throw new IllegalStateException("Unknown facility " + spec.facility());
            Facility fw = facilities.findWithWeredaById(f.getId()).orElseThrow();
            Project p = new Project();
            int n = seq.merge(fw.getSector(), 1, Integer::sum);
            p.setCode("RP-" + fw.getSector().name().substring(0, 3) + "-" + String.format("%03d", n));
            p.setName(spec.name()); p.setSector(fw.getSector()); p.setWereda(fw.getWereda()); p.setStatus(spec.status());
            p.setContractorName(spec.contractor()); p.setImplementingAgency(agency(fw.getSector()));
            p.setDescription(spec.name() + ". Scope derived from the field damage assessment of " + fw.getName() + " (impact score " +
                assessments.findById(fw.getLatestAssessmentId()).map(a -> String.valueOf(a.getStructuralImpactScore())).orElse("n/a") + "/100). " +
                "Supervised by " + agency(fw.getSector()) + " with the Regional Reconstruction PMO.");
            LocalDate start = LocalDate.parse(spec.start() + "-01").plusDays(rnd.nextInt(20));
            LocalDate end = start.plusMonths(spec.months());
            p.setPlannedStart(start); p.setPlannedEnd(end);
            p.setTotalBudgetEtb(BigDecimal.valueOf(spec.budgetM() * 1_000_000).setScale(2, RoundingMode.HALF_UP));
            p.setFundingSource(spec.funding()); p.setBeneficiaries(fw.getBeneficiaries());
            p.setLocation(fw.getLocation());
            p = projects.save(p);
            projectFacilities.save(new ProjectFacility(p, fw));

            List<DemoCatalog.MilestoneTemplate> tpl = fw.getFacilityType() == FacilityType.IRRIGATION_SCHEME ? DemoCatalog.IRRIGATION
                : fw.getSector() == Sector.MANUFACTURING ? DemoCatalog.INDUSTRIAL : DemoCatalog.BUILDING;
            long days = Duration.between(start.atStartOfDay(), end.atStartOfDay()).toDays();
            List<Milestone> ms = new ArrayList<>();
            short i = 1;
            for (var t : tpl) {
                Milestone m = new Milestone();
                m.setProject(p); m.setSequence(i++); m.setName(t.name()); m.setWeightPct(BigDecimal.valueOf(t.weight()));
                m.setPlannedDate(start.plusDays(Math.round(days * t.at())));
                ms.add(m);
            }
            milestones.saveAll(ms);
            budget(p);

            if (spec.status() == ProjectStatus.ACTIVE || spec.status() == ProjectStatus.COMPLETED || spec.status() == ProjectStatus.SUSPENDED) {
                progressHistory(p, ms, spec);
            }
            risksAndIssues(p, spec);
            docs(p, spec);
            projects.save(p);
        }
        log.info("Seeded {} projects", projects.count());
    }

    private void budget(Project p) {
        BigDecimal b = p.getTotalBudgetEtb();
        double[] split = {0.72, 0.10, 0.06, 0.07, 0.05};
        BudgetCategory[] cats = BudgetCategory.values();
        for (int i = 0; i < cats.length; i++) {
            BudgetLine l = new BudgetLine(); l.setProject(p); l.setCategory(cats[i]); l.setAllocatedEtb(b.multiply(BigDecimal.valueOf(split[i])).setScale(2, RoundingMode.HALF_UP));
            budgetLines.save(l);
        }
    }

    private void progressHistory(Project p, List<Milestone> ms, DemoCatalog.Proj spec) {
        LocalDate start = p.getPlannedStart().plusDays(rnd.nextInt(10));
        p.setActualStart(start);
        LocalDate lastReport = spec.status() == ProjectStatus.COMPLETED ? null : TODAY.minusDays(spec.reportLagDays());
        var baseline = ProjectMetricsService_baseline(ms);
        double physical = 0;
        LocalDate d = start;
        LocalDate completion = null;
        List<ProgressLog> logs = new ArrayList<>();
        String engineer = pick(DemoCatalog.SITE_ENGINEERS);
        LocalDate stopAt = lastReport == null ? TODAY : lastReport;
        while (!d.isAfter(stopAt)) {
            double planned = ScheduleBaseline.plannedPct(p.getPlannedStart(), p.getPlannedEnd(), baseline, d);
            double target = Math.min(100, planned * spec.perf() + (rnd.nextDouble() - 0.5) * 2.5);
            physical = Math.max(physical, Math.min(100, target));
            if (spec.status() == ProjectStatus.SUSPENDED && d.isAfter(TODAY.minusDays(spec.reportLagDays()))) break;
            ProgressLog l = new ProgressLog();
            l.setProject(p); l.setLogDate(d); l.setPhysicalProgressPct(bd(physical)); l.setPlannedProgressPct(bd(planned));
            l.setWorkforceCount(20 + rnd.nextInt(120)); l.setReportedBy(engineer); l.setSource(rnd.nextInt(4) == 0 ? DataSource.WEB : DataSource.SITE_APP);
            if (rnd.nextInt(6) == 0) l.setNotes(pick(new String[]{"Rebar delivery received", "Rain stopped works for 2 days", "Additional crew mobilised", "Awaiting IPC payment", "Inspection by bureau engineers", "Formwork for level 2 complete"}));
            logs.add(l);
            if (physical >= 99.5 && completion == null) { completion = d; physical = 100; l.setPhysicalProgressPct(bd(100)); break; }
            d = d.plusDays(7);
        }
        if (spec.status() == ProjectStatus.COMPLETED && completion == null) {
            // force completion within planned duration
            completion = p.getPlannedEnd().minusDays(rnd.nextInt(20));
            ProgressLog l = new ProgressLog(); l.setProject(p); l.setLogDate(completion); l.setPhysicalProgressPct(bd(100)); l.setPlannedProgressPct(bd(100)); l.setReportedBy(engineer); l.setSource(DataSource.WEB);
            logs.add(l); physical = 100;
        }
        progressLogs.saveAll(logs);
        ProgressLog last = logs.get(logs.size() - 1);
        p.setPhysicalProgressPct(last.getPhysicalProgressPct());
        p.setLastProgressReportAt(last.getLogDate().atTime(9 + rnd.nextInt(8), rnd.nextInt(60)).toInstant(ZoneOffset.UTC));
        if (spec.status() == ProjectStatus.COMPLETED) { p.setActualEnd(completion); p.setPhysicalProgressPct(bd(100)); }

        // milestone actual dates where physical crossed cumulative weight
        double cum = 0;
        for (Milestone m : ms) {
            cum += m.getWeightPct().doubleValue();
            final double threshold = cum - 0.5;
            logs.stream().filter(l -> l.getPhysicalProgressPct().doubleValue() >= threshold).findFirst().ifPresent(l -> m.setActualDate(l.getLogDate()));
        }
        milestones.saveAll(ms);

        // disbursement tranches 20/30/30/20 at 0/30/60/100 % progress
        double[] share = {0.20, 0.30, 0.30, 0.20}; double[] trigger = {0, 30, 60, 100};
        boolean lagScenario = spec.reportLagDays() >= 20 || spec.perf() < 0.6;
        for (int t = 0; t < 4; t++) {
            Disbursement dis = new Disbursement(); dis.setProject(p); dis.setTrancheNo((short) (t + 1)); dis.setFundingSource(p.getFundingSource());
            dis.setAmountEtb(p.getTotalBudgetEtb().multiply(BigDecimal.valueOf(share[t])).setScale(2, RoundingMode.HALF_UP));
            LocalDate plannedDate = t == 0 ? start.minusDays(14) : dateWhenPlannedReached(p, baseline, trigger[t]);
            dis.setPlannedDate(plannedDate);
            final double trig = trigger[t];
            Optional<LocalDate> reached = logs.stream().filter(l -> l.getPhysicalProgressPct().doubleValue() >= trig).map(ProgressLog::getLogDate).findFirst();
            boolean release = t == 0 || (reached.isPresent() && !(lagScenario && t >= 2));
            if (t == 1 && lagScenario && spec.perf() < 0.5) release = false;
            if (release) { dis.setReleasedDate((t == 0 ? start.minusDays(3) : reached.get()).plusDays(rnd.nextInt(25))); dis.setStatus(DisbursementStatus.RELEASED); }
            else dis.setStatus(plannedDate.isBefore(TODAY) ? (rnd.nextBoolean() ? DisbursementStatus.REQUESTED : DisbursementStatus.APPROVED) : DisbursementStatus.PLANNED);
            if (dis.getReleasedDate() != null && dis.getReleasedDate().isAfter(TODAY)) { dis.setReleasedDate(null); dis.setStatus(DisbursementStatus.APPROVED); }
            disbursements.save(dis);
        }

        // monthly certified expenditure = earned value × cost factor
        LocalDate m = start.withDayOfMonth(1);
        BigDecimal cumulative = BigDecimal.ZERO;
        while (m.isBefore(TODAY.withDayOfMonth(1))) {
            LocalDate mEnd = m.plusMonths(1).minusDays(1);
            final LocalDate me = mEnd;
            double physAtMonthEnd = logs.stream().filter(l -> !l.getLogDate().isAfter(me)).mapToDouble(l -> l.getPhysicalProgressPct().doubleValue()).max().orElse(0);
            BigDecimal target = p.getTotalBudgetEtb().multiply(BigDecimal.valueOf(physAtMonthEnd / 100.0 * spec.cost())).setScale(2, RoundingMode.HALF_UP);
            BigDecimal amount = target.subtract(cumulative);
            if (amount.signum() > 0) {
                Expenditure e = new Expenditure(); e.setProject(p); e.setPeriodStart(m); e.setPeriodEnd(mEnd); e.setAmountEtb(amount);
                e.setCertifiedBy("Resident Engineer"); e.setCertifiedOn(mEnd.plusDays(10));
                expenditures.save(e); cumulative = target;
            }
            m = m.plusMonths(1);
        }
    }

    private LocalDate dateWhenPlannedReached(Project p, List<ScheduleBaseline.Point> baseline, double pct) {
        LocalDate d = p.getPlannedStart();
        while (d.isBefore(p.getPlannedEnd()) && ScheduleBaseline.plannedPct(p.getPlannedStart(), p.getPlannedEnd(), baseline, d) < pct) d = d.plusDays(1);
        return d;
    }

    private void risksAndIssues(Project p, DemoCatalog.Proj spec) {
        int nRisks = spec.status() == ProjectStatus.ACTIVE ? 1 + rnd.nextInt(3) : rnd.nextInt(2);
        List<DemoCatalog.RiskTemplate> pool = new ArrayList<>(DemoCatalog.RISKS); Collections.shuffle(pool, rnd);
        for (int i = 0; i < nRisks; i++) {
            var t = pool.get(i);
            ProjectRisk r = new ProjectRisk(); r.setProject(p); r.setTitle(t.title()); r.setCategory(t.category());
            r.setLikelihood(Level.valueOf(t.likelihood())); r.setImpact(Level.valueOf(t.impact())); r.setMitigation(t.mitigation());
            r.setOwner(p.getContractorName() != null && rnd.nextBoolean() ? "Contractor PM" : "Bureau project officer");
            r.setStatus(rnd.nextInt(4) == 0 ? RiskStatus.MITIGATING : RiskStatus.OPEN); r.setRaisedOn(p.getPlannedStart().plusDays(rnd.nextInt(90)));
            risks.save(r);
        }
        if (spec.status() == ProjectStatus.ACTIVE && (spec.perf() < 0.85 || rnd.nextInt(3) == 0)) {
            var t = pick(DemoCatalog.ISSUES.toArray(DemoCatalog.IssueTemplate[]::new));
            ProjectIssue is = new ProjectIssue(); is.setProject(p); is.setTitle(t.title()); is.setDescription(t.description()); is.setSeverity(Level.valueOf(t.severity()));
            is.setStatus(rnd.nextBoolean() ? IssueStatus.OPEN : IssueStatus.IN_PROGRESS); is.setRaisedOn(TODAY.minusDays(5 + rnd.nextInt(60))); is.setOwner("Resident Engineer");
            issues.save(is);
        }
    }

    private void docs(Project p, DemoCatalog.Proj spec) {
        String base = "/demo-media/" + p.getCode().toLowerCase() + "/";
        doc(p, DocumentType.CONTRACT, "Signed works contract", base + "contract.pdf", "application/pdf", 2_400_000L, p.getPlannedStart().minusDays(20));
        doc(p, DocumentType.DESIGN, "Architectural & structural drawings (Rev B)", base + "drawings-rev-b.pdf", "application/pdf", 18_900_000L, p.getPlannedStart().minusDays(12));
        if (spec.status() == ProjectStatus.ACTIVE || spec.status() == ProjectStatus.COMPLETED) {
            doc(p, DocumentType.PROGRESS_PHOTO, "Site photos – latest fortnight", base + "photos-latest.zip", "application/zip", 64_000_000L, TODAY.minusDays(spec.reportLagDays() + 1));
            doc(p, DocumentType.SITE_VIDEO, "Drone walkthrough", base + "drone-walkthrough.mp4", "video/mp4", 210_000_000L, TODAY.minusDays(spec.reportLagDays() + 3));
            doc(p, DocumentType.INSPECTION_REPORT, "Bureau inspection report", base + "inspection.pdf", "application/pdf", 1_200_000L, TODAY.minusDays(spec.reportLagDays() + 10));
        }
    }

    private void doc(Project p, DocumentType type, String title, String url, String mt, long size, LocalDate at) {
        ProjectDocument d = new ProjectDocument(); d.setProject(p); d.setDocType(type); d.setTitle(title); d.setUrl(url); d.setMediaType(mt); d.setSizeBytes(size);
        d.setUploadedBy(pick(DemoCatalog.SITE_ENGINEERS)); d.setUploadedAt(at.atTime(10, 0).toInstant(ZoneOffset.UTC));
        documents.save(d);
    }

    /** Pre-recorded executive decisions so the queue shows workflow history. */
    private void seedDecisions() {
        AppUser exec = users.findByUsernameIgnoreCase("executive").orElseThrow();
        AppUser analyst = users.findByUsernameIgnoreCase("analyst").orElseThrow();
        List<Alert> open = alerts.findAllOpen();
        int i = 0;
        for (Alert a : open) {
            if (a.getSeverity() != AlertSeverity.CRITICAL && a.getSeverity() != AlertSeverity.HIGH) continue;
            if (i % 3 == 0) {
                a.setStatus(AlertStatus.ACKNOWLEDGED); a.setAcknowledgedAt(Instant.now().minus(Duration.ofHours(6 + rnd.nextInt(40))));
                action(a, AlertAction.ACKNOWLEDGE, "Reviewed in the Monday reconstruction briefing.", exec, a.getAcknowledgedAt());
            } else if (i % 3 == 1) {
                a.setStatus(AlertStatus.ASSIGNED); a.setAcknowledgedAt(Instant.now().minus(Duration.ofHours(20 + rnd.nextInt(60)))); a.setAssignedToUserId(analyst.getId());
                action(a, AlertAction.ACKNOWLEDGE, null, exec, a.getAcknowledgedAt());
                action(a, AlertAction.ASSIGN, "Prepare a recovery plan with the contractor and report back within 7 days.", exec, a.getAcknowledgedAt().plusSeconds(600));
            }
            alerts.save(a);
            i++;
            if (i >= 9) break;
        }
    }

    private void action(Alert a, AlertAction act, String note, AppUser actor, Instant at) {
        AlertActionEntity e = new AlertActionEntity(); e.setAlert(a); e.setAction(act); e.setNote(note); e.setActorUserId(actor.getId()); e.setActorName(actor.getFullName()); e.setCreatedAt(at);
        alertActions.save(e);
    }

    /** Demo realism: created_at must reflect when field data actually arrived, not when the seeder ran. */
    private void backdateTimestamps() {
        jdbcTemplate.update("UPDATE progress_log SET created_at = (log_date + time '09:00') AT TIME ZONE 'UTC' + (random() * interval '8 hours')");
        jdbcTemplate.update("UPDATE damage_assessment SET created_at = coalesce(synced_at, (assessed_on + time '12:00') AT TIME ZONE 'UTC')");
        jdbcTemplate.update("UPDATE alert_action SET created_at = created_at");
    }
    private void backdateAlerts() {
        jdbcTemplate.update("UPDATE alert SET triggered_at = now() - (random() * interval '21 days') - interval '2 hours' WHERE status IN ('OPEN','ACKNOWLEDGED','ASSIGNED')");
    }

    // ───────────────────────────── helpers ─────────────────────────────
    private static List<ScheduleBaseline.Point> ProjectMetricsService_baseline(List<Milestone> ms) {
        List<ScheduleBaseline.Point> pts = new ArrayList<>(); double cum = 0;
        for (Milestone m : ms) { cum += m.getWeightPct().doubleValue(); pts.add(new ScheduleBaseline.Point(m.getPlannedDate(), Math.min(100, cum))); }
        return pts;
    }
    private static String agency(Sector s) {
        return switch (s) { case EDUCATION -> "Tigray Education Bureau"; case HEALTH -> "Tigray Health Bureau"; case MANUFACTURING -> "Tigray Bureau of Industry"; case AGRICULTURE -> "Tigray Bureau of Agriculture & Rural Development"; };
    }
    private double jitter(double r) { return (rnd.nextDouble() - 0.5) * 2 * r; }
    private <T> T pick(T[] arr) { return arr[rnd.nextInt(arr.length)]; }
    private static BigDecimal bd(double v) { return BigDecimal.valueOf(v).setScale(2, RoundingMode.HALF_UP); }
}
