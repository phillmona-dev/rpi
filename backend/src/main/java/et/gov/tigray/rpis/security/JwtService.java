package et.gov.tigray.rpis.security;

import et.gov.tigray.rpis.config.RpisProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

@Service
@RequiredArgsConstructor
public class JwtService {
    private final JwtEncoder encoder;
    private final RpisProperties props;

    public String issueAccessToken(AppUser user) {
        Instant now = Instant.now();
        List<String> roles = user.getRoles().stream().map(Role::getCode).sorted().toList();
        JwtClaimsSet.Builder claims = JwtClaimsSet.builder()
            .issuer(props.getSecurity().getJwt().getIssuer())
            .issuedAt(now)
            .expiresAt(now.plus(accessTtl()))
            .subject(user.getUsername())
            .claim("uid", user.getId())
            .claim("name", user.getFullName())
            .claim("roles", roles);
        if (user.getSectorScope() != null) claims.claim("sector", user.getSectorScope().name());
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS512).build(), claims.build())).getTokenValue();
    }

    public Duration accessTtl() { return Duration.ofMinutes(props.getSecurity().getJwt().getAccessTtlMinutes()); }
    public Duration refreshTtl() { return Duration.ofHours(props.getSecurity().getJwt().getRefreshTtlHours()); }
}
