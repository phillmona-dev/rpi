-- ============================================================================
-- ReconstructTigray RPIS · V3 command platform
-- Additive: project lifecycle & governance, responsible organisations, field evidence,
-- media upload tickets, analytics insights, report run history. See docs/09.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Project lifecycle (DREAM-style passport) and governance dates
-- ----------------------------------------------------------------------------
ALTER TABLE project
    ADD COLUMN lifecycle_stage       VARCHAR(24) NOT NULL DEFAULT 'PLANNING',
    ADD COLUMN approved_on           DATE,
    ADD COLUMN approval_reference    VARCHAR(120),
    ADD COLUMN funding_secured_on    DATE,
    ADD COLUMN contract_signed_on    DATE,
    ADD COLUMN contract_value_etb    NUMERIC(18,2),
    ADD COLUMN procurement_method    VARCHAR(32),
    ADD COLUMN handover_on           DATE,
    ADD COLUMN defects_liability_end DATE,
    ADD COLUMN risk_score            SMALLINT,
    ADD COLUMN risk_components       JSONB,
    ADD COLUMN risk_computed_at      TIMESTAMPTZ,
    ADD COLUMN last_verified_at      TIMESTAMPTZ;

UPDATE project SET lifecycle_stage = CASE status
    WHEN 'PLANNED'     THEN 'PLANNING'
    WHEN 'PROCUREMENT' THEN 'PROCUREMENT'
    WHEN 'ACTIVE'      THEN 'IMPLEMENTATION'
    WHEN 'SUSPENDED'   THEN 'IMPLEMENTATION'
    WHEN 'COMPLETED'   THEN 'COMPLETION'
    WHEN 'CANCELLED'   THEN 'CANCELLED'
    ELSE 'PLANNING' END;

CREATE INDEX ix_project_stage ON project(lifecycle_stage);
CREATE INDEX ix_project_risk  ON project(risk_score DESC NULLS LAST);

CREATE TABLE project_stage_event (
    id            BIGSERIAL PRIMARY KEY,
    project_id    BIGINT      NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    from_stage    VARCHAR(24),
    to_stage      VARCHAR(24) NOT NULL,
    occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor_user_id BIGINT REFERENCES app_user(id),
    actor_name    VARCHAR(160),
    note          TEXT,
    reference     VARCHAR(120)
);
CREATE INDEX ix_stage_event_project ON project_stage_event(project_id, occurred_at);

-- ----------------------------------------------------------------------------
-- Responsible organisations
-- ----------------------------------------------------------------------------
CREATE TABLE organization (
    id         BIGSERIAL PRIMARY KEY,
    code       VARCHAR(32)  NOT NULL UNIQUE,
    name       VARCHAR(200) NOT NULL,
    org_type   VARCHAR(24)  NOT NULL,
    contact    VARCHAR(200),
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE project_organization (
    project_id      BIGINT      NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    organization_id BIGINT      NOT NULL REFERENCES organization(id),
    role            VARCHAR(32) NOT NULL,
    PRIMARY KEY (project_id, organization_id, role)
);
CREATE INDEX ix_project_org_org ON project_organization(organization_id);

-- ----------------------------------------------------------------------------
-- Field evidence (GEMS-style remote supervision)
-- ----------------------------------------------------------------------------
CREATE TABLE field_inspection (
    id                      BIGSERIAL PRIMARY KEY,
    project_id              BIGINT REFERENCES project(id) ON DELETE CASCADE,
    facility_id             BIGINT REFERENCES facility(id) ON DELETE CASCADE,
    wereda_id               INT         NOT NULL REFERENCES wereda(id),
    inspection_type         VARCHAR(24) NOT NULL,
    visited_on              DATE        NOT NULL,
    started_at              TIMESTAMPTZ,
    ended_at                TIMESTAMPTZ,
    inspector_name          VARCHAR(160) NOT NULL,
    inspector_user_id       BIGINT REFERENCES app_user(id),
    organization            VARCHAR(200),
    location                geometry(Point, 4326),
    gps_accuracy_m          NUMERIC(7,1),
    distance_from_site_m    NUMERIC(9,1),
    observed_progress_pct   NUMERIC(5,2) CHECK (observed_progress_pct BETWEEN 0 AND 100),
    reported_progress_pct   NUMERIC(5,2),
    workforce_observed      INT,
    quality_rating          SMALLINT CHECK (quality_rating BETWEEN 1 AND 5),
    safety_rating           SMALLINT CHECK (safety_rating BETWEEN 1 AND 5),
    findings                TEXT,
    recommended_action      TEXT,
    verification_status     VARCHAR(16) NOT NULL DEFAULT 'UNVERIFIED',
    verified_by_user_id     BIGINT REFERENCES app_user(id),
    verified_by_name        VARCHAR(160),
    verified_at             TIMESTAMPTZ,
    verification_note       TEXT,
    device_id               BIGINT REFERENCES field_device(id),
    client_reference        VARCHAR(64),
    source                  VARCHAR(16) NOT NULL DEFAULT 'WEB',
    synced_at               TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (device_id, client_reference),
    CHECK (project_id IS NOT NULL OR facility_id IS NOT NULL)
);
CREATE INDEX ix_inspection_project  ON field_inspection(project_id, visited_on DESC);
CREATE INDEX ix_inspection_facility ON field_inspection(facility_id, visited_on DESC);
CREATE INDEX ix_inspection_wereda   ON field_inspection(wereda_id);
CREATE INDEX ix_inspection_status   ON field_inspection(verification_status, visited_on DESC);
CREATE INDEX ix_inspection_location ON field_inspection USING GIST(location);

CREATE TABLE evidence_media (
    id                  BIGSERIAL PRIMARY KEY,
    kind                VARCHAR(12) NOT NULL,
    inspection_id       BIGINT REFERENCES field_inspection(id) ON DELETE CASCADE,
    assessment_id       BIGINT REFERENCES damage_assessment(id) ON DELETE CASCADE,
    progress_log_id     BIGINT REFERENCES progress_log(id) ON DELETE SET NULL,
    project_id          BIGINT REFERENCES project(id) ON DELETE CASCADE,
    facility_id         BIGINT REFERENCES facility(id) ON DELETE CASCADE,
    url                 VARCHAR(512) NOT NULL,
    thumbnail_url       VARCHAR(512),
    storage_key         VARCHAR(255),
    media_type          VARCHAR(64),
    size_bytes          BIGINT,
    sha256              VARCHAR(64),
    width               INT,
    height              INT,
    duration_seconds    INT,
    caption             VARCHAR(255),
    captured_at         TIMESTAMPTZ,
    location            geometry(Point, 4326),
    gps_accuracy_m      NUMERIC(7,1),
    heading_deg         SMALLINT,
    captured_by         VARCHAR(160),
    device_id           BIGINT REFERENCES field_device(id),
    client_reference    VARCHAR(64),
    verification_status VARCHAR(16) NOT NULL DEFAULT 'UNVERIFIED',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (project_id IS NOT NULL OR facility_id IS NOT NULL)
);
CREATE INDEX ix_media_project    ON evidence_media(project_id, captured_at DESC);
CREATE INDEX ix_media_facility   ON evidence_media(facility_id, captured_at DESC);
CREATE INDEX ix_media_inspection ON evidence_media(inspection_id);
CREATE INDEX ix_media_location   ON evidence_media USING GIST(location);

CREATE TABLE media_upload_ticket (
    token              UUID PRIMARY KEY,
    device_id          BIGINT REFERENCES field_device(id),
    created_by_user_id BIGINT REFERENCES app_user(id),
    client_reference   VARCHAR(64),
    kind               VARCHAR(12) NOT NULL,
    media_type         VARCHAR(64) NOT NULL,
    size_bytes         BIGINT      NOT NULL,
    sha256             VARCHAR(64),
    storage_key        VARCHAR(255) NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at         TIMESTAMPTZ NOT NULL,
    consumed_at        TIMESTAMPTZ,
    media_id           BIGINT REFERENCES evidence_media(id)
);

-- ----------------------------------------------------------------------------
-- Analytics insights (rule-based today, AI providers later — same contract)
-- ----------------------------------------------------------------------------
CREATE TABLE analytics_insight (
    id                  BIGSERIAL PRIMARY KEY,
    kind                VARCHAR(32)  NOT NULL,
    entity_type         VARCHAR(16)  NOT NULL,
    entity_id           BIGINT       NOT NULL,
    sector              VARCHAR(32),
    wereda_id           INT REFERENCES wereda(id),
    provider            VARCHAR(48)  NOT NULL,
    model_version       VARCHAR(32),
    basis               VARCHAR(8)   NOT NULL DEFAULT 'RULE',
    computed_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    severity            VARCHAR(10),
    score               NUMERIC(6,2),
    confidence          NUMERIC(4,3),
    horizon_days        INT,
    title               VARCHAR(220) NOT NULL,
    summary             TEXT,
    explanation         JSONB,
    status              VARCHAR(16)  NOT NULL DEFAULT 'ACTIVE',
    reviewed_by_user_id BIGINT REFERENCES app_user(id),
    reviewed_by_name    VARCHAR(160),
    reviewed_at         TIMESTAMPTZ,
    review_note         TEXT
);
CREATE UNIQUE INDEX ux_insight_active ON analytics_insight(kind, entity_type, entity_id) WHERE status = 'ACTIVE';
CREATE INDEX ix_insight_entity ON analytics_insight(entity_type, entity_id, computed_at DESC);
CREATE INDEX ix_insight_kind   ON analytics_insight(kind, status, severity);

-- ----------------------------------------------------------------------------
-- Reporting accountability
-- ----------------------------------------------------------------------------
CREATE TABLE report_run (
    id             BIGSERIAL PRIMARY KEY,
    report_type    VARCHAR(32)  NOT NULL,
    period         VARCHAR(16)  NOT NULL,
    title          VARCHAR(220) NOT NULL,
    scope          JSONB,
    format         VARCHAR(8)   NOT NULL,
    generated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    generated_by   VARCHAR(64),
    row_count      INT,
    sha256         VARCHAR(64),
    correlation_id VARCHAR(64)
);
CREATE INDEX ix_report_run_time ON report_run(generated_at DESC);
