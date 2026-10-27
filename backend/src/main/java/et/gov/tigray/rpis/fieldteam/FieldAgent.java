package et.gov.tigray.rpis.fieldteam;

import et.gov.tigray.rpis.common.Enums.AgentStatus;
import et.gov.tigray.rpis.common.Enums.AgentType;
import et.gov.tigray.rpis.common.Enums.EmploymentType;
import et.gov.tigray.rpis.damage.FieldDevice;
import et.gov.tigray.rpis.geo.Wereda;
import et.gov.tigray.rpis.project.Organization;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.time.LocalDate;
import java.util.*;

/**
 * A member of the field team: data collector, field analyst or supervisor. The profile exists independently of a
 * login account; access to the field app is provisioned separately (FIELD_OFFICER role) once onboarding is complete.
 */
@Entity @Table(name = "field_agent")
@Getter @Setter @NoArgsConstructor
public class FieldAgent {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(nullable = false, unique = true, length = 16) private String code;
    @Column(name = "user_id", unique = true) private Long userId;
    @Column(name = "full_name", nullable = false, length = 160) private String fullName;
    @Column(length = 8) private String gender;
    @Column(nullable = false, unique = true, length = 20) private String phone;
    @Column(name = "alt_phone", length = 20) private String altPhone;
    @Column(length = 160) private String email;
    @Column(name = "national_id", unique = true, length = 40) private String nationalId;
    @Column(name = "employee_number", length = 40) private String employeeNumber;
    @Enumerated(EnumType.STRING) @Column(name = "agent_type", nullable = false, length = 24) private AgentType agentType;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20) private AgentStatus status = AgentStatus.PENDING_ONBOARDING;
    @Column(name = "status_reason", columnDefinition = "text") private String statusReason;
    @Column(name = "status_changed_at") private Instant statusChangedAt;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "organization_id") private Organization organization;
    @Enumerated(EnumType.STRING) @Column(name = "employment_type", length = 16) private EmploymentType employmentType;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "home_wereda_id") private Wereda homeWereda;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "supervisor_id") private FieldAgent supervisor;
    @Column(name = "education_level", length = 24) private String educationLevel;
    @Column(name = "years_experience") private Short yearsExperience;
    @JdbcTypeCode(SqlTypes.JSON) @Column(columnDefinition = "jsonb", nullable = false) private List<String> sectors = new ArrayList<>();
    @JdbcTypeCode(SqlTypes.JSON) @Column(columnDefinition = "jsonb", nullable = false) private List<String> skills = new ArrayList<>();
    @JdbcTypeCode(SqlTypes.JSON) @Column(columnDefinition = "jsonb", nullable = false) private List<String> languages = new ArrayList<>();
    @Column(name = "max_active_assignments", nullable = false) private short maxActiveAssignments = 4;
    @Column(name = "contract_start") private LocalDate contractStart;
    @Column(name = "contract_end") private LocalDate contractEnd;
    @Column(name = "training_completed_on") private LocalDate trainingCompletedOn;
    @Column(name = "code_of_conduct_signed_on") private LocalDate codeOfConductSignedOn;
    @Column(name = "background_check_on") private LocalDate backgroundCheckOn;
    @Column(name = "emergency_contact_name", length = 160) private String emergencyContactName;
    @Column(name = "emergency_contact_phone", length = 20) private String emergencyContactPhone;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "device_id") private FieldDevice device;
    @Column(columnDefinition = "text") private String notes;
    @Column(name = "registered_by_name", length = 160) private String registeredByName;
    @CreationTimestamp @Column(name = "created_at", updatable = false) private Instant createdAt;
    @UpdateTimestamp @Column(name = "updated_at") private Instant updatedAt;

    @ElementCollection(fetch = FetchType.LAZY)
    @CollectionTable(name = "field_agent_coverage", joinColumns = @JoinColumn(name = "agent_id"))
    @Column(name = "wereda_id")
    private Set<Integer> coverageWeredaIds = new LinkedHashSet<>();

    /** Onboarding is complete when training and the code of conduct are on record. */
    public boolean isOnboarded() { return trainingCompletedOn != null && codeOfConductSignedOn != null; }
}
