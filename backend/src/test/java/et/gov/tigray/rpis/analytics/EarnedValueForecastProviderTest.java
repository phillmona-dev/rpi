package et.gov.tigray.rpis.analytics;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

class EarnedValueForecastProviderTest {
    private final EarnedValueForecastProvider provider = new EarnedValueForecastProvider();

    @Test
    void behindScheduleProjectForecastsLaterThanPlan() {
        LocalDate start = LocalDate.of(2026, 1, 1), end = LocalDate.of(2026, 12, 31), asOf = LocalDate.of(2026, 7, 1);
        var f = provider.forecast(new ForecastProvider.ForecastInput(start, end, start, asOf, 25, 50, new BigDecimal("100000000"), new BigDecimal("30000000")));
        assertThat(f.spi()).isEqualTo(0.5);
        assertThat(f.cpi()).isLessThan(1.0);
        assertThat(f.forecastEnd()).isAfter(end);
        assertThat(f.forecastCost()).isGreaterThan(new BigDecimal("100000000"));
        assertThat(f.rationale()).contains("not by AI");
    }

    @Test
    void onScheduleProjectForecastsNearPlan() {
        LocalDate start = LocalDate.of(2026, 1, 1), end = LocalDate.of(2026, 12, 31), asOf = LocalDate.of(2026, 7, 1);
        var f = provider.forecast(new ForecastProvider.ForecastInput(start, end, start, asOf, 50, 50, new BigDecimal("100000000"), new BigDecimal("50000000")));
        assertThat(f.spi()).isEqualTo(1.0);
        assertThat(f.cpi()).isEqualTo(1.0);
        assertThat(Math.abs(java.time.temporal.ChronoUnit.DAYS.between(f.forecastEnd(), end))).isLessThan(10);
    }

    @Test
    void completedProjectForecastsAsOfToday() {
        LocalDate start = LocalDate.of(2026, 1, 1), end = LocalDate.of(2026, 6, 30), asOf = LocalDate.of(2026, 6, 15);
        var f = provider.forecast(new ForecastProvider.ForecastInput(start, end, start, asOf, 100, 95, BigDecimal.TEN, BigDecimal.TEN));
        assertThat(f.forecastEnd()).isEqualTo(asOf);
    }
}
