package et.gov.tigray.rpis.security;

import et.gov.tigray.rpis.common.Sector;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;
import java.util.HashSet;
import java.util.Set;

@Entity @Table(name = "app_user")
@Getter @Setter @NoArgsConstructor
public class AppUser {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(nullable = false, unique = true, length = 64) private String username;
    @Column(nullable = false, unique = true, length = 160) private String email;
    @Column(name = "full_name", nullable = false, length = 160) private String fullName;
    @Column(length = 160) private String title;
    @Column(name = "password_hash", nullable = false) private String passwordHash;
    @Column(nullable = false) private boolean enabled = true;
    @Column(nullable = false, length = 5) private String locale = "en";
    @Enumerated(EnumType.STRING) @Column(name = "sector_scope", length = 32) private Sector sectorScope;
    @Column(name = "failed_attempts", nullable = false) private int failedAttempts;
    @Column(name = "locked_until") private Instant lockedUntil;
    @Column(name = "last_login_at") private Instant lastLoginAt;
    @CreationTimestamp @Column(name = "created_at", updatable = false) private Instant createdAt;
    @UpdateTimestamp @Column(name = "updated_at") private Instant updatedAt;

    @ManyToMany(fetch = FetchType.EAGER)
    @JoinTable(name = "user_role", joinColumns = @JoinColumn(name = "user_id"), inverseJoinColumns = @JoinColumn(name = "role_id"))
    private Set<Role> roles = new HashSet<>();

    public boolean isLocked() { return lockedUntil != null && lockedUntil.isAfter(Instant.now()); }
    public boolean hasRole(String code) { return roles.stream().anyMatch(r -> r.getCode().equals(code)); }
}
