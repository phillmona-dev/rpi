package et.gov.tigray.rpis.fieldteam;

import et.gov.tigray.rpis.common.Enums.*;
import et.gov.tigray.rpis.common.Sector;
import et.gov.tigray.rpis.security.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Field team operations. Oversight roles read; analysts and administrators register members and assign projects.
 * Personal data (phone, national ID) is not exposed to the federal observer role.
 */
@RestController
@RequestMapping("/api/v1/field-team")
@RequiredArgsConstructor
@Tag(name = "Field team")
public class FieldTeamController {
    private final FieldAgentService agents;
    private final AssignmentService assignments;
    private final FieldTeamQueries queries;

    private static final String READ = "hasAnyRole('EXECUTIVE','SECTOR_HEAD','ANALYST','ADMIN')";
    private static final String MANAGE = "hasAnyRole('ANALYST','ADMIN')";

    @GetMapping("/summary")
    @PreAuthorize(READ)
    public FieldTeamDtos.TeamSummary summary(@RequestParam(required = false) Sector sector) { return queries.summary(scoped(sector)); }

    // ── members ──────────────────────────────────────────────────────────
    @GetMapping("/agents")
    @PreAuthorize(READ)
    @Operation(summary = "Team roster with workload, overdue visits and inspection quality")
    public List<FieldTeamDtos.AgentSummary> agents(@RequestParam(required = false) String q, @RequestParam(required = false) AgentType type,
                                                   @RequestParam(required = false) AgentStatus status, @RequestParam(required = false) Short zoneId,
                                                   @RequestParam(required = false) Integer weredaId, @RequestParam(required = false) Sector sector,
                                                   @RequestParam(required = false) Boolean available, @RequestParam(required = false) Long supervisorId) {
        return agents.list(new FieldTeamQueries.AgentFilter(q, type, status, zoneId, weredaId, scoped(sector), available, null, supervisorId));
    }

    @GetMapping("/agents/{id}")
    @PreAuthorize(READ)
    public FieldTeamDtos.AgentDetail agent(@PathVariable Long id) { return agents.detail(id); }

    @PostMapping("/agents")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(MANAGE)
    @Operation(summary = "Register a team member; optionally create the field app login (temporary password returned once)")
    public FieldTeamDtos.RegisterResponse register(@Valid @RequestBody FieldTeamDtos.AgentRequest req) { return agents.register(req); }

    @PutMapping("/agents/{id}")
    @PreAuthorize(MANAGE)
    public FieldTeamDtos.AgentDetail update(@PathVariable Long id, @Valid @RequestBody FieldTeamDtos.AgentRequest req) { return agents.update(id, req); }

    @PostMapping("/agents/{id}/status")
    @PreAuthorize(MANAGE)
    @Operation(summary = "Activate, place on leave, suspend or deactivate (login follows the status)")
    public FieldTeamDtos.AgentDetail status(@PathVariable Long id, @Valid @RequestBody FieldTeamDtos.StatusChangeRequest req) { return agents.changeStatus(id, req); }

    @PostMapping("/agents/{id}/access")
    @PreAuthorize(MANAGE)
    @Operation(summary = "Create the field app login, or reset its password; the temporary password is shown once")
    public FieldTeamDtos.AccessResponse access(@PathVariable Long id, @RequestBody(required = false) Map<String, String> body) {
        return agents.access(id, body == null ? null : body.get("username"));
    }

    /** The signed-in field officer's own profile and assignments (field app). */
    @GetMapping("/me")
    @PreAuthorize("hasRole('FIELD_OFFICER')")
    public FieldTeamDtos.AgentDetail me() { return agents.me(); }

    // ── assignments ──────────────────────────────────────────────────────
    @GetMapping("/assignments")
    @PreAuthorize(READ)
    public List<FieldTeamDtos.AssignmentDto> assignments(@RequestParam(required = false) Long agentId, @RequestParam(required = false) Long projectId,
                                                         @RequestParam(required = false) AssignmentStatus status, @RequestParam(required = false) Boolean overdue,
                                                         @RequestParam(required = false) Sector sector) {
        return queries.assignments(new FieldTeamQueries.AssignmentFilter(agentId, projectId, status, overdue, null, scoped(sector)));
    }

    @GetMapping("/candidates")
    @PreAuthorize(READ)
    @Operation(summary = "Active members ranked for a project: coverage area, sector, spare capacity, inspection quality, proximity")
    public List<FieldTeamDtos.Candidate> candidates(@RequestParam Long projectId, @RequestParam(required = false) AssignmentRole role) {
        return assignments.candidates(projectId, role);
    }

    @PostMapping("/assignments/check")
    @PreAuthorize(MANAGE)
    public FieldTeamDtos.CheckResult check(@Valid @RequestBody FieldTeamDtos.AssignmentRequest req) { return assignments.check(req); }

    @PostMapping("/assignments")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(MANAGE)
    public FieldTeamDtos.AssignmentDto assign(@Valid @RequestBody FieldTeamDtos.AssignmentRequest req) { return assignments.assign(req); }

    @PostMapping("/assignments/{id}/close")
    @PreAuthorize(MANAGE)
    public FieldTeamDtos.AssignmentDto close(@PathVariable Long id, @Valid @RequestBody FieldTeamDtos.CloseRequest req) { return assignments.close(id, req); }

    @GetMapping("/coverage")
    @PreAuthorize(READ)
    @Operation(summary = "Approved projects with their field team and the most pressing coverage gap")
    public List<FieldTeamDtos.CoverageRow> coverage(@RequestParam(required = false) Sector sector, @RequestParam(required = false) Short zoneId,
                                                    @RequestParam(defaultValue = "false") boolean gapsOnly) {
        return queries.coverage(scoped(sector), zoneId, gapsOnly);
    }

    private static Sector scoped(Sector requested) { return CurrentUser.get().map(u -> u.effectiveSectorFilter(requested)).orElse(requested); }
}
