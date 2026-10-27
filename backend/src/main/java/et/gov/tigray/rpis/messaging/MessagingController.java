package et.gov.tigray.rpis.messaging;

import et.gov.tigray.rpis.messaging.MessagingDtos.*;
import et.gov.tigray.rpis.security.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.Principal;
import java.util.List;
import java.util.concurrent.TimeUnit;

@RestController
@RequestMapping("/api/v1/messaging")
@RequiredArgsConstructor
@Tag(name = "Messaging")
public class MessagingController {
    private final MessagingService service;

    @GetMapping("/people")
    @Operation(summary = "People you can message (enabled users), with online status")
    public List<Person> people(@RequestParam(required = false) String q) { return service.people(q); }

    @GetMapping("/conversations")
    @Operation(summary = "Your conversations, most recent activity first, with unread counts")
    public List<ConversationSummary> conversations(@RequestParam(required = false) String q) { return service.conversations(q); }

    @GetMapping("/unread")
    public Unread unread() { return service.unread(); }

    @GetMapping("/search")
    @Operation(summary = "Search message text across your conversations")
    public List<SearchHit> search(@RequestParam String q) { return service.search(q); }

    @PostMapping("/conversations/direct")
    @Operation(summary = "Open (creating on first use) the direct conversation with one person")
    public ConversationDetail direct(@Valid @RequestBody DirectRequest req) { return service.openDirect(req.userId()); }

    @PostMapping("/conversations/group")
    public ConversationDetail group(@Valid @RequestBody GroupRequest req) { return service.createGroup(req); }

    @PostMapping("/conversations/context")
    @Operation(summary = "Open (creating on first use) the discussion attached to a project, approval, alert or field team member")
    public ConversationDetail context(@Valid @RequestBody ContextRequest req) { return service.openContext(req.type(), req.id()); }

    @GetMapping("/conversations/{id}")
    public ConversationDetail detail(@PathVariable Long id) { return service.detail(id); }

    @PatchMapping("/conversations/{id}")
    @Operation(summary = "Mute or unmute; rename a group (owner)")
    public ConversationDetail settings(@PathVariable Long id, @Valid @RequestBody SettingsRequest req) { return service.settings(id, req); }

    @PutMapping("/conversations/{id}/follow")
    public ConversationDetail follow(@PathVariable Long id) { return service.follow(id, true); }

    @DeleteMapping("/conversations/{id}/follow")
    public ConversationDetail unfollow(@PathVariable Long id) { return service.follow(id, false); }

    @PostMapping("/conversations/{id}/members")
    public ConversationDetail addMembers(@PathVariable Long id, @Valid @RequestBody MembersRequest req) { return service.addGroupMembers(id, req.userIds()); }

    @DeleteMapping("/conversations/{id}/members/{userId}")
    @Operation(summary = "Leave a group (your own id) or remove someone (group owner)")
    public ResponseEntity<Void> removeMember(@PathVariable Long id, @PathVariable Long userId) {
        service.removeMember(id, userId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/conversations/{id}/messages")
    public MessagePage messages(@PathVariable Long id, @RequestParam(required = false) Long before, @RequestParam(required = false) Long after,
                                @RequestParam(defaultValue = "50") int limit) {
        return service.messages(id, before, after, limit);
    }

    @PostMapping("/conversations/{id}/messages")
    public Message send(@PathVariable Long id, @Valid @RequestBody SendRequest req) { return service.send(id, req); }

    @PostMapping("/conversations/{id}/read")
    public ResponseEntity<Void> read(@PathVariable Long id, @Valid @RequestBody ReadRequest req) {
        service.read(id, req.messageId());
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/messages/{id}")
    public Message edit(@PathVariable Long id, @Valid @RequestBody EditRequest req) { return service.edit(id, req.body()); }

    @DeleteMapping("/messages/{id}")
    public Message delete(@PathVariable Long id) { return service.delete(id); }

    @PostMapping(value = "/attachments", consumes = MediaType.ALL_VALUE)
    @Operation(summary = "Upload a file (raw body, Content-Type set, ?name=file name) to attach to your next message; 25 MB max")
    public Attachment upload(@RequestParam String name, HttpServletRequest request) throws IOException {
        return service.upload(name, request.getContentType(), request.getContentLengthLong(), request.getInputStream());
    }

    @GetMapping("/attachments/{id}")
    public ResponseEntity<Resource> file(@PathVariable Long id) throws IOException {
        MessagingService.StoredFile f = service.file(id);
        boolean inline = f.mediaType().startsWith("image/") || f.mediaType().equals("application/pdf");
        ContentDisposition cd = (inline ? ContentDisposition.inline() : ContentDisposition.attachment()).filename(f.fileName(), StandardCharsets.UTF_8).build();
        return ResponseEntity.ok().header(HttpHeaders.CONTENT_TYPE, f.mediaType()).header(HttpHeaders.CONTENT_DISPOSITION, cd.toString())
            .header("X-Content-Type-Options", "nosniff").cacheControl(CacheControl.maxAge(1, TimeUnit.HOURS).cachePrivate()).contentLength(f.sizeBytes())
            .body(f.resource());
    }

    /** STOMP side: typing indicators sent to /app/chat.typing. */
    @Controller
    @RequiredArgsConstructor
    public static class Stomp {
        private final MessagingService service;

        @MessageMapping("/chat.typing")
        public void typing(@Payload TypingFrame frame, Principal principal) {
            if (frame == null || frame.conversationId() == null || !(principal instanceof JwtAuthenticationToken t)) return;
            try { service.typing(CurrentUser.from(t.getToken(), t.getAuthorities()), frame.conversationId()); }
            catch (RuntimeException ignored) { /* typing is best-effort; never error the socket */ }
        }
    }
}
