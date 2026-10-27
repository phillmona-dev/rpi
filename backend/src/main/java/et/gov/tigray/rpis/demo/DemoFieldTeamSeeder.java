package et.gov.tigray.rpis.demo;

import et.gov.tigray.rpis.common.Enums.*;
import et.gov.tigray.rpis.config.RpisProperties;
import et.gov.tigray.rpis.fieldteam.FieldAgent;
import et.gov.tigray.rpis.fieldteam.FieldTeamRepositories;
import et.gov.tigray.rpis.geo.WeredaRepository;
import et.gov.tigray.rpis.project.ProjectRepositories;
import et.gov.tigray.rpis.security.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * Demo profile · V4 data. Turns the demo inspectors into a registered field team with logins, links their
 * inspections, assigns them to the projects they already visit (leaving realistic gaps), and places three
 * projects in the executive approval queue. Idempotent: skips when any field team member exists.
 */
@Slf4j
@Component
@Order(30)
@ConditionalOnProperty(prefix = "rpis.demo", name = "enabled", havingValue = "true")
@RequiredArgsConstructor
public class DemoFieldTeamSeeder implements ApplicationRunner {
    private final FieldTeamRepositories.Agents agents;
    private final FieldTeamRepositories.Events events;
    private final ProjectRepositories.Organizations organizations;
    private final ProjectRepositories.Projects projects;
    private final WeredaRepository weredas;
    private final UserRepository users;
    private final RoleRepository roles;
    private final PasswordEncoder encoder;
    private final RpisProperties props;
    private final TransactionTemplate tx;
    private final JdbcTemplate jdbc;

    private static final LocalDate TODAY = LocalDate.now(ZoneOffset.UTC);
    private int phoneSeq = 10;

    private record Member(String name, String gender, AgentType type, String orgCode, String username, String supervisor, AgentStatus status, String statusReason) {}

    @Override
    public void run(ApplicationArguments args) {
        if (projects.count() == 0 || agents.count() > 0) return;
        tx.executeWithoutResult(s -> seedTeam());
        tx.executeWithoutResult(s -> seedAssignments());
        tx.executeWithoutResult(s -> seedApprovals());
        log.info("Demo V4 data ready: {} field team members, {} assignments", agents.count(),
            jdbc.queryForObject("SELECT count(*) FROM project_assignment", Long.class));
    }

    private void seedTeam() {
        String pw = encoder.encode(props.getDemo().getPassword());
        Role field = roles.findByCode("FIELD_OFFICER").orElseThrow();
        List<Member> members = List.of(
            new Member("Freweini Gebre", "FEMALE", AgentType.FIELD_SUPERVISOR, "CON-TDC", "freweini.gebre", null, AgentStatus.ACTIVE, null),
            new Member("Tsige Hagos", "FEMALE", AgentType.FIELD_SUPERVISOR, "ORG-PMO", "tsige.hagos", null, AgentStatus.ACTIVE, null),
            new Member("Yohannes Teklu", "MALE", AgentType.FIELD_ANALYST, "CON-TDC", "yohannes.teklu", "Freweini Gebre", AgentStatus.ACTIVE, null),
            new Member("Haile Gebremariam", "MALE", AgentType.FIELD_ANALYST, "CON-TDC", "haile.gebremariam", "Freweini Gebre", AgentStatus.ACTIVE, null),
            new Member("Berhane Kahsay", "MALE", AgentType.FIELD_ANALYST, "ORG-PMO", "berhane.kahsay", "Tsige Hagos", AgentStatus.ACTIVE, null),
            new Member("Selam Tesfay", "FEMALE", AgentType.DATA_COLLECTOR, "CON-TDC", "selam.tesfay", "Freweini Gebre", AgentStatus.ACTIVE, null),
            new Member("Mulu Abraha", "FEMALE", AgentType.DATA_COLLECTOR, "CON-TDC", "mulu.abraha", "Freweini Gebre", AgentStatus.ACTIVE, null),
            new Member("Kidane Berhe", "MALE", AgentType.DATA_COLLECTOR, "ORG-PMO", "kidane.berhe", "Tsige Hagos", AgentStatus.ACTIVE, null),
            new Member("Field Officer (Demo)", "MALE", AgentType.DATA_COLLECTOR, "ORG-PMO", "field.officer", "Tsige Hagos", AgentStatus.ACTIVE, null),
            new Member("Hiwet Kahsay", "FEMALE", AgentType.DATA_COLLECTOR, "ORG-PMO", null, "Tsige Hagos", AgentStatus.ACTIVE, null),
            new Member("Dawit Weldu", "MALE", AgentType.FIELD_ANALYST, "CON-TDC", null, "Freweini Gebre", AgentStatus.ACTIVE, null),
            new Member("Rahwa Tesfamariam", "FEMALE", AgentType.DATA_COLLECTOR, "ORG-PMO", null, "Tsige Hagos", AgentStatus.ON_LEAVE, "Maternity leave until January"),
            new Member("Gebremedhin Assefa", "MALE", AgentType.DATA_COLLECTOR, "CON-TDC", null, "Freweini Gebre", AgentStatus.SUSPENDED, "Two inspections rejected for GPS readings far from site; under review"),
            new Member("Letay Gebreegziabher", "FEMALE", AgentType.DATA_COLLECTOR, "ORG-PMO", null, "Tsige Hagos", AgentStatus.PENDING_ONBOARDING, null),
            new Member("Amanuel Hailu", "MALE", AgentType.FIELD_ANALYST, "ORG-PMO", null, null, AgentStatus.PENDING_ONBOARDING, null));

        // Coverage, sectors and home wereda follow where each inspector has actually worked.
        Map<String, List<Integer>> worked = new HashMap<>();
        Map<String, Set<String>> sectors = new HashMap<>();
        jdbc.query("""
            SELECT fi.inspector_name, fi.wereda_id, p.sector, count(*) n FROM field_inspection fi LEFT JOIN project p ON p.id = fi.project_id
            GROUP BY 1, 2, 3 ORDER BY 1, 4 DESC
            """, rs -> {
                worked.computeIfAbsent(rs.getString(1), k -> new ArrayList<>()).add(rs.getInt(2));
                if (rs.getString(3) != null) sectors.computeIfAbsent(rs.getString(1), k -> new TreeSet<>()).add(rs.getString(3));
            });
        Map<String, List<Integer>> zoneWeredas = new HashMap<>();
        jdbc.query("SELECT z.name_en, w.id FROM wereda w JOIN zone z ON z.id = w.zone_id ORDER BY w.id", rs -> { zoneWeredas.computeIfAbsent(rs.getString(1), k -> new ArrayList<>()).add(rs.getInt(2)); });
        Map<String, String> fallbackZone = Map.of("Field Officer (Demo)", "Mekelle", "Hiwet Kahsay", "Western", "Dawit Weldu", "Southern", "Rahwa Tesfamariam", "Central",
            "Gebremedhin Assefa", "Eastern", "Letay Gebreegziabher", "North Western", "Amanuel Hailu", "South Eastern");
        List<String> skillPool = List.of("Construction progress measurement", "GPS & photo evidence", "Structural defects", "Health facility standards", "School infrastructure",
            "Irrigation works", "Quantity surveying", "Community interviews", "ODK / KoBo forms", "Environmental & social safeguards");

        Map<String, FieldAgent> byName = new LinkedHashMap<>();
        int i = 0;
        for (Member m : members) {
            FieldAgent a = new FieldAgent();
            a.setCode("FT-%04d".formatted(jdbc.queryForObject("SELECT nextval('field_agent_code_seq')", Long.class)));
            a.setFullName(m.name()); a.setGender(m.gender()); a.setAgentType(m.type());
            a.setPhone("+2519141%05d".formatted(phoneSeq++)); a.setAltPhone(i % 3 == 0 ? "+2519442%05d".formatted(phoneSeq) : null);
            a.setEmail(m.username() == null ? null : m.username().replace("field.officer", "field") + "@rpis.demo");
            a.setNationalId("TG-%08d".formatted(41000 + i * 37));
            a.setEmployeeNumber(m.orgCode().equals("ORG-PMO") ? "PMO-F-%03d".formatted(100 + i) : "TDS-%03d".formatted(200 + i));
            a.setOrganization(organizations.findByCode(m.orgCode()).orElse(null));
            a.setEmploymentType(m.orgCode().equals("ORG-PMO") ? EmploymentType.STAFF : EmploymentType.CONTRACT);
            List<Integer> cov = worked.getOrDefault(m.name(), List.of());
            if (cov.isEmpty()) cov = zoneWeredas.getOrDefault(fallbackZone.getOrDefault(m.name(), "Central"), List.of()).stream().limit(5).toList();
            a.setHomeWereda(weredas.findById(cov.get(0)).orElse(null));
            a.getCoverageWeredaIds().addAll(cov.stream().distinct().limit(12).toList());
            Set<String> sec = sectors.getOrDefault(m.name(), Set.of(i % 2 == 0 ? "EDUCATION" : "HEALTH", i % 3 == 0 ? "AGRICULTURE" : "MANUFACTURING"));
            a.setSectors(new ArrayList<>(sec));
            a.setSkills(List.of(skillPool.get(i % skillPool.size()), skillPool.get((i + 3) % skillPool.size()), skillPool.get((i + 6) % skillPool.size())));
            a.setLanguages(i % 4 == 0 ? List.of("ti", "am", "en") : List.of("ti", "en"));
            a.setEducationLevel(m.type() == AgentType.DATA_COLLECTOR ? "DIPLOMA" : m.type() == AgentType.FIELD_ANALYST ? "BACHELOR" : "MASTER");
            a.setYearsExperience((short) (m.type() == AgentType.FIELD_SUPERVISOR ? 9 + i : 2 + (i % 6)));
            a.setMaxActiveAssignments((short) (m.type() == AgentType.FIELD_SUPERVISOR ? 4 : 6));
            a.setContractStart(LocalDate.of(2026, 1, 15));
            a.setContractEnd(m.name().equals("Mulu Abraha") ? TODAY.plusDays(21) : LocalDate.of(2027, 6, 30));
            boolean onboarded = m.status() != AgentStatus.PENDING_ONBOARDING;
            a.setTrainingCompletedOn(onboarded || m.name().equals("Amanuel Hailu") ? LocalDate.of(2026, 2, 10) : null);
            a.setCodeOfConductSignedOn(onboarded ? LocalDate.of(2026, 2, 11) : null);
            a.setBackgroundCheckOn(onboarded ? LocalDate.of(2026, 2, 3) : null);
            a.setEmergencyContactName(m.gender().equals("FEMALE") ? "Gebre " + m.name().split(" ")[1] : "Almaz " + m.name().split(" ")[1]);
            a.setEmergencyContactPhone("+2519143%05d".formatted(phoneSeq + 50));
            a.setStatus(m.status()); a.setStatusReason(m.statusReason());
            a.setStatusChangedAt(m.status() == AgentStatus.PENDING_ONBOARDING ? Instant.now().minus(3, ChronoUnit.DAYS) : Instant.now().minus(m.statusReason() == null ? 200 : 12, ChronoUnit.DAYS));
            a.setRegisteredByName("Planning Analyst (Demo)");
            if (m.username() != null) {
                AppUser u = users.findByUsernameIgnoreCase(m.username()).orElseGet(() -> {
                    AppUser n = new AppUser();
                    n.setUsername(m.username()); n.setEmail(m.username() + "@field.rpis.demo"); n.setFullName(m.name());
                    n.setTitle(m.type() == AgentType.FIELD_SUPERVISOR ? "Field Supervisor" : m.type() == AgentType.FIELD_ANALYST ? "Field Analyst" : "Field Data Collector");
                    n.setPasswordHash(pw); n.setRoles(new HashSet<>(List.of(field)));
                    return users.save(n);
                });
                a.setUserId(u.getId());
            }
            byName.put(m.name(), agents.save(a));
            i++;
        }
        for (Member m : members) if (m.supervisor() != null) { FieldAgent a = byName.get(m.name()); a.setSupervisor(byName.get(m.supervisor())); agents.save(a); }
        for (FieldAgent a : byName.values()) {
            event(a.getId(), "REGISTERED", a.getStatusChangedAt().minus(30, ChronoUnit.DAYS), null, Map.of("agentType", a.getAgentType().name()));
            if (a.getUserId() != null) event(a.getId(), "ACCESS_GRANTED", a.getStatusChangedAt().minus(29, ChronoUnit.DAYS), null, Map.of());
            if (a.getStatus() != AgentStatus.PENDING_ONBOARDING) event(a.getId(), "STATUS_CHANGED", a.getStatusChangedAt().minus(28, ChronoUnit.DAYS), null, Map.of("from", "PENDING_ONBOARDING", "to", "ACTIVE"));
            if (a.getStatusReason() != null) event(a.getId(), "STATUS_CHANGED", a.getStatusChangedAt(), a.getStatusReason(), Map.of("from", "ACTIVE", "to", a.getStatus().name()));
        }
        // Link the historical inspections to the members' accounts so workload and quality metrics are real.
        jdbc.update("""
            UPDATE field_inspection fi SET inspector_user_id = fa.user_id FROM field_agent fa
            WHERE fa.user_id IS NOT NULL AND fi.inspector_name = fa.full_name AND fi.inspector_user_id IS NULL
            """);
    }

    private void seedAssignments() {
        Long analyst = users.findByUsernameIgnoreCase("analyst").map(AppUser::getId).orElse(null);
        Map<Long, Integer> load = new HashMap<>();
        Map<Long, Integer> cap = new HashMap<>();
        Map<Long, String> type = new HashMap<>();
        jdbc.query("SELECT id, max_active_assignments, agent_type FROM field_agent WHERE status = 'ACTIVE'", rs -> {
            cap.put(rs.getLong(1), rs.getInt(2)); type.put(rs.getLong(1), rs.getString(3)); });
        // Visits per (project, member), most-visited first; projects with the highest risk are staffed first.
        List<Object[]> visits = jdbc.query("""
            SELECT fi.project_id, fa.id, count(*) n, min(fi.visited_on) first_visit
            FROM field_inspection fi JOIN field_agent fa ON fa.user_id = fi.inspector_user_id JOIN project p ON p.id = fi.project_id
            WHERE fa.status = 'ACTIVE' AND p.status IN ('ACTIVE', 'SUSPENDED') AND p.approval_status = 'APPROVED'
            GROUP BY 1, 2, p.risk_score ORDER BY p.risk_score DESC NULLS LAST, 1, n DESC
            """, (rs, i) -> new Object[]{rs.getLong(1), rs.getLong(2), rs.getInt(3), rs.getDate(4).toLocalDate()});
        Map<Long, List<Object[]>> byProject = new LinkedHashMap<>();
        for (Object[] v : visits) byProject.computeIfAbsent((Long) v[0], k -> new ArrayList<>()).add(v);
        int skipped = 0, n = 0;
        for (var e : byProject.entrySet()) {
            // Leave every seventh staffed project without a team so the coverage view has real gaps to show.
            if (n++ % 7 == 3) { skipped++; continue; }
            boolean lead = false;
            int members = 0;
            for (Object[] v : e.getValue()) {
                long agent = (Long) v[1];
                if (load.getOrDefault(agent, 0) >= cap.getOrDefault(agent, 0) - 2 || members >= 2) continue;
                String role = !lead ? "LEAD" : type.get(agent).equals("DATA_COLLECTOR") ? "DATA_COLLECTOR" : "VERIFIER";
                LocalDate start = ((LocalDate) v[3]).minusDays(3);
                int freq = role.equals("LEAD") ? 45 : 60;
                jdbc.update("""
                    INSERT INTO project_assignment (project_id, agent_id, assignment_role, priority, start_on, visit_frequency_days, required_inspection_types,
                                                    instructions, assigned_by_user_id, assigned_by_name, assigned_at)
                    VALUES (?, ?, ?, ?, ?, ?, CAST(? AS jsonb), ?, ?, 'Planning Analyst (Demo)', ?)
                    """, e.getKey(), agent, role, members == 0 && n % 4 == 0 ? "HIGH" : "NORMAL", start, freq,
                    role.equals("VERIFIER") ? "[\"PROGRESS_VERIFICATION\",\"QUALITY_INSPECTION\"]" : "[\"SITE_VISIT\",\"PROGRESS_VERIFICATION\"]",
                    role.equals("LEAD") ? "Monthly progress verification with geotagged photos of every active work front; flag variance above 10 pp." : null,
                    analyst, java.sql.Timestamp.from(start.atStartOfDay().toInstant(ZoneOffset.UTC)));
                load.merge(agent, 1, Integer::sum);
                lead = true;
                members++;
            }
        }
        // The demo field officer gets two Mekelle projects so the field app profile is not empty.
        jdbc.update("""
            INSERT INTO project_assignment (project_id, agent_id, assignment_role, start_on, visit_frequency_days, required_inspection_types, assigned_by_user_id, assigned_by_name)
            SELECT p.id, fa.id, 'DATA_COLLECTOR', current_date - 10, 14, '["SITE_VISIT"]', ?, 'Planning Analyst (Demo)'
            FROM project p JOIN wereda w ON w.id = p.wereda_id JOIN zone z ON z.id = w.zone_id, field_agent fa
            WHERE fa.full_name = 'Field Officer (Demo)' AND z.name_en = 'Mekelle' AND p.status = 'ACTIVE'
              AND NOT EXISTS (SELECT 1 FROM project_assignment x WHERE x.project_id = p.id AND x.agent_id = fa.id)
            ORDER BY p.risk_score DESC NULLS LAST LIMIT 2
            """, analyst);
        jdbc.update("""
            INSERT INTO field_agent_event (agent_id, kind, occurred_at, actor_user_id, actor_name, note, data)
            SELECT pa.agent_id, 'ASSIGNED', pa.assigned_at, pa.assigned_by_user_id, pa.assigned_by_name, p.code || ' · ' || p.name,
                   jsonb_build_object('assignmentId', pa.id, 'projectId', p.id, 'projectCode', p.code, 'role', pa.assignment_role)
            FROM project_assignment pa JOIN project p ON p.id = pa.project_id
            """);
        log.info("Seeded demo assignments; {} staffed projects intentionally left without a team", skipped);
    }

    private void seedApprovals() {
        AppUser analyst = users.findByUsernameIgnoreCase("analyst").orElseThrow();
        AppUser exec = users.findByUsernameIgnoreCase("executive").orElseThrow();
        pending("RP-AGR-008", analyst, 6, "Registered from the Western zone damage register; veterinary services for Humera are fully interrupted.");
        pending("RP-EDU-014", analyst, 2, "Priority school for returnees in Tahtay Adiabo; design is ready, procurement can start upon approval.");
        Long id = projectId("RP-HEA-011");
        if (id != null) {
            jdbc.update("""
                UPDATE project SET approval_status = 'RETURNED', status = 'PLANNED', submitted_at = now() - interval '9 days', submitted_by_user_id = ?, submitted_by_name = ?
                WHERE id = ?""", analyst.getId(), analyst.getFullName(), id);
            approvalEvent(id, "SUBMITTED", 9, analyst, "Health post rehabilitation for Tahtay Adiabo; costed from the 2026 damage assessment.", null, null);
            approvalEvent(id, "RETURNED", 4, exec, "The budget has no contingency line and the disbursement schedule covers only 60% of the total. "
                + "Please complete the financial plan and confirm the implementing agency before resubmitting.", null, ref());
            jdbc.update("UPDATE project SET approval_decided_at = now() - interval '4 days', approval_decided_by_name = ? WHERE id = ?", exec.getFullName(), id);
        }
        // Two decisions already on record so the history tab shows the trail.
        decided("RP-EDU-007", analyst, exec, 24, 21, "Approved within the education sector envelope. Contractor must submit a site-specific safety plan before mobilisation.");
        decided("RP-MAN-005", analyst, exec, 18, 17, null);
    }

    private void pending(String code, AppUser analyst, int daysAgo, String note) {
        Long id = projectId(code);
        if (id == null) return;
        jdbc.update("""
            UPDATE project SET approval_status = 'PENDING', status = 'PLANNED', submitted_at = now() - make_interval(days => ?), submitted_by_user_id = ?, submitted_by_name = ?
            WHERE id = ?""", daysAgo, analyst.getId(), analyst.getFullName(), id);
        approvalEvent(id, "SUBMITTED", daysAgo, analyst, note, null, null);
    }

    private void decided(String code, AppUser analyst, AppUser exec, int submittedDaysAgo, int decidedDaysAgo, String conditions) {
        Long id = projectId(code);
        if (id == null) return;
        String ref = ref();
        jdbc.update("""
            UPDATE project SET submitted_at = now() - make_interval(days => ?), submitted_by_user_id = ?, submitted_by_name = ?,
                               approval_decided_at = now() - make_interval(days => ?), approval_decided_by_name = ?, approval_decision_ref = ?, approval_conditions = ?
            WHERE id = ?""", submittedDaysAgo, analyst.getId(), analyst.getFullName(), decidedDaysAgo, exec.getFullName(), ref, conditions, id);
        approvalEvent(id, "SUBMITTED", submittedDaysAgo, analyst, null, null, null);
        approvalEvent(id, "APPROVED", decidedDaysAgo, exec, null, conditions, ref);
    }

    private String ref() { return "CE-%d-%04d".formatted(TODAY.getYear(), jdbc.queryForObject("SELECT nextval('approval_decision_seq')", Long.class)); }
    private Long projectId(String code) { return jdbc.query("SELECT id FROM project WHERE code = ?", rs -> rs.next() ? rs.getLong(1) : null, code); }

    private void approvalEvent(Long projectId, String action, int daysAgo, AppUser actor, String note, String conditions, String ref) {
        jdbc.update("""
            INSERT INTO project_approval_event (project_id, action, occurred_at, actor_user_id, actor_name, note, conditions, reference)
            VALUES (?, ?, now() - make_interval(days => ?), ?, ?, ?, ?, ?)""", projectId, action, daysAgo, actor.getId(), actor.getFullName(), note, conditions, ref);
    }

    private void event(Long agentId, String kind, Instant at, String note, Map<String, Object> data) {
        var e = new et.gov.tigray.rpis.fieldteam.FieldAgentEvent();
        e.setAgentId(agentId); e.setKind(kind); e.setOccurredAt(at); e.setNote(note); e.setData(data.isEmpty() ? null : data);
        e.setActorName("Planning Analyst (Demo)");
        events.save(e);
    }
}
