package et.gov.tigray.rpis.security;

import et.gov.tigray.rpis.audit.Audited;
import et.gov.tigray.rpis.common.BusinessException;
import et.gov.tigray.rpis.common.NotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class UserAdminService {
    private final UserRepository users;
    private final RoleRepository roles;
    private final RefreshTokenRepository refreshTokens;
    private final PasswordEncoder encoder;

    @Transactional(readOnly = true)
    public Page<AuthDtos.UserSummary> list(Pageable pageable) { return users.findAll(pageable).map(UserAdminService::summary); }

    @Transactional(readOnly = true)
    public AuthDtos.UserSummary get(Long id) { return users.findById(id).map(UserAdminService::summary).orElseThrow(() -> new NotFoundException("User", id)); }

    @Audited(action = "USER_CREATE", entityType = "USER")
    @Transactional
    public AuthDtos.UserSummary create(AuthDtos.CreateUserRequest req) {
        if (users.existsByUsernameIgnoreCase(req.username())) throw BusinessException.conflict("username_taken", "Username already exists");
        if (users.existsByEmailIgnoreCase(req.email())) throw BusinessException.conflict("email_taken", "Email already exists");
        AppUser u = new AppUser();
        u.setUsername(req.username().toLowerCase());
        u.setEmail(req.email().toLowerCase());
        u.setFullName(req.fullName());
        u.setTitle(req.title());
        u.setLocale(req.locale() == null ? "en" : req.locale());
        u.setSectorScope(req.sectorScope());
        u.setPasswordHash(encoder.encode(req.password()));
        u.setRoles(resolve(req.roles()));
        validateScope(u);
        return summary(users.save(u));
    }

    @Audited(action = "USER_UPDATE", entityType = "USER")
    @Transactional
    public AuthDtos.UserSummary update(Long id, AuthDtos.UpdateUserRequest req) {
        AppUser u = users.findById(id).orElseThrow(() -> new NotFoundException("User", id));
        if (req.fullName() != null) u.setFullName(req.fullName());
        if (req.title() != null) u.setTitle(req.title());
        if (req.locale() != null) u.setLocale(req.locale());
        if (req.sectorScope() != null) u.setSectorScope(req.sectorScope());
        if (req.roles() != null) u.setRoles(resolve(req.roles()));
        if (req.enabled() != null) {
            u.setEnabled(req.enabled());
            if (!req.enabled()) refreshTokens.revokeAllForUser(u.getId(), Instant.now());
        }
        if (req.newPassword() != null) {
            u.setPasswordHash(encoder.encode(req.newPassword()));
            refreshTokens.revokeAllForUser(u.getId(), Instant.now());
        }
        validateScope(u);
        return summary(users.save(u));
    }

    @Audited(action = "USER_UNLOCK", entityType = "USER")
    @Transactional
    public AuthDtos.UserSummary unlock(Long id) {
        AppUser u = users.findById(id).orElseThrow(() -> new NotFoundException("User", id));
        u.setLockedUntil(null);
        u.setFailedAttempts(0);
        return summary(users.save(u));
    }

    private Set<Role> resolve(List<String> codes) {
        Set<Role> set = new HashSet<>();
        for (String c : codes) set.add(roles.findByCode(c).orElseThrow(() -> BusinessException.badRequest("unknown_role", "Unknown role: " + c)));
        return set;
    }

    private void validateScope(AppUser u) {
        if (u.hasRole("SECTOR_HEAD") && u.getSectorScope() == null)
            throw BusinessException.badRequest("sector_required", "SECTOR_HEAD users must have a sector scope");
    }

    static AuthDtos.UserSummary summary(AppUser u) {
        return new AuthDtos.UserSummary(u.getId(), u.getUsername(), u.getEmail(), u.getFullName(), u.getTitle(), u.isEnabled(),
            u.getRoles().stream().map(Role::getCode).sorted().toList(), u.getSectorScope(), u.getLocale(), u.getLastLoginAt(), u.isLocked());
    }
}
