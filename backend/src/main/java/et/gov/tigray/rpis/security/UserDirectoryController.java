package et.gov.tigray.rpis.security;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Minimal directory for assignment pickers; no credentials or contact details beyond name/role. */
@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
@Tag(name = "User directory")
public class UserDirectoryController {
    private final UserRepository users;

    public record Assignee(Long id, String fullName, String title, List<String> roles, String sectorScope) {}

    @GetMapping("/assignable")
    @Operation(summary = "Enabled users who can own an alert (sector heads, analysts, site managers, executives)")
    @Transactional(readOnly = true)
    public List<Assignee> assignable() {
        return users.findAll().stream().filter(AppUser::isEnabled)
            .filter(u -> u.getRoles().stream().anyMatch(r -> List.of("EXECUTIVE", "SECTOR_HEAD", "ANALYST", "SITE_MANAGER", "ADMIN").contains(r.getCode())))
            .sorted((a, b) -> a.getFullName().compareToIgnoreCase(b.getFullName()))
            .map(u -> new Assignee(u.getId(), u.getFullName(), u.getTitle(), u.getRoles().stream().map(Role::getCode).sorted().toList(), u.getSectorScope() == null ? null : u.getSectorScope().name()))
            .toList();
    }
}
