package et.gov.tigray.rpis.damage;

import et.gov.tigray.rpis.common.Enums.*;
import et.gov.tigray.rpis.common.Sector;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Damage assessment campaigns: planning, team roles, site assignment, fieldwork tracking, results and endorsement, plus the
 * verified-needs register that project registration starts from. Oversight roles read; analysts and administrators run
 * campaigns; field team members see and work their own sites.
 */
@RestController
@RequestMapping("/api/v1/damage")
@RequiredArgsConstructor
@Tag(name = "Damage assessment campaigns")
public class CampaignController {
    private final CampaignService campaigns;
    private final DamageService damage;

    private static final String READ = "hasAnyRole('EXECUTIVE','SECTOR_HEAD','ANALYST','PMO_FEDERAL','ADMIN')";
    private static final String MANAGE = "hasAnyRole('ANALYST','ADMIN')";

    @GetMapping("/overview")
    @PreAuthorize(READ + " or hasRole('FIELD_OFFICER')")
    @Operation(summary = "Hub figures: campaigns, sites, review backlog, facility damage picture, needs awaiting a project, and the caller's own queue")
    public CampaignDtos.Overview overview(@RequestParam(required = false) Sector sector) { return campaigns.overview(sector); }

    @GetMapping("/needs")
    @PreAuthorize(READ)
    @Operation(summary = "Verified reconstruction needs not yet covered by a project, highest priority first")
    public DamageDtos.NeedsResponse needs(@RequestParam(required = false) Sector sector, @RequestParam(required = false) Short zoneId,
                                          @RequestParam(required = false) Integer weredaId, @RequestParam(required = false) NeedPriority priority) {
        return damage.needs(sector, zoneId, weredaId, priority);
    }

    // ── campaigns ────────────────────────────────────────────────────────
    @GetMapping("/campaigns")
    @PreAuthorize(READ)
    public List<CampaignDtos.CampaignSummary> list(@RequestParam(required = false) Sector sector, @RequestParam(required = false) CampaignStatus status) {
        return campaigns.list(sector, status);
    }

    @PostMapping("/campaigns")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(MANAGE)
    @Operation(summary = "Plan a campaign: name, sector, dates, coordinator and the weredas it covers")
    public CampaignDtos.CampaignDetail create(@Valid @RequestBody CampaignDtos.CampaignRequest req) { return campaigns.create(req); }

    @GetMapping("/campaigns/{id}")
    @PreAuthorize(READ)
    public CampaignDtos.CampaignDetail detail(@PathVariable Long id) { return campaigns.detail(id); }

    @PutMapping("/campaigns/{id}")
    @PreAuthorize(MANAGE)
    public CampaignDtos.CampaignDetail update(@PathVariable Long id, @Valid @RequestBody CampaignDtos.CampaignRequest req) { return campaigns.update(id, req); }

    @PostMapping("/campaigns/{id}/start")
    @PreAuthorize(MANAGE)
    @Operation(summary = "Start fieldwork (needs sites, assessors with sites assigned, and a verifier)")
    public CampaignDtos.CampaignDetail start(@PathVariable Long id) { return campaigns.start(id); }

    @PostMapping("/campaigns/{id}/close-fieldwork")
    @PreAuthorize(MANAGE)
    @Operation(summary = "Close fieldwork and send the findings for endorsement (every site verified, inaccessible or cancelled)")
    public CampaignDtos.CampaignDetail closeFieldwork(@PathVariable Long id) { return campaigns.closeFieldwork(id); }

    @PostMapping("/campaigns/{id}/endorse")
    @PreAuthorize("hasAnyRole('EXECUTIVE','SECTOR_HEAD')")
    @Operation(summary = "Endorse the findings (APPROVE) or return the campaign to fieldwork (RETURN)")
    public CampaignDtos.CampaignDetail endorse(@PathVariable Long id, @Valid @RequestBody CampaignDtos.EndorseRequest req) { return campaigns.endorse(id, req); }

    @PostMapping("/campaigns/{id}/cancel")
    @PreAuthorize(MANAGE)
    public CampaignDtos.CampaignDetail cancel(@PathVariable Long id, @Valid @RequestBody CampaignDtos.ReasonRequest req) { return campaigns.cancel(id, req); }

    @GetMapping("/campaigns/{id}/results")
    @PreAuthorize(READ)
    @Operation(summary = "Verified findings: severity, interventions, priorities, costs, by wereda, facility type, cause and building element")
    public CampaignDtos.CampaignResults results(@PathVariable Long id) { return campaigns.results(id); }

    @GetMapping("/campaigns/{id}/activity")
    @PreAuthorize(READ)
    public List<CampaignDtos.Activity> activity(@PathVariable Long id, @RequestParam(defaultValue = "100") int limit) { return campaigns.activity(id, limit); }

    // ── team ─────────────────────────────────────────────────────────────
    @GetMapping("/campaigns/{id}/member-candidates")
    @PreAuthorize(MANAGE)
    @Operation(summary = "Active field team members for a role, by coverage of the campaign's weredas and current workload")
    public List<CampaignDtos.MemberCandidate> memberCandidates(@PathVariable Long id, @RequestParam(required = false) CampaignRole role) {
        return campaigns.memberCandidates(id, role);
    }

    @PostMapping("/campaigns/{id}/members")
    @PreAuthorize(MANAGE)
    public CampaignDtos.CampaignDetail addMember(@PathVariable Long id, @Valid @RequestBody CampaignDtos.MemberRequest req) { return campaigns.addMember(id, req); }

    @PostMapping("/campaigns/{id}/members/{memberId}/release")
    @PreAuthorize(MANAGE)
    public CampaignDtos.CampaignDetail releaseMember(@PathVariable Long id, @PathVariable Long memberId, @Valid @RequestBody CampaignDtos.ReasonRequest req) {
        return campaigns.releaseMember(id, memberId, req);
    }

    // ── sites ────────────────────────────────────────────────────────────
    @GetMapping("/campaigns/{id}/tasks")
    @PreAuthorize(READ)
    public List<CampaignDtos.TaskRow> tasks(@PathVariable Long id, @RequestParam(required = false) TaskStatus status, @RequestParam(required = false) Integer weredaId,
                                            @RequestParam(required = false) Long assessorAgentId, @RequestParam(required = false) Long verifierAgentId,
                                            @RequestParam(required = false) String q) {
        return campaigns.tasks(id, status, weredaId, assessorAgentId, verifierAgentId, q);
    }

    @GetMapping("/campaigns/{id}/site-candidates")
    @PreAuthorize(MANAGE)
    @Operation(summary = "Register facilities in the campaign's scope that are not yet sites, never-assessed first")
    public List<CampaignDtos.SiteCandidate> siteCandidates(@PathVariable Long id, @RequestParam(required = false) Integer weredaId, @RequestParam(required = false) String q,
                                                           @RequestParam(required = false) FacilityType type, @RequestParam(required = false) DamageSeverity severity,
                                                           @RequestParam(defaultValue = "false") boolean neverAssessed) {
        return campaigns.siteCandidates(id, weredaId, q, type, severity, neverAssessed);
    }

    @PostMapping("/campaigns/{id}/sites")
    @PreAuthorize(MANAGE)
    public CampaignDtos.BulkResult addSites(@PathVariable Long id, @Valid @RequestBody CampaignDtos.AddSitesRequest req) { return campaigns.addSites(id, req); }

    @PostMapping("/campaigns/{id}/facilities")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(MANAGE)
    @Operation(summary = "Register a facility found in the field and add it as a site")
    public CampaignDtos.TaskRow registerFacility(@PathVariable Long id, @Valid @RequestBody CampaignDtos.NewFacilityRequest req) { return campaigns.registerFacility(id, req); }

    @PostMapping("/campaigns/{id}/assign")
    @PreAuthorize(MANAGE)
    @Operation(summary = "Assign assessor and verifier (different people), due date, priority and instructions to sites")
    public CampaignDtos.BulkResult assign(@PathVariable Long id, @Valid @RequestBody CampaignDtos.AssignRequest req) { return campaigns.assign(id, req); }

    // ── a single site ────────────────────────────────────────────────────
    @GetMapping("/tasks/mine")
    @PreAuthorize("hasRole('FIELD_OFFICER')")
    @Operation(summary = "The signed-in field team member's sites, as assessor or verifier")
    public List<CampaignDtos.TaskRow> mine() { return campaigns.myTasks(); }

    @GetMapping("/tasks/{taskId}")
    @PreAuthorize(READ + " or hasRole('FIELD_OFFICER')")
    public CampaignDtos.TaskRow task(@PathVariable Long taskId) { return campaigns.task(taskId); }

    @PostMapping("/tasks/{taskId}/status")
    @PreAuthorize("hasAnyRole('ANALYST','ADMIN','FIELD_OFFICER')")
    @Operation(summary = "Start a site, report it inaccessible, remove it, or reopen it")
    public CampaignDtos.TaskRow taskStatus(@PathVariable Long taskId, @Valid @RequestBody CampaignDtos.TaskStatusRequest req) { return campaigns.taskStatus(taskId, req); }
}
