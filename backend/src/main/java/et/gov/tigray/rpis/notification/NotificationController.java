package et.gov.tigray.rpis.notification;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/notifications")
@RequiredArgsConstructor
@Tag(name = "Notifications")
public class NotificationController {
    private final NotificationService service;

    @GetMapping
    @Operation(summary = "Your notifications, newest first; page backwards with `before`")
    public NotificationService.Page list(@RequestParam(defaultValue = "false") boolean unreadOnly, @RequestParam(required = false) Long before,
                                         @RequestParam(defaultValue = "30") int limit) {
        return service.list(unreadOnly, before, limit);
    }

    @GetMapping("/unread")
    public NotificationService.Unread unread() { return service.unread(); }

    @PostMapping("/{id}/read")
    public NotificationService.Unread read(@PathVariable Long id) { return service.markRead(id); }

    @PostMapping("/read-all")
    public NotificationService.Unread readAll() { return service.markAllRead(); }
}
