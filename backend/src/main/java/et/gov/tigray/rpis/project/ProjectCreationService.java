package et.gov.tigray.rpis.project;

import et.gov.tigray.rpis.audit.Audited;
import et.gov.tigray.rpis.common.BusinessException;
import et.gov.tigray.rpis.common.Enums.*;
import et.gov.tigray.rpis.common.GeoPoint;
import et.gov.tigray.rpis.common.Sector;
import et.gov.tigray.rpis.facility.Facility;
import et.gov.tigray.rpis.facility.FacilityRepository;
import et.gov.tigray.rpis.geo.Wereda;
import et.gov.tigray.rpis.geo.WeredaRepository;
import et.gov.tigray.rpis.realtime.DomainEvent;
import et.gov.tigray.rpis.security.CurrentUser;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.regex.Pattern;

/**
 * Registration of new projects from the web interface. One validator serves both the dry run (review step)
 * and the real submission, so the form and the server can never disagree about what is acceptable.
 * Errors block registration; warnings are advisory (possible duplicates, unfunded budget, missing risks).
 */
@Service
@RequiredArgsConstructor
public class ProjectCreationService {
    private final ProjectRepositories.Projects projects;
    private final ProjectRepositories.Milestones milestones;
    private final ProjectRepositories.BudgetLines budgetLines;
    private final ProjectRepositories.Disbursements disbursements;
    private final ProjectRepositories.Risks risks;
    private final ProjectRepositories.StageEvents stageEvents;
    private final ProjectRepositories.Organizations organizations;
    private final ProjectRepositories.ProjectOrganizations projectOrganizations;
    private final ProjectRepositories.ProjectFacilities projectFacilities;
    private final WeredaRepository weredas;
    private final FacilityRepository facilities;
    private final ProjectMetricsService metrics;
    private final NamedParameterJdbcTemplate jdbc;
    private final ApplicationEventPublisher events;

    private static final Pattern CODE = Pattern.compile("^[A-Z0-9][A-Z0-9-]{2,31}$");
    private static final Map<Sector, String> SECTOR_PREFIX = Map.of(Sector.EDUCATION, "EDU", Sector.HEALTH, "HEA", Sector.MANUFACTURING, "MAN", Sector.AGRICULTURE, "AGR");
    private static final Map<OrganizationType, String> ORG_PREFIX = Map.of(OrganizationType.GOVERNMENT_BUREAU, "BUR", OrganizationType.CONTRACTOR, "CTR", OrganizationType.CONSULTANT, "CON",
        OrganizationType.DONOR, "FND", OrganizationType.FEDERAL_AGENCY, "FED", OrganizationType.NGO, "NGO", OrganizationType.COMMUNITY, "COM", OrganizationType.PRIVATE, "PRV");
    public static final List<String> RISK_CATEGORIES = List.of("SCOPE", "FINANCIAL", "SUPPLY", "MARKET", "RESOURCE", "SAFETY", "SECURITY", "ENVIRONMENT", "TECHNICAL", "PROCUREMENT", "SOCIAL");
    private static final Set<OrganizationRole> SINGLE_ROLES = EnumSet.of(OrganizationRole.IMPLEMENTING_AGENCY, OrganizationRole.CONTRACTOR, OrganizationRole.SUPERVISING_CONSULTANT);
    private static final Set<String> NAME_STOPWORDS = Set.of("reconstruction", "rehabilitation", "restoration", "construction", "renovation", "expansion", "upgrade", "project", "phase", "and", "the", "of", "for", "at", "in", "new");
    /** Generous envelope around the regional boundary; points outside are almost certainly swapped or mistyped. */
    private static final double LAT_MIN = 12.2, LAT_MAX = 14.95, LNG_MIN = 36.3, LNG_MAX = 40.1;
    private static final BigDecimal MONEY_TOLERANCE = BigDecimal.ONE;

    // ── queries used by the form ─────────────────────────────────────────

    @Transactional(readOnly = true)
    public String suggestCode(Sector sector) {
        String prefix = "RP-" + SECTOR_PREFIX.get(sector) + "-";
        Integer max = jdbc.queryForObject("SELECT max(CAST(substring(code FROM :len) AS int)) FROM project WHERE code LIKE :like AND substring(code FROM :len) ~ '^[0-9]+$'",
            new MapSqlParameterSource("len", prefix.length() + 1).addValue("like", prefix + "%"), Integer.class);
        return prefix + String.format("%03d", (max == null ? 0 : max) + 1);
    }

    @Transactional(readOnly = true)
    public List<ProjectDtos.SimilarProject> similar(String name, Integer weredaId) {
        List<String> words = significantWords(name);
        if (words.isEmpty()) return List.of();
        MapSqlParameterSource p = new MapSqlParameterSource().addValue("weredaId", weredaId, java.sql.Types.INTEGER);
        StringBuilder score = new StringBuilder("0");
        for (int i = 0; i < words.size(); i++) { p.addValue("w" + i, "%" + words.get(i) + "%"); score.append(" + (CASE WHEN p.name ILIKE :w").append(i).append(" THEN 1 ELSE 0 END)"); }
        int needed = Math.max(1, (int) Math.ceil(words.size() * 0.6));
        return jdbc.query("""
            SELECT * FROM (SELECT p.id, p.code, p.name, w.name_en wereda, p.status, %s AS hits, (p.wereda_id = :weredaId) same_wereda
                           FROM project p JOIN wereda w ON w.id = p.wereda_id WHERE p.status <> 'CANCELLED') x
            WHERE hits >= %d AND (same_wereda OR hits = %d) ORDER BY hits DESC, same_wereda DESC LIMIT 5
            """.formatted(score, needed, words.size()), p,
            (rs, i) -> new ProjectDtos.SimilarProject(rs.getLong("id"), rs.getString("code"), rs.getString("name"), rs.getString("wereda"), ProjectStatus.valueOf(rs.getString("status"))));
    }

    @Transactional(readOnly = true)
    public List<ProjectDtos.OrganizationOption> organizationOptions(String q, OrganizationType type) {
        return jdbc.query("""
            SELECT o.id, o.code, o.name, o.org_type, o.contact, count(DISTINCT po.project_id) n
            FROM organization o LEFT JOIN project_organization po ON po.organization_id = o.id
            WHERE (:q IS NULL OR o.name ILIKE '%' || :q || '%' OR o.code ILIKE '%' || :q || '%') AND (:type IS NULL OR o.org_type = :type)
            GROUP BY o.id ORDER BY n DESC, o.name LIMIT 200
            """, new MapSqlParameterSource().addValue("q", q == null || q.isBlank() ? null : q.trim(), java.sql.Types.VARCHAR).addValue("type", type == null ? null : type.name(), java.sql.Types.VARCHAR),
            (rs, i) -> new ProjectDtos.OrganizationOption(rs.getLong("id"), rs.getString("code"), rs.getString("name"), OrganizationType.valueOf(rs.getString("org_type")), rs.getString("contact"), rs.getLong("n")));
    }

    // ── validation ───────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public ProjectDtos.ValidationResult validate(ProjectDtos.CreateProjectRequest r) {
        List<ProjectDtos.FieldIssue> errors = new ArrayList<>(), warnings = new ArrayList<>();
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        BigDecimal total = r.totalBudgetEtb() == null ? BigDecimal.ZERO : r.totalBudgetEtb();
        LifecycleStage stage = r.initialStage();
        int rank = stage == null ? 0 : ProjectDtos.REGISTRABLE_STAGES.indexOf(stage);

        // Identity
        String code = blankToNull(r.code());
        if (code != null) {
            code = code.toUpperCase(Locale.ROOT);
            if (!CODE.matcher(code).matches()) errors.add(issue("code", "Use 3–32 capital letters, digits or hyphens, starting with a letter or digit"));
            else if (codeExists(code)) errors.add(issue("code", "Project code " + code + " is already in use"));
        }
        if (stage != null && rank < 0) errors.add(issue("initialStage", "Projects can be registered in Planning, Approval, Funding, Procurement or Implementation"));
        CurrentUser.get().ifPresent(u -> { if (u.sectorScope() != null && r.sector() != null && u.sectorScope() != r.sector()) errors.add(issue("sector", "Your account is limited to the " + u.sectorScope() + " sector")); });

        // Location
        Wereda wereda = r.weredaId() == null ? null : weredas.findById(r.weredaId()).orElse(null);
        if (r.weredaId() != null && wereda == null) errors.add(issue("weredaId", "Unknown wereda"));
        if ((r.latitude() == null) != (r.longitude() == null)) errors.add(issue(r.latitude() == null ? "latitude" : "longitude", "Provide both latitude and longitude, or neither"));
        else if (r.latitude() != null) {
            if (r.latitude() < LAT_MIN || r.latitude() > LAT_MAX) errors.add(issue("latitude", "Latitude must be within Tigray (" + LAT_MIN + "–" + LAT_MAX + "°N)"));
            if (r.longitude() < LNG_MIN || r.longitude() > LNG_MAX) errors.add(issue("longitude", "Longitude must be within Tigray (" + LNG_MIN + "–" + LNG_MAX + "°E)"));
            boolean inside = r.latitude() >= LAT_MIN && r.latitude() <= LAT_MAX && r.longitude() >= LNG_MIN && r.longitude() <= LNG_MAX;
            if (inside && wereda != null && wereda.getCentroid() != null) {
                double km = haversineKm(r.latitude(), r.longitude(), wereda.getCentroid().getY(), wereda.getCentroid().getX());
                if (km > 40) warnings.add(issue("latitude", String.format("The site is %.0f km from the centre of %s — check the wereda or the coordinates", km, wereda.getNameEn())));
            }
        }
        if (r.name() != null && r.weredaId() != null)
            for (var s : similar(r.name(), r.weredaId())) warnings.add(issue("name", "Possible duplicate: " + s.code() + " · " + s.name() + " (" + s.weredaName() + ", " + s.status() + ")"));

        // Schedule
        LocalDate start = r.plannedStart(), end = r.plannedEnd();
        if (start != null && end != null) {
            if (!end.isAfter(start)) errors.add(issue("plannedEnd", "Planned end must be after the planned start"));
            else if (ChronoUnit.YEARS.between(start, end) >= 10) errors.add(issue("plannedEnd", "Planned duration cannot exceed 10 years"));
            if (end.isBefore(today) && stage != LifecycleStage.IMPLEMENTATION) warnings.add(issue("plannedEnd", "The planned end is already in the past"));
        }

        // Governance by stage: each stage requires the decisions that lead to it, and nothing beyond it
        requireByStage(errors, rank, 2, "approvedOn", r.approvedOn(), "Approval date is required from the Funding stage onward");
        requireByStage(errors, rank, 2, "approvalReference", blankToNull(r.approvalReference()), "Approval reference (decision minute or letter no.) is required from the Funding stage onward");
        requireByStage(errors, rank, 3, "fundingSecuredOn", r.fundingSecuredOn(), "Date funding was secured is required from the Procurement stage onward");
        requireByStage(errors, rank, 3, "procurementMethod", blankToNull(r.procurementMethod()), "Procurement method is required from the Procurement stage onward");
        requireByStage(errors, rank, 4, "contractSignedOn", r.contractSignedOn(), "Contract signature date is required for projects already in implementation");
        requireByStage(errors, rank, 4, "actualStart", r.actualStart(), "Actual start date is required for projects already in implementation");
        requireByStage(errors, rank, 4, "contractValueEtb", r.contractValueEtb(), "Contract value is required for projects already in implementation");
        Map<String, LocalDate> govDates = new LinkedHashMap<>();
        govDates.put("approvedOn", r.approvedOn()); govDates.put("fundingSecuredOn", r.fundingSecuredOn()); govDates.put("contractSignedOn", r.contractSignedOn()); govDates.put("actualStart", r.actualStart());
        LocalDate prev = null; String prevField = null;
        for (var e : govDates.entrySet()) {
            if (e.getValue() == null) continue;
            if (e.getValue().isAfter(today)) errors.add(issue(e.getKey(), "Cannot be in the future"));
            if (prev != null && e.getValue().isBefore(prev)) errors.add(issue(e.getKey(), "Must be on or after " + label(prevField) + " (" + prev + ")"));
            prev = e.getValue(); prevField = e.getKey();
        }
        if (r.contractValueEtb() != null && r.totalBudgetEtb() != null) {
            if (r.contractValueEtb().compareTo(total) > 0) errors.add(issue("contractValueEtb", "Contract value cannot exceed the total budget"));
            else if (r.contractValueEtb().signum() > 0 && r.contractValueEtb().compareTo(total.multiply(BigDecimal.valueOf(0.5))) < 0)
                warnings.add(issue("contractValueEtb", "Contract value is less than half of the total budget — check the figures"));
        }

        // Organisations
        List<ProjectDtos.OrganizationAssignment> orgs = nz(r.organizations());
        Map<OrganizationRole, Integer> roleCount = new EnumMap<>(OrganizationRole.class);
        Set<String> pairs = new HashSet<>();
        for (int i = 0; i < orgs.size(); i++) {
            var o = orgs.get(i);
            String f = "organizations[" + i + "]";
            if (o.role() != null) roleCount.merge(o.role(), 1, Integer::sum);
            boolean hasId = o.organizationId() != null, hasNew = blankToNull(o.newName()) != null;
            if (hasId == hasNew) errors.add(issue(f + ".organizationId", "Choose an existing organisation or enter a new one"));
            else if (hasId && !organizations.existsById(o.organizationId())) errors.add(issue(f + ".organizationId", "Unknown organisation"));
            else if (hasNew && o.newType() == null) errors.add(issue(f + ".newType", "Select the organisation type"));
            String key = o.role() + ":" + (hasId ? "#" + o.organizationId() : String.valueOf(o.newName()).trim().toLowerCase(Locale.ROOT));
            if (!pairs.add(key)) errors.add(issue(f + ".organizationId", "This organisation is already listed in the same role"));
        }
        for (OrganizationRole single : SINGLE_ROLES) if (roleCount.getOrDefault(single, 0) > 1) errors.add(issue("organizations", "Only one " + label(single.name()) + " can be named"));
        if (roleCount.getOrDefault(OrganizationRole.IMPLEMENTING_AGENCY, 0) == 0) errors.add(issue("organizations", "Name the implementing agency"));
        if (rank >= 4 && roleCount.getOrDefault(OrganizationRole.CONTRACTOR, 0) == 0) errors.add(issue("organizations", "Name the contractor for a project already in implementation"));

        // Milestones
        List<ProjectDtos.MilestoneInput> ms = nz(r.milestones());
        if (ms.isEmpty()) errors.add(issue("milestones", "Add at least one milestone (the final handover milestone at minimum)"));
        BigDecimal weights = BigDecimal.ZERO;
        Set<String> names = new HashSet<>();
        for (int i = 0; i < ms.size(); i++) {
            var m = ms.get(i);
            String f = "milestones[" + i + "]";
            if (m.weightPct() != null) { weights = weights.add(m.weightPct()); if (m.weightPct().signum() <= 0) errors.add(issue(f + ".weightPct", "Weight must be greater than 0")); }
            if (m.name() != null && !names.add(m.name().trim().toLowerCase(Locale.ROOT))) errors.add(issue(f + ".name", "Milestone names must be unique"));
            if (m.plannedDate() != null && start != null && end != null && (m.plannedDate().isBefore(start) || m.plannedDate().isAfter(end)))
                errors.add(issue(f + ".plannedDate", "Must fall between the planned start and end (" + start + " – " + end + ")"));
        }
        if (!ms.isEmpty() && weights.subtract(BigDecimal.valueOf(100)).abs().compareTo(BigDecimal.valueOf(0.05)) > 0)
            errors.add(issue("milestones", "Milestone weights must add up to 100% (currently " + weights.stripTrailingZeros().toPlainString() + "%)"));
        if (!ms.isEmpty() && end != null && ms.stream().map(ProjectDtos.MilestoneInput::plannedDate).filter(Objects::nonNull).noneMatch(d -> !d.isBefore(end.minusDays(30))))
            warnings.add(issue("milestones", "No milestone falls in the last 30 days of the schedule — consider a completion / handover milestone"));

        // Budget lines
        List<ProjectDtos.BudgetLineInput> lines = nz(r.budgetLines());
        Set<BudgetCategory> cats = EnumSet.noneOf(BudgetCategory.class);
        BigDecimal allocated = BigDecimal.ZERO;
        for (int i = 0; i < lines.size(); i++) {
            var l = lines.get(i);
            if (l.category() != null && !cats.add(l.category())) errors.add(issue("budgetLines[" + i + "].category", "Each category can appear only once"));
            if (l.allocatedEtb() != null) allocated = allocated.add(l.allocatedEtb());
        }
        if (lines.isEmpty()) warnings.add(issue("budgetLines", "No budget breakdown — finance views will show the total only"));
        else if (allocated.subtract(total).abs().compareTo(MONEY_TOLERANCE) > 0)
            errors.add(issue("budgetLines", "Budget lines add up to ETB " + fmt(allocated) + " but the total budget is ETB " + fmt(total)));

        // Tranches
        List<ProjectDtos.TrancheInput> tr = nz(r.tranches());
        BigDecimal scheduled = BigDecimal.ZERO;
        for (int i = 0; i < tr.size(); i++) {
            var t = tr.get(i);
            if (t.amountEtb() != null) scheduled = scheduled.add(t.amountEtb());
            if (t.plannedDate() != null && start != null && end != null && (t.plannedDate().isBefore(start.minusYears(1)) || t.plannedDate().isAfter(end)))
                errors.add(issue("tranches[" + i + "].plannedDate", "Must fall between one year before the start and the planned end"));
        }
        if (scheduled.subtract(total).compareTo(MONEY_TOLERANCE) > 0) errors.add(issue("tranches", "Scheduled tranches (ETB " + fmt(scheduled) + ") exceed the total budget (ETB " + fmt(total) + ")"));
        else if (tr.isEmpty()) warnings.add(issue("tranches", "No disbursement schedule — disbursement-lag alerts cannot fire for this project"));
        else if (total.subtract(scheduled).compareTo(MONEY_TOLERANCE) > 0) warnings.add(issue("tranches", "ETB " + fmt(total.subtract(scheduled)) + " of the budget has no disbursement scheduled"));

        // Facilities
        List<Long> fids = nz(r.facilityIds());
        if (new HashSet<>(fids).size() != fids.size()) errors.add(issue("facilityIds", "A facility is listed twice"));
        for (Long id : new LinkedHashSet<>(fids)) {
            Facility f = facilities.findById(id).orElse(null);
            if (f == null) { errors.add(issue("facilityIds", "Unknown facility #" + id)); continue; }
            if (r.sector() != null && f.getSector() != r.sector()) errors.add(issue("facilityIds", f.getName() + " belongs to the " + f.getSector() + " sector"));
            int linked = projectFacilities.countByFacilityId(id);
            if (linked > 0) warnings.add(issue("facilityIds", f.getName() + " is already covered by " + linked + " other project" + (linked > 1 ? "s" : "")));
        }

        // Risks
        List<ProjectDtos.RiskInput> rk = nz(r.risks());
        for (int i = 0; i < rk.size(); i++)
            if (rk.get(i).category() != null && !RISK_CATEGORIES.contains(rk.get(i).category())) errors.add(issue("risks[" + i + "].category", "Unknown risk category"));
        if (rk.isEmpty()) warnings.add(issue("risks", "No risks registered — the issues & risks component of the risk score starts at zero"));

        return new ProjectDtos.ValidationResult(errors.isEmpty(), code == null && r.sector() != null ? suggestCode(r.sector()) : code, errors, warnings);
    }

    // ── registration ─────────────────────────────────────────────────────

    @Audited(action = "PROJECT_CREATE", entityType = "PROJECT")
    @Transactional
    public ProjectDtos.ProjectSummary create(ProjectDtos.CreateProjectRequest r) {
        ProjectDtos.ValidationResult v = validate(r);
        if (!v.valid()) throw BusinessException.invalid("The project could not be registered: " + v.errors().size() + " problem(s) to fix",
            v.errors().stream().map(e -> Map.of("field", e.field(), "message", e.message())).toList());
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        Wereda wereda = weredas.findWithZoneById(r.weredaId()).orElseThrow();
        LifecycleStage stage = r.initialStage();
        CurrentUser actor = CurrentUser.get().orElse(null);

        Project p = new Project();
        p.setCode(v.suggestedCode());
        p.setName(r.name().trim());
        p.setSector(r.sector());
        p.setWereda(wereda);
        p.setDescription(blankToNull(r.description()));
        p.setBeneficiaries(r.beneficiaries());
        p.setLocation(r.latitude() != null ? GeoPoint.jts(r.latitude(), r.longitude()) : wereda.getCentroid());
        p.setLifecycleStage(stage);
        p.setStatus(switch (stage) { case PROCUREMENT -> ProjectStatus.PROCUREMENT; case IMPLEMENTATION -> ProjectStatus.ACTIVE; default -> ProjectStatus.PLANNED; });
        p.setPlannedStart(r.plannedStart());
        p.setPlannedEnd(r.plannedEnd());
        p.setActualStart(r.actualStart());
        p.setTotalBudgetEtb(r.totalBudgetEtb());
        p.setFundingSource(r.fundingSource());
        p.setProcurementMethod(blankToNull(r.procurementMethod()));
        p.setContractValueEtb(r.contractValueEtb());
        p.setApprovedOn(r.approvedOn());
        p.setApprovalReference(blankToNull(r.approvalReference()));
        p.setFundingSecuredOn(r.fundingSecuredOn());
        p.setContractSignedOn(r.contractSignedOn());

        List<ProjectOrganization> links = new ArrayList<>();
        for (var o : nz(r.organizations())) {
            Organization org = o.organizationId() != null ? organizations.findById(o.organizationId()).orElseThrow() : resolveNew(o);
            if (o.role() == OrganizationRole.CONTRACTOR) p.setContractorName(org.getName());
            if (o.role() == OrganizationRole.IMPLEMENTING_AGENCY) p.setImplementingAgency(org.getName());
            links.add(new ProjectOrganization(null, org, o.role()));
        }
        Project saved = projects.save(p);
        links.forEach(l -> l.setProject(saved));
        projectOrganizations.saveAll(links);

        List<ProjectDtos.MilestoneInput> ms = new ArrayList<>(nz(r.milestones()));
        ms.sort(Comparator.comparing(ProjectDtos.MilestoneInput::plannedDate));
        short seq = 0;
        for (var m : ms) {
            Milestone e = new Milestone();
            e.setProject(saved); e.setSequence(++seq); e.setName(m.name().trim()); e.setPlannedDate(m.plannedDate()); e.setWeightPct(m.weightPct());
            milestones.save(e);
        }
        for (var l : nz(r.budgetLines())) {
            BudgetLine e = new BudgetLine();
            e.setProject(saved); e.setCategory(l.category()); e.setAllocatedEtb(l.allocatedEtb());
            budgetLines.save(e);
        }
        List<ProjectDtos.TrancheInput> tr = new ArrayList<>(nz(r.tranches()));
        tr.sort(Comparator.comparing(ProjectDtos.TrancheInput::plannedDate));
        short no = 0;
        for (var t : tr) {
            Disbursement e = new Disbursement();
            e.setProject(saved); e.setTrancheNo(++no); e.setPlannedDate(t.plannedDate()); e.setAmountEtb(t.amountEtb());
            e.setFundingSource(t.fundingSource() != null ? t.fundingSource() : r.fundingSource());
            disbursements.save(e);
        }
        for (Long fid : new LinkedHashSet<>(nz(r.facilityIds()))) projectFacilities.save(new ProjectFacility(saved, facilities.getReferenceById(fid)));
        for (var k : nz(r.risks())) {
            ProjectRisk e = new ProjectRisk();
            e.setProject(saved); e.setTitle(k.title().trim()); e.setCategory(k.category()); e.setLikelihood(k.likelihood()); e.setImpact(k.impact());
            e.setMitigation(blankToNull(k.mitigation())); e.setOwner(blankToNull(k.owner())); e.setRaisedOn(today);
            risks.save(e);
        }

        ProjectStageEvent ev = new ProjectStageEvent();
        ev.setProject(saved); ev.setFromStage(null); ev.setToStage(stage); ev.setOccurredAt(Instant.now());
        ev.setNote(Optional.ofNullable(blankToNull(r.registrationNote())).orElse("Registered in RPIS at the " + label(stage.name()) + " stage"));
        ev.setReference(blankToNull(r.approvalReference()));
        if (actor != null) { ev.setActorUserId(actor.id()); ev.setActorName(actor.fullName()); }
        stageEvents.save(ev);

        Project computed = metrics.recompute(saved, today);
        events.publishEvent(DomainEvent.of("PROJECT_CREATED", "PROJECT", computed.getId(), computed.getSector(), wereda.getId(),
            Map.of("projectName", computed.getName(), "projectCode", computed.getCode(), "stage", stage.name(), "budgetEtb", computed.getTotalBudgetEtb(),
                   "actor", actor == null ? "system" : actor.fullName(), "weredaName", wereda.getNameEn())));
        return ProjectService.summary(computed);
    }

    /** New organisations are matched by name first so the same contractor typed twice does not become two records. */
    private Organization resolveNew(ProjectDtos.OrganizationAssignment o) {
        String name = o.newName().trim();
        return organizations.findByNameIgnoreCase(name).orElseGet(() -> {
            Organization org = new Organization();
            org.setCode(ORG_PREFIX.get(o.newType()) + "-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(Locale.ROOT));
            org.setName(name);
            org.setOrgType(o.newType());
            org.setContact(blankToNull(o.newContact()));
            return organizations.save(org);
        });
    }

    // ── helpers ──────────────────────────────────────────────────────────
    private boolean codeExists(String code) {
        Integer n = jdbc.queryForObject("SELECT count(*) FROM project WHERE upper(code) = :c", new MapSqlParameterSource("c", code), Integer.class);
        return n != null && n > 0;
    }
    private static void requireByStage(List<ProjectDtos.FieldIssue> errors, int rank, int fromRank, String field, Object value, String message) {
        if (rank >= fromRank && value == null) errors.add(issue(field, message));
        if (rank >= 0 && rank < fromRank && value != null) errors.add(issue(field, "Only recorded once the project reaches the " + label(ProjectDtos.REGISTRABLE_STAGES.get(fromRank).name()) + " stage — clear it or choose a later stage"));
    }
    private static List<String> significantWords(String name) {
        if (name == null) return List.of();
        return Arrays.stream(name.toLowerCase(Locale.ROOT).split("[^\\p{L}\\p{N}]+"))
            .filter(w -> w.length() >= 3 && !NAME_STOPWORDS.contains(w)).distinct().limit(6).toList();
    }
    private static double haversineKm(double lat1, double lng1, double lat2, double lng2) {
        double dLat = Math.toRadians(lat2 - lat1), dLng = Math.toRadians(lng2 - lng1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    private static ProjectDtos.FieldIssue issue(String field, String message) { return new ProjectDtos.FieldIssue(field, message); }
    private static <T> List<T> nz(List<T> l) { return l == null ? List.of() : l; }
    private static String blankToNull(String s) { return s == null || s.isBlank() ? null : s.trim(); }
    private static String fmt(BigDecimal v) { return String.format("%,.0f", v); }
    private static String label(String enumName) {
        String s = switch (enumName) { case "approvedOn" -> "the approval date"; case "fundingSecuredOn" -> "the funding date"; case "contractSignedOn" -> "the contract date"; default -> enumName; };
        if (!s.equals(enumName)) return s;
        String l = enumName.replace('_', ' ').toLowerCase(Locale.ROOT);
        return Character.toUpperCase(l.charAt(0)) + l.substring(1);
    }
}
