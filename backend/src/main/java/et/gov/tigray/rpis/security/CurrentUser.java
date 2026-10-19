package et.gov.tigray.rpis.security;

import et.gov.tigray.rpis.common.Sector;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import java.util.List;
import java.util.Optional;

/** Convenience accessor for the authenticated principal derived from the JWT. */
public record CurrentUser(Long id, String username, String fullName, List<String> roles, Sector sectorScope) {

    public static Optional<CurrentUser> get() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth instanceof JwtAuthenticationToken token) return Optional.of(from(token.getToken(), token.getAuthorities()));
        return Optional.empty();
    }

    public static CurrentUser from(Jwt jwt, java.util.Collection<? extends GrantedAuthority> authorities) {
        Long id = jwt.getClaim("uid") == null ? null : ((Number) jwt.getClaim("uid")).longValue();
        String sector = jwt.getClaimAsString("sector");
        return new CurrentUser(id, jwt.getSubject(), jwt.getClaimAsString("name"),
                authorities.stream().map(GrantedAuthority::getAuthority).map(a -> a.replace("ROLE_", "")).toList(),
                sector == null ? null : Sector.valueOf(sector));
    }

    public boolean has(String role) { return roles.contains(role); }
    public boolean isFederal() { return has("PMO_FEDERAL"); }
    /** Sector heads only see their sector; everyone else is unscoped. */
    public Sector effectiveSectorFilter(Sector requested) {
        if (has("SECTOR_HEAD") && sectorScope != null) return sectorScope;
        return requested;
    }
}
