package et.gov.tigray.rpis.messaging;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import et.gov.tigray.rpis.audit.Audited;
import et.gov.tigray.rpis.common.BusinessException;
import et.gov.tigray.rpis.common.NotFoundException;
import et.gov.tigray.rpis.evidence.MediaStorage;
import et.gov.tigray.rpis.messaging.MessagingDtos.*;
import et.gov.tigray.rpis.notification.NotificationService;
import et.gov.tigray.rpis.realtime.DomainEvent;
import et.gov.tigray.rpis.security.CurrentUser;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.core.io.Resource;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.io.InputStream;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Messaging: direct messages, group conversations and discussion threads attached to records.
 * Membership is what drives unread counts and live delivery; for record threads it means "following",
 * and the people with a stake in the record (submitter, executives, assigned field staff, alert owner)
 * are followed in automatically. Messages are never hard-deleted.
 */
@Service
@RequiredArgsConstructor
public class MessagingService {
    private final NamedParameterJdbcTemplate jdbc;
    private final ChatContexts contexts;
    private final ChatRealtime realtime;
    private final ApplicationEventPublisher events;
    private final ObjectMapper json;
    private final MediaStorage storage;
    private final NotificationService notifications;

    private static final Pattern MENTION = Pattern.compile("(?<![\\w@])@([A-Za-z0-9._-]{2,64})");
    private static final long MAX_ATTACHMENT_BYTES = 25L * 1024 * 1024;
    private static final Set<String> ALLOWED_TYPES = Set.of(
        "image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf", "text/plain", "text/csv",
        "application/msword", "application/vnd.ms-excel", "application/vnd.ms-powerpoint", "application/zip",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation");

    record Conv(Long id, ConversationKind kind, String title, ContextType contextType, Long contextId) {}
    private record Access(Conv conv, boolean member, ChatContexts.Info context, String cannotRead, String cannotPost) {}
    private record MemberRow(Long userId, String role, Long lastRead, Instant lastReadAt, boolean muted) {}

    // ── people ───────────────────────────────────────────────────────────
    private static final String PERSON_COLS = """
        u.id, u.username, u.full_name, u.title, u.sector_scope,
        ARRAY(SELECT r.code FROM user_role ur JOIN role r ON r.id = ur.role_id WHERE ur.user_id = u.id ORDER BY r.code) roles
        """;

    private Person person(ResultSet rs, String prefix) throws SQLException {
        Object[] roles = rs.getArray(prefix + "roles") == null ? new Object[0] : (Object[]) rs.getArray(prefix + "roles").getArray();
        String username = rs.getString(prefix + "username");
        return new Person(rs.getLong(prefix + "id"), username, rs.getString(prefix + "full_name"), rs.getString(prefix + "title"),
            Arrays.stream(roles).map(String::valueOf).toList(), rs.getString(prefix + "sector_scope"), realtime.isOnline(username));
    }

    @Transactional(readOnly = true)
    public List<Person> people(String q) {
        CurrentUser u = me();
        MapSqlParameterSource p = new MapSqlParameterSource("me", u.id())
            .addValue("q", q == null || q.isBlank() ? null : "%" + q.trim().toLowerCase(Locale.ROOT) + "%", Types.VARCHAR);
        return jdbc.query("SELECT " + PERSON_COLS + """
            FROM app_user u WHERE u.enabled AND u.id <> :me
              AND (CAST(:q AS varchar) IS NULL OR lower(u.full_name) LIKE :q OR lower(u.username) LIKE :q OR lower(coalesce(u.title, '')) LIKE :q)
            ORDER BY u.full_name LIMIT 200
            """, p, (rs, i) -> person(rs, ""));
    }

    // ── conversations ────────────────────────────────────────────────────
    @Transactional(readOnly = true)
    public List<ConversationSummary> conversations(String q) {
        CurrentUser u = me();
        MapSqlParameterSource p = new MapSqlParameterSource("me", u.id()).addValue("mention", mentionProbe(u.id()))
            .addValue("q", q == null || q.isBlank() ? null : "%" + q.trim().toLowerCase(Locale.ROOT) + "%", Types.VARCHAR);
        return jdbc.query("""
            SELECT c.id, c.kind, c.title, c.context_type, c.context_id, c.created_at, c.last_message_at, m.muted,
                   CASE WHEN c.context_type IN ('PROJECT', 'APPROVAL') THEN (SELECT code FROM project WHERE id = c.context_id)
                        WHEN c.context_type = 'FIELD_AGENT' THEN (SELECT code FROM field_agent WHERE id = c.context_id) END ctx_code,
                   (SELECT count(*) FROM conversation_member mm WHERE mm.conversation_id = c.id) member_count,
                   (SELECT count(*) FROM chat_message x WHERE x.conversation_id = c.id AND x.id > m.last_read_message_id AND x.kind = 'TEXT'
                      AND x.deleted_at IS NULL AND x.sender_user_id IS DISTINCT FROM :me) unread,
                   EXISTS (SELECT 1 FROM chat_message x WHERE x.conversation_id = c.id AND x.id > m.last_read_message_id AND x.deleted_at IS NULL
                      AND x.mentions @> CAST(:mention AS jsonb)) mentioned,
                   lm.id lm_id, lm.kind lm_kind, lm.body lm_body, lm.deleted_at lm_deleted, lm.created_at lm_created, su.full_name lm_sender,
                   EXISTS (SELECT 1 FROM chat_attachment a WHERE a.message_id = lm.id) lm_att,
                   cp.id cp_id, cp.username cp_username, cp.full_name cp_full_name, cp.title cp_title, cp.sector_scope cp_sector_scope, cp.roles cp_roles
            FROM conversation_member m
            JOIN conversation c ON c.id = m.conversation_id
            LEFT JOIN chat_message lm ON lm.id = c.last_message_id
            LEFT JOIN app_user su ON su.id = lm.sender_user_id
            LEFT JOIN LATERAL (SELECT
            """ + PERSON_COLS + """
                 FROM conversation_member o JOIN app_user u ON u.id = o.user_id
                 WHERE c.kind = 'DIRECT' AND o.conversation_id = c.id AND o.user_id <> :me LIMIT 1) cp ON true
            WHERE m.user_id = :me
              -- A record discussion appears in inboxes once someone has written in it, not when a page merely opened it.
              AND (c.kind <> 'CONTEXT' OR c.last_message_id IS NOT NULL)
              AND (CAST(:q AS varchar) IS NULL OR lower(coalesce(c.title, cp.full_name, '')) LIKE :q)
            ORDER BY coalesce(c.last_message_at, c.created_at) DESC
            LIMIT 300
            """, p, (rs, i) -> {
                Person cp = rs.getObject("cp_id") == null ? null : person(rs, "cp_");
                ConversationKind kind = ConversationKind.valueOf(rs.getString("kind"));
                MessagePreview last = rs.getObject("lm_id") == null ? null : new MessagePreview(rs.getLong("lm_id"), rs.getString("lm_sender"), rs.getString("lm_kind"),
                    rs.getTimestamp("lm_deleted") != null ? null : excerpt(rs.getString("lm_body"), 140), rs.getTimestamp("lm_deleted") != null, rs.getBoolean("lm_att"),
                    rs.getTimestamp("lm_created").toInstant());
                Timestamp activity = rs.getTimestamp("last_message_at") != null ? rs.getTimestamp("last_message_at") : rs.getTimestamp("created_at");
                return new ConversationSummary(rs.getLong("id"), kind, kind == ConversationKind.DIRECT && cp != null ? cp.fullName() : rs.getString("title"),
                    contextRef(rs.getString("context_type"), (Long) rs.getObject("context_id"), rs.getString("ctx_code")), cp, rs.getInt("member_count"),
                    last, activity.toInstant(), rs.getLong("unread"), rs.getBoolean("mentioned"), rs.getBoolean("muted"));
            });
    }

    @Transactional(readOnly = true)
    public Unread unread() {
        CurrentUser u = me();
        MapSqlParameterSource p = new MapSqlParameterSource("me", u.id()).addValue("mention", mentionProbe(u.id()));
        return jdbc.queryForObject("""
            SELECT coalesce(sum(n) FILTER (WHERE NOT muted), 0) total, count(*) FILTER (WHERE n > 0 AND NOT muted) convs, coalesce(sum(mn), 0) mentions FROM (
              SELECT m.muted,
                     (SELECT count(*) FROM chat_message x WHERE x.conversation_id = m.conversation_id AND x.id > m.last_read_message_id
                        AND x.kind = 'TEXT' AND x.deleted_at IS NULL AND x.sender_user_id IS DISTINCT FROM :me) n,
                     (SELECT count(*) FROM chat_message x WHERE x.conversation_id = m.conversation_id AND x.id > m.last_read_message_id
                        AND x.deleted_at IS NULL AND x.mentions @> CAST(:mention AS jsonb)) mn
              FROM conversation_member m WHERE m.user_id = :me) t
            """, p, (rs, i) -> new Unread(rs.getLong("total"), rs.getLong("convs"), rs.getLong("mentions")));
    }

    @Transactional(readOnly = true)
    public ConversationDetail detail(Long id) {
        CurrentUser u = me();
        Access a = readable(id, u);
        Conv c = a.conv();
        List<Member> members = new ArrayList<>();
        MemberRow mine = null;
        for (var row : memberRows(c.id())) {
            if (row.getKey().userId().equals(u.id())) mine = row.getKey();
            members.add(new Member(row.getValue(), row.getKey().role(), row.getKey().lastRead(), row.getKey().lastReadAt()));
        }
        Person counterpart = c.kind() == ConversationKind.DIRECT
            ? members.stream().map(Member::person).filter(pp -> !pp.id().equals(u.id())).findFirst().orElse(null) : null;
        boolean owner = mine != null && "OWNER".equals(mine.role());
        String title = counterpart != null ? counterpart.fullName() : c.title();
        ContextRef ctx = a.context() == null ? null : new ContextRef(c.contextType(), c.contextId(), a.context().code());
        return new ConversationDetail(c.id(), c.kind(), title, ctx, counterpart, members, mine != null, mine != null && mine.muted(),
            a.cannotPost() == null, a.cannotPost(), c.kind() == ConversationKind.GROUP && (owner || u.has("ADMIN")),
            mine == null ? null : mine.lastRead());
    }

    @Transactional
    public ConversationDetail openDirect(Long otherUserId) {
        CurrentUser u = me();
        if (otherUserId.equals(u.id())) throw BusinessException.badRequest("self_conversation", "You cannot start a conversation with yourself");
        requireEnabledUsers(List.of(otherUserId));
        String key = Math.min(u.id(), otherUserId) + ":" + Math.max(u.id(), otherUserId);
        MapSqlParameterSource p = new MapSqlParameterSource("key", key).addValue("me", u.id());
        Long id = jdbc.query("""
            INSERT INTO conversation(kind, direct_key, created_by_user_id) VALUES ('DIRECT', :key, :me)
            ON CONFLICT (direct_key) DO NOTHING RETURNING id
            """, p, (rs, i) -> rs.getLong(1)).stream().findFirst().orElse(null);
        if (id == null) return detail(jdbc.queryForObject("SELECT id FROM conversation WHERE direct_key = :key", p, Long.class));
        addMembers(id, List.of(u.id(), otherUserId), null, 0L);
        return detail(id);
    }

    @Audited(action = "CHAT_GROUP_CREATE", entityType = "CONVERSATION")
    @Transactional
    public ConversationDetail createGroup(GroupRequest req) {
        CurrentUser u = me();
        List<Long> others = req.memberIds().stream().distinct().filter(x -> !x.equals(u.id())).toList();
        if (others.isEmpty()) throw BusinessException.badRequest("no_members", "Add at least one other person to the group");
        requireEnabledUsers(others);
        Long id = jdbc.queryForObject("INSERT INTO conversation(kind, title, created_by_user_id) VALUES ('GROUP', :t, :me) RETURNING id",
            new MapSqlParameterSource("t", req.title().trim()).addValue("me", u.id()), Long.class);
        addMembers(id, List.of(u.id()), "OWNER", 0L);
        addMembers(id, others, null, 0L);
        systemMessage(id, u, "GROUP_CREATED", Map.of("actor", u.fullName(), "title", req.title().trim()));
        notifyConversation(id, List.of());
        return detail(id);
    }

    /** Opens (creating on first use) the discussion thread attached to a record. */
    @Transactional
    public ConversationDetail openContext(ContextType type, Long contextId) {
        CurrentUser u = me();
        ChatContexts.Info info = contexts.resolve(type, contextId).orElseThrow(() -> new NotFoundException(type.name(), contextId));
        String reason = contexts.cannotRead(info, u);
        if (reason != null) throw BusinessException.forbidden("chat_forbidden", reason);
        MapSqlParameterSource p = new MapSqlParameterSource("type", type.name()).addValue("cid", contextId).addValue("title", info.title()).addValue("me", u.id());
        Long id = jdbc.query("""
            INSERT INTO conversation(kind, title, context_type, context_id, created_by_user_id) VALUES ('CONTEXT', :title, :type, :cid, :me)
            ON CONFLICT (context_type, context_id) WHERE kind = 'CONTEXT' DO NOTHING RETURNING id
            """, p, (rs, i) -> rs.getLong(1)).stream().findFirst().orElse(null);
        if (id != null) {
            addMembers(id, new ArrayList<>(info.stakeholders()), null, 0L);
        } else {
            id = jdbc.queryForObject("SELECT id FROM conversation WHERE kind = 'CONTEXT' AND context_type = :type AND context_id = :cid", p, Long.class);
            // Keep the label in step with the record (projects can be renamed on resubmission).
            jdbc.update("UPDATE conversation SET title = :title WHERE id = :id AND title IS DISTINCT FROM :title", p.addValue("id", id));
        }
        return detail(id);
    }

    // ── membership ───────────────────────────────────────────────────────
    @Transactional
    public ConversationDetail follow(Long id, boolean follow) {
        CurrentUser u = me();
        Access a = readable(id, u);
        if (a.conv().kind() != ConversationKind.CONTEXT) throw BusinessException.badRequest("not_a_thread", "Only record discussions can be followed");
        if (follow) addMembers(id, List.of(u.id()), null, latestMessageId(id));
        else jdbc.update("DELETE FROM conversation_member WHERE conversation_id = :c AND user_id = :u", new MapSqlParameterSource("c", id).addValue("u", u.id()));
        notifyUsers(List.of(u.id()), new ChatFrame("CONVERSATION", id, null));
        return detail(id);
    }

    @Transactional
    public ConversationDetail addGroupMembers(Long id, List<Long> userIds) {
        CurrentUser u = me();
        Access a = readable(id, u);
        if (a.conv().kind() != ConversationKind.GROUP) throw BusinessException.badRequest("not_a_group", "People can only be added to group conversations");
        Set<Long> existing = new HashSet<>(memberIds(id));
        List<Long> added = userIds.stream().distinct().filter(x -> !existing.contains(x)).toList();
        if (added.isEmpty()) return detail(id);
        requireEnabledUsers(added);
        addMembers(id, added, null, latestMessageId(id));
        systemMessage(id, u, "MEMBERS_ADDED", Map.of("actor", u.fullName(), "names", names(added)));
        notifyConversation(id, List.of());
        return detail(id);
    }

    @Transactional
    public void removeMember(Long id, Long userId) {
        CurrentUser u = me();
        Access a = readable(id, u);
        Conv c = a.conv();
        boolean self = userId.equals(u.id());
        if (c.kind() == ConversationKind.DIRECT) throw BusinessException.badRequest("direct_conversation", "Direct conversations have no members to remove");
        if (c.kind() == ConversationKind.CONTEXT) {
            if (!self) throw BusinessException.forbidden("chat_forbidden", "You can only unfollow a discussion yourself");
            follow(id, false);
            return;
        }
        List<Map.Entry<MemberRow, Person>> rows = memberRows(id);
        MemberRow mine = rows.stream().map(Map.Entry::getKey).filter(r -> r.userId().equals(u.id())).findFirst().orElse(null);
        if (!self && !(u.has("ADMIN") || (mine != null && "OWNER".equals(mine.role()))))
            throw BusinessException.forbidden("chat_forbidden", "Only the group owner can remove other people");
        MemberRow target = rows.stream().map(Map.Entry::getKey).filter(r -> r.userId().equals(userId)).findFirst()
            .orElseThrow(() -> new NotFoundException("Member", userId));
        List<Long> before = rows.stream().map(r -> r.getKey().userId()).toList();
        String targetName = names(List.of(userId)).get(0);
        jdbc.update("DELETE FROM conversation_member WHERE conversation_id = :c AND user_id = :u", new MapSqlParameterSource("c", id).addValue("u", userId));
        if ("OWNER".equals(target.role())) {
            // Hand ownership to the longest-standing member so the group stays manageable.
            jdbc.update("""
                UPDATE conversation_member SET member_role = 'OWNER' WHERE conversation_id = :c AND user_id =
                  (SELECT user_id FROM conversation_member WHERE conversation_id = :c ORDER BY joined_at, user_id LIMIT 1)
                """, new MapSqlParameterSource("c", id));
        }
        systemMessage(id, u, self ? "MEMBER_LEFT" : "MEMBER_REMOVED", Map.of("actor", u.fullName(), "name", targetName));
        notifyUsers(before, new ChatFrame("CONVERSATION", id, null));
    }

    @Transactional
    public ConversationDetail settings(Long id, SettingsRequest req) {
        CurrentUser u = me();
        Access a = readable(id, u);
        if (!a.member()) throw BusinessException.badRequest("not_following", "Follow the discussion before changing its settings");
        MapSqlParameterSource p = new MapSqlParameterSource("c", id).addValue("u", u.id());
        if (req.muted() != null) jdbc.update("UPDATE conversation_member SET muted = :m WHERE conversation_id = :c AND user_id = :u", p.addValue("m", req.muted()));
        if (req.title() != null && !req.title().trim().equals(a.conv().title())) {
            if (!detail(id).canManage()) throw BusinessException.forbidden("chat_forbidden", "Only the group owner can rename the group");
            jdbc.update("UPDATE conversation SET title = :t WHERE id = :c", p.addValue("t", req.title().trim()));
            systemMessage(id, u, "RENAMED", Map.of("actor", u.fullName(), "title", req.title().trim()));
            notifyConversation(id, List.of());
        } else if (req.muted() != null) {
            notifyUsers(List.of(u.id()), new ChatFrame("CONVERSATION", id, null));
        }
        return detail(id);
    }

    // ── messages ─────────────────────────────────────────────────────────
    private static final String MESSAGE_SELECT = """
        SELECT m.id, m.conversation_id, m.sender_user_id, su.full_name sender_name, m.kind, m.body, m.meta::text meta, m.mentions::text mentions,
               m.created_at, m.edited_at, m.deleted_at,
               r.id r_id, ru.full_name r_sender, r.kind r_kind, left(r.body, 200) r_body, r.deleted_at r_deleted,
               coalesce((SELECT json_agg(json_build_object('id', a.id, 'fileName', a.file_name, 'mediaType', a.media_type, 'sizeBytes', a.size_bytes) ORDER BY a.id)
                         FROM chat_attachment a WHERE a.message_id = m.id), '[]')::text atts
        FROM chat_message m
        LEFT JOIN app_user su ON su.id = m.sender_user_id
        LEFT JOIN chat_message r ON r.id = m.reply_to_id
        LEFT JOIN app_user ru ON ru.id = r.sender_user_id
        """;

    private Message message(ResultSet rs) throws SQLException {
        boolean deleted = rs.getTimestamp("deleted_at") != null;
        ReplyRef reply = rs.getObject("r_id") == null ? null : new ReplyRef(rs.getLong("r_id"), rs.getString("r_sender"),
            rs.getTimestamp("r_deleted") != null || "SYSTEM".equals(rs.getString("r_kind")) ? null : excerpt(rs.getString("r_body"), 160), rs.getTimestamp("r_deleted") != null);
        Long sender = rs.getObject("sender_user_id") == null ? null : rs.getLong("sender_user_id");
        return new Message(rs.getLong("id"), rs.getLong("conversation_id"), sender, rs.getString("sender_name"), rs.getString("kind"),
            deleted ? null : rs.getString("body"), read(rs.getString("meta"), new TypeReference<Map<String, Object>>() {}), reply,
            deleted ? List.of() : read(rs.getString("mentions"), new TypeReference<List<Mention>>() {}),
            deleted ? List.of() : read(rs.getString("atts"), new TypeReference<List<Attachment>>() {}),
            rs.getTimestamp("created_at").toInstant(), rs.getTimestamp("edited_at") == null ? null : rs.getTimestamp("edited_at").toInstant(), deleted);
    }

    /** History, newest page first: `before` pages backwards; `after` catches up after a reconnect. Items are returned oldest first. */
    @Transactional(readOnly = true)
    public MessagePage messages(Long id, Long before, Long after, int limit) {
        readable(id, me());
        int n = Math.min(Math.max(limit, 1), 100);
        MapSqlParameterSource p = new MapSqlParameterSource("c", id).addValue("n", n + 1)
            .addValue("before", before, Types.BIGINT).addValue("after", after, Types.BIGINT);
        boolean forward = after != null;
        List<Message> rows = new ArrayList<>(jdbc.query(MESSAGE_SELECT + """
            WHERE m.conversation_id = :c AND (CAST(:before AS bigint) IS NULL OR m.id < :before) AND (CAST(:after AS bigint) IS NULL OR m.id > :after)
            ORDER BY m.id
            """ + (forward ? " ASC" : " DESC") + " LIMIT :n", p, (rs, i) -> message(rs)));
        boolean more = rows.size() > n;
        if (more) rows.remove(rows.size() - 1);
        if (!forward) Collections.reverse(rows);
        return new MessagePage(rows, more);
    }

    @Transactional
    public Message send(Long id, SendRequest req) {
        CurrentUser u = me();
        Access a = readable(id, u);
        if (a.cannotPost() != null) throw BusinessException.forbidden("chat_read_only", a.cannotPost());
        String body = req.body() == null ? "" : req.body().strip();
        List<Long> attachmentIds = req.attachmentIds() == null ? List.of() : req.attachmentIds().stream().distinct().toList();
        if (body.isEmpty() && attachmentIds.isEmpty()) throw BusinessException.badRequest("empty_message", "Write a message or attach a file");
        MapSqlParameterSource p = new MapSqlParameterSource("c", id).addValue("me", u.id());
        if (req.replyToId() != null) {
            Integer same = jdbc.queryForObject("SELECT count(*) FROM chat_message WHERE id = :r AND conversation_id = :c", p.addValue("r", req.replyToId()), Integer.class);
            if (same == null || same == 0) throw BusinessException.badRequest("reply_elsewhere", "The message you are replying to is not in this conversation");
        }
        List<Mention> mentions = mentions(body, a);
        Long msgId = jdbc.queryForObject("""
            INSERT INTO chat_message(conversation_id, sender_user_id, kind, body, reply_to_id, mentions)
            VALUES (:c, :me, 'TEXT', :body, :r, CAST(:mentions AS jsonb)) RETURNING id
            """, p.addValue("body", body).addValue("r", req.replyToId(), Types.BIGINT).addValue("mentions", write(mentions)), Long.class);
        if (!attachmentIds.isEmpty()) {
            int linked = jdbc.update("UPDATE chat_attachment SET message_id = :m WHERE id IN (:ids) AND uploader_user_id = :me AND message_id IS NULL",
                p.addValue("m", msgId).addValue("ids", attachmentIds));
            if (linked != attachmentIds.size()) throw BusinessException.badRequest("attachment_unavailable", "One or more attachments were not uploaded by you or are already sent");
        }
        jdbc.update("UPDATE conversation SET last_message_id = :m, last_message_at = now() WHERE id = :c", p.addValue("m", msgId));
        // Writing in a record discussion follows it; mentioned colleagues are followed in so they are notified.
        Set<Long> joiners = new LinkedHashSet<>();
        if (!a.member()) joiners.add(u.id());
        if (a.conv().kind() == ConversationKind.CONTEXT) mentions.forEach(m -> joiners.add(m.id()));
        if (!joiners.isEmpty()) addMembers(id, new ArrayList<>(joiners), null, msgId - 1);
        markRead(id, u.id(), msgId);
        Message out = messageById(msgId);
        notifyMembers(id, new ChatFrame("MESSAGE", id, out));
        if (!mentions.isEmpty())
            notifications.mentioned(mentions.stream().map(Mention::id).toList(), u.id(), u.fullName(), id, a.conv().title(), excerpt(body, 160));
        if (!joiners.isEmpty()) notifyUsers(new ArrayList<>(joiners), new ChatFrame("CONVERSATION", id, null));
        return out;
    }

    @Transactional
    public Message edit(Long messageId, String body) {
        CurrentUser u = me();
        Message m = ownMessage(messageId, u, false);
        Access a = readable(m.conversationId(), u);
        if (a.cannotPost() != null) throw BusinessException.forbidden("chat_read_only", a.cannotPost());
        String text = body.strip();
        if (text.equals(m.body())) return m;
        jdbc.update("UPDATE chat_message SET body = :b, mentions = CAST(:mentions AS jsonb), edited_at = now() WHERE id = :id",
            new MapSqlParameterSource("b", text).addValue("mentions", write(mentions(text, a))).addValue("id", messageId));
        Message out = messageById(messageId);
        notifyMembers(m.conversationId(), new ChatFrame("MESSAGE_UPDATED", m.conversationId(), out));
        return out;
    }

    @Audited(action = "CHAT_MESSAGE_DELETE", entityType = "CHAT_MESSAGE")
    @Transactional
    public Message delete(Long messageId) {
        CurrentUser u = me();
        Message m = ownMessage(messageId, u, u.has("ADMIN"));
        readable(m.conversationId(), u);
        // Soft delete: the text stays on record for audit, readers see a placeholder.
        jdbc.update("UPDATE chat_message SET deleted_at = now() WHERE id = :id", new MapSqlParameterSource("id", messageId));
        Message out = messageById(messageId);
        notifyMembers(m.conversationId(), new ChatFrame("MESSAGE_UPDATED", m.conversationId(), out));
        return out;
    }

    @Transactional
    public void read(Long id, Long messageId) {
        CurrentUser u = me();
        Access a = readable(id, u);
        if (!a.member()) return;
        Integer inConv = jdbc.queryForObject("SELECT count(*) FROM chat_message WHERE id = :m AND conversation_id = :c",
            new MapSqlParameterSource("m", messageId).addValue("c", id), Integer.class);
        if (inConv == null || inConv == 0) throw BusinessException.badRequest("message_elsewhere", "That message is not in this conversation");
        if (markRead(id, u.id(), messageId))
            notifyMembers(id, new ChatFrame("READ", id, Map.of("userId", u.id(), "lastReadMessageId", messageId)));
    }

    @Transactional(readOnly = true)
    public List<SearchHit> search(String q) {
        CurrentUser u = me();
        if (q == null || q.trim().length() < 2) return List.of();
        MapSqlParameterSource p = new MapSqlParameterSource("me", u.id()).addValue("q", "%" + q.trim().replace("%", "\\%").replace("_", "\\_") + "%");
        return jdbc.query(MESSAGE_SELECT.replace("FROM chat_message m", """
            , c.kind c_kind, coalesce(c.title, (SELECT ou.full_name FROM conversation_member o JOIN app_user ou ON ou.id = o.user_id
                                              WHERE o.conversation_id = c.id AND o.user_id <> :me LIMIT 1)) c_title
            FROM chat_message m JOIN conversation c ON c.id = m.conversation_id
            """) + """
            WHERE m.conversation_id IN (SELECT conversation_id FROM conversation_member WHERE user_id = :me)
              AND m.kind = 'TEXT' AND m.deleted_at IS NULL AND m.body ILIKE :q
            ORDER BY m.id DESC LIMIT 40
            """, p, (rs, i) -> new SearchHit(message(rs), rs.getString("c_title"), ConversationKind.valueOf(rs.getString("c_kind"))));
    }

    /** Typing indicator: relayed to the other members, never stored. */
    public void typing(CurrentUser u, Long id) {
        Access a = access(conv(id), u);
        if (a.cannotPost() != null) return;
        List<String> others = jdbc.queryForList("""
            SELECT u.username FROM conversation_member m JOIN app_user u ON u.id = m.user_id WHERE m.conversation_id = :c AND m.user_id <> :me
            """, new MapSqlParameterSource("c", id).addValue("me", u.id()), String.class);
        if (!others.isEmpty()) events.publishEvent(new ChatRealtime.Outbound(others, new ChatFrame("TYPING", id, Map.of("userId", u.id(), "fullName", u.fullName()))));
    }

    // ── attachments ──────────────────────────────────────────────────────
    public record StoredFile(Resource resource, String fileName, String mediaType, long sizeBytes) {}

    @Transactional
    public Attachment upload(String fileName, String mediaType, long declaredBytes, InputStream in) throws IOException {
        CurrentUser u = me();
        String type = mediaType == null ? "" : mediaType.split(";")[0].trim().toLowerCase(Locale.ROOT);
        if (!ALLOWED_TYPES.contains(type)) throw BusinessException.badRequest("attachment_type", "This file type cannot be shared in messages");
        if (declaredBytes > MAX_ATTACHMENT_BYTES) throw BusinessException.badRequest("attachment_too_large", "Attachments are limited to 25 MB");
        String name = cleanFileName(fileName);
        String ext = name.contains(".") ? name.substring(name.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "") : "";
        String key = "chat/" + DateTimeFormatter.ofPattern("yyyy/MM").format(Instant.now().atZone(ZoneOffset.UTC)) + "/" + UUID.randomUUID()
            + (ext.isEmpty() || ext.length() > 5 ? "" : "." + ext);
        long written = storage.put(key, in, declaredBytes);
        if (written == 0) throw BusinessException.badRequest("attachment_empty", "The file is empty");
        if (written > MAX_ATTACHMENT_BYTES) throw BusinessException.badRequest("attachment_too_large", "Attachments are limited to 25 MB");
        Long id = jdbc.queryForObject("""
            INSERT INTO chat_attachment(uploader_user_id, file_name, media_type, size_bytes, storage_key) VALUES (:me, :n, :t, :s, :k) RETURNING id
            """, new MapSqlParameterSource("me", u.id()).addValue("n", name).addValue("t", type).addValue("s", written).addValue("k", key), Long.class);
        return new Attachment(id, name, type, written);
    }

    @Transactional(readOnly = true)
    public StoredFile file(Long attachmentId) throws IOException {
        CurrentUser u = me();
        record Row(Long messageId, Long conversationId, Long uploader, String name, String type, long size, String key, boolean deleted) {}
        Row r = jdbc.query("""
            SELECT a.message_id, m.conversation_id, a.uploader_user_id, a.file_name, a.media_type, a.size_bytes, a.storage_key, m.deleted_at IS NOT NULL deleted
            FROM chat_attachment a LEFT JOIN chat_message m ON m.id = a.message_id WHERE a.id = :id
            """, new MapSqlParameterSource("id", attachmentId), (rs, i) -> new Row((Long) rs.getObject("message_id"), (Long) rs.getObject("conversation_id"),
                rs.getLong("uploader_user_id"), rs.getString("file_name"), rs.getString("media_type"), rs.getLong("size_bytes"), rs.getString("storage_key"), rs.getBoolean("deleted")))
            .stream().findFirst().orElseThrow(() -> new NotFoundException("Attachment", attachmentId));
        if (r.messageId() == null) {
            if (!r.uploader().equals(u.id())) throw new NotFoundException("Attachment", attachmentId);
        } else {
            readable(r.conversationId(), u);
            if (r.deleted()) throw new NotFoundException("Attachment", attachmentId);
        }
        if (!storage.exists(r.key())) throw new NotFoundException("Attachment", attachmentId);
        return new StoredFile(storage.get(r.key()), r.name(), r.type(), r.size());
    }

    // ── workflow hooks ───────────────────────────────────────────────────
    /** Records approval decisions in the approval discussion, when one exists, so the conversation reads as a complete trail. */
    @EventListener
    public void onDomainEvent(DomainEvent e) {
        if (!"PROJECT".equals(e.entityType()) || e.entityId() == null) return;
        String code = switch (e.type()) {
            case "PROJECT_APPROVED" -> "APPROVAL_APPROVED";
            case "PROJECT_RETURNED" -> "APPROVAL_RETURNED";
            case "PROJECT_REJECTED" -> "APPROVAL_REJECTED";
            case "PROJECT_RESUBMITTED" -> "APPROVAL_RESUBMITTED";
            default -> null;
        };
        if (code == null) return;
        Long convId = jdbc.query("SELECT id FROM conversation WHERE kind = 'CONTEXT' AND context_type = 'APPROVAL' AND context_id = :id",
            new MapSqlParameterSource("id", e.entityId()), (rs, i) -> rs.getLong(1)).stream().findFirst().orElse(null);
        if (convId == null) return;
        Map<String, Object> meta = new LinkedHashMap<>();
        Object actor = e.payload().get("actor");
        meta.put("actor", actor == null ? "system" : actor);
        if (e.payload().get("reference") != null) meta.put("reference", e.payload().get("reference"));
        systemMessage(convId, CurrentUser.get().orElse(null), code, meta);
    }

    // ── helpers ──────────────────────────────────────────────────────────
    private CurrentUser me() {
        CurrentUser u = CurrentUser.get().orElseThrow(() -> BusinessException.unauthorized("unauthenticated", "Sign in required"));
        if (u.id() == null) throw BusinessException.unauthorized("unauthenticated", "Sign in required");
        return u;
    }

    private Conv conv(Long id) {
        return jdbc.query("SELECT id, kind, title, context_type, context_id FROM conversation WHERE id = :id", new MapSqlParameterSource("id", id),
                (rs, i) -> new Conv(rs.getLong("id"), ConversationKind.valueOf(rs.getString("kind")), rs.getString("title"),
                    rs.getString("context_type") == null ? null : ContextType.valueOf(rs.getString("context_type")), (Long) rs.getObject("context_id")))
            .stream().findFirst().orElseThrow(() -> new NotFoundException("Conversation", id));
    }

    private Access access(Conv c, CurrentUser u) {
        Integer n = jdbc.queryForObject("SELECT count(*) FROM conversation_member WHERE conversation_id = :c AND user_id = :u",
            new MapSqlParameterSource("c", c.id()).addValue("u", u.id()), Integer.class);
        boolean member = n != null && n > 0;
        if (c.kind() != ConversationKind.CONTEXT) {
            String r = member ? null : "You are not a member of this conversation";
            return new Access(c, member, null, r, r);
        }
        ChatContexts.Info info = contexts.resolve(c.contextType(), c.contextId()).orElse(null);
        if (info == null) return new Access(c, member, null, "The record this discussion belongs to no longer exists", "The record this discussion belongs to no longer exists");
        return new Access(c, member, info, contexts.cannotRead(info, u), contexts.cannotPost(info, u));
    }

    private Access readable(Long id, CurrentUser u) {
        Access a = access(conv(id), u);
        if (a.cannotRead() != null) throw BusinessException.forbidden("chat_forbidden", a.cannotRead());
        return a;
    }

    private List<Map.Entry<MemberRow, Person>> memberRows(Long id) {
        return jdbc.query("SELECT m.member_role, m.last_read_message_id, m.last_read_at, m.muted, " + PERSON_COLS + """
            FROM conversation_member m JOIN app_user u ON u.id = m.user_id WHERE m.conversation_id = :c ORDER BY m.member_role DESC, u.full_name
            """, new MapSqlParameterSource("c", id), (rs, i) -> Map.entry(
                new MemberRow(rs.getLong("id"), rs.getString("member_role"), rs.getLong("last_read_message_id"),
                    rs.getTimestamp("last_read_at") == null ? null : rs.getTimestamp("last_read_at").toInstant(), rs.getBoolean("muted")),
                person(rs, "")));
    }

    private List<Long> memberIds(Long id) {
        return jdbc.queryForList("SELECT user_id FROM conversation_member WHERE conversation_id = :c", new MapSqlParameterSource("c", id), Long.class);
    }

    /** Adds members; lastRead marks where their unread count starts (0 = everything, latest id = nothing). */
    private void addMembers(Long id, List<Long> userIds, String role, Long lastRead) {
        for (Long uid : userIds) {
            jdbc.update("""
                INSERT INTO conversation_member(conversation_id, user_id, member_role, last_read_message_id) VALUES (:c, :u, :r, :lr)
                ON CONFLICT (conversation_id, user_id) DO NOTHING
                """, new MapSqlParameterSource("c", id).addValue("u", uid).addValue("r", role == null ? "MEMBER" : role).addValue("lr", Math.max(0, lastRead)));
        }
    }

    private long latestMessageId(Long id) {
        Long v = jdbc.queryForObject("SELECT coalesce(max(id), 0) FROM chat_message WHERE conversation_id = :c", new MapSqlParameterSource("c", id), Long.class);
        return v == null ? 0 : v;
    }

    private boolean markRead(Long id, Long userId, Long messageId) {
        return jdbc.update("""
            UPDATE conversation_member SET last_read_message_id = :m, last_read_at = now()
            WHERE conversation_id = :c AND user_id = :u AND last_read_message_id < :m
            """, new MapSqlParameterSource("c", id).addValue("u", userId).addValue("m", messageId)) > 0;
    }

    private void requireEnabledUsers(Collection<Long> ids) {
        Integer n = jdbc.queryForObject("SELECT count(*) FROM app_user WHERE enabled AND id IN (:ids)", new MapSqlParameterSource("ids", ids), Integer.class);
        if (n == null || n != new HashSet<>(ids).size()) throw BusinessException.badRequest("unknown_user", "One or more people could not be found or are disabled");
    }

    private List<String> names(List<Long> ids) {
        Map<Long, String> byId = new HashMap<>();
        jdbc.query("SELECT id, full_name FROM app_user WHERE id IN (:ids)", new MapSqlParameterSource("ids", ids), rs -> { byId.put(rs.getLong(1), rs.getString(2)); });
        return ids.stream().map(i -> byId.getOrDefault(i, "?")).toList();
    }

    /** @username tokens that resolve to people who can actually see the conversation. */
    private List<Mention> mentions(String body, Access a) {
        Set<String> handles = new LinkedHashSet<>();
        Matcher m = MENTION.matcher(body);
        while (m.find()) handles.add(m.group(1).toLowerCase(Locale.ROOT));
        if (handles.isEmpty()) return List.of();
        List<Mention> found = jdbc.query("SELECT " + PERSON_COLS + " FROM app_user u WHERE u.enabled AND lower(u.username) IN (:h)",
            new MapSqlParameterSource("h", handles), (rs, i) -> person(rs, "")).stream()
            .filter(pp -> {
                if (a.conv().kind() != ConversationKind.CONTEXT) return memberIds(a.conv().id()).contains(pp.id());
                CurrentUser cu = new CurrentUser(pp.id(), pp.username(), pp.fullName(), pp.roles(), pp.sectorScope() == null ? null : et.gov.tigray.rpis.common.Sector.valueOf(pp.sectorScope()));
                return contexts.cannotRead(a.context(), cu) == null;
            })
            .map(pp -> new Mention(pp.id(), pp.username(), pp.fullName())).toList();
        return found.size() > 20 ? found.subList(0, 20) : found;
    }

    private void systemMessage(Long id, CurrentUser actor, String code, Map<String, Object> meta) {
        MapSqlParameterSource p = new MapSqlParameterSource("c", id).addValue("u", actor == null ? null : actor.id(), Types.BIGINT)
            .addValue("b", code).addValue("meta", write(meta));
        Long msgId = jdbc.queryForObject("INSERT INTO chat_message(conversation_id, sender_user_id, kind, body, meta) VALUES (:c, :u, 'SYSTEM', :b, CAST(:meta AS jsonb)) RETURNING id", p, Long.class);
        jdbc.update("UPDATE conversation SET last_message_id = :m, last_message_at = now() WHERE id = :c", p.addValue("m", msgId));
        notifyMembers(id, new ChatFrame("MESSAGE", id, messageById(msgId)));
    }

    private Message messageById(Long id) {
        return jdbc.query(MESSAGE_SELECT + " WHERE m.id = :id", new MapSqlParameterSource("id", id), (rs, i) -> message(rs)).get(0);
    }

    private Message ownMessage(Long id, CurrentUser u, boolean anyone) {
        Message m = jdbc.query(MESSAGE_SELECT + " WHERE m.id = :id", new MapSqlParameterSource("id", id), (rs, i) -> message(rs))
            .stream().findFirst().orElseThrow(() -> new NotFoundException("Message", id));
        if (m.deleted() || !"TEXT".equals(m.kind())) throw BusinessException.conflict("message_locked", "This message can no longer be changed");
        if (!anyone && !u.id().equals(m.senderId())) throw BusinessException.forbidden("chat_forbidden", "You can only change your own messages");
        return m;
    }

    private void notifyMembers(Long id, ChatFrame frame) { notifyUsers(memberIds(id), frame); }

    private void notifyConversation(Long id, List<Long> extra) {
        List<Long> ids = new ArrayList<>(memberIds(id));
        ids.addAll(extra);
        notifyUsers(ids, new ChatFrame("CONVERSATION", id, null));
    }

    private void notifyUsers(Collection<Long> userIds, ChatFrame frame) {
        if (userIds.isEmpty()) return;
        List<String> usernames = jdbc.queryForList("SELECT username FROM app_user WHERE id IN (:ids)", new MapSqlParameterSource("ids", new HashSet<>(userIds)), String.class);
        events.publishEvent(new ChatRealtime.Outbound(usernames, frame));
    }

    private static ContextRef contextRef(String type, Long id, String code) {
        return type == null ? null : new ContextRef(ContextType.valueOf(type), id, code);
    }

    private String mentionProbe(Long userId) { return "[{\"id\":" + userId + "}]"; }

    private static String excerpt(String s, int max) {
        if (s == null) return null;
        String one = s.replaceAll("\\s+", " ").trim();
        return one.length() <= max ? one : one.substring(0, max - 1) + "…";
    }

    private static String cleanFileName(String name) {
        String n = name == null ? "" : name.replace('\\', '/');
        n = n.substring(n.lastIndexOf('/') + 1).replaceAll("[\\p{Cntrl}\"]", "").trim();
        if (n.isEmpty()) n = "file";
        return n.length() > 200 ? n.substring(n.length() - 200) : n;
    }

    private String write(Object o) {
        try { return json.writeValueAsString(o); } catch (Exception e) { throw new IllegalStateException(e); }
    }

    private <T> T read(String s, TypeReference<T> type) {
        try { return json.readValue(s == null ? "null" : s, type); } catch (Exception e) { throw new IllegalStateException(e); }
    }
}
