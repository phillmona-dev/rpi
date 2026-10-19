package et.gov.tigray.rpis.analytics;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;

/**
 * Planned-progress baseline. With milestones: piecewise-linear cumulative weight by planned date.
 * Without: linear between planned start and end. Pure function; unit-tested.
 */
public final class ScheduleBaseline {
    private ScheduleBaseline() {}

    public record Point(LocalDate date, double cumulativePct) {}

    public static double plannedPct(LocalDate start, LocalDate end, List<Point> milestonePoints, LocalDate asOf) {
        if (asOf.isBefore(start)) return 0;
        if (!asOf.isBefore(end)) return 100;
        if (milestonePoints == null || milestonePoints.isEmpty()) return linear(start, end, asOf);
        LocalDate prevDate = start; double prevPct = 0;
        for (Point p : milestonePoints) {
            if (!asOf.isBefore(p.date())) { prevDate = p.date(); prevPct = p.cumulativePct(); continue; }
            return interpolate(prevDate, prevPct, p.date(), p.cumulativePct(), asOf);
        }
        return interpolate(prevDate, prevPct, end, 100, asOf);
    }

    private static double linear(LocalDate start, LocalDate end, LocalDate asOf) {
        return interpolate(start, 0, end, 100, asOf);
    }

    private static double interpolate(LocalDate d0, double p0, LocalDate d1, double p1, LocalDate x) {
        long span = ChronoUnit.DAYS.between(d0, d1);
        if (span <= 0) return p1;
        long elapsed = ChronoUnit.DAYS.between(d0, x);
        double v = p0 + (p1 - p0) * ((double) elapsed / span);
        return Math.max(0, Math.min(100, v));
    }
}
