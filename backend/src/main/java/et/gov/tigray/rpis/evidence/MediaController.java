package et.gov.tigray.rpis.evidence;

import et.gov.tigray.rpis.audit.Audited;
import et.gov.tigray.rpis.common.BusinessException;
import et.gov.tigray.rpis.config.RpisProperties;
import et.gov.tigray.rpis.damage.FieldDeviceRepository;
import et.gov.tigray.rpis.security.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.io.InputStream;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.HexFormat;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

/**
 * Media upload contract agreed with the Phase-2 mobile app: request a short-lived ticket, PUT the bytes,
 * then reference the returned URL from the structured record (inspection / assessment / progress log).
 */
@RestController
@RequestMapping("/api/v1/media")
@RequiredArgsConstructor
@Tag(name = "Media (evidence storage)")
public class MediaController {
    private static final Set<String> ALLOWED_TYPES = Set.of("image/jpeg", "image/png", "image/webp", "image/heic", "video/mp4", "video/webm", "audio/aac", "audio/ogg", "audio/mpeg", "application/pdf");
    private final MediaStorage storage;
    private final EvidenceRepositories.UploadTickets tickets;
    private final FieldDeviceRepository devices;
    private final RpisProperties props;

    @PostMapping("/upload-url")
    @PreAuthorize("hasAnyRole('FIELD_OFFICER','SITE_MANAGER','ANALYST','ADMIN')")
    @Operation(summary = "Issue a single-use upload ticket (the 'signed upload URL' of the mobile contract)")
    @Transactional
    public EvidenceDtos.UploadUrlResponse uploadUrl(@Valid @RequestBody EvidenceDtos.UploadUrlRequest req) {
        if (!ALLOWED_TYPES.contains(req.mediaType().toLowerCase())) throw BusinessException.badRequest("media_type_not_allowed", "Unsupported media type " + req.mediaType());
        if (req.sizeBytes() > props.getMedia().getMaxUploadBytes()) throw BusinessException.badRequest("too_large", "Object exceeds the maximum upload size of " + props.getMedia().getMaxUploadBytes() + " bytes");
        Long deviceId = req.deviceUid() == null ? null : devices.findByDeviceUid(req.deviceUid()).map(d -> d.getId()).orElse(null);
        String ext = switch (req.mediaType().toLowerCase()) { case "image/jpeg" -> "jpg"; case "image/png" -> "png"; case "image/webp" -> "webp"; case "image/heic" -> "heic"; case "video/mp4" -> "mp4"; case "video/webm" -> "webm"; case "application/pdf" -> "pdf"; case "audio/aac" -> "aac"; case "audio/ogg" -> "ogg"; default -> "bin"; };
        MediaUploadTicket t = new MediaUploadTicket();
        t.setToken(UUID.randomUUID()); t.setDeviceId(deviceId); t.setCreatedByUserId(CurrentUser.get().map(CurrentUser::id).orElse(null));
        t.setClientReference(req.clientReference()); t.setKind(req.kind()); t.setMediaType(req.mediaType()); t.setSizeBytes(req.sizeBytes()); t.setSha256(req.sha256());
        t.setStorageKey(DateTimeFormatter.ofPattern("yyyy/MM").format(Instant.now().atZone(ZoneOffset.UTC)) + "/" + t.getToken() + "." + ext);
        t.setExpiresAt(Instant.now().plusSeconds(props.getMedia().getTicketTtlMinutes() * 60L));
        tickets.save(t);
        return new EvidenceDtos.UploadUrlResponse(t.getToken().toString(), "/api/v1/media/upload/" + t.getToken(), storage.publicUrl(t.getStorageKey()), t.getExpiresAt(), props.getMedia().getMaxUploadBytes());
    }

    @PutMapping(value = "/upload/{token}", consumes = MediaType.ALL_VALUE)
    @PreAuthorize("hasAnyRole('FIELD_OFFICER','SITE_MANAGER','ANALYST','ADMIN')")
    @Operation(summary = "Upload the bytes for a ticket; verifies size and SHA-256 when supplied")
    @Audited(action = "MEDIA_UPLOAD", entityType = "MEDIA")
    @Transactional
    public EvidenceDtos.UploadResult upload(@PathVariable UUID token, HttpServletRequest request) throws IOException {
        MediaUploadTicket t = tickets.findById(token).orElseThrow(() -> BusinessException.badRequest("ticket_unknown", "Unknown upload ticket"));
        if (t.getConsumedAt() != null) return new EvidenceDtos.UploadResult(storage.publicUrl(t.getStorageKey()), t.getStorageKey(), t.getSha256(), t.getSizeBytes(), t.getMediaType());
        if (t.getExpiresAt().isBefore(Instant.now())) throw BusinessException.badRequest("ticket_expired", "Upload ticket expired; request a new one");
        MessageDigest md;
        try { md = MessageDigest.getInstance("SHA-256"); } catch (Exception e) { throw new IOException(e); }
        long written;
        try (InputStream in = new DigestInputStream(request.getInputStream(), md)) { written = storage.put(t.getStorageKey(), in, t.getSizeBytes()); }
        String sha = HexFormat.of().formatHex(md.digest());
        if (t.getSha256() != null && !t.getSha256().equalsIgnoreCase(sha)) throw BusinessException.badRequest("checksum_mismatch", "Uploaded bytes do not match the declared SHA-256");
        t.setSha256(sha); t.setSizeBytes(written); t.setConsumedAt(Instant.now());
        tickets.save(t);
        return new EvidenceDtos.UploadResult(storage.publicUrl(t.getStorageKey()), t.getStorageKey(), sha, written, t.getMediaType());
    }

    @GetMapping("/files/{year}/{month}/{name}")
    @Operation(summary = "Stream a stored media object (authenticated; the BFF proxies it for <img> tags)")
    public ResponseEntity<Resource> file(@PathVariable String year, @PathVariable String month, @PathVariable String name) throws IOException {
        String key = year + "/" + month + "/" + name;
        if (!key.matches("\\d{4}/\\d{2}/[0-9a-fA-F-]{36}\\.[a-z0-9]{2,5}")) throw new et.gov.tigray.rpis.common.NotFoundException("Media", key);
        if (!storage.exists(key)) throw new et.gov.tigray.rpis.common.NotFoundException("Media", key);
        Resource r = storage.get(key);
        String type = switch (name.substring(name.lastIndexOf('.') + 1)) { case "jpg" -> "image/jpeg"; case "png" -> "image/png"; case "webp" -> "image/webp"; case "heic" -> "image/heic"; case "mp4" -> "video/mp4"; case "webm" -> "video/webm"; case "pdf" -> "application/pdf"; case "aac" -> "audio/aac"; case "ogg" -> "audio/ogg"; default -> MediaType.APPLICATION_OCTET_STREAM_VALUE; };
        return ResponseEntity.ok().header(HttpHeaders.CONTENT_TYPE, type).cacheControl(CacheControl.maxAge(1, TimeUnit.DAYS).cachePrivate())
            .header("X-Content-Type-Options", "nosniff").header(HttpHeaders.CONTENT_DISPOSITION, "inline").body(r);
    }
}
