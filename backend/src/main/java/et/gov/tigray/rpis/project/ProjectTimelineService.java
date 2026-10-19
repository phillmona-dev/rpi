package et.gov.tigray.rpis.project;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.sql.Types;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Unified, chronological project passport: governance, delivery, finance, control and field evidence in one stream. */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ProjectTimelineService {
    private final NamedParameterJdbcTemplate jdbc;

    private static final String SQL = """
        SELECT * FROM (
          SELECT 'S' || e.id id, 'STAGE' kind, e.occurred_at at, 'Stage: ' || e.to_stage title,
                 coalesce(e.note, '') || CASE WHEN e.reference IS NOT NULL THEN ' (' || e.reference || ')' ELSE '' END detail,
                 e.actor_name actor, 'info' tone, jsonb_build_object('fromStage', e.from_stage, 'toStage', e.to_stage) data
          FROM project_stage_event e WHERE e.project_id = :id
          UNION ALL
          SELECT 'M' || m.id, 'MILESTONE', (m.actual_date::timestamp AT TIME ZONE 'UTC'), 'Milestone achieved: ' || m.name,
                 'Planned ' || m.planned_date || CASE WHEN m.actual_date > m.planned_date THEN ', ' || (m.actual_date - m.planned_date) || ' days late' ELSE '' END,
                 NULL, CASE WHEN m.actual_date > m.planned_date THEN 'warning' ELSE 'good' END,
                 jsonb_build_object('milestoneId', m.id, 'plannedDate', m.planned_date, 'actualDate', m.actual_date)
          FROM milestone m WHERE m.project_id = :id AND m.actual_date IS NOT NULL
          UNION ALL
          SELECT 'L' || l.id, 'PROGRESS', l.created_at, 'Progress report: ' || l.physical_progress_pct || '%',
                 'Planned ' || l.planned_progress_pct || '%' || coalesce(' · ' || l.notes, ''), l.reported_by,
                 CASE WHEN l.physical_progress_pct + 5 < l.planned_progress_pct THEN 'warning' ELSE 'neutral' END,
                 jsonb_build_object('physicalPct', l.physical_progress_pct, 'plannedPct', l.planned_progress_pct, 'source', l.source)
          FROM progress_log l WHERE l.project_id = :id
          UNION ALL
          SELECT 'D' || d.id, 'DISBURSEMENT', (d.released_date::timestamp AT TIME ZONE 'UTC'), 'Tranche ' || d.tranche_no || ' released',
                 'ETB ' || to_char(d.amount_etb, 'FM999,999,999,999') || ' from ' || d.funding_source, NULL, 'good',
                 jsonb_build_object('trancheNo', d.tranche_no, 'amountEtb', d.amount_etb)
          FROM disbursement d WHERE d.project_id = :id AND d.released_date IS NOT NULL
          UNION ALL
          SELECT 'A' || a.id, 'ALERT', a.triggered_at, a.title, a.detail, NULL,
                 CASE a.severity WHEN 'CRITICAL' THEN 'critical' WHEN 'HIGH' THEN 'serious' WHEN 'MEDIUM' THEN 'warning' ELSE 'neutral' END,
                 jsonb_build_object('alertId', a.id, 'rule', a.rule, 'severity', a.severity, 'status', a.status)
          FROM alert a WHERE a.entity_type = 'PROJECT' AND a.entity_id = :id
          UNION ALL
          SELECT 'X' || x.id, 'DECISION', x.created_at, x.action || ': ' || a.title, x.note, x.actor_name, 'info',
                 jsonb_build_object('alertId', a.id, 'action', x.action)
          FROM alert_action x JOIN alert a ON a.id = x.alert_id WHERE a.entity_type = 'PROJECT' AND a.entity_id = :id AND x.action <> 'COMMENT'
          UNION ALL
          SELECT 'I' || i.id, 'INSPECTION', coalesce(i.started_at, (i.visited_on::timestamp AT TIME ZONE 'UTC')),
                 replace(initcap(lower(i.inspection_type)), '_', ' ') || CASE WHEN i.verification_status = 'VERIFIED' THEN ' (verified)' WHEN i.verification_status = 'DISPUTED' THEN ' (disputed)' ELSE '' END,
                 coalesce(i.findings, ''), i.inspector_name,
                 CASE i.verification_status WHEN 'VERIFIED' THEN 'good' WHEN 'DISPUTED' THEN 'serious' WHEN 'REJECTED' THEN 'critical' ELSE 'neutral' END,
                 jsonb_build_object('inspectionId', i.id, 'type', i.inspection_type, 'verificationStatus', i.verification_status,
                                    'observedProgressPct', i.observed_progress_pct, 'reportedProgressPct', i.reported_progress_pct,
                                    'mediaCount', (SELECT count(*) FROM evidence_media em WHERE em.inspection_id = i.id))
          FROM field_inspection i WHERE i.project_id = :id
          UNION ALL
          SELECT 'C' || d.id, 'DOCUMENT', d.uploaded_at, 'Document: ' || d.title, d.doc_type, d.uploaded_by, 'neutral',
                 jsonb_build_object('documentId', d.id, 'docType', d.doc_type, 'url', d.url)
          FROM project_document d WHERE d.project_id = :id
        ) t WHERE at IS NOT NULL ORDER BY at DESC LIMIT :limit
        """;

    public List<ProjectDtos.TimelineEvent> timeline(Long projectId, int limit) {
        var p = new MapSqlParameterSource().addValue("id", projectId, Types.BIGINT).addValue("limit", limit, Types.INTEGER);
        return jdbc.query(SQL, p, (rs, i) -> {
            Timestamp at = rs.getTimestamp("at");
            Map<String, Object> data = new LinkedHashMap<>();
            String json = rs.getString("data");
            if (json != null) {
                try { data = new com.fasterxml.jackson.databind.ObjectMapper().readValue(json, new com.fasterxml.jackson.core.type.TypeReference<LinkedHashMap<String, Object>>() {}); }
                catch (Exception ignored) { /* keep empty */ }
            }
            return new ProjectDtos.TimelineEvent(rs.getString("id"), rs.getString("kind"), at == null ? null : at.toInstant(), rs.getString("title"),
                rs.getString("detail"), rs.getString("actor"), rs.getString("tone"), data);
        });
    }
}
