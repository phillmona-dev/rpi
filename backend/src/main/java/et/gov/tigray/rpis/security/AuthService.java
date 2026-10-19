package et.gov.tigray.rpis.security;

import et.gov.tigray.rpis.audit.AuditService;
import et.gov.tigray.rpis.common.BusinessException;
import et.gov.tigray.rpis.config.RpisProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.LockedException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {
    private final UserRepository users;
    private final RefreshTokenRepository refreshTokens;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwt;
    private final RpisProperties props;
    private final AuditService audit;
    private final SecureRandom random = new SecureRandom();

    @Transactional(noRollbackFor = {BadCredentialsException.class, LockedException.class})
    public AuthDtos.TokenResponse login(AuthDtos.LoginRequest req, String userAgent, String ip) {
        AppUser user = users.findByUsernameIgnoreCase(req.username()).orElse(null);
        if (user == null) {
            // Constant-time-ish: still hash to avoid user enumeration via timing
            passwordEncoder.matches(req.password(), "$argon2id$v=19$m=16384,t=2,p=1$ZHVtbXlzYWx0$ZHVtbXloYXNo");
            audit.record("LOGIN_FAILED", "USER", req.username(), Map.of("reason", "unknown_user", "ip", ip));
            throw new BadCredentialsException("Invalid credentials");
        }
        if (!user.isEnabled()) throw new LockedException("Account is disabled. Contact the system administrator.");
        if (user.isLocked()) throw new LockedException("Account temporarily locked after repeated failed attempts. Try again later.");

        if (!passwordEncoder.matches(req.password(), user.getPasswordHash())) {
            user.setFailedAttempts(user.getFailedAttempts() + 1);
            if (user.getFailedAttempts() >= props.getSecurity().getLogin().getMaxFailedAttempts()) {
                user.setLockedUntil(Instant.now().plus(props.getSecurity().getLogin().getLockMinutes(), ChronoUnit.MINUTES));
                user.setFailedAttempts(0);
                audit.record("ACCOUNT_LOCKED", "USER", user.getUsername(), Map.of("ip", ip));
            }
            users.save(user);
            audit.record("LOGIN_FAILED", "USER", user.getUsername(), Map.of("reason", "bad_password", "ip", ip));
            throw new BadCredentialsException("Invalid credentials");
        }
        user.setFailedAttempts(0);
        user.setLockedUntil(null);
        user.setLastLoginAt(Instant.now());
        users.save(user);
        audit.record("LOGIN", "USER", user.getUsername(), Map.of("ip", ip));
        return issue(user, userAgent, ip);
    }

    @Transactional
    public AuthDtos.TokenResponse refresh(String rawRefreshToken, String userAgent, String ip) {
        RefreshToken current = refreshTokens.findByTokenHash(hash(rawRefreshToken))
            .orElseThrow(() -> BusinessException.unauthorized("refresh_invalid", "Refresh token is not recognised"));
        if (!current.isActive()) {
            // Reuse of a rotated token indicates theft: revoke the whole family for this user.
            refreshTokens.revokeAllForUser(current.getUser().getId(), Instant.now());
            audit.record("REFRESH_REUSE_DETECTED", "USER", current.getUser().getUsername(), Map.of("ip", ip));
            throw BusinessException.unauthorized("refresh_revoked", "Refresh token has been revoked");
        }
        AppUser user = current.getUser();
        if (!user.isEnabled()) throw BusinessException.unauthorized("user_disabled", "Account disabled");
        AuthDtos.TokenResponse response = issue(user, userAgent, ip);
        current.setRevokedAt(Instant.now());
        current.setReplacedBy(refreshTokens.findByTokenHash(hash(response.refreshToken())).map(RefreshToken::getId).orElse(null));
        refreshTokens.save(current);
        return response;
    }

    @Transactional
    public void logout(String rawRefreshToken) {
        if (rawRefreshToken == null) return;
        refreshTokens.findByTokenHash(hash(rawRefreshToken)).ifPresent(t -> {
            t.setRevokedAt(Instant.now());
            refreshTokens.save(t);
            audit.record("LOGOUT", "USER", t.getUser().getUsername(), null);
        });
    }

    @Transactional(readOnly = true)
    public AuthDtos.UserProfile profile(String username) {
        return users.findByUsernameIgnoreCase(username).map(AuthService::toProfile)
            .orElseThrow(() -> BusinessException.unauthorized("user_missing", "User no longer exists"));
    }

    private AuthDtos.TokenResponse issue(AppUser user, String userAgent, String ip) {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String raw = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        RefreshToken rt = new RefreshToken();
        rt.setUser(user);
        rt.setTokenHash(hash(raw));
        rt.setExpiresAt(Instant.now().plus(jwt.refreshTtl()));
        rt.setUserAgent(userAgent == null ? null : userAgent.substring(0, Math.min(255, userAgent.length())));
        rt.setIpAddress(ip);
        refreshTokens.save(rt);
        return new AuthDtos.TokenResponse(jwt.issueAccessToken(user), jwt.accessTtl().toSeconds(), raw, jwt.refreshTtl().toSeconds(), toProfile(user));
    }

    static AuthDtos.UserProfile toProfile(AppUser u) {
        return new AuthDtos.UserProfile(u.getId(), u.getUsername(), u.getFullName(), u.getTitle(), u.getEmail(), u.getLocale(),
            u.getRoles().stream().map(Role::getCode).sorted().toList(), u.getSectorScope(), u.getLastLoginAt());
    }

    static String hash(String raw) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(raw.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }

    @Scheduled(cron = "0 30 3 * * *")
    @Transactional
    public void purgeExpiredTokens() {
        int n = refreshTokens.purgeExpired(Instant.now().minus(30, ChronoUnit.DAYS));
        if (n > 0) log.info("Purged {} expired refresh tokens", n);
    }
}
