-- ============================================================================
-- ReconstructTigray RPIS · V6 user notifications
-- One row per recipient. Rows carry an event type and parameters, not text,
-- so each reader sees the notification in their own language.
-- ============================================================================

CREATE TABLE notification (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT      NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    type        VARCHAR(32) NOT NULL,
    severity    VARCHAR(8)  NOT NULL DEFAULT 'INFO' CHECK (severity IN ('INFO', 'SUCCESS', 'WARNING', 'CRITICAL')),
    link        VARCHAR(255),
    actor_name  VARCHAR(160),
    data        JSONB       NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    read_at     TIMESTAMPTZ
);
CREATE INDEX ix_notification_user ON notification(user_id, id DESC);
CREATE INDEX ix_notification_unread ON notification(user_id) WHERE read_at IS NULL;
