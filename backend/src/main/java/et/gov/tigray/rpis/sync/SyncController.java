package et.gov.tigray.rpis.sync;

import et.gov.tigray.rpis.common.BusinessException;
import et.gov.tigray.rpis.common.Enums.DataSource;
import et.gov.tigray.rpis.damage.DamageDtos;
import et.gov.tigray.rpis.damage.DamageService;
import et.gov.tigray.rpis.damage.FieldDevice;
import et.gov.tigray.rpis.damage.FieldDeviceRepository;
import et.gov.tigray.rpis.evidence.EvidenceDtos;
import et.gov.tigray.rpis.evidence.EvidenceService;
import et.gov.tigray.rpis.project.ProjectDtos;
import et.gov.tigray.rpis.project.ProjectService;
import et.gov.tigray.rpis.security.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Stable contract for the Phase-2 offline Flutter apps. Batches are idempotent per (device, clientReference);
 * replays return the already-stored ids so the client can safely retry after connectivity loss.
 */
@RestController
@RequestMapping("/api/v1/sync")
@RequiredArgsConstructor
@Tag(name = "Field Sync (Phase 2 contract)")
public class SyncController {
    private final FieldDeviceRepository devices;
    private final DamageService damage;
    private final ProjectService projects;
    private final EvidenceService evidence;
    private final NamedParameterJdbcTemplate jdbc;

    public record RegisterDeviceRequest(@NotBlank @Size(max = 128) String deviceUid, @Size(max = 120) String label, @Size(max = 32) String platform, @Size(max = 32) String appVersion) {}
    public record DeviceResponse(Long id, String deviceUid, String label, boolean enabled, Instant lastSyncAt) {}
    public record AssessmentBatch(@NotBlank String deviceUid, @NotBlank @Size(max = 64) String batchUid, @NotEmpty @Valid List<DamageDtos.CreateAssessmentRequest> items) {}
    public record ProgressBatchItem(@NotNull Long projectId, @NotBlank @Size(max = 64) String clientReference, @Valid ProjectDtos.ProgressEntryRequest entry) {}
    public record ProgressBatch(@NotBlank String deviceUid, @NotBlank @Size(max = 64) String batchUid, @NotEmpty @Valid List<ProgressBatchItem> items) {}
    public record InspectionBatch(@NotBlank String deviceUid, @NotBlank @Size(max = 64) String batchUid, @NotEmpty @Valid List<EvidenceDtos.CreateInspectionRequest> items) {}
    public record ItemResult(int index, String clientReference, String status, Long serverId, String error) {}
    public record BatchResult(String batchUid, int accepted, int duplicates, int rejected, List<ItemResult> items, Instant serverTime) {}

    @PostMapping("/devices")
    @Operation(summary = "Register or refresh a field device")
    @Transactional
    public DeviceResponse register(@Valid @RequestBody RegisterDeviceRequest req) {
        FieldDevice d = devices.findByDeviceUid(req.deviceUid()).orElseGet(FieldDevice::new);
        d.setDeviceUid(req.deviceUid()); d.setLabel(req.label()); d.setPlatform(req.platform()); d.setAppVersion(req.appVersion());
        d.setAssignedUserId(CurrentUser.get().map(CurrentUser::id).orElse(null));
        d = devices.save(d);
        return new DeviceResponse(d.getId(), d.getDeviceUid(), d.getLabel(), d.isEnabled(), d.getLastSyncAt());
    }

    @PostMapping("/damage-assessments")
    @Operation(summary = "Upload a batch of offline-recorded damage assessments (idempotent)")
    @Transactional
    public BatchResult assessments(@Valid @RequestBody AssessmentBatch batch) {
        FieldDevice device = device(batch.deviceUid());
        Long uid = CurrentUser.get().map(CurrentUser::id).orElse(null);
        List<ItemResult> results = new ArrayList<>();
        int accepted = 0, dup = 0, rejected = 0;
        for (int i = 0; i < batch.items().size(); i++) {
            var item = batch.items().get(i);
            try {
                if (item.clientReference() == null) throw BusinessException.badRequest("client_reference_required", "clientReference is required for sync items");
                boolean existed = damage.forFacility(item.facilityId()).stream().anyMatch(a -> a.source() == DataSource.FIELD_APP) &&
                    jdbc.queryForObject("SELECT count(*) FROM damage_assessment WHERE device_id = :d AND client_reference = :c", new org.springframework.jdbc.core.namedparam.MapSqlParameterSource().addValue("d", device.getId(), java.sql.Types.BIGINT).addValue("c", item.clientReference(), java.sql.Types.VARCHAR), Long.class) > 0;
                var saved = damage.create(item, DataSource.FIELD_APP, device, uid);
                if (existed) { dup++; results.add(new ItemResult(i, item.clientReference(), "DUPLICATE", saved.id(), null)); }
                else { accepted++; results.add(new ItemResult(i, item.clientReference(), "ACCEPTED", saved.id(), null)); }
            } catch (Exception e) {
                rejected++; results.add(new ItemResult(i, item.clientReference(), "REJECTED", null, e.getMessage()));
            }
        }
        recordBatch(device, batch.batchUid(), batch.items().size(), accepted, dup, rejected);
        return new BatchResult(batch.batchUid(), accepted, dup, rejected, results, Instant.now());
    }

    @PostMapping("/progress-logs")
    @Operation(summary = "Upload site-manager progress logs (idempotent per clientReference)")
    @Transactional
    public BatchResult progress(@Valid @RequestBody ProgressBatch batch) {
        FieldDevice device = device(batch.deviceUid());
        String by = CurrentUser.get().map(CurrentUser::fullName).orElse("site-app");
        List<ItemResult> results = new ArrayList<>();
        int accepted = 0, rejected = 0;
        for (int i = 0; i < batch.items().size(); i++) {
            var item = batch.items().get(i);
            try {
                var saved = projects.recordProgress(item.projectId(), item.entry(), by, DataSource.SITE_APP);
                accepted++; results.add(new ItemResult(i, item.clientReference(), "ACCEPTED", saved.id(), null));
            } catch (Exception e) { rejected++; results.add(new ItemResult(i, item.clientReference(), "REJECTED", null, e.getMessage())); }
        }
        recordBatch(device, batch.batchUid(), batch.items().size(), accepted, 0, rejected);
        return new BatchResult(batch.batchUid(), accepted, 0, rejected, results, Instant.now());
    }

    @PostMapping("/inspections")
    @Operation(summary = "Upload offline-recorded site inspections with geotagged media references (idempotent per clientReference)")
    @Transactional
    public BatchResult inspections(@Valid @RequestBody InspectionBatch batch) {
        FieldDevice device = device(batch.deviceUid());
        Long uid = CurrentUser.get().map(CurrentUser::id).orElse(null);
        List<ItemResult> results = new ArrayList<>();
        int accepted = 0, dup = 0, rejected = 0;
        for (int i = 0; i < batch.items().size(); i++) {
            var item = batch.items().get(i);
            try {
                if (item.clientReference() == null) throw BusinessException.badRequest("client_reference_required", "clientReference is required for sync items");
                boolean existed = jdbc.queryForObject("SELECT count(*) FROM field_inspection WHERE device_id = :d AND client_reference = :c",
                    new org.springframework.jdbc.core.namedparam.MapSqlParameterSource().addValue("d", device.getId(), java.sql.Types.BIGINT).addValue("c", item.clientReference(), java.sql.Types.VARCHAR), Long.class) > 0;
                var saved = evidence.create(item, DataSource.FIELD_APP, device, uid);
                if (existed) { dup++; results.add(new ItemResult(i, item.clientReference(), "DUPLICATE", saved.id(), null)); }
                else { accepted++; results.add(new ItemResult(i, item.clientReference(), "ACCEPTED", saved.id(), null)); }
            } catch (Exception e) { rejected++; results.add(new ItemResult(i, item.clientReference(), "REJECTED", null, e.getMessage())); }
        }
        recordBatch(device, batch.batchUid(), batch.items().size(), accepted, dup, rejected);
        return new BatchResult(batch.batchUid(), accepted, dup, rejected, results, Instant.now());
    }

    private FieldDevice device(String uid) {
        FieldDevice d = devices.findByDeviceUid(uid).orElseThrow(() -> BusinessException.badRequest("device_unknown", "Device not registered: " + uid));
        if (!d.isEnabled()) throw BusinessException.forbidden("device_disabled", "Device has been disabled");
        d.setLastSyncAt(Instant.now());
        return devices.save(d);
    }

    private void recordBatch(FieldDevice d, String batchUid, int count, int accepted, int dup, int rejected) {
        jdbc.update("""
            INSERT INTO sync_batch (device_id, batch_uid, item_count, accepted, duplicates, rejected, status)
            VALUES (:d, :b, :n, :a, :dup, :r, 'PROCESSED') ON CONFLICT (batch_uid) DO UPDATE SET accepted = EXCLUDED.accepted, duplicates = EXCLUDED.duplicates, rejected = EXCLUDED.rejected
            """, Map.of("d", d.getId(), "b", batchUid, "n", count, "a", accepted, "dup", dup, "r", rejected));
    }
}
