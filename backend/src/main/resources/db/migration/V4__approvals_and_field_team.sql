-- ============================================================================
-- ReconstructTigray RPIS · V4 executive approval gate and field team operations
-- Additive. Projects registered after this migration wait for an executive
-- decision; existing projects are treated as already approved.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Executive approval of registered projects
-- ----------------------------------------------------------------------------
ALTER TABLE project
    ADD COLUMN approval_status          VARCHAR(16) NOT NULL DEFAULT 'APPROVED',
    ADD COLUMN submitted_at             TIMESTAMPTZ,
    ADD COLUMN submitted_by_user_id     BIGINT REFERENCES app_user(id),
    ADD COLUMN submitted_by_name        VARCHAR(160),
    ADD COLUMN approval_decided_at      TIMESTAMPTZ,
    ADD COLUMN approval_decided_by_name VARCHAR(160),
    ADD COLUMN approval_decision_ref    VARCHAR(40),
    ADD COLUMN approval_conditions      TEXT;

ALTER TABLE project ADD CONSTRAINT ck_project_approval_status
    CHECK (approval_status IN ('PENDING', 'RETURNED', 'APPROVED', 'REJECTED'));
CREATE INDEX ix_project_approval ON project(approval_status, submitted_at);

CREATE TABLE project_approval_event (
    id            BIGSERIAL PRIMARY KEY,
    project_id    BIGINT      NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    action        VARCHAR(16) NOT NULL CHECK (action IN ('SUBMITTED', 'RESUBMITTED', 'APPROVED', 'RETURNED', 'REJECTED')),
    occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor_user_id BIGINT REFERENCES app_user(id),
    actor_name    VARCHAR(160),
    note          TEXT,
    conditions    TEXT,
    reference     VARCHAR(40)
);
CREATE INDEX ix_approval_event_project ON project_approval_event(project_id, occurred_at);
CREATE SEQUENCE approval_decision_seq;

-- ----------------------------------------------------------------------------
-- Field team: data collectors, field analysts and supervisors
-- ----------------------------------------------------------------------------
CREATE SEQUENCE field_agent_code_seq;

CREATE TABLE field_agent (
    id                       BIGSERIAL PRIMARY KEY,
    code                     VARCHAR(16)  NOT NULL UNIQUE,
    user_id                  BIGINT UNIQUE REFERENCES app_user(id),
    full_name                VARCHAR(160) NOT NULL,
    gender                   VARCHAR(8),
    phone                    VARCHAR(20)  NOT NULL UNIQUE,
    alt_phone                VARCHAR(20),
    email                    VARCHAR(160),
    national_id              VARCHAR(40) UNIQUE,
    employee_number          VARCHAR(40),
    agent_type               VARCHAR(24)  NOT NULL CHECK (agent_type IN ('DATA_COLLECTOR', 'FIELD_ANALYST', 'FIELD_SUPERVISOR')),
    status                   VARCHAR(20)  NOT NULL DEFAULT 'PENDING_ONBOARDING'
                             CHECK (status IN ('PENDING_ONBOARDING', 'ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'DEACTIVATED')),
    status_reason            TEXT,
    status_changed_at        TIMESTAMPTZ,
    organization_id          BIGINT REFERENCES organization(id),
    employment_type          VARCHAR(16) CHECK (employment_type IN ('STAFF', 'CONTRACT', 'SECONDED', 'VOLUNTEER')),
    home_wereda_id           INT REFERENCES wereda(id),
    supervisor_id            BIGINT REFERENCES field_agent(id),
    education_level          VARCHAR(24),
    years_experience         SMALLINT CHECK (years_experience BETWEEN 0 AND 60),
    sectors                  JSONB NOT NULL DEFAULT '[]',
    skills                   JSONB NOT NULL DEFAULT '[]',
    languages                JSONB NOT NULL DEFAULT '[]',
    max_active_assignments   SMALLINT NOT NULL DEFAULT 4 CHECK (max_active_assignments BETWEEN 1 AND 20),
    contract_start           DATE,
    contract_end             DATE,
    training_completed_on    DATE,
    code_of_conduct_signed_on DATE,
    background_check_on      DATE,
    emergency_contact_name   VARCHAR(160),
    emergency_contact_phone  VARCHAR(20),
    device_id                BIGINT REFERENCES field_device(id),
    notes                    TEXT,
    registered_by_name       VARCHAR(160),
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_agent_contract CHECK (contract_end IS NULL OR contract_start IS NULL OR contract_end >= contract_start),
    CONSTRAINT ck_agent_not_own_supervisor CHECK (supervisor_id IS NULL OR supervisor_id <> id)
);
CREATE INDEX ix_field_agent_status ON field_agent(status, agent_type);

CREATE TABLE field_agent_coverage (
    agent_id  BIGINT NOT NULL REFERENCES field_agent(id) ON DELETE CASCADE,
    wereda_id INT    NOT NULL REFERENCES wereda(id),
    PRIMARY KEY (agent_id, wereda_id)
);
CREATE INDEX ix_agent_coverage_wereda ON field_agent_coverage(wereda_id);

CREATE TABLE field_agent_event (
    id            BIGSERIAL PRIMARY KEY,
    agent_id      BIGINT      NOT NULL REFERENCES field_agent(id) ON DELETE CASCADE,
    kind          VARCHAR(24) NOT NULL,
    occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor_user_id BIGINT REFERENCES app_user(id),
    actor_name    VARCHAR(160),
    note          TEXT,
    data          JSONB
);
CREATE INDEX ix_agent_event_agent ON field_agent_event(agent_id, occurred_at);

-- ----------------------------------------------------------------------------
-- Project assignments: who collects and verifies data for which project
-- ----------------------------------------------------------------------------
CREATE TABLE project_assignment (
    id                        BIGSERIAL PRIMARY KEY,
    project_id                BIGINT      NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    agent_id                  BIGINT      NOT NULL REFERENCES field_agent(id),
    assignment_role           VARCHAR(16) NOT NULL CHECK (assignment_role IN ('LEAD', 'DATA_COLLECTOR', 'FIELD_ANALYST', 'VERIFIER')),
    status                    VARCHAR(12) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'RELEASED')),
    priority                  VARCHAR(8)  NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('NORMAL', 'HIGH', 'URGENT')),
    start_on                  DATE        NOT NULL,
    end_on                    DATE,
    visit_frequency_days      SMALLINT    NOT NULL DEFAULT 14 CHECK (visit_frequency_days BETWEEN 1 AND 90),
    required_inspection_types JSONB       NOT NULL DEFAULT '[]',
    instructions              TEXT,
    override_note             TEXT,
    assigned_by_user_id       BIGINT REFERENCES app_user(id),
    assigned_by_name          VARCHAR(160),
    assigned_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at                 TIMESTAMPTZ,
    closed_by_name            VARCHAR(160),
    close_reason              TEXT,
    CONSTRAINT ck_assignment_dates CHECK (end_on IS NULL OR end_on >= start_on)
);
CREATE UNIQUE INDEX ux_assignment_active_pair ON project_assignment(project_id, agent_id) WHERE status = 'ACTIVE';
CREATE UNIQUE INDEX ux_assignment_one_lead    ON project_assignment(project_id) WHERE status = 'ACTIVE' AND assignment_role = 'LEAD';
CREATE INDEX ix_assignment_agent ON project_assignment(agent_id, status);
CREATE INDEX ix_inspection_inspector_project ON field_inspection(inspector_user_id, project_id, visited_on);

UPDATE role SET description = 'Field team member (data collector, field analyst, supervisor): submits inspections and assessments for assigned projects'
WHERE code = 'FIELD_OFFICER';
