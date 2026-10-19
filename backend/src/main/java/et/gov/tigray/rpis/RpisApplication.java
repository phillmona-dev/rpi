package et.gov.tigray.rpis;

import et.gov.tigray.rpis.config.RpisProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * ReconstructTigray RPIS backend – Integrated Reconstruction &amp; Project Command System.
 * Feature-modular monolith; see docs/03-architecture.md for module boundaries.
 */
@SpringBootApplication
@EnableConfigurationProperties(RpisProperties.class)
@EnableCaching
@EnableScheduling
@EnableAsync
public class RpisApplication {
    public static void main(String[] args) {
        SpringApplication.run(RpisApplication.class, args);
    }
}
