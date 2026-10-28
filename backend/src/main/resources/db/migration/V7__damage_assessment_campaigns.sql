-- ============================================================================
-- ReconstructTigray RPIS · V7 damage assessment campaigns
-- A campaign is a planned assessment round over a set of weredas. Its team
-- (field agents in named roles) is given site tasks; each submitted assessment
-- is verified by someone other than its author before it counts, and the
-- campaign's findings are endorsed before they feed project registration.
-- Additive. Assessments recorded before this migration are treated as verified.
-- ============================================================================

CREATE SEQUENCE assessment_campaign_seq;
CREATE SEQUENCE assessment_endorsement_seq;

CREATE TABLE assessment_campaign (
    id                    BIGSERIAL PRIMARY KEY,
    code                  VARCHAR(20)  NOT NULL UNIQUE,
    name                  VARCHAR(200) NOT NULL,
    sector                VARCHAR(32),                      -- NULL: multi-sector campaign
    objective             TEXT,
    methodology           TEXT,
    status                VARCHAR(12)  NOT NULL DEFAULT 'PLANNING'
                          CHECK (status IN ('PLANNING', 'ACTIVE', 'REVIEW', 'COMPLETED', 'CANCELLED')),
    planned_start         DATE         NOT NULL,
    planned_end           DATE         NOT NULL,
    started_at            TIMESTAMPTZ,
    fieldwork_closed_at   TIMESTAMPTZ,
    coordinator_user_id   BIGINT REFERENCES app_user(id),
    coordinator_name      VARCHAR(160),
    created_by_user_id    BIGINT REFERENCES app_user(id),
    created_by_name       VARCHAR(160),
    endorsed_at           TIMESTAMPTZ,
    endorsed_by_user_id   BIGINT REFERENCES app_user(id),
    endorsed_by_name      VARCHAR(160),
    endorsement_reference VARCHAR(40),
    endorsement_note      TEXT,
    cancel_reason         TEXT,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_campaign_dates CHECK (planned_end >= planned_start)
);
CREATE INDEX ix_campaign_status ON assessment_campaign(status, planned_start);

CREATE TABLE assessment_campaign_wereda (
    campaign_id BIGINT NOT NULL REFERENCES assessment_campaign(id) ON DELETE CASCADE,
    wereda_id   INT    NOT NULL REFERENCES wereda(id),
    PRIMARY KEY (campaign_id, wereda_id)
);

-- Team: field agents in a campaign role. A person may hold more than one role.
CREATE TABLE assessment_campaign_member (
    id             BIGSERIAL PRIMARY KEY,
    campaign_id    BIGINT      NOT NULL REFERENCES assessment_campaign(id) ON DELETE CASCADE,
    agent_id       BIGINT      NOT NULL REFERENCES field_agent(id),
    role           VARCHAR(12) NOT NULL CHECK (role IN ('TEAM_LEAD', 'ASSESSOR', 'ENGINEER', 'VERIFIER')),
    active         BOOLEAN     NOT NULL DEFAULT TRUE,
    added_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    added_by_name  VARCHAR(160),
    released_at    TIMESTAMPTZ,
    released_by_name VARCHAR(160),
    release_reason TEXT
);
CREATE UNIQUE INDEX ux_campaign_member_active ON assessment_campaign_member(campaign_id, agent_id, role) WHERE active;
CREATE INDEX ix_campaign_member_agent ON assessment_campaign_member(agent_id, active);

-- One site (facility) per campaign; its assessor records it, its verifier checks it.
CREATE TABLE assessment_task (
    id                 BIGSERIAL PRIMARY KEY,
    campaign_id        BIGINT      NOT NULL REFERENCES assessment_campaign(id) ON DELETE CASCADE,
    facility_id        BIGINT      NOT NULL REFERENCES facility(id),
    status             VARCHAR(12) NOT NULL DEFAULT 'PLANNED'
                       CHECK (status IN ('PLANNED', 'ASSIGNED', 'IN_PROGRESS', 'SUBMITTED', 'RETURNED', 'VERIFIED', 'INACCESSIBLE', 'CANCELLED')),
    priority           VARCHAR(8)  NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('NORMAL', 'HIGH', 'URGENT')),
    assessor_agent_id  BIGINT REFERENCES field_agent(id),
    verifier_agent_id  BIGINT REFERENCES field_agent(id),
    due_on             DATE,
    instructions       TEXT,
    assessment_id      BIGINT,                                -- FK added below (damage_assessment refers back here)
    status_note        TEXT,
    assigned_at        TIMESTAMPTZ,
    assigned_by_name   VARCHAR(160),
    started_at         TIMESTAMPTZ,
    submitted_at       TIMESTAMPTZ,
    verified_at        TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_task_distinct_people CHECK (verifier_agent_id IS NULL OR assessor_agent_id IS NULL OR verifier_agent_id <> assessor_agent_id),
    UNIQUE (campaign_id, facility_id)
);
CREATE INDEX ix_task_campaign ON assessment_task(campaign_id, status);
CREATE INDEX ix_task_assessor ON assessment_task(assessor_agent_id, status);
CREATE INDEX ix_task_verifier ON assessment_task(verifier_agent_id, status);

-- ----------------------------------------------------------------------------
-- Assessment record: workflow state, needs and component condition
-- ----------------------------------------------------------------------------
ALTER TABLE damage_assessment
    ADD COLUMN campaign_id              BIGINT REFERENCES assessment_campaign(id),
    ADD COLUMN task_id                  BIGINT REFERENCES assessment_task(id),
    ADD COLUMN status                   VARCHAR(12) NOT NULL DEFAULT 'VERIFIED'
                                        CHECK (status IN ('SUBMITTED', 'RETURNED', 'VERIFIED', 'REJECTED')),
    ADD COLUMN revision                 SMALLINT    NOT NULL DEFAULT 1,
    ADD COLUMN access_status            VARCHAR(12) CHECK (access_status IN ('ACCESSIBLE', 'PARTIAL', 'INACCESSIBLE')),
    ADD COLUMN current_use              VARCHAR(16) CHECK (current_use IN ('NORMAL_USE', 'PARTIAL_USE', 'IDP_SHELTER', 'MILITARY_USE', 'ABANDONED', 'OTHER')),
    ADD COLUMN uxo_suspected            BOOLEAN     NOT NULL DEFAULT FALSE,
    ADD COLUMN damage_causes            JSONB       NOT NULL DEFAULT '[]',
    ADD COLUMN recommended_intervention VARCHAR(16) CHECK (recommended_intervention IN ('NO_ACTION', 'MINOR_REPAIR', 'REHABILITATION', 'RECONSTRUCTION', 'RELOCATION')),
    ADD COLUMN intervention_priority    VARCHAR(8)  CHECK (intervention_priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
    ADD COLUMN beneficiaries_affected   INT CHECK (beneficiaries_affected >= 0),
    ADD COLUMN equipment_loss_etb       NUMERIC(18,2),
    ADD COLUMN submitted_by_user_id     BIGINT REFERENCES app_user(id),
    ADD COLUMN submitted_by_name        VARCHAR(160),
    ADD COLUMN submitted_at             TIMESTAMPTZ,
    ADD COLUMN verified_by_user_id      BIGINT REFERENCES app_user(id),
    ADD COLUMN verified_by_name         VARCHAR(160),
    ADD COLUMN verified_at              TIMESTAMPTZ,
    ADD COLUMN review_note              TEXT,
    ADD COLUMN project_id               BIGINT REFERENCES project(id) ON DELETE SET NULL,
    ADD COLUMN project_linked_at        TIMESTAMPTZ;

UPDATE damage_assessment SET verified_at = created_at, verified_by_name = 'Recorded before verification workflow', submitted_at = created_at;

CREATE INDEX ix_assessment_status   ON damage_assessment(status, submitted_at);
CREATE INDEX ix_assessment_campaign ON damage_assessment(campaign_id);
CREATE INDEX ix_assessment_project  ON damage_assessment(project_id);
CREATE UNIQUE INDEX ux_assessment_task ON damage_assessment(task_id) WHERE task_id IS NOT NULL;

ALTER TABLE assessment_task ADD CONSTRAINT fk_task_assessment FOREIGN KEY (assessment_id) REFERENCES damage_assessment(id) ON DELETE SET NULL;

-- Condition and repair cost per building element, utility or equipment group.
CREATE TABLE assessment_component (
    id              BIGSERIAL PRIMARY KEY,
    assessment_id   BIGINT      NOT NULL REFERENCES damage_assessment(id) ON DELETE CASCADE,
    component       VARCHAR(32) NOT NULL,
    condition       VARCHAR(16) NOT NULL CHECK (condition IN ('NONE', 'MINOR', 'MODERATE', 'SEVERE', 'DESTROYED')),
    repair_cost_etb NUMERIC(18,2) CHECK (repair_cost_etb >= 0),
    note            VARCHAR(500),
    UNIQUE (assessment_id, component)
);

-- Activity log for campaigns, tasks and assessment reviews.
CREATE TABLE assessment_event (
    id            BIGSERIAL PRIMARY KEY,
    campaign_id   BIGINT REFERENCES assessment_campaign(id) ON DELETE CASCADE,
    task_id       BIGINT REFERENCES assessment_task(id) ON DELETE CASCADE,
    assessment_id BIGINT REFERENCES damage_assessment(id) ON DELETE CASCADE,
    kind          VARCHAR(24) NOT NULL,
    occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor_user_id BIGINT REFERENCES app_user(id),
    actor_name    VARCHAR(160),
    note          TEXT,
    data          JSONB
);
CREATE INDEX ix_assessment_event_campaign   ON assessment_event(campaign_id, occurred_at);
CREATE INDEX ix_assessment_event_assessment ON assessment_event(assessment_id, occurred_at);
