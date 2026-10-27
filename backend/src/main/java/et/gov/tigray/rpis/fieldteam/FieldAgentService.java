package et.gov.tigray.rpis.fieldteam;

import et.gov.tigray.rpis.audit.Audited;
import et.gov.tigray.rpis.common.BusinessException;
import et.gov.tigray.rpis.common.Enums.*;
import et.gov.tigray.rpis.common.NotFoundException;
import et.gov.tigray.rpis.common.Sector;
import et.gov.tigray.rpis.geo.GeoDtos;
import et.gov.tigray.rpis.geo.Wereda;
import et.gov.tigray.rpis.geo.WeredaRepository;
import et.gov.tigray.rpis.project.ProjectRepositories;
import et.gov.tigray.rpis.realtime.DomainEvent;
import et.gov.tigray.rpis.security.*;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.text.Normalizer;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.*;
import java.util.regex.Pattern;

/**
 * Registration and lifecycle of field team members. Status drives system access: only ACTIVE members can sign in
 * to the field app; suspension or deactivation disables the account and revokes sessions immediately.
 */
@Service
@RequiredArgsConstructor
public class FieldAgentService {
    private final FieldTeamRepositories.Agents agents;
    private final FieldTeamRepositories.Events agentEvents;
    private final FieldTeamRepositories.Assignments assignments;
    private final FieldTeamQueries queries;
    private final ProjectRepositories.Organizations organizations;
    private final WeredaRepository weredas;
    private final UserRepository users;
    private final RoleRepository roles;
    private final RefreshTokenRepository refreshTokens;
    private final PasswordEncoder encoder;
    private final NamedParameterJdbcTemplate jdbc;
    private final ApplicationEventPublisher events;

    /** Ethiopian mobile (09…/07…) and fixed-line numbers, with or without the +251 prefix. */
    private static final Pattern PHONE = Pattern.compile("^(?:\\+251|0)([1-9]\\d{8})$");
    private static final Map<AgentStatus, List<AgentStatus>> TRANSITIONS = Map.of(
        AgentStatus.PENDING_ONBOARDING, List.of(AgentStatus.ACTIVE, AgentStatus.DEACTIVATED),
        AgentStatus.ACTIVE, List.of(AgentStatus.ON_LEAVE, AgentStatus.SUSPENDED, AgentStatus.DEACTIVATED),
        AgentStatus.ON_LEAVE, List.of(AgentStatus.ACTIVE, AgentStatus.SUSPENDED, AgentStatus.DEACTIVATED),
        AgentStatus.SUSPENDED, List.of(AgentStatus.ACTIVE, AgentStatus.DEACTIVATED),
        AgentStatus.DEACTIVATED, List.of(AgentStatus.PENDING_ONBOARDING));
    private static final String PASSWORD_CHARS_UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ", PASSWORD_CHARS_LOWER = "abcdefghijkmnpqrstuvwxyz",
        PASSWORD_CHARS_DIGIT = "23456789", PASSWORD_CHARS_SYMBOL = "@#$%&*!?";
    private final SecureRandom random = new SecureRandom();

    public static List<AgentStatus> allowedTransitions(AgentStatus s) { return TRANSITIONS.getOrDefault(s, List.of()); }

    // ── queries ──────────────────────────────────────────────────────────
    @Transactional(readOnly = true)
    public List<FieldTeamDtos.AgentSummary> list(FieldTeamQueries.AgentFilter f) { return queries.agents(f); }

    @Transactional(readOnly = true)
    public FieldTeamDtos.AgentDetail detail(Long id) {
        FieldAgent a = agents.findDetailedById(id).orElseThrow(() -> new NotFoundException("Field team member", id));
        FieldTeamDtos.AgentSummary s = queries.agents(FieldTeamQueries.AgentFilter.byId(id)).get(0);
        List<FieldTeamDtos.WeredaLite> coverage = a.getCoverageWeredaIds().isEmpty() ? List.of() : weredas.findAllById(a.getCoverageWeredaIds()).stream()
            .sorted(Comparator.comparing((Wereda w) -> w.getZone().getNameEn()).thenComparing(Wereda::getNameEn)).map(FieldAgentService::lite).toList();
        List<FieldTeamDtos.AgentRef> team = a.getAgentType() == AgentType.FIELD_SUPERVISOR ? agents.findBySupervisorIdOrderByFullNameAsc(id).stream().map(FieldAgentService::ref).toList() : List.of();
        var assignmentList = queries.assignments(new FieldTeamQueries.AssignmentFilter(id, null, null, false, null, null));
        var ev = agentEvents.findTop50ByAgentIdOrderByOccurredAtDesc(id).stream()
            .map(e -> new FieldTeamDtos.AgentEventDto(e.getId(), e.getKind(), e.getOccurredAt(), e.getActorName(), e.getNote(), e.getData())).toList();
        var d = a.getDevice();
        return new FieldTeamDtos.AgentDetail(s, a.getGender(), a.getAltPhone(), a.getNationalId(), a.getEmployeeNumber(), a.getEmploymentType(),
            a.getOrganization() == null ? null : new FieldTeamDtos.OrganizationRef(a.getOrganization().getId(), a.getOrganization().getCode(), a.getOrganization().getName()),
            a.getSupervisor() == null ? null : ref(a.getSupervisor()), a.getEducationLevel(), a.getYearsExperience(), a.getSkills(), a.getLanguages(),
            a.getContractStart(), a.getTrainingCompletedOn(), a.getCodeOfConductSignedOn(), a.getBackgroundCheckOn(), a.getEmergencyContactName(),
            a.getEmergencyContactPhone(), a.getNotes(), a.getStatusReason(), a.getStatusChangedAt(), a.getRegisteredByName(), a.getCreatedAt(), coverage, team,
            assignmentList, queries.performance(a.getUserId(), id), queries.recentInspections(a.getUserId()), ev,
            d == null ? null : new FieldTeamDtos.DeviceDto(d.getId(), d.getDeviceUid(), d.getLabel(), d.getPlatform(), d.getAppVersion(), d.getLastSyncAt(), d.isEnabled()),
            allowedTransitions(a.getStatus()));
    }

    @Transactional(readOnly = true)
    public FieldTeamDtos.AgentDetail me() {
        CurrentUser u = CurrentUser.get().orElseThrow(() -> BusinessException.unauthorized("unauthenticated", "Sign in required"));
        FieldAgent a = agents.findByUserId(u.id()).orElseThrow(() -> new NotFoundException("Field team profile for user", u.id()));
        return detail(a.getId());
    }

    // ── registration & profile ───────────────────────────────────────────
    @Audited(action = "FIELD_AGENT_REGISTER", entityType = "FIELD_AGENT")
    @Transactional
    public FieldTeamDtos.RegisterResponse register(FieldTeamDtos.AgentRequest r) {
        FieldAgent a = new FieldAgent();
        apply(a, r, true);
        Long n = jdbc.queryForObject("SELECT nextval('field_agent_code_seq')", new MapSqlParameterSource(), Long.class);
        a.setCode("FT-%04d".formatted(n));
        CurrentUser actor = CurrentUser.get().orElse(null);
        a.setRegisteredByName(actor == null ? "system" : actor.fullName());
        a.setStatus(AgentStatus.PENDING_ONBOARDING);
        a.setStatusChangedAt(Instant.now());
        FieldAgent saved = agents.saveAndFlush(a);
        record(saved.getId(), "REGISTERED", actor, null, Map.of("agentType", saved.getAgentType().name(), "coverage", saved.getCoverageWeredaIds().size()));
        FieldTeamDtos.AccessResponse access = Boolean.TRUE.equals(r.createAccount()) ? provision(saved, r.username(), actor) : null;
        events.publishEvent(DomainEvent.of("FIELD_AGENT_REGISTERED", "FIELD_AGENT", saved.getId(), null, saved.getHomeWereda() == null ? null : saved.getHomeWereda().getId(),
            Map.of("name", saved.getFullName(), "code", saved.getCode(), "agentType", saved.getAgentType().name(), "actor", actor == null ? "system" : actor.fullName())));
        return new FieldTeamDtos.RegisterResponse(detail(saved.getId()), access);
    }

    @Audited(action = "FIELD_AGENT_UPDATE", entityType = "FIELD_AGENT")
    @Transactional
    public FieldTeamDtos.AgentDetail update(Long id, FieldTeamDtos.AgentRequest r) {
        FieldAgent a = agents.findDetailedById(id).orElseThrow(() -> new NotFoundException("Field team member", id));
        apply(a, r, false);
        agents.saveAndFlush(a);
        if (a.getUserId() != null) users.findById(a.getUserId()).ifPresent(u -> { u.setFullName(a.getFullName()); u.setTitle(titleFor(a.getAgentType())); users.save(u); });
        record(id, "PROFILE_UPDATED", CurrentUser.get().orElse(null), null, null);
        return detail(id);
    }

    private void apply(FieldAgent a, FieldTeamDtos.AgentRequest r, boolean creating) {
        List<Map<String, String>> errors = new ArrayList<>();
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        String phone = normalizePhone(r.phone());
        if (phone == null) errors.add(err("phone", "Enter an Ethiopian number such as 0914 123 456 or +251 914 123 456"));
        else if (creating ? agents.existsByPhone(phone) : agents.existsByPhoneAndIdNot(phone, a.getId())) errors.add(err("phone", "Another team member already uses this phone number"));
        String alt = blank(r.altPhone()) == null ? null : normalizePhone(r.altPhone());
        if (blank(r.altPhone()) != null && alt == null) errors.add(err("altPhone", "Enter a valid Ethiopian phone number"));
        String emergencyPhone = blank(r.emergencyContactPhone()) == null ? null : normalizePhone(r.emergencyContactPhone());
        if (blank(r.emergencyContactPhone()) != null && emergencyPhone == null) errors.add(err("emergencyContactPhone", "Enter a valid Ethiopian phone number"));
        String nid = blank(r.nationalId());
        if (nid != null && (creating ? agents.existsByNationalIdIgnoreCase(nid) : agents.existsByNationalIdIgnoreCaseAndIdNot(nid, a.getId())))
            errors.add(err("nationalId", "This national ID is already registered to another team member"));
        if (r.contractStart() != null && r.contractEnd() != null && r.contractEnd().isBefore(r.contractStart())) errors.add(err("contractEnd", "Contract end must be on or after the start"));
        if (!creating && r.contractEnd() != null && r.contractEnd().isBefore(today) && a.getStatus() == AgentStatus.ACTIVE)
            errors.add(err("contractEnd", "The contract would already have ended; deactivate the member or extend the contract"));
        var organization = r.organizationId() == null ? null : organizations.findById(r.organizationId()).orElse(null);
        if (r.organizationId() != null && organization == null) errors.add(err("organizationId", "Unknown organisation"));
        Wereda home = r.homeWeredaId() == null ? null : weredas.findById(r.homeWeredaId()).orElse(null);
        if (r.homeWeredaId() != null && home == null) errors.add(err("homeWeredaId", "Unknown wereda"));
        Set<Integer> coverage = new LinkedHashSet<>(r.coverageWeredaIds());
        if (coverage.size() > 40) errors.add(err("coverageWeredaIds", "A member can cover at most 40 weredas"));
        if (weredas.findAllById(coverage).size() != coverage.size()) errors.add(err("coverageWeredaIds", "One or more weredas are unknown"));
        FieldAgent supervisor = null;
        if (r.supervisorId() != null) {
            supervisor = agents.findById(r.supervisorId()).orElse(null);
            if (supervisor == null) errors.add(err("supervisorId", "Unknown supervisor"));
            else if (supervisor.getId().equals(a.getId())) errors.add(err("supervisorId", "A member cannot supervise themselves"));
            else if (supervisor.getAgentType() != AgentType.FIELD_SUPERVISOR) errors.add(err("supervisorId", supervisor.getFullName() + " is not registered as a field supervisor"));
            else if (supervisor.getStatus() == AgentStatus.DEACTIVATED || supervisor.getStatus() == AgentStatus.SUSPENDED) errors.add(err("supervisorId", supervisor.getFullName() + " is " + supervisor.getStatus().name().toLowerCase(Locale.ROOT)));
        }
        if (!creating && r.agentType() != AgentType.FIELD_SUPERVISOR && a.getAgentType() == AgentType.FIELD_SUPERVISOR && !agents.findBySupervisorIdOrderByFullNameAsc(a.getId()).isEmpty())
            errors.add(err("agentType", "Reassign this supervisor's team before changing the role"));
        if (!errors.isEmpty()) throw BusinessException.invalid("The team member could not be saved: " + errors.size() + " problem(s) to fix", errors);

        a.setFullName(r.fullName().trim().replaceAll("\\s+", " "));
        a.setGender(r.gender());
        a.setPhone(phone);
        a.setAltPhone(alt);
        a.setEmail(blank(r.email()) == null ? null : r.email().trim().toLowerCase(Locale.ROOT));
        a.setNationalId(nid);
        a.setEmployeeNumber(blank(r.employeeNumber()));
        a.setAgentType(r.agentType());
        a.setOrganization(organization);
        a.setEmploymentType(r.employmentType());
        a.setHomeWereda(home);
        a.setSupervisor(supervisor);
        a.setEducationLevel(blank(r.educationLevel()));
        a.setYearsExperience(r.yearsExperience());
        a.setSectors(r.sectors().stream().distinct().map(Sector::name).toList());
        a.setSkills(r.skills() == null ? new ArrayList<>() : r.skills().stream().map(String::trim).filter(s -> !s.isEmpty()).distinct().toList());
        a.setLanguages(r.languages() == null ? new ArrayList<>() : r.languages().stream().distinct().toList());
        a.setMaxActiveAssignments(r.maxActiveAssignments() == null ? 4 : r.maxActiveAssignments());
        a.setContractStart(r.contractStart());
        a.setContractEnd(r.contractEnd());
        a.setTrainingCompletedOn(r.trainingCompletedOn());
        a.setCodeOfConductSignedOn(r.codeOfConductSignedOn());
        a.setBackgroundCheckOn(r.backgroundCheckOn());
        a.setEmergencyContactName(blank(r.emergencyContactName()));
        a.setEmergencyContactPhone(emergencyPhone);
        a.setNotes(blank(r.notes()));
        a.getCoverageWeredaIds().clear();
        a.getCoverageWeredaIds().addAll(coverage);
    }

    // ── status & access ──────────────────────────────────────────────────
    @Audited(action = "FIELD_AGENT_STATUS", entityType = "FIELD_AGENT")
    @Transactional
    public FieldTeamDtos.AgentDetail changeStatus(Long id, FieldTeamDtos.StatusChangeRequest r) {
        FieldAgent a = agents.findDetailedById(id).orElseThrow(() -> new NotFoundException("Field team member", id));
        AgentStatus from = a.getStatus(), to = r.status();
        if (from == to) throw BusinessException.conflict("same_status", "The member is already " + to);
        if (!allowedTransitions(from).contains(to)) throw BusinessException.badRequest("illegal_transition", "Cannot change status from " + from + " to " + to);
        String reason = blank(r.reason());
        if ((to == AgentStatus.SUSPENDED || to == AgentStatus.DEACTIVATED || to == AgentStatus.ON_LEAVE) && (reason == null || reason.length() < 5))
            throw BusinessException.invalid("A reason is required", List.of(err("reason", "State the reason for this change; it is kept in the member's history")));
        if (to == AgentStatus.ACTIVE) {
            List<Map<String, String>> missing = new ArrayList<>();
            if (a.getTrainingCompletedOn() == null) missing.add(err("trainingCompletedOn", "Record the date field training was completed"));
            if (a.getCodeOfConductSignedOn() == null) missing.add(err("codeOfConductSignedOn", "Record the date the code of conduct was signed"));
            if (a.getContractEnd() != null && a.getContractEnd().isBefore(LocalDate.now(ZoneOffset.UTC))) missing.add(err("contractEnd", "The contract has ended; extend it before activating"));
            if (!missing.isEmpty()) throw BusinessException.invalid("Onboarding is not complete", missing);
        }
        CurrentUser actor = CurrentUser.get().orElse(null);
        List<ProjectAssignment> open = assignments.findByAgentIdAndStatus(id, AssignmentStatus.ACTIVE);
        if (!open.isEmpty() && (to == AgentStatus.SUSPENDED || to == AgentStatus.DEACTIVATED)) {
            if (!Boolean.TRUE.equals(r.releaseAssignments()))
                throw BusinessException.conflict("has_assignments", "The member holds " + open.size() + " active assignment(s). Release them, or confirm releasing them with this change.");
            for (ProjectAssignment pa : open) {
                pa.setStatus(AssignmentStatus.RELEASED); pa.setClosedAt(Instant.now()); pa.setClosedByName(actor == null ? "system" : actor.fullName());
                pa.setCloseReason("Member " + to.name().toLowerCase(Locale.ROOT) + ": " + reason);
                assignments.save(pa);
            }
        }
        a.setStatus(to);
        a.setStatusReason(reason);
        a.setStatusChangedAt(Instant.now());
        agents.saveAndFlush(a);
        syncAccount(a);
        Map<String, Object> data = new LinkedHashMap<>(); data.put("from", from.name()); data.put("to", to.name());
        if (!open.isEmpty() && (to == AgentStatus.SUSPENDED || to == AgentStatus.DEACTIVATED)) data.put("releasedAssignments", open.size());
        record(id, "STATUS_CHANGED", actor, reason, data);
        return detail(id);
    }

    @Audited(action = "FIELD_AGENT_ACCESS", entityType = "FIELD_AGENT")
    @Transactional
    public FieldTeamDtos.AccessResponse access(Long id, String requestedUsername) {
        FieldAgent a = agents.findDetailedById(id).orElseThrow(() -> new NotFoundException("Field team member", id));
        if (a.getStatus() == AgentStatus.DEACTIVATED) throw BusinessException.conflict("deactivated", "Deactivated members cannot be given access");
        return provision(a, requestedUsername, CurrentUser.get().orElse(null));
    }

    /** Creates the FIELD_OFFICER login on first call, resets the password afterwards. The temporary password is returned once and never stored in clear. */
    private FieldTeamDtos.AccessResponse provision(FieldAgent a, String requestedUsername, CurrentUser actor) {
        String password = temporaryPassword();
        if (a.getUserId() != null) {
            AppUser u = users.findById(a.getUserId()).orElseThrow();
            u.setPasswordHash(encoder.encode(password));
            u.setFailedAttempts(0); u.setLockedUntil(null);
            users.save(u);
            refreshTokens.revokeAllForUser(u.getId(), Instant.now());
            record(a.getId(), "ACCESS_RESET", actor, null, Map.of("username", u.getUsername()));
            return new FieldTeamDtos.AccessResponse(u.getUsername(), password, false);
        }
        String username = blank(requestedUsername) != null ? requestedUsername.trim().toLowerCase(Locale.ROOT) : suggestUsername(a.getFullName());
        if (users.existsByUsernameIgnoreCase(username)) throw BusinessException.invalid("Username taken", List.of(err("username", "The username " + username + " is already in use")));
        String email = a.getEmail() != null && !users.existsByEmailIgnoreCase(a.getEmail()) ? a.getEmail() : a.getCode().toLowerCase(Locale.ROOT) + "@field.rpis.local";
        AppUser u = new AppUser();
        u.setUsername(username); u.setEmail(email); u.setFullName(a.getFullName()); u.setTitle(titleFor(a.getAgentType()));
        u.setPasswordHash(encoder.encode(password));
        u.setRoles(new HashSet<>(List.of(roles.findByCode("FIELD_OFFICER").orElseThrow())));
        u.setEnabled(a.getStatus() == AgentStatus.ACTIVE);
        AppUser saved = users.save(u);
        a.setUserId(saved.getId());
        agents.saveAndFlush(a);
        record(a.getId(), "ACCESS_GRANTED", actor, null, Map.of("username", username));
        return new FieldTeamDtos.AccessResponse(username, password, true);
    }

    /** Only ACTIVE members can sign in; any other status disables the login and ends open sessions. */
    private void syncAccount(FieldAgent a) {
        if (a.getUserId() == null) return;
        users.findById(a.getUserId()).ifPresent(u -> {
            boolean enable = a.getStatus() == AgentStatus.ACTIVE;
            if (u.isEnabled() != enable) {
                u.setEnabled(enable);
                users.save(u);
                if (!enable) refreshTokens.revokeAllForUser(u.getId(), Instant.now());
            }
        });
    }

    void record(Long agentId, String kind, CurrentUser actor, String note, Map<String, Object> data) {
        FieldAgentEvent e = new FieldAgentEvent();
        e.setAgentId(agentId); e.setKind(kind); e.setOccurredAt(Instant.now()); e.setNote(note); e.setData(data);
        if (actor != null) { e.setActorUserId(actor.id()); e.setActorName(actor.fullName()); }
        agentEvents.save(e);
    }

    // ── helpers ──────────────────────────────────────────────────────────
    public static String normalizePhone(String raw) {
        if (raw == null) return null;
        String s = raw.replaceAll("[\\s()-]", "");
        if (s.startsWith("251")) s = "+" + s;
        var m = PHONE.matcher(s);
        return m.matches() ? "+251" + m.group(1) : null;
    }

    private String suggestUsername(String fullName) {
        String ascii = Normalizer.normalize(fullName, Normalizer.Form.NFD).replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT).replaceAll("[^a-z ]", " ").trim();
        String[] parts = ascii.isEmpty() ? new String[]{"field"} : ascii.split("\\s+");
        String base = parts.length == 1 ? parts[0] : parts[0] + "." + parts[parts.length - 1];
        if (base.length() < 3) base = "field." + base;
        String candidate = base;
        for (int i = 2; users.existsByUsernameIgnoreCase(candidate); i++) candidate = base + i;
        return candidate;
    }

    private String temporaryPassword() {
        List<Character> chars = new ArrayList<>();
        for (String pool : List.of(PASSWORD_CHARS_UPPER, PASSWORD_CHARS_LOWER, PASSWORD_CHARS_DIGIT, PASSWORD_CHARS_SYMBOL)) chars.add(pool.charAt(random.nextInt(pool.length())));
        String all = PASSWORD_CHARS_UPPER + PASSWORD_CHARS_LOWER + PASSWORD_CHARS_DIGIT + PASSWORD_CHARS_SYMBOL;
        while (chars.size() < 14) chars.add(all.charAt(random.nextInt(all.length())));
        Collections.shuffle(chars, random);
        StringBuilder sb = new StringBuilder(); chars.forEach(sb::append);
        return sb.toString();
    }

    static String titleFor(AgentType t) {
        return switch (t) { case DATA_COLLECTOR -> "Field Data Collector"; case FIELD_ANALYST -> "Field Analyst"; case FIELD_SUPERVISOR -> "Field Supervisor"; };
    }
    static FieldTeamDtos.AgentRef ref(FieldAgent a) { return new FieldTeamDtos.AgentRef(a.getId(), a.getCode(), a.getFullName(), a.getAgentType(), a.getStatus()); }
    static FieldTeamDtos.WeredaLite lite(Wereda w) {
        return new FieldTeamDtos.WeredaLite(w.getId(), new GeoDtos.LocalizedName(w.getNameEn(), w.getNameTi(), w.getNameAm()), w.getZone().getId(),
            new GeoDtos.LocalizedName(w.getZone().getNameEn(), w.getZone().getNameTi(), w.getZone().getNameAm()));
    }
    private static Map<String, String> err(String field, String message) { return Map.of("field", field, "message", message); }
    private static String blank(String s) { return s == null || s.isBlank() ? null : s.trim(); }
}
