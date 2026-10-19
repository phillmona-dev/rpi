# 04 · Core Domain Model

## Entity overview
```
Region 1─∞ Zone 1─∞ Wereda 1─∞ Facility 1─∞ DamageAssessment
                              │                 └─∞ AssessmentPhoto
                              └─∞ ProjectFacility ∞─1 Project
Project 1─∞ Milestone · ProgressLog · BudgetLine · Disbursement · Expenditure · Risk · Issue · Document · Forecast
Project 1─∞ ProjectStageEvent · Project ∞─∞ Organization (ProjectOrganization, by role)
Project | Facility 1─∞ FieldInspection 1─∞ EvidenceMedia   (EvidenceMedia may also reference DamageAssessment / ProgressLog)
AnalyticsInsight ∞─1 (Project | Facility)   ReportRun   MediaUploadTicket
Alert ∞─1 (Project | Facility | Wereda)   Alert 1─∞ AlertAction
User ∞─∞ Role · User 1─∞ RefreshToken · AuditLog
Device 1─∞ SyncBatch 1─∞ SyncItem
```

## Reference enumerations (stable API codes)
- **Sector**: `EDUCATION`, `HEALTH`, `MANUFACTURING`, `AGRICULTURE`
- **FacilityType** (per sector): `PRIMARY_SCHOOL`, `SECONDARY_SCHOOL`, `TVET_COLLEGE`, `UNIVERSITY` · `HEALTH_POST`, `HEALTH_CENTER`, `PRIMARY_HOSPITAL`, `GENERAL_HOSPITAL`, `REFERRAL_HOSPITAL` · `FACTORY`, `INDUSTRIAL_PARK`, `AGRO_PROCESSING_PLANT`, `WAREHOUSE` · `IRRIGATION_SCHEME`, `VETERINARY_CLINIC`, `SEED_MULTIPLICATION_CENTER`, `FARMERS_TRAINING_CENTER`, `AGRICULTURAL_RESEARCH_CENTER`
- **DamageSeverity**: `NONE`, `MINOR`, `MODERATE`, `SEVERE`, `DESTROYED`
- **FacilityOperationalStatus**: `NON_FUNCTIONAL`, `PARTIALLY_FUNCTIONAL`, `FUNCTIONAL`
- **ProjectStatus**: `PLANNED`, `PROCUREMENT`, `ACTIVE`, `SUSPENDED`, `COMPLETED`, `CANCELLED`
- **ProjectHealth** (derived): `ON_TRACK`, `AT_RISK`, `DELAYED`, `STALLED`, `COMPLETED`, `NOT_STARTED`
- **MilestoneStatus**: `PENDING`, `IN_PROGRESS`, `ACHIEVED`, `OVERDUE`
- **FundingSource**: `REGIONAL_TREASURY`, `FEDERAL_TRANSFER`, `DONOR_GRANT`, `DEVELOPMENT_LOAN`, `DIASPORA_FUND`, `PRIVATE_INVESTMENT`
- **AlertSeverity**: `CRITICAL`, `HIGH`, `MEDIUM`, `LOW` · **AlertStatus**: `OPEN`, `ACKNOWLEDGED`, `ASSIGNED`, `RESOLVED`, `DISMISSED`
- **AlertRule**: `SCHEDULE_SLIPPAGE`, `COST_OVERRUN`, `STALLED_REPORTING`, `MILESTONE_OVERDUE`, `DISBURSEMENT_LAG`, `SEVERE_DAMAGE_UNADDRESSED`, `QUALITY_NONCONFORMANCE`, `FIELD_VERIFICATION_OVERDUE`, `PROGRESS_DISCREPANCY`
- **LifecycleStage** (governance passport): `PLANNING`, `APPROVAL`, `FUNDING`, `PROCUREMENT`, `IMPLEMENTATION`, `MONITORING`, `COMPLETION`, `CANCELLED`
- **OrganizationRole**: `IMPLEMENTING_AGENCY`, `CONTRACTOR`, `SUPERVISING_CONSULTANT`, `FUNDER`, `BENEFICIARY_INSTITUTION`, `OVERSIGHT` · **OrganizationType**: `GOVERNMENT_BUREAU`, `CONTRACTOR`, `CONSULTANT`, `DONOR`, `FEDERAL_AGENCY`, `NGO`, `COMMUNITY`, `PRIVATE`
- **InspectionType**: `SITE_VISIT`, `PROGRESS_VERIFICATION`, `QUALITY_INSPECTION`, `DAMAGE_VERIFICATION`, `HANDOVER_INSPECTION`, `SAFETY_AUDIT` · **VerificationStatus**: `UNVERIFIED`, `VERIFIED`, `DISPUTED`, `REJECTED` · **MediaKind**: `PHOTO`, `VIDEO`, `AUDIO`, `DOCUMENT`
- **InsightKind**: `DELAY_PREDICTION`, `COMPLETION_FORECAST`, `COST_RISK`, `SUPPLY_RISK`, `RISK_SCORE`, `DAMAGE_PRIORITY`, `FUNDING_PRIORITY`, `ANOMALY`, `RECOMMENDATION` · **InsightStatus**: `ACTIVE`, `SUPERSEDED`, `DISMISSED`, `ACTIONED` · **InsightBasis**: `RULE`, `MODEL`
- **ReportType**: `EXECUTIVE_SUMMARY`, `SECTOR`, `GEOGRAPHIC`, `PROJECT_PROGRESS`, `FINANCIAL`, `RISK`, `DECISION_LOG`, `FIELD_EVIDENCE` · **ReportPeriod**: `DAILY`, `WEEKLY`, `MONTHLY`, `QUARTERLY`, `CUSTOM`
- **Role**: `EXECUTIVE`, `SECTOR_HEAD`, `ANALYST`, `PMO_FEDERAL`, `FIELD_OFFICER`, `SITE_MANAGER`, `ADMIN`

## Key entities (abridged; full DDL in `backend/src/main/resources/db/migration`)

### Wereda
`id, zone_id, code, name_en, name_ti, name_am, population, centroid geometry(Point,4326), boundary geometry(MultiPolygon,4326) NULL`

### Facility
`id, code, sector, type, name, wereda_id, kebele, location geometry(Point,4326), pre_crisis_capacity, capacity_unit, operational_status, latest_assessment_id, replacement_estimate_etb`

### DamageAssessment (field app payload)
`id, facility_id, assessed_on, assessor_name, device_id, client_reference (idempotency), severity, structural_impact_score (0–100), inventory_loss_pct, estimated_repair_cost_etb, estimated_replacement_cost_etb, notes, audio_note_url, location geometry(Point), synced_at`

### Project
`id, code, name, sector, wereda_id, status, contractor_name, implementing_agency, description, planned_start, planned_end, actual_start, actual_end, revised_end, total_budget_etb, currency, funding_source, physical_progress_pct, planned_progress_pct (computed from baseline curve), health (derived), last_progress_report_at, location geometry(Point)`

### Project (V3 additions)
`lifecycle_stage, approved_on, approval_reference, funding_secured_on, contract_signed_on, contract_value_etb, procurement_method, handover_on, defects_liability_end, risk_score (0–100), risk_components jsonb, risk_computed_at, last_verified_at`
`ProjectStageEvent: id, project_id, from_stage, to_stage, occurred_at, actor_user_id, actor_name, note, reference`
`Organization: id, code, name, org_type, contact` · `ProjectOrganization: project_id, organization_id, role`

### FieldInspection (field app payload, GEMS-style)
`id, project_id | facility_id, wereda_id, inspection_type, visited_on, started_at, ended_at, inspector_name, inspector_user_id, organization, location geometry(Point), gps_accuracy_m, distance_from_site_m (computed), observed_progress_pct, reported_progress_pct (snapshot), workforce_observed, quality_rating 1–5, safety_rating 1–5, findings, recommended_action, verification_status, verified_by_*, verification_note, device_id, client_reference (idempotency), source, synced_at`

### EvidenceMedia
`id, kind, inspection_id | assessment_id | progress_log_id, project_id | facility_id, url, thumbnail_url, storage_key, media_type, size_bytes, sha256, width, height, duration_seconds, caption, captured_at, location geometry(Point), gps_accuracy_m, heading_deg, captured_by, device_id, client_reference, verification_status`
`MediaUploadTicket: token uuid, device_id, created_by_user_id, client_reference, kind, media_type, size_bytes, sha256, storage_key, expires_at, consumed_at`

### AnalyticsInsight
`id, kind, entity_type, entity_id, sector, wereda_id, provider, model_version, basis, computed_at, severity, score, confidence, horizon_days, title, summary, explanation jsonb ({basis, features[{name,value,weight}] | items[] | components[]}), status, reviewed_by_*, review_note`
One `ACTIVE` row per `(kind, entity)`; a new result supersedes the previous one.

### ReportRun
`id, report_type, period, title, scope jsonb, format, generated_at, generated_by, row_count, sha256, correlation_id`

### ProgressLog (time-series; Timescale-ready)
`id, project_id, log_date, physical_progress_pct, planned_progress_pct, workforce_count, notes, reported_by, source (WEB|SITE_APP|IMPORT), created_at`
Unique on `(project_id, log_date)`.

### Milestone
`id, project_id, name, sequence, planned_date, actual_date, weight_pct, status`

### Finance
- `BudgetLine: id, project_id, category (WORKS|GOODS|SERVICES|CONTINGENCY|SUPERVISION), allocated_etb`
- `Disbursement: id, project_id, tranche_no, planned_date, released_date NULL, amount_etb, funding_source, status (PLANNED|REQUESTED|APPROVED|RELEASED)`
- `Expenditure: id, project_id, period_start, period_end, amount_etb, certified_by, certified_on`

### Alert
`id, rule, severity, status, title, detail, entity_type (PROJECT|FACILITY|WEREDA), entity_id, sector, wereda_id, triggered_at, acknowledged_at, assigned_to_user_id, resolved_at, metrics jsonb (values that fired the rule)`
`AlertAction: id, alert_id, action (ACKNOWLEDGE|ASSIGN|RESOLVE|DISMISS|COMMENT), note, actor_user_id, created_at`

### Security & audit
- `app_user: id, username, email, full_name, password_hash (Argon2id), enabled, locale, sector_scope NULL, failed_attempts, locked_until, last_login_at`
- `role` / `user_role`
- `refresh_token: id, user_id, token_hash, expires_at, revoked_at, replaced_by`
- `audit_log: id, occurred_at, actor_username, actor_roles, action, entity_type, entity_id, http_method, path, status, ip, correlation_id, detail jsonb` (append-only; `REVOKE UPDATE, DELETE` for app role)

## Derived indicators (computed server-side, documented so Phase 5 can replace them)
- **Planned progress %** at date *d*: linear interpolation on the milestone baseline (weights × planned dates), fallback to linear schedule.
- **Schedule variance (pp)** = physical − planned.
- **SPI** = physical / planned (0 when planned = 0). **CPI** = earned value / actual cost where EV = physical% × budget, AC = certified expenditure.
- **Health**: `COMPLETED` if status completed; `NOT_STARTED` if status planned/procurement; `STALLED` if no progress log for > 21 days (configurable) while ACTIVE; `DELAYED` if variance ≤ −15 pp or milestone overdue > 30 days; `AT_RISK` if variance ≤ −5 pp or CPI < 0.9; else `ON_TRACK`.
- **Forecast completion** = start + elapsed / SPI (baseline provider); stored with `provider = 'EARNED_VALUE_BASELINE'`.
- **Composite risk score** (`RiskScoringService`, provider `COMPOSITE_RISK_BASELINE`): weighted mean of bounded 0–100 components — schedule (variance / days past planned start), cost (CPI), reporting (days since site report), milestones (worst overdue), issues & risks (open items by severity × likelihood), funding (unreleased tranches past due), verification (days since a verified inspection). Weights in `rpis.analytics.weight-*`. Bands: LOW < 25, MODERATE < 50, HIGH < 75, CRITICAL ≥ 75.
- **Delay likelihood** (rule-based): 0.5 + (1 − SPI) × 1.2 + slip term − productivity-trend term, clamped to [0.02, 0.98]; horizon = forecast slip days.
- **Cost exposure** = CPI-projected overrun + inflation on remaining works (`construction-inflation-pct-annual`, default 18 %, reviewed quarterly).
- **Funding priority** (unaddressed severe / destroyed facilities) = log10(1 + beneficiaries per ETB million of replacement) × 25 × severity weight (+10 for health).
- **Anomalies**: progress jump ≥ 15 pp within 7 days; certified spend with ≤ 1 pp progress over 60 days; released funds > 35 pp ahead of physical progress; inspection observed ≥ 10 pp below reported.

## Retention
- `progress_log`, `audit_log`: retain indefinitely (legal / audit); partition by year when > 10 M rows.
- `refresh_token`: purge expired after 30 days.
