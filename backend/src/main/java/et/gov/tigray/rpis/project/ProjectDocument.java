package et.gov.tigray.rpis.project;

import et.gov.tigray.rpis.common.Enums.DocumentType;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity @Table(name = "project_document")
@Getter @Setter @NoArgsConstructor
public class ProjectDocument {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "project_id") private Project project;
    @Enumerated(EnumType.STRING) @Column(name = "doc_type", nullable = false, length = 32) private DocumentType docType;
    @Column(nullable = false, length = 200) private String title;
    @Column(nullable = false, length = 512) private String url;
    @Column(name = "media_type", length = 64) private String mediaType;
    @Column(name = "uploaded_by", length = 160) private String uploadedBy;
    @Column(name = "uploaded_at", nullable = false) private Instant uploadedAt = Instant.now();
    @Column(name = "size_bytes") private Long sizeBytes;
}
