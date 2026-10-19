package et.gov.tigray.rpis.analytics;

import et.gov.tigray.rpis.common.Enums.*;
import et.gov.tigray.rpis.config.RpisProperties;
import et.gov.tigray.rpis.project.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Composite, explainable project risk score (0–100). Every component is a named, bounded signal with a
 * configurable weight (rpis.analytics.*) so the executive office can review and tune the model. This is
 * the transparent baseline that a trained risk model may later replace through the same `analytics_insight` contract.
 */
@Service
@RequiredArgsConstructor
public class RiskScoringService {
    public static final String PROVIDER = "COMPOSITE_RISK_BASELINE";
    private final RpisProperties props;
    private final ProjectRepositories.Risks risks;
    private final ProjectRepositories.Issues issues;
    private final ProjectRepositories.Disbursements disbursements;

    public record Component(String key, double score, double weight, String value, String note) {}
    public record Result(short score, String band, List<Component> components, Instant computedAt) {
        public Map<String, Object> asMap() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("band", band); m.put("asOf", computedAt.toString());
            List<Map<String, Object>> cs = new ArrayList<>();
            for (Component c : components) {
                Map<String, Object> cm = new LinkedHashMap<>();
                cm.put("key", c.key()); cm.put("score", Math.round(c.score())); cm.put("weight", c.weight()); cm.put("value", c.value()); cm.put("note", c.note());
                cs.add(cm);
            }
            m.put("components", cs);
            return m;
        }
    }

    public static String band(Short score) {
        if (score == null) return null;
        return score >= 75 ? "CRITICAL" : score >= 50 ? "HIGH" : score >= 25 ? "MODERATE" : "LOW";
    }

    /** Returns null for completed / cancelled projects (no delivery risk to manage). */
    public Result score(Project p, List<Milestone> milestones, LocalDate asOf) {
        if (p.getStatus() == ProjectStatus.COMPLETED || p.getStatus() == ProjectStatus.CANCELLED) return null;
        var a = props.getAnalytics();
        List<Component> cs = new ArrayList<>();
        boolean delivering = p.getStatus() == ProjectStatus.ACTIVE || p.getStatus() == ProjectStatus.SUSPENDED;

        // Schedule: variance against the milestone baseline (active) or days past planned start (not yet active)
        if (delivering) {
            double v = p.getScheduleVariancePp().doubleValue();
            cs.add(new Component("schedule", clamp(-v / 40 * 100), a.getWeightSchedule(), fmt(v) + " pp", v < 0 ? "Behind the milestone baseline" : "On or ahead of baseline"));
        } else {
            long late = Math.max(0, ChronoUnit.DAYS.between(p.getPlannedStart(), asOf));
            cs.add(new Component("schedule", clamp(late / 120.0 * 100), a.getWeightSchedule(), late + " d", late > 0 ? "Planned start passed without mobilisation" : "Not yet due to start"));
        }
        // Cost: CPI below 1 means certified cost outpaces earned value
        double cpi = p.getCpi() == null ? 1 : p.getCpi().doubleValue();
        cs.add(new Component("cost", delivering ? clamp((1 - cpi) / 0.3 * 100) : 0, a.getWeightCost(), p.getCpi() == null ? "n/a" : String.format("CPI %.2f", cpi), cpi < 0.9 ? "Cost performance below threshold" : "Cost within plan"));
        // Reporting: silence from site
        long days = p.getLastProgressReportAt() == null
            ? (delivering ? ChronoUnit.DAYS.between(p.getActualStart() != null ? p.getActualStart() : p.getPlannedStart(), asOf) : 0)
            : ChronoUnit.DAYS.between(p.getLastProgressReportAt().atZone(ZoneOffset.UTC).toLocalDate(), asOf);
        double reporting = p.getStatus() == ProjectStatus.SUSPENDED ? 100 : delivering ? clamp((days - 7) / 38.0 * 100) : 0;
        cs.add(new Component("reporting", reporting, a.getWeightReporting(), days + " d", p.getStatus() == ProjectStatus.SUSPENDED ? "Project suspended" : days > 21 ? "No site report beyond threshold" : "Reporting regular"));
        // Milestones: worst overdue
        long worst = milestones.stream().filter(m -> m.getActualDate() == null && m.getPlannedDate().isBefore(asOf)).mapToLong(m -> ChronoUnit.DAYS.between(m.getPlannedDate(), asOf)).max().orElse(0);
        long overdueCount = milestones.stream().filter(m -> m.getActualDate() == null && m.getPlannedDate().isBefore(asOf)).count();
        cs.add(new Component("milestones", delivering ? clamp(worst / 90.0 * 100) : 0, a.getWeightMilestones(), overdueCount + " overdue", worst > 0 ? "Worst milestone " + worst + " days late" : "No overdue milestones"));
        // Issues & risks register
        int issuePts = issues.findByProjectIdOrderByRaisedOnDesc(p.getId()).stream().filter(i -> i.getStatus() != IssueStatus.RESOLVED)
            .mapToInt(i -> i.getSeverity() == Level.HIGH ? 30 : i.getSeverity() == Level.MEDIUM ? 15 : 5).sum();
        int riskPts = risks.findByProjectIdOrderByRaisedOnDesc(p.getId()).stream().filter(r -> r.getStatus() != RiskStatus.CLOSED)
            .mapToInt(r -> (r.getLikelihood() == Level.HIGH ? 2 : r.getLikelihood() == Level.MEDIUM ? 1 : 0) * (r.getImpact() == Level.HIGH ? 10 : r.getImpact() == Level.MEDIUM ? 5 : 2)).sum();
        cs.add(new Component("issues", clamp(issuePts + riskPts), a.getWeightIssues(), issuePts / 5 + " issue pts · " + riskPts + " risk pts", "Open issues and high-likelihood / high-impact risks"));
        // Funding: unreleased tranches already due
        List<Disbursement> ds = disbursements.findByProjectIdOrderByTrancheNoAsc(p.getId());
        BigDecimal lagging = ds.stream().filter(d -> d.getReleasedDate() == null && d.getPlannedDate().isBefore(asOf)).map(Disbursement::getAmountEtb).reduce(BigDecimal.ZERO, BigDecimal::add);
        long worstLag = ds.stream().filter(d -> d.getReleasedDate() == null && d.getPlannedDate().isBefore(asOf)).mapToLong(d -> ChronoUnit.DAYS.between(d.getPlannedDate(), asOf)).max().orElse(0);
        double share = p.getTotalBudgetEtb().signum() == 0 ? 0 : lagging.doubleValue() / p.getTotalBudgetEtb().doubleValue();
        cs.add(new Component("funding", clamp(share * 200 + worstLag / 2.0), a.getWeightFunding(), String.format("%.0f%% of budget unreleased past due", share * 100), worstLag > 0 ? "Oldest overdue tranche " + worstLag + " days" : "Tranches released on schedule"));
        // Verification: independent field evidence
        long sinceVerified = p.getLastVerifiedAt() == null ? -1 : ChronoUnit.DAYS.between(p.getLastVerifiedAt().atZone(ZoneOffset.UTC).toLocalDate(), asOf);
        double verif = !delivering ? 0 : sinceVerified < 0 ? 70 : clamp((sinceVerified - 30) / 90.0 * 100);
        cs.add(new Component("verification", verif, a.getWeightVerification(), sinceVerified < 0 ? "never verified" : sinceVerified + " d since verified visit", sinceVerified < 0 ? "No verified field inspection on record" : "Last independently verified " + sinceVerified + " days ago"));

        double wsum = cs.stream().mapToDouble(Component::weight).sum();
        double total = wsum == 0 ? 0 : cs.stream().mapToDouble(c -> c.score() * c.weight()).sum() / wsum;
        short s = (short) Math.round(clamp(total));
        return new Result(s, band(s), cs, Instant.now());
    }

    static double clamp(double v) { return Math.max(0, Math.min(100, v)); }
    private static String fmt(double v) { return String.format("%+.0f", v); }
}
