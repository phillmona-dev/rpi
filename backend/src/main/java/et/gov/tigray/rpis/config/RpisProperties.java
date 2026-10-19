package et.gov.tigray.rpis.config;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.util.List;

@Getter @Setter
@Validated
@ConfigurationProperties(prefix = "rpis")
public class RpisProperties {
    private Security security = new Security();
    private Alerts alerts = new Alerts();
    private Realtime realtime = new Realtime();
    private Demo demo = new Demo();
    private Media media = new Media();
    private Analytics analytics = new Analytics();

    @Getter @Setter
    public static class Security {
        private Jwt jwt = new Jwt();
        private Login login = new Login();
        private Cors cors = new Cors();

        @Getter @Setter
        public static class Jwt {
            @NotBlank private String secret;
            @NotBlank private String issuer = "rpis.tigray.gov.et";
            @Min(1) private int accessTtlMinutes = 15;
            @Min(1) private int refreshTtlHours = 8;
        }
        @Getter @Setter
        public static class Login {
            @Min(1) private int maxFailedAttempts = 5;
            @Min(1) private int lockMinutes = 15;
        }
        @Getter @Setter
        public static class Cors {
            private List<String> allowedOrigins = List.of("http://localhost:3000");
        }
    }

    /** Thresholds behind the rule-based alert engine. Reviewed by the executive office, not hard-coded. */
    @Getter @Setter
    public static class Alerts {
        private double scheduleVarianceAtRiskPp = 5;
        private double scheduleVarianceDelayedPp = 15;
        private double costPerformanceAtRisk = 0.90;
        private double costOverrunPct = 10;
        private int stalledReportingDays = 21;
        private int milestoneOverdueDays = 30;
        private int disbursementLagDays = 45;
        private String evaluationCron = "0 */5 * * * *";
    }

    @Getter @Setter
    public static class Realtime { private boolean enabled = true; }

    /** Evidence media storage. Local filesystem by default; S3-compatible storage is a drop-in MediaStorage implementation. */
    @Getter @Setter
    public static class Media {
        private String localDir = "./data/media";
        private long maxUploadBytes = 60L * 1024 * 1024;
        private int ticketTtlMinutes = 30;
        private int evidenceStaleDays = 30;
        /** Field evidence captured further than this from the registered site is flagged for review. */
        private int siteDistanceWarningM = 250;
    }

    /** Transparent, reviewable weights behind the composite project risk score and rule-based insights. */
    @Getter @Setter
    public static class Analytics {
        private double weightSchedule = 30;
        private double weightCost = 20;
        private double weightReporting = 15;
        private double weightMilestones = 10;
        private double weightIssues = 10;
        private double weightFunding = 10;
        private double weightVerification = 5;
        /** Assumed annual construction-cost inflation used for exposure estimates (Ethiopia, reviewed quarterly). */
        private double constructionInflationPctAnnual = 18;
        /** Physical progress jump in a single report that is flagged as an anomaly. */
        private double progressJumpAnomalyPp = 15;
        private String evaluationCron = "0 2/5 * * * *";
    }

    @Getter @Setter
    public static class Demo {
        private boolean enabled = false;
        private String password = "Rpis@2026!";
        private LiveSimulator liveSimulator = new LiveSimulator();
        @Getter @Setter
        public static class LiveSimulator { private boolean enabled = false; private int intervalSeconds = 25; }
    }
}
