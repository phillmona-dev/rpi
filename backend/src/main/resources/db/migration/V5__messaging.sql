-- ============================================================================
-- ReconstructTigray RPIS · V5 messaging
-- Direct messages, group conversations, and discussion threads attached to a
-- project, an approval request, an alert or a field team member. Messages are
-- official correspondence: deletion is soft and the text is kept for audit.
-- ============================================================================

CREATE TABLE conversation (
    id                 BIGSERIAL PRIMARY KEY,
    kind               VARCHAR(8)   NOT NULL CHECK (kind IN ('DIRECT', 'GROUP', 'CONTEXT')),
    title              VARCHAR(220),
    context_type       VARCHAR(16)  CHECK (context_type IN ('PROJECT', 'APPROVAL', 'ALERT', 'FIELD_AGENT')),
    context_id         BIGINT,
    -- "lowId:highId" for direct conversations so a pair of users has exactly one
    direct_key         VARCHAR(41)  UNIQUE,
    created_by_user_id BIGINT REFERENCES app_user(id),
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_message_id    BIGINT,
    last_message_at    TIMESTAMPTZ,
    CONSTRAINT ck_conversation_context CHECK ((kind = 'CONTEXT') = (context_type IS NOT NULL AND context_id IS NOT NULL)),
    CONSTRAINT ck_conversation_direct  CHECK ((kind = 'DIRECT') = (direct_key IS NOT NULL))
);
CREATE UNIQUE INDEX ux_conversation_context ON conversation(context_type, context_id) WHERE kind = 'CONTEXT';

-- Membership doubles as "following": members get unread counts and live delivery.
CREATE TABLE conversation_member (
    conversation_id      BIGINT      NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
    user_id              BIGINT      NOT NULL REFERENCES app_user(id),
    member_role          VARCHAR(8)  NOT NULL DEFAULT 'MEMBER' CHECK (member_role IN ('OWNER', 'MEMBER')),
    joined_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_read_message_id BIGINT      NOT NULL DEFAULT 0,
    last_read_at         TIMESTAMPTZ,
    muted                BOOLEAN     NOT NULL DEFAULT FALSE,
    PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX ix_conversation_member_user ON conversation_member(user_id);

CREATE TABLE chat_message (
    id              BIGSERIAL PRIMARY KEY,
    conversation_id BIGINT      NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
    sender_user_id  BIGINT REFERENCES app_user(id),
    kind            VARCHAR(8)  NOT NULL DEFAULT 'TEXT' CHECK (kind IN ('TEXT', 'SYSTEM')),
    -- TEXT: the message. SYSTEM: an event code, translated client-side with meta as parameters.
    body            TEXT        NOT NULL,
    meta            JSONB       NOT NULL DEFAULT '{}',
    reply_to_id     BIGINT REFERENCES chat_message(id),
    mentions        JSONB       NOT NULL DEFAULT '[]',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    edited_at       TIMESTAMPTZ,
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX ix_chat_message_conversation ON chat_message(conversation_id, id);

ALTER TABLE conversation ADD CONSTRAINT fk_conversation_last_message FOREIGN KEY (last_message_id) REFERENCES chat_message(id);

CREATE TABLE chat_attachment (
    id               BIGSERIAL PRIMARY KEY,
    message_id       BIGINT REFERENCES chat_message(id) ON DELETE CASCADE,
    uploader_user_id BIGINT       NOT NULL REFERENCES app_user(id),
    file_name        VARCHAR(255) NOT NULL,
    media_type       VARCHAR(120) NOT NULL,
    size_bytes       BIGINT       NOT NULL,
    storage_key      VARCHAR(255) NOT NULL UNIQUE,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX ix_chat_attachment_message ON chat_attachment(message_id);
