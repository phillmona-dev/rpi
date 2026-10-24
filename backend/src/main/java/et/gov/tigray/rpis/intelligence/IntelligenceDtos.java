package et.gov.tigray.rpis.intelligence;

import et.gov.tigray.rpis.common.Enums.AlertSeverity;
import et.gov.tigray.rpis.common.Enums.EntityType;
import et.gov.tigray.rpis.common.Sector;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

public final class IntelligenceDtos {
    private IntelligenceDtos() {}

    /** Early-warning indicator with its value, severity and the explanation an executive needs to trust it. */
    public record Signal(String code, AlertSeverity severity, BigDecimal value, String unit, String display, String trend, String explanation, String href) {}

    /** One executive action card: what, why (evidence), what to do, and where it leads. */
    public record Action(String id, int priority, String kind, AlertSeverity severity, String title, String rationale, List<Evidence> evidence, String suggestedAction,
                         EntityType entityType, Long entityId, String entityName, String entityCode, Sector sector, String weredaName, Long alertId, Long insightId, String basis, long ageHours) {}
    public record Evidence(String label, String value) {}

    public record UnitComparison(String key, String label, long projectsActive, long projectsDelayed, BigDecimal avgVariancePp, BigDecimal avgCpi, BigDecimal reportingCoveragePct,
                                 BigDecimal verifiedCoveragePct, BigDecimal disbursementPct, BigDecimal avgRiskScore, long criticalAlerts, int rank) {}

    public record ContractorPerformance(String contractor, long projects, long active, long delayed, long completed, BigDecimal avgVariancePp, BigDecimal avgCpi,
                                        BigDecimal budgetEtb, BigDecimal onTimeRatePct, int rank) {}

    public record FundingPriority(Long facilityId, String code, String name, Sector sector, String facilityType, String weredaName, String severity, Integer impactScore,
                                  Integer beneficiaries, BigDecimal replacementEstimateEtb, BigDecimal priorityScore, Long insightId, Map<String, Object> explanation) {}

    /** riskType = the component contributing most to the composite score; severity maps the band onto the alert scale. */
    public record RiskEntry(Long projectId, String code, String name, Sector sector, String weredaName, String status, String health, Short riskScore, String band,
                            BigDecimal variancePp, BigDecimal cpi, Integer daysSinceReport, Integer daysSinceVerified, BigDecimal budgetEtb, Map<String, Object> components,
                            String riskType, AlertSeverity severity, String recommendedAction) {}

    /** Active project with a tranche pending (overdue or due within 60 days), ranked for release. recommendation: RELEASE | CONDITIONAL | HOLD. */
    public record ProjectFundingPriority(Long projectId, String code, String name, Sector sector, String weredaName, String health, BigDecimal physicalPct, BigDecimal budgetEtb,
                                         BigDecimal disbursedEtb, BigDecimal pendingEtb, LocalDate nextDueDate, int lagDays, Short riskScore, Integer daysSinceVerified,
                                         BigDecimal priorityScore, String recommendation, String rationale) {}

    public record Briefing(Instant generatedAt, Sector sector, Short zoneId, List<Signal> signals, List<Action> actions, List<UnitComparison> sectors, List<UnitComparison> zones,
                           List<ContractorPerformance> contractors, List<ProjectFundingPriority> projectFundingPriorities, List<FundingPriority> fundingPriorities,
                           List<RiskEntry> riskRegister, String disclaimer) {}
}
