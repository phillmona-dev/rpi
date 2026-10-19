package et.gov.tigray.rpis.analytics;

import et.gov.tigray.rpis.common.Enums.*;
import et.gov.tigray.rpis.common.Sector;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;

public final class AnalyticsDtos {
    private AnalyticsDtos() {}

    public record InsightDto(Long id, InsightKind kind, EntityType entityType, Long entityId, String entityName, String entityCode, Sector sector, Integer weredaId, String weredaName,
                             String provider, String modelVersion, InsightBasis basis, Instant computedAt, AlertSeverity severity, BigDecimal score, BigDecimal confidence,
                             Integer horizonDays, String title, String summary, Map<String, Object> explanation, InsightStatus status, String reviewedByName, Instant reviewedAt, String reviewNote) {}

    public record ProjectIntelligence(Long projectId, Short riskScore, String riskBand, Instant riskComputedAt, Map<String, Object> riskComponents,
                                      List<InsightDto> insights, List<ForecastPoint> forecastHistory, Disclaimer disclaimer) {}
    public record ForecastPoint(Instant computedAt, String provider, java.time.LocalDate forecastEnd, BigDecimal forecastCostEtb, BigDecimal confidence) {}
    public record Disclaimer(String text, List<String> providers) {}

    public record ReviewRequest(@NotNull InsightStatus status, @Size(max = 2000) String note) {}

    public static InsightDto dto(AnalyticsInsight i, String entityName, String entityCode, String weredaName) {
        return new InsightDto(i.getId(), i.getKind(), i.getEntityType(), i.getEntityId(), entityName, entityCode, i.getSector(), i.getWeredaId(), weredaName,
            i.getProvider(), i.getModelVersion(), i.getBasis(), i.getComputedAt(), i.getSeverity(), i.getScore(), i.getConfidence(), i.getHorizonDays(),
            i.getTitle(), i.getSummary(), i.getExplanation(), i.getStatus(), i.getReviewedByName(), i.getReviewedAt(), i.getReviewNote());
    }
}
