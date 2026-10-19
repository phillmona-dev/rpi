package et.gov.tigray.rpis.report;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ReportRunRepository extends JpaRepository<ReportRun, Long> {
    Page<ReportRun> findAllByOrderByGeneratedAtDesc(Pageable pageable);
}
