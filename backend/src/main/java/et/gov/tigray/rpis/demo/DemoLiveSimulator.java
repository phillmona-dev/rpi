package et.gov.tigray.rpis.demo;

import et.gov.tigray.rpis.common.Enums.DamageSeverity;
import et.gov.tigray.rpis.common.Enums.DataSource;
import et.gov.tigray.rpis.common.Enums.ProjectStatus;
import et.gov.tigray.rpis.common.GeoPoint;
import et.gov.tigray.rpis.damage.DamageDtos;
import et.gov.tigray.rpis.damage.DamageService;
import et.gov.tigray.rpis.damage.FieldDeviceRepository;
import et.gov.tigray.rpis.facility.Facility;
import et.gov.tigray.rpis.facility.FacilityRepository;
import et.gov.tigray.rpis.project.Project;
import et.gov.tigray.rpis.project.ProjectDtos;
import et.gov.tigray.rpis.project.ProjectRepositories;
import et.gov.tigray.rpis.project.ProjectService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Random;

/**
 * DEMO ONLY. Emulates field/site apps syncing: posts a small progress increment or a fresh damage
 * assessment every interval, so the executive dashboard demonstrates live WebSocket updates.
 */
@Slf4j
@Component
@ConditionalOnProperty(prefix = "rpis.demo.live-simulator", name = "enabled", havingValue = "true")
@RequiredArgsConstructor
public class DemoLiveSimulator {
    private final ProjectRepositories.Projects projects;
    private final ProjectService projectService;
    private final FacilityRepository facilities;
    private final DamageService damageService;
    private final FieldDeviceRepository devices;
    private final org.springframework.jdbc.core.JdbcTemplate jdbc;
    private final Random rnd = new Random();

    @Scheduled(initialDelayString = "PT40S", fixedDelayString = "${rpis.demo.live-simulator.interval-seconds:25}000")
    public void tick() {
        try {
            if (rnd.nextInt(4) == 0) simulateAssessment(); else simulateProgress();
        } catch (Exception e) {
            log.debug("Simulator tick skipped: {}", e.getMessage());
        }
    }

    private void simulateProgress() {
        List<Project> active = projects.findByStatusIn(List.of(ProjectStatus.ACTIVE)).stream()
            .filter(p -> p.getPhysicalProgressPct().doubleValue() < 99 && p.getLastProgressReportAt() != null
                      && p.getLastProgressReportAt().isAfter(java.time.Instant.now().minusSeconds(86400L * 20))).toList();
        if (active.isEmpty()) return;
        Project p = active.get(rnd.nextInt(active.size()));
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        BigDecimal next = p.getPhysicalProgressPct().add(BigDecimal.valueOf(0.2 + rnd.nextDouble() * 0.9)).setScale(2, RoundingMode.HALF_UP).min(BigDecimal.valueOf(100));
        projectService.recordProgress(p.getId(), new ProjectDtos.ProgressEntryRequest(today, next, 30 + rnd.nextInt(90),
            rnd.nextInt(3) == 0 ? "Daily site report (simulated sync)" : null), "Site app (simulated)", DataSource.SIMULATED);
    }

    private void simulateAssessment() {
        // Follow-up visits leave facilities whose current picture comes from a campaign alone.
        List<Long> ids = jdbc.queryForList("SELECT f.id FROM facility f LEFT JOIN damage_assessment a ON a.id = f.latest_assessment_id WHERE a.campaign_id IS NULL", Long.class);
        if (ids.isEmpty()) return;
        Facility f = facilities.findById(ids.get(rnd.nextInt(ids.size()))).orElse(null);
        if (f == null) return;
        var dev = devices.findByDeviceUid("demo-tablet-01").orElse(null);
        DamageSeverity sev = f.getLatestSeverity() == null ? DamageSeverity.MODERATE : f.getLatestSeverity();
        int score = switch (sev) { case NONE -> 5; case MINOR -> 18; case MODERATE -> 42; case SEVERE -> 66; case DESTROYED -> 88; } + rnd.nextInt(8);
        damageService.create(DamageDtos.CreateAssessmentRequest.basic(f.getId(), "sim-" + System.currentTimeMillis(), LocalDate.now(ZoneOffset.UTC),
            "Field team (simulated)", sev, Math.min(100, score), Math.min(100, score + 5), Math.max(0, 100 - score), null, f.getReplacementEstimateEtb(),
            "Follow-up verification visit (simulated field sync).", GeoPoint.of(f.getLocation())), DataSource.FIELD_APP, dev, null);
    }
}
