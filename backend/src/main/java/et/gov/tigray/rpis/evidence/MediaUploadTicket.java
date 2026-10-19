package et.gov.tigray.rpis.evidence;

import et.gov.tigray.rpis.common.Enums.MediaKind;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/** Short-lived, single-use authorisation to PUT one media object (the "signed upload URL" of the mobile contract). */
@Entity @Table(name = "media_upload_ticket")
@Getter @Setter @NoArgsConstructor
public class MediaUploadTicket {
    @Id private UUID token;
    @Column(name = "device_id") private Long deviceId;
    @Column(name = "created_by_user_id") private Long createdByUserId;
    @Column(name = "client_reference", length = 64) private String clientReference;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 12) private MediaKind kind;
    @Column(name = "media_type", nullable = false, length = 64) private String mediaType;
    @Column(name = "size_bytes", nullable = false) private long sizeBytes;
    @Column(length = 64) private String sha256;
    @Column(name = "storage_key", nullable = false, length = 255) private String storageKey;
    @Column(name = "created_at", nullable = false) private Instant createdAt = Instant.now();
    @Column(name = "expires_at", nullable = false) private Instant expiresAt;
    @Column(name = "consumed_at") private Instant consumedAt;
    @Column(name = "media_id") private Long mediaId;
}
