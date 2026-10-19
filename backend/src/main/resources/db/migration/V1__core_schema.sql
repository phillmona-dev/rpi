-- ============================================================================
-- ReconstructTigray RPIS · V1 core schema
-- PostgreSQL 16 + PostGIS 3.4. All timestamps are UTC (timestamptz).
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- Security
-- ----------------------------------------------------------------------------
CREATE TABLE role (
    id          SMALLSERIAL PRIMARY KEY,
    code        VARCHAR(32)  NOT NULL UNIQUE,
    description VARCHAR(200) NOT NULL
);

CREATE TABLE app_user (
    id               BIGSERIAL PRIMARY KEY,
    username         VARCHAR(64)  NOT NULL UNIQUE,
    email            VARCHAR(160) NOT NULL UNIQUE,
    full_name        VARCHAR(160) NOT NULL,
    title            VARCHAR(160),
    password_hash    VARCHAR(255) NOT NULL,
    enabled          BOOLEAN      NOT NULL DEFAULT TRUE,
    locale           VARCHAR(5)   NOT NULL DEFAULT 'en',
    sector_scope     VARCHAR(32),
    failed_attempts  INT          NOT NULL DEFAULT 0,
    locked_until     TIMESTAMPTZ,
    last_login_at    TIMESTAMPTZ,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE user_role (
    user_id BIGINT   NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    role_id SMALLINT NOT NULL REFERENCES role(id),
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE refresh_token (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT      NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    token_hash  VARCHAR(64) NOT NULL UNIQUE,
    issued_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ,
    replaced_by BIGINT REFERENCES refresh_token(id),
    user_agent  VARCHAR(255),
    ip_address  VARCHAR(64)
);
CREATE INDEX ix_refresh_token_user ON refresh_token(user_id) WHERE revoked_at IS NULL;

-- ----------------------------------------------------------------------------
-- Audit (append-only)
-- ----------------------------------------------------------------------------
CREATE TABLE audit_log (
    id             BIGSERIAL PRIMARY KEY,
    occurred_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    actor_username VARCHAR(64),
    actor_roles    VARCHAR(255),
    action         VARCHAR(64)  NOT NULL,
    entity_type    VARCHAR(48),
    entity_id      VARCHAR(64),
    http_method    VARCHAR(8),
    path           VARCHAR(512),
    status_code    INT,
    ip_address     VARCHAR(64),
    correlation_id VARCHAR(64),
    detail         JSONB
);
CREATE INDEX ix_audit_occurred ON audit_log(occurred_at DESC);
CREATE INDEX ix_audit_entity   ON audit_log(entity_type, entity_id);
CREATE INDEX ix_audit_actor    ON audit_log(actor_username, occurred_at DESC);

-- ----------------------------------------------------------------------------
-- Geography: Region → Zone → Wereda
-- ----------------------------------------------------------------------------
CREATE TABLE region (
    id       SMALLSERIAL PRIMARY KEY,
    code     VARCHAR(16)  NOT NULL UNIQUE,
    name_en  VARCHAR(120) NOT NULL,
    name_ti  VARCHAR(120),
    name_am  VARCHAR(120),
    boundary geometry(MultiPolygon, 4326)
);

CREATE TABLE zone (
    id        SMALLSERIAL PRIMARY KEY,
    region_id SMALLINT     NOT NULL REFERENCES region(id),
    code      VARCHAR(16)  NOT NULL UNIQUE,
    name_en   VARCHAR(120) NOT NULL,
    name_ti   VARCHAR(120),
    name_am   VARCHAR(120),
    centroid  geometry(Point, 4326),
    boundary  geometry(MultiPolygon, 4326)
);

CREATE TABLE wereda (
    id         SERIAL PRIMARY KEY,
    zone_id    SMALLINT     NOT NULL REFERENCES zone(id),
    code       VARCHAR(16)  NOT NULL UNIQUE,
    name_en    VARCHAR(120) NOT NULL,
    name_ti    VARCHAR(120),
    name_am    VARCHAR(120),
    is_urban   BOOLEAN      NOT NULL DEFAULT FALSE,
    population INT,
    centroid   geometry(Point, 4326) NOT NULL,
    boundary   geometry(MultiPolygon, 4326)
);
CREATE INDEX ix_wereda_zone     ON wereda(zone_id);
CREATE INDEX ix_wereda_centroid ON wereda USING GIST(centroid);
CREATE INDEX ix_wereda_boundary ON wereda USING GIST(boundary);

-- ----------------------------------------------------------------------------
-- Facilities & damage assessments
-- ----------------------------------------------------------------------------
CREATE TABLE facility (
    id                        BIGSERIAL PRIMARY KEY,
    code                      VARCHAR(32)  NOT NULL UNIQUE,
    sector                    VARCHAR(32)  NOT NULL,
    facility_type             VARCHAR(48)  NOT NULL,
    name                      VARCHAR(200) NOT NULL,
    wereda_id                 INT          NOT NULL REFERENCES wereda(id),
    kebele                    VARCHAR(120),
    location                  geometry(Point, 4326),
    pre_crisis_capacity       INT,
    capacity_unit             VARCHAR(32),
    operational_status        VARCHAR(32)  NOT NULL DEFAULT 'NON_FUNCTIONAL',
    latest_severity           VARCHAR(16),
    latest_assessment_id      BIGINT,
    replacement_estimate_etb  NUMERIC(18,2),
    beneficiaries             INT,
    created_at                TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX ix_facility_wereda   ON facility(wereda_id);
CREATE INDEX ix_facility_sector   ON facility(sector, facility_type);
CREATE INDEX ix_facility_location ON facility USING GIST(location);

CREATE TABLE field_device (
    id              BIGSERIAL PRIMARY KEY,
    device_uid      VARCHAR(128) NOT NULL UNIQUE,
    label           VARCHAR(120),
    assigned_user_id BIGINT REFERENCES app_user(id),
    platform        VARCHAR(32),
    app_version     VARCHAR(32),
    registered_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_sync_at    TIMESTAMPTZ,
    enabled         BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE damage_assessment (
    id                             BIGSERIAL PRIMARY KEY,
    facility_id                    BIGINT       NOT NULL REFERENCES facility(id),
    client_reference               VARCHAR(64),
    device_id                      BIGINT REFERENCES field_device(id),
    assessed_on                    DATE         NOT NULL,
    assessor_name                  VARCHAR(160) NOT NULL,
    assessor_user_id               BIGINT REFERENCES app_user(id),
    severity                       VARCHAR(16)  NOT NULL,
    structural_impact_score        SMALLINT     NOT NULL CHECK (structural_impact_score BETWEEN 0 AND 100),
    inventory_loss_pct             SMALLINT     CHECK (inventory_loss_pct BETWEEN 0 AND 100),
    estimated_repair_cost_etb      NUMERIC(18,2),
    estimated_replacement_cost_etb NUMERIC(18,2),
    functional_capacity_pct        SMALLINT     CHECK (functional_capacity_pct BETWEEN 0 AND 100),
    notes                          TEXT,
    audio_note_url                 VARCHAR(512),
    location                       geometry(Point, 4326),
    source                         VARCHAR(16)  NOT NULL DEFAULT 'WEB',
    synced_at                      TIMESTAMPTZ,
    created_at                     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (device_id, client_reference)
);
CREATE INDEX ix_assessment_facility ON damage_assessment(facility_id, assessed_on DESC);
CREATE INDEX ix_assessment_date     ON damage_assessment(assessed_on DESC);

ALTER TABLE facility
    ADD CONSTRAINT fk_facility_latest_assessment
    FOREIGN KEY (latest_assessment_id) REFERENCES damage_assessment(id) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE assessment_photo (
    id            BIGSERIAL PRIMARY KEY,
    assessment_id BIGINT NOT NULL REFERENCES damage_assessment(id) ON DELETE CASCADE,
    url           VARCHAR(512) NOT NULL,
    caption       VARCHAR(255),
    taken_at      TIMESTAMPTZ,
    location      geometry(Point, 4326)
);

-- ----------------------------------------------------------------------------
-- Projects
-- ----------------------------------------------------------------------------
CREATE TABLE project (
    id                      BIGSERIAL PRIMARY KEY,
    code                    VARCHAR(32)  NOT NULL UNIQUE,
    name                    VARCHAR(220) NOT NULL,
    sector                  VARCHAR(32)  NOT NULL,
    wereda_id               INT          NOT NULL REFERENCES wereda(id),
    status                  VARCHAR(24)  NOT NULL,
    health                  VARCHAR(24)  NOT NULL DEFAULT 'NOT_STARTED',
    contractor_name         VARCHAR(200),
    implementing_agency     VARCHAR(200),
    description             TEXT,
    planned_start           DATE NOT NULL,
    planned_end             DATE NOT NULL,
    actual_start            DATE,
    actual_end              DATE,
    revised_end             DATE,
    forecast_end            DATE,
    forecast_provider       VARCHAR(48),
    total_budget_etb        NUMERIC(18,2) NOT NULL,
    currency                VARCHAR(3)   NOT NULL DEFAULT 'ETB',
    funding_source          VARCHAR(32)  NOT NULL,
    physical_progress_pct   NUMERIC(5,2) NOT NULL DEFAULT 0,
    planned_progress_pct    NUMERIC(5,2) NOT NULL DEFAULT 0,
    schedule_variance_pp    NUMERIC(6,2) NOT NULL DEFAULT 0,
    spi                     NUMERIC(6,3),
    cpi                     NUMERIC(6,3),
    disbursed_etb           NUMERIC(18,2) NOT NULL DEFAULT 0,
    expended_etb            NUMERIC(18,2) NOT NULL DEFAULT 0,
    last_progress_report_at TIMESTAMPTZ,
    beneficiaries           INT,
    location                geometry(Point, 4326),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (planned_end >= planned_start)
);
CREATE INDEX ix_project_sector   ON project(sector);
CREATE INDEX ix_project_wereda   ON project(wereda_id);
CREATE INDEX ix_project_status   ON project(status, health);
CREATE INDEX ix_project_location ON project USING GIST(location);

CREATE TABLE project_facility (
    project_id  BIGINT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    facility_id BIGINT NOT NULL REFERENCES facility(id),
    PRIMARY KEY (project_id, facility_id)
);
CREATE INDEX ix_project_facility_facility ON project_facility(facility_id);

CREATE TABLE milestone (
    id           BIGSERIAL PRIMARY KEY,
    project_id   BIGINT       NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    sequence     SMALLINT     NOT NULL,
    name         VARCHAR(200) NOT NULL,
    planned_date DATE         NOT NULL,
    actual_date  DATE,
    weight_pct   NUMERIC(5,2) NOT NULL DEFAULT 0,
    status       VARCHAR(16)  NOT NULL DEFAULT 'PENDING',
    UNIQUE (project_id, sequence)
);

-- Time-series. TimescaleDB-ready: SELECT create_hypertable('progress_log','log_date', migrate_data => true);
CREATE TABLE progress_log (
    id                    BIGSERIAL PRIMARY KEY,
    project_id            BIGINT       NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    log_date              DATE         NOT NULL,
    physical_progress_pct NUMERIC(5,2) NOT NULL CHECK (physical_progress_pct BETWEEN 0 AND 100),
    planned_progress_pct  NUMERIC(5,2) NOT NULL DEFAULT 0,
    workforce_count       INT,
    notes                 TEXT,
    reported_by           VARCHAR(160),
    source                VARCHAR(16)  NOT NULL DEFAULT 'WEB',
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (project_id, log_date)
);
CREATE INDEX ix_progress_log_date ON progress_log(log_date DESC);

CREATE TABLE budget_line (
    id            BIGSERIAL PRIMARY KEY,
    project_id    BIGINT        NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    category      VARCHAR(24)   NOT NULL,
    allocated_etb NUMERIC(18,2) NOT NULL
);

CREATE TABLE disbursement (
    id             BIGSERIAL PRIMARY KEY,
    project_id     BIGINT        NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    tranche_no     SMALLINT      NOT NULL,
    planned_date   DATE          NOT NULL,
    released_date  DATE,
    amount_etb     NUMERIC(18,2) NOT NULL,
    funding_source VARCHAR(32)   NOT NULL,
    status         VARCHAR(16)   NOT NULL DEFAULT 'PLANNED',
    UNIQUE (project_id, tranche_no)
);

CREATE TABLE expenditure (
    id           BIGSERIAL PRIMARY KEY,
    project_id   BIGINT        NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    period_start DATE          NOT NULL,
    period_end   DATE          NOT NULL,
    amount_etb   NUMERIC(18,2) NOT NULL,
    certified_by VARCHAR(160),
    certified_on DATE
);

CREATE TABLE project_risk (
    id          BIGSERIAL PRIMARY KEY,
    project_id  BIGINT       NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    title       VARCHAR(200) NOT NULL,
    category    VARCHAR(32)  NOT NULL,
    likelihood  VARCHAR(8)   NOT NULL,
    impact      VARCHAR(8)   NOT NULL,
    mitigation  TEXT,
    owner       VARCHAR(160),
    status      VARCHAR(16)  NOT NULL DEFAULT 'OPEN',
    raised_on   DATE         NOT NULL,
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE project_issue (
    id          BIGSERIAL PRIMARY KEY,
    project_id  BIGINT       NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    title       VARCHAR(200) NOT NULL,
    description TEXT,
    severity    VARCHAR(8)   NOT NULL,
    status      VARCHAR(16)  NOT NULL DEFAULT 'OPEN',
    raised_on   DATE         NOT NULL,
    resolved_on DATE,
    owner       VARCHAR(160)
);

CREATE TABLE project_document (
    id           BIGSERIAL PRIMARY KEY,
    project_id   BIGINT       NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    doc_type     VARCHAR(32)  NOT NULL,
    title        VARCHAR(200) NOT NULL,
    url          VARCHAR(512) NOT NULL,
    media_type   VARCHAR(64),
    uploaded_by  VARCHAR(160),
    uploaded_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    size_bytes   BIGINT
);

CREATE TABLE project_forecast (
    id               BIGSERIAL PRIMARY KEY,
    project_id       BIGINT      NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    computed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    provider         VARCHAR(48) NOT NULL,
    forecast_end     DATE,
    forecast_cost_etb NUMERIC(18,2),
    confidence       NUMERIC(4,3),
    rationale        TEXT
);
CREATE INDEX ix_forecast_project ON project_forecast(project_id, computed_at DESC);

-- ----------------------------------------------------------------------------
-- Alerts / decision queue
-- ----------------------------------------------------------------------------
CREATE TABLE alert (
    id                  BIGSERIAL PRIMARY KEY,
    rule                VARCHAR(40)  NOT NULL,
    severity            VARCHAR(10)  NOT NULL,
    status              VARCHAR(16)  NOT NULL DEFAULT 'OPEN',
    title               VARCHAR(220) NOT NULL,
    detail              TEXT,
    entity_type         VARCHAR(16)  NOT NULL,
    entity_id           BIGINT       NOT NULL,
    sector              VARCHAR(32),
    wereda_id           INT REFERENCES wereda(id),
    triggered_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_evaluated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    acknowledged_at     TIMESTAMPTZ,
    assigned_to_user_id BIGINT REFERENCES app_user(id),
    resolved_at         TIMESTAMPTZ,
    decision_required   BOOLEAN NOT NULL DEFAULT FALSE,
    metrics             JSONB
);
CREATE UNIQUE INDEX ux_alert_open_rule_entity ON alert(rule, entity_type, entity_id)
    WHERE status IN ('OPEN','ACKNOWLEDGED','ASSIGNED');
CREATE INDEX ix_alert_status_sev ON alert(status, severity, triggered_at DESC);
CREATE INDEX ix_alert_sector     ON alert(sector);

CREATE TABLE alert_action (
    id            BIGSERIAL PRIMARY KEY,
    alert_id      BIGINT      NOT NULL REFERENCES alert(id) ON DELETE CASCADE,
    action        VARCHAR(16) NOT NULL,
    note          TEXT,
    actor_user_id BIGINT REFERENCES app_user(id),
    actor_name    VARCHAR(160),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_alert_action_alert ON alert_action(alert_id, created_at);

-- ----------------------------------------------------------------------------
-- Field sync (contract for the offline Flutter app, Phase 2)
-- ----------------------------------------------------------------------------
CREATE TABLE sync_batch (
    id            BIGSERIAL PRIMARY KEY,
    device_id     BIGINT      NOT NULL REFERENCES field_device(id),
    batch_uid     VARCHAR(64) NOT NULL UNIQUE,
    received_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    item_count    INT         NOT NULL,
    accepted      INT         NOT NULL DEFAULT 0,
    duplicates    INT         NOT NULL DEFAULT 0,
    rejected      INT         NOT NULL DEFAULT 0,
    status        VARCHAR(16) NOT NULL DEFAULT 'RECEIVED'
);

CREATE TABLE sync_conflict (
    id           BIGSERIAL PRIMARY KEY,
    batch_id     BIGINT NOT NULL REFERENCES sync_batch(id),
    entity_type  VARCHAR(32) NOT NULL,
    entity_id    BIGINT,
    client_payload JSONB NOT NULL,
    server_payload JSONB,
    resolution   VARCHAR(16) NOT NULL DEFAULT 'SERVER_WINS',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
