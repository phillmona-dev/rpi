package et.gov.tigray.rpis.alert;

import et.gov.tigray.rpis.common.Enums.*;
import et.gov.tigray.rpis.common.Sector;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.Map;

public final class AlertDtos {
    private AlertDtos() {}

    public record AlertSummary(Long id, AlertRule rule, AlertSeverity severity, AlertStatus status, String title, String detail,
                               EntityType entityType, Long entityId, String entityName, String entityCode, Sector sector,
                               Integer weredaId, String weredaName, Instant triggeredAt, Instant acknowledgedAt, Long assignedToUserId,
                               String assignedToName, Instant resolvedAt, boolean decisionRequired, long ageHours, Map<String, Object> metrics) {}

    public record ActionDto(Long id, AlertAction action, String note, String actorName, Instant createdAt) {}
    public record AlertDetail(AlertSummary alert, List<ActionDto> history) {}

    public record ActionRequest(@NotNull AlertAction action, @Size(max = 2000) String note, Long assigneeUserId) {}

    public record Counts(long open, long critical, long high, long decisionRequired, long acknowledged, long assigned, long resolvedLast7Days) {}
}
