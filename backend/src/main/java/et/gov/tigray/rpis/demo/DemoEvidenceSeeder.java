package et.gov.tigray.rpis.demo;

import et.gov.tigray.rpis.alert.AlertRuleEngine;
import et.gov.tigray.rpis.analytics.InsightEngine;
import et.gov.tigray.rpis.common.Enums.*;
import et.gov.tigray.rpis.common.GeoPoint;
import et.gov.tigray.rpis.common.Sector;
import et.gov.tigray.rpis.damage.*;
import et.gov.tigray.rpis.evidence.EvidenceMedia;
import et.gov.tigray.rpis.evidence.EvidenceRepositories;
import et.gov.tigray.rpis.evidence.FieldInspection;
import et.gov.tigray.rpis.facility.Facility;
import et.gov.tigray.rpis.facility.FacilityRepository;
import et.gov.tigray.rpis.project.*;
import et.gov.tigray.rpis.security.AppUser;
import et.gov.tigray.rpis.security.UserRepository;
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
import java.time.*;
import java.util.*;

/**
 * Demo profile · V3 data: responsible organisations, lifecycle stage history, field inspections with geotagged
 * placeholder media, assessment photos, then alert + insight evaluation. Idempotent (skips when inspections exist).
 * Runs after DemoDataSeeder so it also upgrades databases seeded before V3.
 */
@Slf4j
@Component
@Order(20)
@ConditionalOnProperty(prefix = "rpis.demo", name = "enabled", havingValue = "true")
@RequiredArgsConstructor
public class DemoEvidenceSeeder implements ApplicationRunner {
    private final ProjectRepositories.Projects projects;
    private final ProjectRepositories.Organizations organizations;
    private final ProjectRepositories.ProjectOrganizations projectOrganizations;
    private final ProjectRepositories.StageEvents stageEvents;
    private final ProjectRepositories.ProjectFacilities projectFacilities;
    private final FacilityRepository facilities;
    private final DamageAssessmentRepository assessments;
    private final FieldDeviceRepository devices;
    private final EvidenceRepositories.Inspections inspections;
    private final UserRepository users;
    private final AlertRuleEngine alertEngine;
    private final InsightEngine insightEngine;
    private final TransactionTemplate tx;
    private final JdbcTemplate jdbc;

    private final Random rnd = new Random(20261019L);
    private static final LocalDate TODAY = LocalDate.now(ZoneOffset.UTC);
    private static final String[] PHOTOS = {"site-overview", "roof-structure", "foundation-works", "wall-framing", "classroom-interior", "equipment-damage", "drainage-canal", "finishing-works"};
    private static final String[] CAPTIONS = {"Site overview from access road", "Roof structure after repair", "Foundation and column works", "Wall framing, block 2", "Interior finishing", "Damaged equipment awaiting salvage", "Canal lining progress", "Finishing works and painting"};

    @Override
    public void run(ApplicationArguments args) {
        if (projects.count() == 0 || inspections.count() > 0) return;
        tx.executeWithoutResult(s -> seedOrganizationsAndStages());
        tx.executeWithoutResult(s -> seedInspections());
        tx.executeWithoutResult(s -> seedAssessmentPhotos());
        jdbc.update("UPDATE field_inspection SET created_at = coalesce(started_at, (visited_on + time '10:00') AT TIME ZONE 'UTC')");
        jdbc.update("UPDATE evidence_media SET created_at = coalesce(captured_at, now())");
        int alerts = alertEngine.evaluateAll();
        int insights = insightEngine.evaluateAll();
        log.info("Demo V3 data ready: {} inspections, {} insights, {} new alerts", inspections.count(), insights, alerts);
    }

    // ── organisations & lifecycle ─────────────────────────────────────────
    private void seedOrganizationsAndStages() {
        AppUser exec = users.findByUsernameIgnoreCase("executive").orElseThrow();
        AppUser analyst = users.findByUsernameIgnoreCase("analyst").orElseThrow();
        Organization pmo = org("ORG-PMO", "Regional Reconstruction PMO", OrganizationType.GOVERNMENT_BUREAU, "pmo@tigray.gov.et");
        for (Project p : projects.findAll()) {
            Project pw = projects.findWithWeredaById(p.getId()).orElseThrow();
            if (pw.getImplementingAgency() != null) link(pw, org(code("BUR", pw.getImplementingAgency()), pw.getImplementingAgency(), OrganizationType.GOVERNMENT_BUREAU, null), OrganizationRole.IMPLEMENTING_AGENCY);
            if (pw.getContractorName() != null) link(pw, org(code("CTR", pw.getContractorName()), pw.getContractorName(), OrganizationType.CONTRACTOR, null), OrganizationRole.CONTRACTOR);
            link(pw, org(code("FND", funder(pw.getFundingSource())), funder(pw.getFundingSource()), funderType(pw.getFundingSource()), null), OrganizationRole.FUNDER);
            link(pw, pmo, OrganizationRole.OVERSIGHT);
            if (pw.getStatus() == ProjectStatus.ACTIVE || pw.getStatus() == ProjectStatus.COMPLETED) link(pw, org("CON-TDC", "Tigray Design & Supervision Works Enterprise", OrganizationType.CONSULTANT, null), OrganizationRole.SUPERVISING_CONSULTANT);

            // governance dates and stage history consistent with the operational status
            LocalDate start = pw.getPlannedStart();
            LocalDate planning = start.minusDays(150 + rnd.nextInt(60)), approval = start.minusDays(95 + rnd.nextInt(30)), funding = start.minusDays(60 + rnd.nextInt(20)), procurement = start.minusDays(35 + rnd.nextInt(15));
            String ref = "RRC/" + approval.getYear() + "/" + String.format("%03d", 10 + rnd.nextInt(400));
            List<Object[]> steps = new ArrayList<>();
            steps.add(new Object[]{null, LifecycleStage.PLANNING, planning, analyst, "Concept note and damage-based scope registered.", null});
            if (pw.getStatus() != ProjectStatus.PLANNED || rnd.nextBoolean()) steps.add(new Object[]{LifecycleStage.PLANNING, LifecycleStage.APPROVAL, approval, exec, "Approved in the Reconstruction Council session.", ref});
            if (pw.getStatus() != ProjectStatus.PLANNED) { pw.setApprovedOn(approval); pw.setApprovalReference(ref); steps.add(new Object[]{LifecycleStage.APPROVAL, LifecycleStage.FUNDING, funding, exec, "Funding secured from " + funder(pw.getFundingSource()) + ".", null}); pw.setFundingSecuredOn(funding); }
            if (pw.getStatus() == ProjectStatus.PROCUREMENT || pw.getStatus() == ProjectStatus.ACTIVE || pw.getStatus() == ProjectStatus.SUSPENDED || pw.getStatus() == ProjectStatus.COMPLETED) {
                steps.add(new Object[]{LifecycleStage.FUNDING, LifecycleStage.PROCUREMENT, procurement, analyst, "Tender launched (" + (rnd.nextBoolean() ? "national competitive bidding" : "restricted tender") + ").", null});
                pw.setProcurementMethod(rnd.nextBoolean() ? "NCB" : "RESTRICTED");
            }
            if (pw.getStatus() == ProjectStatus.ACTIVE || pw.getStatus() == ProjectStatus.SUSPENDED || pw.getStatus() == ProjectStatus.COMPLETED) {
                LocalDate signed = start.minusDays(3 + rnd.nextInt(10));
                pw.setContractSignedOn(signed);
                pw.setContractValueEtb(pw.getTotalBudgetEtb().multiply(BigDecimal.valueOf(0.82 + rnd.nextDouble() * 0.1)).setScale(2, RoundingMode.HALF_UP));
                steps.add(new Object[]{LifecycleStage.PROCUREMENT, LifecycleStage.IMPLEMENTATION, signed, exec, "Contract signed with " + pw.getContractorName() + ".", "CTR/" + signed.getYear() + "/" + String.format("%03d", rnd.nextInt(900) + 100)});
                if (pw.getStatus() == ProjectStatus.ACTIVE && pw.getPhysicalProgressPct().doubleValue() > 50 && rnd.nextInt(3) == 0) { steps.add(new Object[]{LifecycleStage.IMPLEMENTATION, LifecycleStage.MONITORING, TODAY.minusDays(20 + rnd.nextInt(40)), analyst, "Works substantially complete; monitoring commissioning and defects.", null}); pw.setLifecycleStage(LifecycleStage.MONITORING); }
            }
            if (pw.getStatus() == ProjectStatus.COMPLETED && pw.getActualEnd() != null) {
                pw.setHandoverOn(pw.getActualEnd()); pw.setDefectsLiabilityEnd(pw.getActualEnd().plusYears(1));
                steps.add(new Object[]{pw.getLifecycleStage() == LifecycleStage.MONITORING ? LifecycleStage.MONITORING : LifecycleStage.IMPLEMENTATION, LifecycleStage.COMPLETION, pw.getActualEnd(), exec, "Handover certificate signed; defects liability period started.", "HO/" + pw.getActualEnd().getYear() + "/" + String.format("%03d", rnd.nextInt(900) + 100)});
            }
            if (pw.getStatus() == ProjectStatus.CANCELLED) steps.add(new Object[]{LifecycleStage.FUNDING, LifecycleStage.CANCELLED, start.minusDays(10), exec, "Cancelled: beneficiary institution relocated; funds reallocated.", ref});
            for (Object[] st : steps) {
                ProjectStageEvent e = new ProjectStageEvent();
                e.setProject(pw); e.setFromStage((LifecycleStage) st[0]); e.setToStage((LifecycleStage) st[1]);
                e.setOccurredAt(((LocalDate) st[2]).atTime(9 + rnd.nextInt(7), rnd.nextInt(60)).toInstant(ZoneOffset.UTC));
                AppUser actor = (AppUser) st[3]; e.setActorUserId(actor.getId()); e.setActorName(actor.getFullName()); e.setNote((String) st[4]); e.setReference((String) st[5]);
                stageEvents.save(e);
            }
            projects.save(pw);
        }
        log.info("Seeded organisations and lifecycle history");
    }

    // ── inspections & media ───────────────────────────────────────────────
    private void seedInspections() {
        FieldDevice dev = devices.findByDeviceUid("demo-tablet-01").orElseGet(() -> { FieldDevice d = new FieldDevice(); d.setDeviceUid("demo-tablet-01"); d.setLabel("Field tablet 01 (demo)"); d.setPlatform("android"); return devices.save(d); });
        AppUser analyst = users.findByUsernameIgnoreCase("analyst").orElseThrow();
        AppUser exec = users.findByUsernameIgnoreCase("executive").orElseThrow();
        AppUser[] verifiers = {analyst, analyst, exec};
        int count = 0;
        for (Project p0 : projects.findByStatusIn(List.of(ProjectStatus.ACTIVE, ProjectStatus.SUSPENDED, ProjectStatus.COMPLETED))) {
            Project p = projects.findWithWeredaById(p0.getId()).orElseThrow();
            if (p.getLocation() == null || p.getActualStart() == null) continue;
            int n = p.getStatus() == ProjectStatus.COMPLETED ? 2 : 1 + rnd.nextInt(4);
            double perf = p.getPlannedProgressPct().signum() == 0 ? 1 : p.getPhysicalProgressPct().doubleValue() / Math.max(1, p.getPlannedProgressPct().doubleValue());
            Instant lastVerified = null;
            for (int k = 0; k < n; k++) {
                LocalDate visited = TODAY.minusDays(5 + rnd.nextInt(Math.max(10, (int) Math.min(150, Duration.between(p.getActualStart().atStartOfDay(), TODAY.atStartOfDay()).toDays()))));
                if (p.getStatus() == ProjectStatus.COMPLETED && p.getActualEnd() != null && visited.isAfter(p.getActualEnd())) visited = p.getActualEnd().minusDays(rnd.nextInt(20));
                FieldInspection i = new FieldInspection();
                i.setProject(p); i.setWereda(p.getWereda());
                i.setInspectionType(k == 0 && p.getStatus() == ProjectStatus.COMPLETED ? InspectionType.HANDOVER_INSPECTION : pick(new InspectionType[]{InspectionType.PROGRESS_VERIFICATION, InspectionType.PROGRESS_VERIFICATION, InspectionType.QUALITY_INSPECTION, InspectionType.SITE_VISIT, InspectionType.SAFETY_AUDIT}));
                i.setVisitedOn(visited); i.setStartedAt(visited.atTime(8 + rnd.nextInt(3), rnd.nextInt(60)).toInstant(ZoneOffset.UTC)); i.setEndedAt(i.getStartedAt().plusSeconds(3600L + rnd.nextInt(5400)));
                i.setInspectorName(pick(DemoCatalog.ASSESSORS)); i.setOrganization(rnd.nextInt(3) == 0 ? "Regional Reconstruction PMO" : "Tigray Design & Supervision Works Enterprise");
                boolean far = rnd.nextInt(12) == 0;
                double dLat = jitter(far ? 0.004 : 0.0006), dLng = jitter(far ? 0.004 : 0.0006);
                i.setLocation(GeoPoint.jts(p.getLocation().getY() + dLat, p.getLocation().getX() + dLng));
                i.setGpsAccuracyM(BigDecimal.valueOf(3 + rnd.nextInt(12)));
                i.setDistanceFromSiteM(BigDecimal.valueOf(haversine(p.getLocation().getY(), p.getLocation().getX(), p.getLocation().getY() + dLat, p.getLocation().getX() + dLng)).setScale(1, RoundingMode.HALF_UP));
                double reportedAt = progressAt(p, visited);
                double gap = perf < 0.6 && rnd.nextInt(3) > 0 ? 8 + rnd.nextInt(16) : rnd.nextInt(5) - 1;
                i.setReportedProgressPct(bd(reportedAt)); i.setObservedProgressPct(bd(Math.max(0, Math.min(100, reportedAt - gap))));
                i.setWorkforceObserved(10 + rnd.nextInt(90)); i.setQualityRating((short) (gap > 10 ? 2 + rnd.nextInt(2) : 3 + rnd.nextInt(3))); i.setSafetyRating((short) (2 + rnd.nextInt(4)));
                i.setFindings(gap > 8 ? "Observed works lag the site report: " + pick(new String[]{"second-floor slab not yet poured", "roof trusses delivered but not erected", "canal lining complete on 40% of the reported length", "finishing works not started in block B"}) + ". Crew of " + i.getWorkforceObserved() + " on site."
                    : pick(new String[]{"Works consistent with the site report. Materials stockpiled and secured.", "Good workmanship; minor snagging on door frames noted.", "Progress as reported; safety signage and PPE adequate.", "Reinforcement and formwork inspected and approved for the next pour.", "Site access road degraded by rain; works unaffected."}));
                i.setRecommendedAction(gap > 8 ? "Withhold acceptance of the reported percentage; request a corrected progress report and a recovery plan." : rnd.nextInt(3) == 0 ? "Follow up on snag list at next visit." : null);
                i.setDevice(dev); i.setClientReference(UUID.nameUUIDFromBytes((p.getCode() + visited + k).getBytes()).toString()); i.setSource(DataSource.FIELD_APP); i.setSyncedAt(i.getEndedAt().plusSeconds(3600L * (2 + rnd.nextInt(30))));
                int roll = rnd.nextInt(20);
                VerificationStatus vs = roll < 12 ? VerificationStatus.VERIFIED : roll < 17 ? VerificationStatus.UNVERIFIED : roll < 19 ? VerificationStatus.DISPUTED : VerificationStatus.REJECTED;
                if (gap > 8 && vs == VerificationStatus.UNVERIFIED && rnd.nextBoolean()) vs = VerificationStatus.VERIFIED;
                if (vs != VerificationStatus.UNVERIFIED) {
                    AppUser v = pick(verifiers); i.setVerificationStatus(vs); i.setVerifiedByUserId(v.getId()); i.setVerifiedByName(v.getFullName()); i.setVerifiedAt(i.getSyncedAt().plusSeconds(3600L * (4 + rnd.nextInt(72))));
                    i.setVerificationNote(vs == VerificationStatus.VERIFIED ? (rnd.nextBoolean() ? "Photos and GPS consistent with the site; accepted." : null) : vs == VerificationStatus.DISPUTED ? "Contractor disputes the observed percentage; joint re-measurement requested." : "GPS position is " + i.getDistanceFromSiteM() + " m from the registered site and photos lack timestamps.");
                    if (vs == VerificationStatus.VERIFIED && (lastVerified == null || i.getVerifiedAt().isAfter(lastVerified))) lastVerified = i.getVerifiedAt();
                }
                int photos = 2 + rnd.nextInt(3);
                for (int m = 0; m < photos; m++) {
                    int idx = rnd.nextInt(PHOTOS.length);
                    EvidenceMedia em = new EvidenceMedia();
                    em.setKind(MediaKind.PHOTO); em.setInspection(i); em.setProjectId(p.getId()); em.setUrl("/demo-media/site/" + PHOTOS[idx] + ".svg"); em.setThumbnailUrl(em.getUrl());
                    em.setMediaType("image/svg+xml"); em.setSizeBytes(180_000L + rnd.nextInt(220_000)); em.setWidth(1600); em.setHeight(1200); em.setCaption(CAPTIONS[idx]);
                    em.setCapturedAt(i.getStartedAt().plusSeconds(300L * (m + 1))); em.setLocation(GeoPoint.jts(p.getLocation().getY() + dLat + jitter(0.0002), p.getLocation().getX() + dLng + jitter(0.0002)));
                    em.setGpsAccuracyM(BigDecimal.valueOf(3 + rnd.nextInt(10))); em.setHeadingDeg((short) rnd.nextInt(360)); em.setCapturedBy(i.getInspectorName()); em.setDeviceId(dev.getId());
                    em.setClientReference(UUID.randomUUID().toString()); em.setVerificationStatus(i.getVerificationStatus());
                    i.getMedia().add(em);
                }
                if (rnd.nextInt(3) == 0) {
                    EvidenceMedia vid = new EvidenceMedia();
                    vid.setKind(MediaKind.VIDEO); vid.setInspection(i); vid.setProjectId(p.getId()); vid.setUrl("/demo-media/site/walkthrough.svg"); vid.setThumbnailUrl("/demo-media/site/walkthrough.svg");
                    vid.setMediaType("video/mp4"); vid.setSizeBytes(18_000_000L + rnd.nextInt(30_000_000)); vid.setWidth(1280); vid.setHeight(720); vid.setDurationSeconds(25 + rnd.nextInt(35)); vid.setCaption("Site walkthrough");
                    vid.setCapturedAt(i.getStartedAt().plusSeconds(1800)); vid.setLocation(i.getLocation()); vid.setGpsAccuracyM(BigDecimal.valueOf(5)); vid.setCapturedBy(i.getInspectorName()); vid.setDeviceId(dev.getId());
                    vid.setClientReference(UUID.randomUUID().toString()); vid.setVerificationStatus(i.getVerificationStatus());
                    i.getMedia().add(vid);
                }
                inspections.save(i); count++;
            }
            if (lastVerified != null) { p.setLastVerifiedAt(lastVerified); projects.save(p); }
        }
        // Damage verification visits for severe facilities without a project
        for (Facility f : facilities.findAll()) {
            boolean severe = f.getLatestSeverity() == DamageSeverity.SEVERE || f.getLatestSeverity() == DamageSeverity.DESTROYED;
            if (!severe || projectFacilities.countByFacilityId(f.getId()) > 0 || f.getLocation() == null || rnd.nextInt(3) == 0) continue;
            Facility fw = facilities.findWithWeredaById(f.getId()).orElseThrow();
            FieldInspection i = new FieldInspection();
            i.setFacility(fw); i.setWereda(fw.getWereda()); i.setInspectionType(InspectionType.DAMAGE_VERIFICATION);
            LocalDate visited = TODAY.minusDays(10 + rnd.nextInt(120));
            i.setVisitedOn(visited); i.setStartedAt(visited.atTime(9 + rnd.nextInt(5), rnd.nextInt(60)).toInstant(ZoneOffset.UTC)); i.setEndedAt(i.getStartedAt().plusSeconds(2400 + rnd.nextInt(3000)));
            i.setInspectorName(pick(DemoCatalog.ASSESSORS)); i.setOrganization("Regional Reconstruction PMO");
            double dLat = jitter(0.0005), dLng = jitter(0.0005);
            i.setLocation(GeoPoint.jts(fw.getLocation().getY() + dLat, fw.getLocation().getX() + dLng)); i.setGpsAccuracyM(BigDecimal.valueOf(4 + rnd.nextInt(8)));
            i.setDistanceFromSiteM(BigDecimal.valueOf(haversine(fw.getLocation().getY(), fw.getLocation().getX(), fw.getLocation().getY() + dLat, fw.getLocation().getX() + dLng)).setScale(1, RoundingMode.HALF_UP));
            i.setQualityRating(null); i.setSafetyRating((short) (1 + rnd.nextInt(2)));
            i.setFindings("Damage confirmed as " + fw.getLatestSeverity().name().toLowerCase() + ". " + pick(new String[]{"Structure unsafe for occupation; community using temporary shelter.", "Looted equipment confirmed; perimeter fence destroyed.", "Roof collapse over main block; partial walls standing.", "Site cleared of debris by community; awaiting scope decision."}));
            i.setRecommendedAction("Include in next funding round; prepare bill of quantities.");
            i.setDevice(dev); i.setClientReference(UUID.nameUUIDFromBytes((fw.getCode() + visited + "dv").getBytes()).toString()); i.setSource(DataSource.FIELD_APP); i.setSyncedAt(i.getEndedAt().plusSeconds(3600L * (3 + rnd.nextInt(40))));
            if (rnd.nextInt(3) > 0) { i.setVerificationStatus(VerificationStatus.VERIFIED); i.setVerifiedByUserId(analyst.getId()); i.setVerifiedByName(analyst.getFullName()); i.setVerifiedAt(i.getSyncedAt().plusSeconds(3600L * 24)); }
            for (int m = 0; m < 2 + rnd.nextInt(2); m++) {
                int idx = rnd.nextInt(PHOTOS.length);
                EvidenceMedia em = new EvidenceMedia();
                em.setKind(MediaKind.PHOTO); em.setInspection(i); em.setFacilityId(fw.getId()); em.setUrl("/demo-media/site/" + PHOTOS[idx] + ".svg"); em.setThumbnailUrl(em.getUrl());
                em.setMediaType("image/svg+xml"); em.setSizeBytes(150_000L + rnd.nextInt(200_000)); em.setWidth(1600); em.setHeight(1200); em.setCaption(CAPTIONS[idx]);
                em.setCapturedAt(i.getStartedAt().plusSeconds(240L * (m + 1))); em.setLocation(GeoPoint.jts(fw.getLocation().getY() + dLat + jitter(0.0002), fw.getLocation().getX() + dLng + jitter(0.0002)));
                em.setGpsAccuracyM(BigDecimal.valueOf(3 + rnd.nextInt(10))); em.setCapturedBy(i.getInspectorName()); em.setDeviceId(dev.getId()); em.setClientReference(UUID.randomUUID().toString()); em.setVerificationStatus(i.getVerificationStatus());
                i.getMedia().add(em);
            }
            inspections.save(i); count++;
        }
        log.info("Seeded {} field inspections", count);
    }

    /** Attach placeholder photos to the most recent assessment of each facility so the evidence stream shows field photos. */
    private void seedAssessmentPhotos() {
        for (Facility f : facilities.findAll()) {
            if (f.getLatestAssessmentId() == null) continue;
            DamageAssessment a = assessments.findDetailById(f.getLatestAssessmentId()).orElse(null);
            if (a == null || !a.getPhotos().isEmpty()) continue;
            int n = 1 + rnd.nextInt(3);
            for (int m = 0; m < n; m++) {
                int idx = rnd.nextInt(PHOTOS.length);
                AssessmentPhoto ph = new AssessmentPhoto();
                ph.setAssessment(a); ph.setUrl("/demo-media/site/" + PHOTOS[idx] + ".svg"); ph.setCaption(CAPTIONS[idx]);
                ph.setTakenAt(a.getAssessedOn().atTime(10 + m, 15).toInstant(ZoneOffset.UTC));
                if (a.getLocation() != null) ph.setLocation(GeoPoint.jts(a.getLocation().getY() + jitter(0.0003), a.getLocation().getX() + jitter(0.0003)));
                a.getPhotos().add(ph);
            }
            assessments.save(a);
        }
    }

    // ── helpers ───────────────────────────────────────────────────────────
    private Organization org(String code, String name, OrganizationType type, String contact) {
        return organizations.findByCode(code).orElseGet(() -> { Organization o = new Organization(); o.setCode(code); o.setName(name); o.setOrgType(type); o.setContact(contact); return organizations.save(o); });
    }
    private void link(Project p, Organization o, OrganizationRole r) { projectOrganizations.save(new ProjectOrganization(p, o, r)); }
    private static String code(String prefix, String name) { return prefix + "-" + Integer.toHexString(name.hashCode()).toUpperCase(); }
    private static String funder(FundingSource s) {
        return switch (s) { case REGIONAL_TREASURY -> "Tigray Bureau of Finance"; case FEDERAL_TRANSFER -> "Ministry of Finance (Federal)"; case DONOR_GRANT -> "Reconstruction Partners Trust Fund"; case DEVELOPMENT_LOAN -> "Development Bank of Ethiopia"; case DIASPORA_FUND -> "Tigray Diaspora Reconstruction Fund"; case PRIVATE_INVESTMENT -> "Private investors consortium"; };
    }
    private static OrganizationType funderType(FundingSource s) {
        return switch (s) { case REGIONAL_TREASURY -> OrganizationType.GOVERNMENT_BUREAU; case FEDERAL_TRANSFER -> OrganizationType.FEDERAL_AGENCY; case DONOR_GRANT -> OrganizationType.DONOR; case DEVELOPMENT_LOAN -> OrganizationType.DONOR; case DIASPORA_FUND -> OrganizationType.COMMUNITY; case PRIVATE_INVESTMENT -> OrganizationType.PRIVATE; };
    }
    private double progressAt(Project p, LocalDate d) {
        Double v = jdbc.query("SELECT physical_progress_pct FROM progress_log WHERE project_id = ? AND log_date <= ? ORDER BY log_date DESC LIMIT 1", rs -> rs.next() ? rs.getDouble(1) : null, p.getId(), d);
        return v == null ? Math.min(100, p.getPhysicalProgressPct().doubleValue()) : v;
    }
    private double jitter(double r) { return (rnd.nextDouble() - 0.5) * 2 * r; }
    private <T> T pick(T[] arr) { return arr[rnd.nextInt(arr.length)]; }
    private static BigDecimal bd(double v) { return BigDecimal.valueOf(v).setScale(2, RoundingMode.HALF_UP); }
    private static double haversine(double lat1, double lon1, double lat2, double lon2) {
        double r = 6_371_000, dLat = Math.toRadians(lat2 - lat1), dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
}
