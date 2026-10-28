package et.gov.tigray.rpis.damage;

import et.gov.tigray.rpis.audit.Audited;
import et.gov.tigray.rpis.common.BusinessException;
import et.gov.tigray.rpis.common.Enums.*;
import et.gov.tigray.rpis.common.GeoPoint;
import et.gov.tigray.rpis.common.NotFoundException;
import et.gov.tigray.rpis.common.Sector;
import et.gov.tigray.rpis.facility.Facility;
import et.gov.tigray.rpis.facility.FacilityRepository;
import et.gov.tigray.rpis.geo.Wereda;
import et.gov.tigray.rpis.geo.WeredaRepository;
import et.gov.tigray.rpis.security.CurrentUser;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Types;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.*;

import static et.gov.tigray.rpis.damage.AssessmentSupport.blankToNull;
import static et.gov.tigray.rpis.damage.AssessmentSupport.data;

/**
 * Damage assessment campaigns. Lifecycle: PLANNING (scope, team, sites) → ACTIVE (fieldwork: assessors record, verifiers
 * check) → REVIEW (fieldwork closed, every site verified, inaccessible or cancelled) → COMPLETED once the sector head or the
 * Chief Executive endorses the findings. Analysts and administrators run campaigns; the endorser may not be the coordinator.
 * Team roles: TEAM_LEAD supervises and may record or verify any site; ASSESSOR and ENGINEER record sites; VERIFIER checks
 * submissions. Leads and verifiers must be field analysts or supervisors, and nobody verifies a site they assessed.
 */
@Service
@RequiredArgsConstructor
public class CampaignService {
    private final NamedParameterJdbcTemplate jdbc;
    private final CampaignQueries queries;
    private final AssessmentSupport support;
    private final WeredaRepository weredas;
    private final FacilityRepository facilities;

    record Campaign(Long id, String code, String name, Sector sector, CampaignStatus status, LocalDate plannedStart, LocalDate plannedEnd,
                    Long coordinatorUserId, Long createdByUserId) {}

    private static final Set<TaskStatus> OPEN = EnumSet.of(TaskStatus.PLANNED, TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS, TaskStatus.SUBMITTED, TaskStatus.RETURNED);
    /** Generous envelope around the regional boundary, as for project registration. */
    private static final double LAT_MIN = 12.2, LAT_MAX = 14.95, LNG_MIN = 36.3, LNG_MAX = 40.1;

    // ── queries ──────────────────────────────────────────────────────────
    @Transactional(readOnly = true)
    public List<CampaignDtos.CampaignSummary> list(Sector requested, CampaignStatus status) { return queries.campaigns(scoped(requested), status, null); }

    @Transactional(readOnly = true)
    public CampaignDtos.CampaignDetail detail(Long id) {
        Campaign c = load(id);
        requireVisible(c);
        CurrentUser u = CurrentUser.get().orElse(null);
        var row = jdbc.queryForMap("SELECT objective, methodology, created_by_name, created_at, started_at, fieldwork_closed_at, endorsed_by_name, endorsement_note, cancel_reason FROM assessment_campaign WHERE id = :id",
            new MapSqlParameterSource("id", id));
        CampaignDtos.CampaignSummary summary = queries.campaigns(null, null, id).get(0);
        boolean manage = canManage(u);
        String startReason = manage ? cannotStartReason(c) : "Only analysts and administrators run assessment rounds";
        String closeReason = manage ? cannotCloseReason(c) : "Only analysts and administrators run assessment rounds";
        String endorseReason = cannotEndorseReason(c, u);
        return new CampaignDtos.CampaignDetail(summary, (String) row.get("objective"), (String) row.get("methodology"), queries.weredas(id),
            c.coordinatorUserId(), (String) row.get("created_by_name"), ts(row.get("created_at")), ts(row.get("started_at")), ts(row.get("fieldwork_closed_at")),
            (String) row.get("endorsed_by_name"), (String) row.get("endorsement_note"), (String) row.get("cancel_reason"),
            queries.members(id, u != null && !u.isFederal()),
            new CampaignDtos.CampaignPermissions(manage && c.status() != CampaignStatus.COMPLETED && c.status() != CampaignStatus.CANCELLED,
                startReason == null, startReason, closeReason == null, closeReason, endorseReason == null, endorseReason,
                manage && (c.status() == CampaignStatus.PLANNING || c.status() == CampaignStatus.ACTIVE)));
    }

    @Transactional(readOnly = true)
    public List<CampaignDtos.TaskRow> tasks(Long campaignId, TaskStatus status, Integer weredaId, Long assessorAgentId, Long verifierAgentId, String q) {
        Campaign c = load(campaignId);
        requireVisible(c);
        Sector sector = CurrentUser.get().map(u -> u.effectiveSectorFilter(null)).orElse(null);
        return queries.tasks(new CampaignQueries.TaskFilter(campaignId, status, weredaId, assessorAgentId, verifierAgentId, q, null, null, sector));
    }

    @Transactional(readOnly = true)
    public CampaignDtos.TaskRow task(Long taskId) {
        CampaignDtos.TaskRow t = queries.tasks(CampaignQueries.TaskFilter.one(taskId)).stream().findFirst().orElseThrow(() -> new NotFoundException("Assessment task", taskId));
        CurrentUser u = CurrentUser.get().orElse(null);
        if (u != null && u.has("FIELD_OFFICER") && !u.has("ANALYST") && !u.has("ADMIN")) {
            Long me = support.agentOfUser(u.id());
            boolean mine = me != null && ((t.assessor() != null && me.equals(t.assessor().agentId())) || (t.verifier() != null && me.equals(t.verifier().agentId()))
                || isActiveMember(t.campaignId(), me, CampaignRole.TEAM_LEAD));
            if (!mine) throw BusinessException.forbidden("not_your_task", "This site is not assigned to you");
        } else if (u != null && u.has("SECTOR_HEAD") && u.sectorScope() != null && u.sectorScope() != t.facility().sector()) {
            throw BusinessException.forbidden("out_of_scope", "This site is outside your sector");
        }
        return t;
    }

    /** Sites assigned to the signed-in field team member, as assessor or verifier, in campaigns that are still running. */
    @Transactional(readOnly = true)
    public List<CampaignDtos.TaskRow> myTasks() {
        CurrentUser u = CurrentUser.get().orElseThrow(() -> BusinessException.unauthorized("unauthenticated", "Sign in required"));
        Long me = support.agentOfUser(u.id());
        if (me == null) return List.of();
        return queries.tasks(new CampaignQueries.TaskFilter(null, null, null, null, null, null, me, null, null));
    }

    @Transactional(readOnly = true)
    public List<CampaignDtos.SiteCandidate> siteCandidates(Long campaignId, Integer weredaId, String q, FacilityType type, DamageSeverity severity, boolean neverAssessed) {
        Campaign c = load(campaignId);
        return queries.siteCandidates(campaignId, c.sector(), weredaId, q, type, severity, neverAssessed);
    }

    @Transactional(readOnly = true)
    public List<CampaignDtos.MemberCandidate> memberCandidates(Long campaignId, CampaignRole role) {
        Campaign c = load(campaignId);
        return queries.memberCandidates(campaignId, c.sector(), role);
    }

    @Transactional(readOnly = true)
    public CampaignDtos.CampaignResults results(Long campaignId) { requireVisible(load(campaignId)); return queries.results(campaignId); }

    @Transactional(readOnly = true)
    public List<CampaignDtos.Activity> activity(Long campaignId, int limit) { requireVisible(load(campaignId)); return queries.activity(campaignId, limit); }

    @Transactional(readOnly = true)
    public CampaignDtos.Overview overview(Sector requested) {
        CurrentUser u = CurrentUser.get().orElse(null);
        return queries.overview(scoped(requested), u, u == null ? null : support.agentOfUser(u.id()));
    }

    // ── campaign lifecycle ───────────────────────────────────────────────
    @Audited(action = "CAMPAIGN_CREATE", entityType = "ASSESSMENT_CAMPAIGN")
    @Transactional
    public CampaignDtos.CampaignDetail create(CampaignDtos.CampaignRequest req) {
        CurrentUser u = CurrentUser.get().orElse(null);
        validate(req, u, null);
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        Long seq = jdbc.queryForObject("SELECT nextval('assessment_campaign_seq')", new MapSqlParameterSource(), Long.class);
        String code = "DA-%d-%03d".formatted(today.getYear(), seq);
        Long coordinator = req.coordinatorUserId() != null ? req.coordinatorUserId() : u == null ? null : u.id();
        Long id = jdbc.queryForObject("""
            INSERT INTO assessment_campaign(code, name, sector, objective, methodology, planned_start, planned_end, coordinator_user_id, coordinator_name, created_by_user_id, created_by_name)
            VALUES (:code, :name, :sector, :objective, :methodology, :start, :end, :coord, (SELECT full_name FROM app_user WHERE id = :coord), :uid, :uname)
            RETURNING id
            """, new MapSqlParameterSource("code", code).addValue("name", req.name().trim()).addValue("sector", req.sector() == null ? null : req.sector().name(), Types.VARCHAR)
                .addValue("objective", blankToNull(req.objective()), Types.VARCHAR).addValue("methodology", blankToNull(req.methodology()), Types.VARCHAR)
                .addValue("start", req.plannedStart()).addValue("end", req.plannedEnd()).addValue("coord", coordinator, Types.BIGINT)
                .addValue("uid", u == null ? null : u.id(), Types.BIGINT).addValue("uname", u == null ? "system" : u.fullName()), Long.class);
        setWeredas(id, req.weredaIds());
        support.log(id, null, null, "CREATED", null, data("code", code, "weredas", req.weredaIds().size()));
        return detail(id);
    }

    @Audited(action = "CAMPAIGN_UPDATE", entityType = "ASSESSMENT_CAMPAIGN")
    @Transactional
    public CampaignDtos.CampaignDetail update(Long id, CampaignDtos.CampaignRequest req) {
        Campaign c = load(id);
        requireStatus(c, CampaignStatus.PLANNING, CampaignStatus.ACTIVE);
        CurrentUser u = CurrentUser.get().orElse(null);
        validate(req, u, c);
        // Weredas that already hold sites cannot leave the scope.
        List<String> blocked = jdbc.queryForList("""
            SELECT DISTINCT w.name_en FROM assessment_task t JOIN facility f ON f.id = t.facility_id JOIN wereda w ON w.id = f.wereda_id
            WHERE t.campaign_id = :c AND t.status <> 'CANCELLED' AND NOT (f.wereda_id IN (:keep))
            """, new MapSqlParameterSource("c", id).addValue("keep", req.weredaIds()), String.class);
        if (!blocked.isEmpty()) throw BusinessException.conflict("wereda_has_sites", "These weredas have sites in the assessment round and must stay in scope: " + String.join(", ", blocked));
        if (c.sector() != req.sector() && req.sector() != null) {
            Long other = jdbc.queryForObject("SELECT count(*) FROM assessment_task t JOIN facility f ON f.id = t.facility_id WHERE t.campaign_id = :c AND t.status <> 'CANCELLED' AND f.sector <> :s",
                new MapSqlParameterSource("c", id).addValue("s", req.sector().name()), Long.class);
            if (other != null && other > 0) throw BusinessException.conflict("sector_has_sites", other + " sites belong to another sector; cancel them before narrowing the campaign");
        }
        jdbc.update("""
            UPDATE assessment_campaign SET name = :name, sector = :sector, objective = :objective, methodology = :methodology, planned_start = :start, planned_end = :end,
                   coordinator_user_id = coalesce(:coord, coordinator_user_id),
                   coordinator_name = coalesce((SELECT full_name FROM app_user WHERE id = :coord), coordinator_name), updated_at = now()
            WHERE id = :id
            """, new MapSqlParameterSource("id", id).addValue("name", req.name().trim()).addValue("sector", req.sector() == null ? null : req.sector().name(), Types.VARCHAR)
                .addValue("objective", blankToNull(req.objective()), Types.VARCHAR).addValue("methodology", blankToNull(req.methodology()), Types.VARCHAR)
                .addValue("start", req.plannedStart()).addValue("end", req.plannedEnd()).addValue("coord", req.coordinatorUserId(), Types.BIGINT));
        jdbc.update("DELETE FROM assessment_campaign_wereda WHERE campaign_id = :c", new MapSqlParameterSource("c", id));
        setWeredas(id, req.weredaIds());
        support.log(id, null, null, "UPDATED", null, null);
        return detail(id);
    }

    @Audited(action = "CAMPAIGN_START", entityType = "ASSESSMENT_CAMPAIGN")
    @Transactional
    public CampaignDtos.CampaignDetail start(Long id) {
        Campaign c = load(id);
        String reason = cannotStartReason(c);
        if (reason != null) throw BusinessException.conflict("cannot_start", reason);
        jdbc.update("UPDATE assessment_campaign SET status = 'ACTIVE', started_at = now(), updated_at = now() WHERE id = :id", new MapSqlParameterSource("id", id));
        support.log(id, null, null, "STARTED", null, null);
        // Everyone on the team with a login hears that fieldwork has begun.
        support.notice(jdbc.queryForList("""
            SELECT DISTINCT fa.user_id FROM assessment_campaign_member m JOIN field_agent fa ON fa.id = m.agent_id WHERE m.campaign_id = :c AND m.active AND fa.user_id IS NOT NULL
            """, new MapSqlParameterSource("c", id), Long.class), "CAMPAIGN_STARTED", "INFO", "/damage/my-tasks", data("campaignId", id, "code", c.code(), "name", c.name()));
        return detail(id);
    }

    @Audited(action = "CAMPAIGN_CLOSE_FIELDWORK", entityType = "ASSESSMENT_CAMPAIGN")
    @Transactional
    public CampaignDtos.CampaignDetail closeFieldwork(Long id) {
        Campaign c = load(id);
        String reason = cannotCloseReason(c);
        if (reason != null) throw BusinessException.conflict("cannot_close", reason);
        jdbc.update("UPDATE assessment_campaign SET status = 'REVIEW', fieldwork_closed_at = now(), updated_at = now() WHERE id = :id", new MapSqlParameterSource("id", id));
        support.log(id, null, null, "FIELDWORK_CLOSED", null, null);
        support.notice(endorsers(c), "CAMPAIGN_REVIEW", "INFO", "/damage/campaigns/" + id, data("campaignId", id, "code", c.code(), "name", c.name()));
        return detail(id);
    }

    /** Endorse the findings (campaign completes) or send the campaign back to fieldwork with comments. */
    @Audited(action = "CAMPAIGN_ENDORSE", entityType = "ASSESSMENT_CAMPAIGN")
    @Transactional
    public CampaignDtos.CampaignDetail endorse(Long id, CampaignDtos.EndorseRequest req) {
        Campaign c = load(id);
        CurrentUser u = CurrentUser.get().orElse(null);
        String reason = cannotEndorseReason(c, u);
        if (reason != null) throw BusinessException.conflict("cannot_endorse", reason);
        String note = blankToNull(req.note());
        Set<Long> to = new LinkedHashSet<>();
        to.add(c.coordinatorUserId()); to.add(c.createdByUserId());
        switch (req.decision()) {
            case APPROVE -> {
                LocalDate today = LocalDate.now(ZoneOffset.UTC);
                String ref = "EN-%d-%04d".formatted(today.getYear(), jdbc.queryForObject("SELECT nextval('assessment_endorsement_seq')", new MapSqlParameterSource(), Long.class));
                jdbc.update("""
                    UPDATE assessment_campaign SET status = 'COMPLETED', endorsed_at = now(), endorsed_by_user_id = :uid, endorsed_by_name = :name,
                           endorsement_reference = :ref, endorsement_note = :note, updated_at = now() WHERE id = :id
                    """, new MapSqlParameterSource("id", id).addValue("uid", u.id()).addValue("name", u.fullName()).addValue("ref", ref).addValue("note", note, Types.VARCHAR));
                support.log(id, null, null, "ENDORSED", note, data("reference", ref));
                support.notice(to, "CAMPAIGN_ENDORSED", "SUCCESS", "/damage/campaigns/" + id, data("campaignId", id, "code", c.code(), "name", c.name(), "reference", ref));
            }
            case RETURN -> {
                if (note == null || note.length() < 10) throw BusinessException.invalid("A reason is required", List.of(Map.of("field", "note", "message", "Explain what must be done before approval in at least 10 characters")));
                jdbc.update("UPDATE assessment_campaign SET status = 'ACTIVE', fieldwork_closed_at = NULL, updated_at = now() WHERE id = :id", new MapSqlParameterSource("id", id));
                support.log(id, null, null, "RETURNED_TO_FIELDWORK", note, null);
                support.notice(to, "CAMPAIGN_RETURNED", "WARNING", "/damage/campaigns/" + id, data("campaignId", id, "code", c.code(), "name", c.name(), "excerpt", note));
            }
            default -> throw BusinessException.badRequest("invalid_decision", "Approve (APPROVE) or return (RETURN) the assessment round");
        }
        return detail(id);
    }

    @Audited(action = "CAMPAIGN_CANCEL", entityType = "ASSESSMENT_CAMPAIGN")
    @Transactional
    public CampaignDtos.CampaignDetail cancel(Long id, CampaignDtos.ReasonRequest req) {
        Campaign c = load(id);
        requireStatus(c, CampaignStatus.PLANNING, CampaignStatus.ACTIVE);
        Long submitted = jdbc.queryForObject("SELECT count(*) FROM assessment_task WHERE campaign_id = :c AND status = 'SUBMITTED'", new MapSqlParameterSource("c", id), Long.class);
        if (submitted != null && submitted > 0) throw BusinessException.conflict("submissions_pending", submitted + " assessments are awaiting review; review them before cancelling");
        jdbc.update("UPDATE assessment_campaign SET status = 'CANCELLED', cancel_reason = :r, updated_at = now() WHERE id = :id", new MapSqlParameterSource("id", id).addValue("r", req.reason().trim()));
        jdbc.update("UPDATE assessment_task SET status = 'CANCELLED', status_note = 'Campaign cancelled', updated_at = now() WHERE campaign_id = :c AND status IN ('PLANNED', 'ASSIGNED', 'IN_PROGRESS', 'RETURNED')",
            new MapSqlParameterSource("c", id));
        support.log(id, null, null, "CANCELLED", req.reason().trim(), null);
        return detail(id);
    }

    // ── team ─────────────────────────────────────────────────────────────
    @Audited(action = "CAMPAIGN_MEMBER_ADD", entityType = "ASSESSMENT_CAMPAIGN")
    @Transactional
    public CampaignDtos.CampaignDetail addMember(Long id, CampaignDtos.MemberRequest req) {
        Campaign c = load(id);
        requireStatus(c, CampaignStatus.PLANNING, CampaignStatus.ACTIVE, CampaignStatus.REVIEW);
        var agent = jdbc.queryForList("SELECT full_name, agent_type, status, user_id FROM field_agent WHERE id = :a", new MapSqlParameterSource("a", req.agentId()));
        if (agent.isEmpty()) throw new NotFoundException("Field team member", req.agentId());
        var a = agent.get(0);
        if (!"ACTIVE".equals(a.get("status"))) throw BusinessException.conflict("agent_not_active", a.get("full_name") + " is not an active team member (" + a.get("status") + ")");
        if ((req.role() == CampaignRole.VERIFIER || req.role() == CampaignRole.TEAM_LEAD) && "DATA_COLLECTOR".equals(a.get("agent_type")))
            throw BusinessException.conflict("role_needs_analyst", "Team leads and checkers must be field analysts or supervisors");
        if (isActiveMember(id, req.agentId(), req.role())) throw BusinessException.conflict("already_member", a.get("full_name") + " already holds this role in the campaign");
        CurrentUser u = CurrentUser.get().orElse(null);
        jdbc.update("INSERT INTO assessment_campaign_member(campaign_id, agent_id, role, added_by_name) VALUES (:c, :a, :r, :by)",
            new MapSqlParameterSource("c", id).addValue("a", req.agentId()).addValue("r", req.role().name()).addValue("by", u == null ? "system" : u.fullName()));
        support.log(id, null, null, "MEMBER_ADDED", null, data("agent", a.get("full_name"), "role", req.role().name()));
        Long userId = a.get("user_id") == null ? null : ((Number) a.get("user_id")).longValue();
        support.notice(userId == null ? List.of() : List.of(userId), "CAMPAIGN_MEMBER", "INFO", "/damage/my-tasks",
            data("campaignId", id, "code", c.code(), "name", c.name(), "role", req.role().name()));
        return detail(id);
    }

    @Audited(action = "CAMPAIGN_MEMBER_RELEASE", entityType = "ASSESSMENT_CAMPAIGN")
    @Transactional
    public CampaignDtos.CampaignDetail releaseMember(Long id, Long memberId, CampaignDtos.ReasonRequest req) {
        Campaign c = load(id);
        requireStatus(c, CampaignStatus.PLANNING, CampaignStatus.ACTIVE, CampaignStatus.REVIEW);
        var rows = jdbc.queryForList("SELECT m.agent_id, m.role, fa.full_name FROM assessment_campaign_member m JOIN field_agent fa ON fa.id = m.agent_id WHERE m.id = :m AND m.campaign_id = :c AND m.active",
            new MapSqlParameterSource("m", memberId).addValue("c", id));
        if (rows.isEmpty()) throw new NotFoundException("Assessment round member", memberId);
        Long agentId = ((Number) rows.get(0).get("agent_id")).longValue();
        CampaignRole role = CampaignRole.valueOf((String) rows.get(0).get("role"));
        // Sites still depending on this person in this role must be handed over first.
        String column = role == CampaignRole.VERIFIER ? "verifier_agent_id" : "assessor_agent_id";
        boolean holdsOther = role == CampaignRole.TEAM_LEAD || jdbc.queryForObject("""
            SELECT count(*) FROM assessment_campaign_member WHERE campaign_id = :c AND agent_id = :a AND active AND id <> :m AND role IN (:roles)
            """, new MapSqlParameterSource("c", id).addValue("a", agentId).addValue("m", memberId)
                .addValue("roles", role == CampaignRole.VERIFIER ? List.of("TEAM_LEAD") : List.of("ASSESSOR", "ENGINEER", "TEAM_LEAD")), Long.class) > 0;
        if (!holdsOther) {
            Long open = jdbc.queryForObject("SELECT count(*) FROM assessment_task WHERE campaign_id = :c AND " + column + " = :a AND status IN ('PLANNED', 'ASSIGNED', 'IN_PROGRESS', 'SUBMITTED', 'RETURNED')",
                new MapSqlParameterSource("c", id).addValue("a", agentId), Long.class);
            if (open != null && open > 0) throw BusinessException.conflict("member_has_sites", rows.get(0).get("full_name") + " still has " + open + " open sites in this role; reassign them first");
        }
        CurrentUser u = CurrentUser.get().orElse(null);
        jdbc.update("UPDATE assessment_campaign_member SET active = FALSE, released_at = now(), released_by_name = :by, release_reason = :r WHERE id = :m",
            new MapSqlParameterSource("m", memberId).addValue("by", u == null ? "system" : u.fullName()).addValue("r", req.reason().trim()));
        support.log(id, null, null, "MEMBER_RELEASED", req.reason().trim(), data("agent", rows.get(0).get("full_name"), "role", role.name()));
        return detail(id);
    }

    // ── sites ────────────────────────────────────────────────────────────
    @Audited(action = "CAMPAIGN_SITES_ADD", entityType = "ASSESSMENT_CAMPAIGN")
    @Transactional
    public CampaignDtos.BulkResult addSites(Long id, CampaignDtos.AddSitesRequest req) {
        Campaign c = load(id);
        requireStatus(c, CampaignStatus.PLANNING, CampaignStatus.ACTIVE);
        List<String> skipped = new ArrayList<>();
        int added = 0;
        Set<Integer> scope = new HashSet<>(jdbc.queryForList("SELECT wereda_id FROM assessment_campaign_wereda WHERE campaign_id = :c", new MapSqlParameterSource("c", id), Integer.class));
        for (Long fid : new LinkedHashSet<>(req.facilityIds())) {
            Facility f = facilities.findWithWeredaById(fid).orElse(null);
            if (f == null) { skipped.add("#" + fid + ": unknown facility"); continue; }
            if (!scope.contains(f.getWereda().getId())) { skipped.add(f.getName() + ": outside the weredas of this assessment round"); continue; }
            if (c.sector() != null && c.sector() != f.getSector()) { skipped.add(f.getName() + ": outside the sector of this assessment round"); continue; }
            int n = jdbc.update("""
                INSERT INTO assessment_task(campaign_id, facility_id, priority, due_on) VALUES (:c, :f, :p, :due) ON CONFLICT (campaign_id, facility_id) DO NOTHING
                """, new MapSqlParameterSource("c", id).addValue("f", fid).addValue("p", (req.priority() == null ? AssignmentPriority.NORMAL : req.priority()).name())
                    .addValue("due", req.dueOn() != null ? req.dueOn() : c.plannedEnd()));
            if (n == 0) skipped.add(f.getName() + ": already in this assessment round"); else added++;
        }
        if (added > 0) support.log(id, null, null, "SITES_ADDED", null, data("count", added));
        return new CampaignDtos.BulkResult(added, skipped);
    }

    /** Registers a facility found in the field that is not yet in the register, and adds it to the campaign. */
    @Audited(action = "FACILITY_REGISTER", entityType = "FACILITY")
    @Transactional
    public CampaignDtos.TaskRow registerFacility(Long id, CampaignDtos.NewFacilityRequest req) {
        Campaign c = load(id);
        requireStatus(c, CampaignStatus.PLANNING, CampaignStatus.ACTIVE);
        if (c.sector() != null && req.facilityType().sector != c.sector()) throw BusinessException.badRequest("sector_mismatch", "The assessment round covers the " + c.sector() + " sector only");
        Long inScope = jdbc.queryForObject("SELECT count(*) FROM assessment_campaign_wereda WHERE campaign_id = :c AND wereda_id = :w", new MapSqlParameterSource("c", id).addValue("w", req.weredaId()), Long.class);
        if (inScope == null || inScope == 0) throw BusinessException.badRequest("wereda_out_of_scope", "Add the wereda to the assessment round first");
        if ((req.latitude() == null) != (req.longitude() == null)) throw BusinessException.badRequest("coordinates", "Provide both latitude and longitude, or neither");
        if (req.latitude() != null && (req.latitude() < LAT_MIN || req.latitude() > LAT_MAX || req.longitude() < LNG_MIN || req.longitude() > LNG_MAX))
            throw BusinessException.badRequest("coordinates", "The coordinates are outside Tigray");
        Long dup = jdbc.queryForObject("SELECT count(*) FROM facility WHERE wereda_id = :w AND lower(name) = lower(:n)", new MapSqlParameterSource("w", req.weredaId()).addValue("n", req.name().trim()), Long.class);
        if (dup != null && dup > 0) throw BusinessException.conflict("facility_exists", "A facility with this name is already registered in the wereda; add it from the register instead");
        Wereda w = weredas.findById(req.weredaId()).orElseThrow(() -> new NotFoundException("Wereda", req.weredaId()));
        Facility f = new Facility();
        f.setCode(nextFacilityCode(req.facilityType().sector));
        f.setSector(req.facilityType().sector);
        f.setFacilityType(req.facilityType());
        f.setName(req.name().trim());
        f.setWereda(w);
        f.setKebele(blankToNull(req.kebele()));
        f.setLocation(req.latitude() == null ? null : GeoPoint.jts(req.latitude(), req.longitude()));
        f.setPreCrisisCapacity(req.preCrisisCapacity());
        f.setCapacityUnit(blankToNull(req.capacityUnit()));
        f.setBeneficiaries(req.beneficiaries());
        f.setOperationalStatus(OperationalStatus.NON_FUNCTIONAL);
        Facility saved = facilities.saveAndFlush(f);
        Long taskId = jdbc.queryForObject("INSERT INTO assessment_task(campaign_id, facility_id, priority, due_on) VALUES (:c, :f, :p, :due) RETURNING id",
            new MapSqlParameterSource("c", id).addValue("f", saved.getId()).addValue("p", (req.priority() == null ? AssignmentPriority.NORMAL : req.priority()).name()).addValue("due", c.plannedEnd()), Long.class);
        support.log(id, taskId, null, "FACILITY_REGISTERED", null, data("facility", saved.getName(), "code", saved.getCode()));
        return queries.tasks(CampaignQueries.TaskFilter.one(taskId)).get(0);
    }

    /** Assigns (or reassigns) assessor, verifier, due date and priority on one or more sites. */
    @Audited(action = "CAMPAIGN_ASSIGN", entityType = "ASSESSMENT_CAMPAIGN")
    @Transactional
    public CampaignDtos.BulkResult assign(Long id, CampaignDtos.AssignRequest req) {
        Campaign c = load(id);
        requireStatus(c, CampaignStatus.PLANNING, CampaignStatus.ACTIVE);
        if (req.assessorAgentId() == null && req.verifierAgentId() == null && req.dueOn() == null && req.priority() == null && req.instructions() == null)
            throw BusinessException.badRequest("nothing_to_change", "Choose an assessor, checker, due date, priority or instructions");
        if (req.assessorAgentId() != null && !(isActiveMember(id, req.assessorAgentId(), CampaignRole.ASSESSOR) || isActiveMember(id, req.assessorAgentId(), CampaignRole.ENGINEER)
            || isActiveMember(id, req.assessorAgentId(), CampaignRole.TEAM_LEAD)))
            throw BusinessException.conflict("not_assessor", "The assessor must be on the assessment round team as assessor, engineer or team lead");
        if (req.verifierAgentId() != null && !(isActiveMember(id, req.verifierAgentId(), CampaignRole.VERIFIER) || isActiveMember(id, req.verifierAgentId(), CampaignRole.TEAM_LEAD)))
            throw BusinessException.conflict("not_verifier", "The checker must be on the assessment round team as checker or team lead");
        if (req.assessorAgentId() != null && req.assessorAgentId().equals(req.verifierAgentId()))
            throw BusinessException.conflict("same_person", "The assessor and the checker of a site must be different people");

        CurrentUser u = CurrentUser.get().orElse(null);
        List<String> skipped = new ArrayList<>();
        Map<Long, List<String>> newlyAssigned = new LinkedHashMap<>();
        int updated = 0;
        for (Long taskId : new LinkedHashSet<>(req.taskIds())) {
            var rows = jdbc.queryForList("SELECT t.status, t.assessor_agent_id, t.verifier_agent_id, f.name FROM assessment_task t JOIN facility f ON f.id = t.facility_id WHERE t.id = :t AND t.campaign_id = :c",
                new MapSqlParameterSource("t", taskId).addValue("c", id));
            if (rows.isEmpty()) { skipped.add("#" + taskId + ": not in this assessment round"); continue; }
            var t = rows.get(0);
            TaskStatus status = TaskStatus.valueOf((String) t.get("status"));
            String name = (String) t.get("name");
            Long assessor = t.get("assessor_agent_id") == null ? null : ((Number) t.get("assessor_agent_id")).longValue();
            Long verifier = t.get("verifier_agent_id") == null ? null : ((Number) t.get("verifier_agent_id")).longValue();
            if (!OPEN.contains(status)) { skipped.add(name + (status == TaskStatus.VERIFIED ? ": already checked" : ": closed (unreachable or removed)")); continue; }
            boolean changeAssessor = req.assessorAgentId() != null && !req.assessorAgentId().equals(assessor);
            if (changeAssessor && (status == TaskStatus.SUBMITTED || status == TaskStatus.RETURNED)) { skipped.add(name + ": already recorded by the current assessor"); continue; }
            Long newAssessor = changeAssessor ? req.assessorAgentId() : assessor;
            Long newVerifier = req.verifierAgentId() != null ? req.verifierAgentId() : verifier;
            if (newAssessor != null && newAssessor.equals(newVerifier)) { skipped.add(name + ": the assessor and the checker would be the same person"); continue; }
            jdbc.update("""
                UPDATE assessment_task SET assessor_agent_id = :a, verifier_agent_id = :v,
                       due_on = coalesce(:due, due_on), priority = coalesce(:p, priority), instructions = coalesce(:ins, instructions),
                       status = CASE WHEN status = 'PLANNED' AND CAST(:a AS bigint) IS NOT NULL THEN 'ASSIGNED' ELSE status END,
                       assigned_at = CASE WHEN :changed THEN now() ELSE assigned_at END, assigned_by_name = CASE WHEN :changed THEN :by ELSE assigned_by_name END,
                       updated_at = now()
                WHERE id = :t
                """, new MapSqlParameterSource("t", taskId).addValue("a", newAssessor, Types.BIGINT).addValue("v", newVerifier, Types.BIGINT)
                    .addValue("due", req.dueOn(), Types.DATE).addValue("p", req.priority() == null ? null : req.priority().name(), Types.VARCHAR)
                    .addValue("ins", blankToNull(req.instructions()), Types.VARCHAR).addValue("changed", changeAssessor).addValue("by", u == null ? "system" : u.fullName()));
            support.log(id, taskId, null, changeAssessor ? "ASSIGNED" : "TASK_UPDATED", null,
                data("assessorAgentId", newAssessor, "verifierAgentId", newVerifier, "dueOn", req.dueOn() == null ? null : req.dueOn().toString()));
            if (changeAssessor) newlyAssigned.computeIfAbsent(newAssessor, k -> new ArrayList<>()).add(name);
            updated++;
        }
        newlyAssigned.forEach((agentId, sites) -> support.notice(Collections.singletonList(support.userOfAgent(agentId)), "ASSESSMENT_TASKS", "INFO", "/damage/my-tasks",
            data("campaignId", id, "code", c.code(), "name", c.name(), "count", sites.size(), "subject", sites.get(0))));
        return new CampaignDtos.BulkResult(updated, skipped);
    }

    /** Field progress on a site: started, inaccessible, cancelled, or reopened. */
    @Audited(action = "CAMPAIGN_TASK_STATUS", entityType = "ASSESSMENT_TASK")
    @Transactional
    public CampaignDtos.TaskRow taskStatus(Long taskId, CampaignDtos.TaskStatusRequest req) {
        CampaignDtos.TaskRow t = task(taskId);
        Campaign c = load(t.campaignId());
        CurrentUser u = CurrentUser.get().orElseThrow(() -> BusinessException.unauthorized("unauthenticated", "Sign in required"));
        boolean manage = canManage(u);
        Long me = support.agentOfUser(u.id());
        boolean assessor = me != null && t.assessor() != null && me.equals(t.assessor().agentId());
        boolean lead = me != null && isActiveMember(c.id(), me, CampaignRole.TEAM_LEAD);
        String note = blankToNull(req.note());
        TaskStatus from = t.status();
        TaskStatus to = req.status();
        switch (to) {
            case IN_PROGRESS -> {
                if (!(manage || assessor || lead)) throw BusinessException.forbidden("not_assessor", "Only the site's assessor or a team lead can start it");
                if (c.status() != CampaignStatus.ACTIVE) throw BusinessException.conflict("campaign_not_active", "Site visits for this assessment round are not under way");
                if (from != TaskStatus.ASSIGNED) throw BusinessException.conflict("invalid_transition", "Only assigned sites can be started");
            }
            case INACCESSIBLE -> {
                if (!(manage || assessor || lead)) throw BusinessException.forbidden("not_assessor", "Only the site's assessor, a team lead or an analyst can report access problems");
                if (!EnumSet.of(TaskStatus.PLANNED, TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS, TaskStatus.RETURNED).contains(from)) throw BusinessException.conflict("invalid_transition", "This site cannot be changed at this point");
                requireNote(note, "Describe why the site cannot be reached (security, road, flooding…)");
            }
            case CANCELLED -> {
                if (!manage) throw BusinessException.forbidden("not_manager", "Only analysts and administrators remove sites");
                if (!EnumSet.of(TaskStatus.PLANNED, TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS, TaskStatus.RETURNED, TaskStatus.INACCESSIBLE).contains(from)) throw BusinessException.conflict("invalid_transition", "This site cannot be changed at this point");
                requireNote(note, "Explain why the site is removed from the assessment round");
            }
            case PLANNED, ASSIGNED -> {
                if (!manage) throw BusinessException.forbidden("not_manager", "Only analysts and administrators reopen sites");
                if (from != TaskStatus.INACCESSIBLE && from != TaskStatus.CANCELLED) throw BusinessException.conflict("invalid_transition", "Only inaccessible or cancelled sites can be reopened");
                to = t.assessor() == null ? TaskStatus.PLANNED : TaskStatus.ASSIGNED;
            }
            default -> throw BusinessException.badRequest("invalid_status", "Sites move to submitted and checked through their assessment");
        }
        if (c.status() == CampaignStatus.COMPLETED || c.status() == CampaignStatus.CANCELLED) throw BusinessException.conflict("campaign_closed", "This assessment round is already finished or cancelled");
        jdbc.update("""
            UPDATE assessment_task SET status = :s, status_note = :n, started_at = CASE WHEN :s = 'IN_PROGRESS' THEN now() ELSE started_at END, updated_at = now() WHERE id = :t
            """, new MapSqlParameterSource("t", taskId).addValue("s", to.name()).addValue("n", note, Types.VARCHAR));
        support.log(c.id(), taskId, null, "TASK_" + to.name(), note, data("from", from.name()));
        if (to == TaskStatus.INACCESSIBLE) support.notice(Collections.singletonList(c.coordinatorUserId()), "ASSESSMENT_INACCESSIBLE", "WARNING", "/damage/campaigns/" + c.id() + "?view=sites",
            data("campaignId", c.id(), "code", c.code(), "subject", t.facility().name(), "excerpt", note));
        return queries.tasks(CampaignQueries.TaskFilter.one(taskId)).get(0);
    }

    // ── rules ────────────────────────────────────────────────────────────
    private String cannotStartReason(Campaign c) {
        if (c.status() != CampaignStatus.PLANNING) return "The assessment round has already started";
        var r = jdbc.queryForMap("""
            SELECT (SELECT count(*) FROM assessment_task WHERE campaign_id = :c AND status <> 'CANCELLED') sites,
                   (SELECT count(*) FROM assessment_task WHERE campaign_id = :c AND status = 'PLANNED') unassigned,
                   (SELECT count(*) FROM assessment_campaign_member WHERE campaign_id = :c AND active AND role IN ('ASSESSOR', 'ENGINEER', 'TEAM_LEAD')) assessors,
                   (SELECT count(*) FROM assessment_campaign_member WHERE campaign_id = :c AND active AND role IN ('VERIFIER', 'TEAM_LEAD')) verifiers
            """, new MapSqlParameterSource("c", c.id()));
        if (((Number) r.get("sites")).longValue() == 0) return "Add the sites to assess first";
        if (((Number) r.get("assessors")).longValue() == 0) return "Add at least one assessor to the team";
        if (((Number) r.get("verifiers")).longValue() == 0) return "Add at least one checker or team lead to the team";
        long unassigned = ((Number) r.get("unassigned")).longValue();
        if (unassigned > 0) return unassigned + " sites have no assessor yet";
        return null;
    }

    private String cannotCloseReason(Campaign c) {
        if (c.status() != CampaignStatus.ACTIVE) return "Site visits can only be closed while the assessment round is active";
        var r = jdbc.queryForMap("""
            SELECT count(*) FILTER (WHERE status IN ('PLANNED', 'ASSIGNED', 'IN_PROGRESS')) open, count(*) FILTER (WHERE status = 'SUBMITTED') submitted,
                   count(*) FILTER (WHERE status = 'RETURNED') returned, count(*) FILTER (WHERE status = 'VERIFIED') verified
            FROM assessment_task WHERE campaign_id = :c
            """, new MapSqlParameterSource("c", c.id()));
        List<String> left = new ArrayList<>();
        if (((Number) r.get("open")).longValue() > 0) left.add(r.get("open") + " not yet assessed");
        if (((Number) r.get("submitted")).longValue() > 0) left.add(r.get("submitted") + " waiting to be checked");
        if (((Number) r.get("returned")).longValue() > 0) left.add(r.get("returned") + " sent back for changes");
        if (!left.isEmpty()) return "Sites still open: " + String.join(", ", left) + ". Finish them, or mark them as unreachable or removed";
        if (((Number) r.get("verified")).longValue() == 0) return "No site has a checked assessment";
        return null;
    }

    private String cannotEndorseReason(Campaign c, CurrentUser u) {
        if (u == null) return "Sign in required";
        boolean executive = u.has("EXECUTIVE");
        boolean head = u.has("SECTOR_HEAD") && c.sector() != null && (u.sectorScope() == null || u.sectorScope() == c.sector());
        if (!executive && !head) return c.sector() == null ? "Only the Chief Executive approves multi-sector assessment rounds" : "Only the sector head or the Chief Executive approves assessment round findings";
        if (c.status() != CampaignStatus.REVIEW) return "The assessment round is not waiting for approval";
        if (u.id() != null && (u.id().equals(c.coordinatorUserId()) || u.id().equals(c.createdByUserId()))) return "You ran this assessment round; another person must approve it";
        return null;
    }

    private void validate(CampaignDtos.CampaignRequest req, CurrentUser u, Campaign existing) {
        List<Map<String, String>> errors = new ArrayList<>();
        if (req.plannedEnd().isBefore(req.plannedStart())) errors.add(Map.of("field", "plannedEnd", "message", "The end date must be on or after the start date"));
        if (existing == null && req.plannedEnd().isBefore(LocalDate.now(ZoneOffset.UTC))) errors.add(Map.of("field", "plannedEnd", "message", "The assessment round cannot end in the past"));
        if (u != null && u.sectorScope() != null && req.sector() != u.sectorScope()) errors.add(Map.of("field", "sector", "message", "Your account is limited to the " + u.sectorScope() + " sector"));
        Set<Integer> ids = new HashSet<>(req.weredaIds());
        Long known = jdbc.queryForObject("SELECT count(*) FROM wereda WHERE id IN (:ids)", new MapSqlParameterSource("ids", ids), Long.class);
        if (known == null || known != ids.size()) errors.add(Map.of("field", "weredaIds", "message", "Unknown wereda in the scope"));
        if (req.coordinatorUserId() != null) {
            Long ok = jdbc.queryForObject("""
                SELECT count(*) FROM app_user u JOIN user_role ur ON ur.user_id = u.id JOIN role r ON r.id = ur.role_id
                WHERE u.id = :id AND u.enabled AND r.code IN ('ANALYST', 'ADMIN', 'SECTOR_HEAD')
                """, new MapSqlParameterSource("id", req.coordinatorUserId()), Long.class);
            if (ok == null || ok == 0) errors.add(Map.of("field", "coordinatorUserId", "message", "The coordinator must be an active analyst, sector head or administrator"));
        }
        if (!errors.isEmpty()) throw BusinessException.invalid("The assessment round has errors", errors);
    }

    private void setWeredas(Long id, List<Integer> weredaIds) {
        for (Integer w : new LinkedHashSet<>(weredaIds))
            jdbc.update("INSERT INTO assessment_campaign_wereda(campaign_id, wereda_id) VALUES (:c, :w) ON CONFLICT DO NOTHING", new MapSqlParameterSource("c", id).addValue("w", w));
    }

    private List<Long> endorsers(Campaign c) {
        Set<Long> to = new LinkedHashSet<>(support.usersWithRole("EXECUTIVE", null));
        if (c.sector() != null) to.addAll(jdbc.queryForList("""
            SELECT u.id FROM app_user u JOIN user_role ur ON ur.user_id = u.id JOIN role r ON r.id = ur.role_id
            WHERE r.code = 'SECTOR_HEAD' AND u.enabled AND (u.sector_scope IS NULL OR u.sector_scope = :s)
            """, new MapSqlParameterSource("s", c.sector().name()), Long.class));
        return new ArrayList<>(to);
    }

    private String nextFacilityCode(Sector sector) {
        String prefix = "FAC-" + switch (sector) { case EDUCATION -> "EDU"; case HEALTH -> "HEA"; case MANUFACTURING -> "MAN"; case AGRICULTURE -> "AGR"; } + "-";
        Integer max = jdbc.queryForObject("SELECT max(CAST(substring(code FROM :len) AS int)) FROM facility WHERE code LIKE :like AND substring(code FROM :len) ~ '^[0-9]+$'",
            new MapSqlParameterSource("len", prefix.length() + 1).addValue("like", prefix + "%"), Integer.class);
        return prefix + String.format("%04d", (max == null ? 0 : max) + 1);
    }

    boolean isActiveMember(Long campaignId, Long agentId, CampaignRole role) {
        Long n = jdbc.queryForObject("SELECT count(*) FROM assessment_campaign_member WHERE campaign_id = :c AND agent_id = :a AND role = :r AND active",
            new MapSqlParameterSource("c", campaignId).addValue("a", agentId).addValue("r", role.name()), Long.class);
        return n != null && n > 0;
    }

    private Campaign load(Long id) {
        return jdbc.query("SELECT id, code, name, sector, status, planned_start, planned_end, coordinator_user_id, created_by_user_id FROM assessment_campaign WHERE id = :id",
            new MapSqlParameterSource("id", id), (rs, i) -> new Campaign(rs.getLong("id"), rs.getString("code"), rs.getString("name"),
                rs.getString("sector") == null ? null : Sector.valueOf(rs.getString("sector")), CampaignStatus.valueOf(rs.getString("status")),
                rs.getObject("planned_start", LocalDate.class), rs.getObject("planned_end", LocalDate.class),
                (Long) rs.getObject("coordinator_user_id"), (Long) rs.getObject("created_by_user_id"))).stream().findFirst()
            .orElseThrow(() -> new NotFoundException("Assessment assessment round", id));
    }

    private static void requireVisible(Campaign c) {
        CurrentUser.get().ifPresent(u -> {
            if (u.has("SECTOR_HEAD") && u.sectorScope() != null && c.sector() != null && c.sector() != u.sectorScope())
                throw BusinessException.forbidden("out_of_scope", "This assessment round is outside your sector");
        });
    }

    private static void requireStatus(Campaign c, CampaignStatus... allowed) {
        if (!Arrays.asList(allowed).contains(c.status())) throw BusinessException.conflict("campaign_status", "This is not possible at the current stage of the assessment round");
    }

    private static void requireNote(String note, String message) {
        if (note == null || note.length() < 10) throw BusinessException.invalid("A note is required", List.of(Map.of("field", "note", "message", message)));
    }

    private static boolean canManage(CurrentUser u) { return u != null && (u.has("ANALYST") || u.has("ADMIN")); }
    private static Sector scoped(Sector requested) { return CurrentUser.get().map(u -> u.effectiveSectorFilter(requested)).orElse(requested); }
    private static java.time.Instant ts(Object o) { return o == null ? null : ((java.sql.Timestamp) o).toInstant(); }
}
