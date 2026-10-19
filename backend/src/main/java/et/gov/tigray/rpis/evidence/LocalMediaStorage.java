package et.gov.tigray.rpis.evidence;

import et.gov.tigray.rpis.config.RpisProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

@Slf4j
@Component
@RequiredArgsConstructor
public class LocalMediaStorage implements MediaStorage {
    private final RpisProperties props;

    private Path root() throws IOException {
        Path root = Path.of(props.getMedia().getLocalDir()).toAbsolutePath().normalize();
        Files.createDirectories(root);
        return root;
    }

    private Path resolve(String key) throws IOException {
        if (key == null || key.contains("..") || key.startsWith("/")) throw new IOException("Invalid storage key");
        Path p = root().resolve(key).normalize();
        if (!p.startsWith(root())) throw new IOException("Invalid storage key");
        return p;
    }

    @Override
    public long put(String key, InputStream in, long expectedBytes) throws IOException {
        Path target = resolve(key);
        Files.createDirectories(target.getParent());
        Path tmp = Files.createTempFile(target.getParent(), "upload-", ".part");
        long written = 0;
        try (OutputStream out = Files.newOutputStream(tmp)) {
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) {
                written += n;
                if (written > props.getMedia().getMaxUploadBytes()) throw new IOException("Upload exceeds the configured maximum size");
                out.write(buf, 0, n);
            }
        } catch (IOException e) { Files.deleteIfExists(tmp); throw e; }
        Files.move(tmp, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        return written;
    }

    @Override public Resource get(String key) throws IOException { return new FileSystemResource(resolve(key)); }
    @Override public boolean exists(String key) { try { return Files.exists(resolve(key)); } catch (IOException e) { return false; } }
}
