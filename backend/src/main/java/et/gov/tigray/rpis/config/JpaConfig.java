package et.gov.tigray.rpis.config;

import et.gov.tigray.rpis.RpisApplication;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

@Configuration
@EnableJpaAuditing
@EnableJpaRepositories(basePackageClasses = RpisApplication.class, considerNestedRepositories = true)
public class JpaConfig {}
