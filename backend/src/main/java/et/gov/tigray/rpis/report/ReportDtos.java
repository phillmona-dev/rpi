package et.gov.tigray.rpis.report;

import et.gov.tigray.rpis.common.Enums.ReportFormat;
import et.gov.tigray.rpis.common.Enums.ReportPeriod;
import et.gov.tigray.rpis.common.Enums.ReportType;
import et.gov.tigray.rpis.common.Sector;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/** Generic, renderer-agnostic report model: the UI renders it, the CSV renderer flattens it, a PDF renderer can paginate it. */
public final class ReportDtos {
    private ReportDtos() {}

    public record Scope(Sector sector, Short zoneId, String zoneName, Integer weredaId, String weredaName, Long projectId, String projectCode) {}
    public record Kpi(String label, String value, String hint, String tone) {}
    public record Column(String key, String label, String align, String format) {}
    public record Section(String id, String title, String kind, String hint, List<Kpi> kpis, List<Column> columns, List<Map<String, Object>> rows, List<String> items, String text) {
        public static Section kpis(String id, String title, String hint, List<Kpi> kpis) { return new Section(id, title, "KPIS", hint, kpis, null, null, null, null); }
        public static Section table(String id, String title, String hint, List<Column> cols, List<Map<String, Object>> rows) { return new Section(id, title, "TABLE", hint, null, cols, rows, null, null); }
        public static Section list(String id, String title, String hint, List<String> items) { return new Section(id, title, "LIST", hint, null, null, null, items, null); }
        public static Section text(String id, String title, String text) { return new Section(id, title, "TEXT", null, null, null, null, null, text); }
    }
    public record Report(ReportType type, String title, String subtitle, ReportPeriod period, LocalDate from, LocalDate to, Instant generatedAt, String generatedBy,
                         Scope scope, List<Section> sections, String classification) {}

    public record CatalogEntry(ReportType type, String title, String description, List<ReportPeriod> periods, List<String> scopes, List<ReportFormat> formats) {}
    public record RunDto(Long id, ReportType reportType, ReportPeriod period, String title, Map<String, Object> scope, ReportFormat format, Instant generatedAt, String generatedBy, Integer rowCount, String sha256) {}
    public record RecordRunRequest(ReportType type, ReportPeriod period, String title, Map<String, Object> scope, ReportFormat format, Integer rowCount) {}
}
