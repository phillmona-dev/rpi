package et.gov.tigray.rpis.messaging;

import jakarta.validation.constraints.*;

import java.time.Instant;
import java.util.List;
import java.util.Map;

public final class MessagingDtos {
    private MessagingDtos() {}

    public enum ConversationKind { DIRECT, GROUP, CONTEXT }
    /** What a discussion thread is attached to. APPROVAL and PROJECT both key on the project id. */
    public enum ContextType { PROJECT, APPROVAL, ALERT, FIELD_AGENT }

    public record Person(Long id, String username, String fullName, String title, List<String> roles, String sectorScope, boolean online) {}
    public record ContextRef(ContextType type, Long id, String code) {}

    public record MessagePreview(Long id, String senderName, String kind, String body, boolean deleted, boolean hasAttachments, Instant createdAt) {}
    public record ConversationSummary(Long id, ConversationKind kind, String title, ContextRef context, Person counterpart, int memberCount,
                                      MessagePreview lastMessage, Instant lastActivityAt, long unread, boolean mentioned, boolean muted) {}

    public record Member(Person person, String role, Long lastReadMessageId, Instant lastReadAt) {}
    public record ConversationDetail(Long id, ConversationKind kind, String title, ContextRef context, Person counterpart, List<Member> members,
                                     boolean following, boolean muted, boolean canPost, String cannotPostReason, boolean canManage, Long lastReadMessageId) {}

    public record Mention(Long id, String username, String fullName) {}
    public record Attachment(Long id, String fileName, String mediaType, long sizeBytes) {}
    public record ReplyRef(Long id, String senderName, String excerpt, boolean deleted) {}
    /** TEXT carries the message; SYSTEM carries an event code in body, translated client-side with meta as parameters. */
    public record Message(Long id, Long conversationId, Long senderId, String senderName, String kind, String body, Map<String, Object> meta,
                          ReplyRef replyTo, List<Mention> mentions, List<Attachment> attachments, Instant createdAt, Instant editedAt, boolean deleted) {}
    public record MessagePage(List<Message> items, boolean hasMore) {}

    public record Unread(long total, long conversations, long mentions) {}
    public record SearchHit(Message message, String conversationTitle, ConversationKind kind) {}

    /** Live frame on /user/queue/chat. */
    public record ChatFrame(String type, Long conversationId, Object payload) {}

    public record DirectRequest(@NotNull Long userId) {}
    public record GroupRequest(@NotBlank @Size(max = 120) String title, @NotEmpty @Size(max = 100) List<@NotNull Long> memberIds) {}
    public record ContextRequest(@NotNull ContextType type, @NotNull Long id) {}
    public record SendRequest(@Size(max = 4000) String body, Long replyToId, @Size(max = 10) List<@NotNull Long> attachmentIds) {}
    public record EditRequest(@NotBlank @Size(max = 4000) String body) {}
    public record ReadRequest(@NotNull Long messageId) {}
    public record MembersRequest(@NotEmpty @Size(max = 100) List<@NotNull Long> userIds) {}
    public record SettingsRequest(Boolean muted, @Size(min = 1, max = 120) String title) {}
    public record TypingFrame(Long conversationId) {}
}
