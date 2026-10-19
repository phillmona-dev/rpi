package et.gov.tigray.rpis.security;

import et.gov.tigray.rpis.common.Sector;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;

public final class AuthDtos {
    private AuthDtos() {}

    public record LoginRequest(@NotBlank @Size(max = 64) String username, @NotBlank @Size(min = 8, max = 128) String password) {}
    public record RefreshRequest(@NotBlank String refreshToken) {}
    public record TokenResponse(String accessToken, long accessExpiresInSeconds, String refreshToken, long refreshExpiresInSeconds, UserProfile user) {}
    public record UserProfile(Long id, String username, String fullName, String title, String email, String locale, List<String> roles, Sector sectorScope, Instant lastLoginAt) {}

    public record CreateUserRequest(@NotBlank @Size(min = 3, max = 64) String username, @NotBlank @Email String email,
                                    @NotBlank @Size(max = 160) String fullName, @Size(max = 160) String title,
                                    @NotBlank @Size(min = 12, max = 128) String password, @NotEmpty List<String> roles,
                                    Sector sectorScope, String locale) {}
    public record UpdateUserRequest(@Size(max = 160) String fullName, @Size(max = 160) String title, Boolean enabled,
                                    List<String> roles, Sector sectorScope, String locale, @Size(min = 12, max = 128) String newPassword) {}
    public record UserSummary(Long id, String username, String email, String fullName, String title, boolean enabled,
                              List<String> roles, Sector sectorScope, String locale, Instant lastLoginAt, boolean locked) {}
}
