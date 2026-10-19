package et.gov.tigray.rpis.damage;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity @Table(name = "field_device")
@Getter @Setter @NoArgsConstructor
public class FieldDevice {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "device_uid", nullable = false, unique = true, length = 128) private String deviceUid;
    @Column(length = 120) private String label;
    @Column(name = "assigned_user_id") private Long assignedUserId;
    @Column(length = 32) private String platform;
    @Column(name = "app_version", length = 32) private String appVersion;
    @Column(name = "registered_at", nullable = false) private Instant registeredAt = Instant.now();
    @Column(name = "last_sync_at") private Instant lastSyncAt;
    @Column(nullable = false) private boolean enabled = true;
}
