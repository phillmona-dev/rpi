package et.gov.tigray.rpis.audit;

import et.gov.tigray.rpis.security.CurrentUser;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Map;

/** Pillar 4 requirement: every data read by federal / PMO users is recorded. */
@Component
@RequiredArgsConstructor
public class FederalReadAuditFilter extends OncePerRequestFilter {
    private final AuditService audit;

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws ServletException, IOException {
        chain.doFilter(req, res);
        if ("GET".equals(req.getMethod()) && req.getRequestURI().startsWith("/api/v1/") && !req.getRequestURI().startsWith("/api/v1/auth/")) {
            CurrentUser.get().filter(CurrentUser::isFederal).ifPresent(u ->
                audit.record("FEDERAL_READ", "ENDPOINT", req.getRequestURI(), Map.of("query", String.valueOf(req.getQueryString()), "status", res.getStatus())));
        }
    }
}
