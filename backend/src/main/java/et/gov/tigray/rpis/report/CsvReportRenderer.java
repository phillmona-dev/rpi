package et.gov.tigray.rpis.report;

import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.Map;

/** Excel-compatible CSV (UTF-8 BOM, CRLF). Each section is written with a title line, then header and rows. */
@Component
public class CsvReportRenderer implements ReportRenderer {
    @Override public String contentType() { return "text/csv; charset=utf-8"; }
    @Override public String extension() { return "csv"; }

    @Override
    public byte[] render(ReportDtos.Report r) {
        StringBuilder sb = new StringBuilder("﻿");
        line(sb, r.title()); line(sb, r.subtitle() == null ? "" : r.subtitle());
        line(sb, "Period", r.period().name(), String.valueOf(r.from()), String.valueOf(r.to()));
        line(sb, "Generated", r.generatedAt().toString(), r.generatedBy() == null ? "" : r.generatedBy());
        line(sb, "Classification", r.classification());
        for (ReportDtos.Section s : r.sections()) {
            sb.append("\r\n"); line(sb, s.title());
            switch (s.kind()) {
                case "KPIS" -> { line(sb, "Indicator", "Value", "Note"); s.kpis().forEach(k -> line(sb, k.label(), k.value(), k.hint() == null ? "" : k.hint())); }
                case "TABLE" -> {
                    line(sb, s.columns().stream().map(ReportDtos.Column::label).toArray(String[]::new));
                    for (Map<String, Object> row : s.rows()) line(sb, s.columns().stream().map(c -> String.valueOf(row.getOrDefault(c.key(), "") == null ? "" : row.get(c.key()))).toArray(String[]::new));
                }
                case "LIST" -> s.items().forEach(i -> line(sb, i));
                default -> line(sb, s.text() == null ? "" : s.text());
            }
        }
        return sb.toString().getBytes(StandardCharsets.UTF_8);
    }

    private static void line(StringBuilder sb, String... cells) {
        for (int i = 0; i < cells.length; i++) { if (i > 0) sb.append(','); sb.append(escape(cells[i])); }
        sb.append("\r\n");
    }
    private static String escape(String v) {
        if (v == null) return "";
        boolean q = v.contains(",") || v.contains("\"") || v.contains("\n") || v.contains("\r");
        String s = v.replace("\"", "\"\"");
        return q ? "\"" + s + "\"" : s;
    }
}
