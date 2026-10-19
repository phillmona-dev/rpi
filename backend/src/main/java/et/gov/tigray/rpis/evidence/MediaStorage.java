package et.gov.tigray.rpis.evidence;

import org.springframework.core.io.Resource;

import java.io.IOException;
import java.io.InputStream;

/**
 * Binary storage for field media. The local filesystem implementation ships now; an S3 / MinIO implementation
 * replaces it by configuration. Keys are opaque relative paths (yyyy/MM/uuid.ext) and never contain user input.
 */
public interface MediaStorage {
    /** Writes the stream to the key and returns the number of bytes stored. */
    long put(String key, InputStream in, long expectedBytes) throws IOException;
    Resource get(String key) throws IOException;
    boolean exists(String key);
    /** API-relative URL the web and mobile clients use to fetch the object (authenticated). */
    default String publicUrl(String key) { return "/api/v1/media/files/" + key; }
}
