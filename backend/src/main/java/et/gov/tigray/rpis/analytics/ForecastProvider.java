package et.gov.tigray.rpis.analytics;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Extension point for Pillar 5. The baseline earned-value provider ships now; an AI provider
 * (trained on progress logs, supply-chain and inflation signals) can be registered later and
 * selected via configuration without changing callers.
 */
public interface ForecastProvider {
    String id();
    Forecast forecast(ForecastInput input);

    record ForecastInput(LocalDate plannedStart, LocalDate plannedEnd, LocalDate actualStart, LocalDate asOf,
                         double physicalPct, double plannedPct, BigDecimal budget, BigDecimal expended) {}

    record Forecast(LocalDate forecastEnd, BigDecimal forecastCost, double confidence, String rationale, Double spi, Double cpi) {}
}
