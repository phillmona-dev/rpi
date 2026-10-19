package et.gov.tigray.rpis.analytics;

import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

/** Transparent, explainable baseline: SPI / CPI from earned-value management. */
@Component
public class EarnedValueForecastProvider implements ForecastProvider {
    public static final String ID = "EARNED_VALUE_BASELINE";

    @Override public String id() { return ID; }

    @Override
    public Forecast forecast(ForecastInput in) {
        LocalDate start = in.actualStart() != null ? in.actualStart() : in.plannedStart();
        Double spi = in.plannedPct() > 0 ? round3(in.physicalPct() / in.plannedPct()) : null;
        BigDecimal ev = in.budget().multiply(BigDecimal.valueOf(in.physicalPct() / 100.0));
        Double cpi = in.expended() != null && in.expended().signum() > 0 ? round3(ev.divide(in.expended(), 6, RoundingMode.HALF_UP).doubleValue()) : null;

        long plannedDays = Math.max(1, ChronoUnit.DAYS.between(in.plannedStart(), in.plannedEnd()));
        LocalDate forecastEnd;
        if (in.physicalPct() >= 100) forecastEnd = in.asOf();
        else if (spi == null || spi <= 0.05) forecastEnd = in.plannedEnd().plusDays(Math.round(plannedDays * 0.5)); // no signal yet: assume 50% slip
        else {
            long elapsed = Math.max(1, ChronoUnit.DAYS.between(start, in.asOf()));
            double remainingPct = 100 - in.physicalPct();
            double ratePerDay = in.physicalPct() / elapsed; // observed productivity
            long remainingDays = ratePerDay > 0 ? Math.round(remainingPct / ratePerDay) : Math.round(plannedDays * 1.5);
            forecastEnd = in.asOf().plusDays(Math.min(remainingDays, plannedDays * 3));
        }
        BigDecimal forecastCost = cpi != null && cpi > 0.2 ? in.budget().divide(BigDecimal.valueOf(cpi), 2, RoundingMode.HALF_UP) : in.budget();
        double confidence = in.physicalPct() < 10 ? 0.35 : in.physicalPct() < 40 ? 0.55 : 0.7;
        String rationale = String.format("Observed productivity %.2f%%/day; SPI %s; CPI %s. Baseline earned-value projection, not an AI forecast.",
            in.physicalPct() / Math.max(1, ChronoUnit.DAYS.between(start, in.asOf())), spi == null ? "n/a" : spi, cpi == null ? "n/a" : cpi);
        return new Forecast(forecastEnd, forecastCost, confidence, rationale, spi, cpi);
    }

    private static double round3(double v) { return Math.round(v * 1000.0) / 1000.0; }
}
