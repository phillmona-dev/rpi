package et.gov.tigray.rpis.report;

/** Output renderer. CSV ships now; XLSX / PDF renderers plug in here without touching report logic. */
public interface ReportRenderer {
    String contentType();
    String extension();
    byte[] render(ReportDtos.Report report);
}
