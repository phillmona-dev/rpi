# 01 · Proposal Analysis & Phase 1 Recommendations

Source of truth: *Executive Solution Proposal & Architecture – Integrated Reconstruction & Project
Command System (ReconstructTigray RPIS)*, dated 16 October 2026, prepared for the Office of the
Chief Executive for Economic Affairs and Reconstruction.

## 1. What the proposal asks for

| Pillar | Scope | Phase in proposal | Phase 1 web deliverable |
|---|---|---|---|
| P1 Offline-first Field Damage Recorder | Flutter app, GPS, impact scores, photos, audio, auto-sync | Phase 1 (configure), later | **Data model + sync ingest contract only** (no mobile app) |
| P2 Single-Window Executive Command Dashboard | Incident & progress stream, sector summaries, drill-down to wereda / school / hospital, damage reports, replacement estimates | Phase 1–2 | **Fully implemented** |
| P3 Construction & Project Progress Control | Site-manager logs, physical % vs milestones vs budget releases, instant delay / cost-variance flags | Phase 2 | **Web side implemented** (progress logs, milestones, budget vs actual, variance alerts). Site-manager mobile app deferred |
| P4 Federal / PMO Linkage | Real-time read & audit access, automated daily/weekly digests | Phase 3 | **Architecture prepared**: `PMO_FEDERAL` read-only role, audit log, printable daily brief, API versioning |
| P5 AI Predictive Analytics & Prioritisation | Completion forecasting, inflation / supply risk, prioritisation matrix | Phase 3 | **Architecture prepared**: deterministic schedule-performance forecasting shipped now as a transparent baseline; AI slot defined |

Technical standards stated in the proposal and honoured here:

| Dimension | Proposal | This implementation |
|---|---|---|
| Dashboard UI | React / Next.js SPA | Next.js 14 (App Router), React 18, TypeScript |
| Backend | Containerised Spring Boot, WebSocket live streaming | Spring Boot 3.3 modular monolith, STOMP over WebSocket, Dockerfile + Compose |
| Database | PostgreSQL + PostGIS, TimescaleDB for progress logs | PostgreSQL 16 + PostGIS 3.4. Progress logs are a time-series table designed for a Timescale hypertable (see 04-domain-model) |
| Federal gateway | Secure REST, AES-256, role-based views | Versioned REST `/api/v1`, TLS at the edge, role-scoped responses, audit trail |
| Languages | Tigrinya, Amharic, English | `next-intl` with `en`, `am`, `ti` bundles; Ethiopic font loaded |

## 2. Gaps and ambiguities in the proposal, and how Phase 1 resolves them

1. **Administrative hierarchy is implied but not defined.** Tigray is organised Region → Zone → Wereda → Kebele. The proposal only names weredas. Phase 1 models Region → Zone → Wereda and keeps Kebele as an optional attribute on facilities so field data can be more precise later.
2. **"Facility" is used loosely (schools, hospitals).** We generalise to a `Facility` entity with a sector and a sector-specific type (school, health post, hospital, factory, irrigation scheme, …). A damage assessment belongs to a facility; a reconstruction project targets one or more facilities.
3. **"Budget releases" vs "spend" are different numbers.** Executives need allocation, release (disbursed to contractor / implementer), and actual expenditure certified. All three are modelled and shown.
4. **"Flagging delays instantly" needs a definition.** Phase 1 ships rule-based alerts with explicit thresholds (schedule variance, cost variance, stalled reporting, milestone overdue, severe damage without a project). Thresholds live in configuration, not code.
5. **Federal read access must not leak decision workflow.** The `PMO_FEDERAL` role is read-only and excluded from acknowledgement / decision actions. Every read is audited.
6. **Field sync is Phase 1 in the proposal but the mobile app is out of scope now.** The backend exposes a documented ingest endpoint (`POST /api/v1/sync/damage-assessments`) with idempotency keys so the Flutter app can be built against a stable contract.

## 3. Required vs. optional enhancements

### Explicitly required by the proposal or the brief (implemented)
- Executive single-window overview: KPIs, alerts, trends, map, project status, financials, sector summaries.
- Drill-down: Region → Sector → Wereda → Project / Facility.
- Sectors: Education, Health, Manufacturing, Agriculture.
- Project tracking: milestones, budget vs actuals, delays, risks, completion status.
- Interactive PostGIS-backed map.
- Live updates via WebSocket.
- Role-based access, secure authentication, audit.
- Responsive desktop / laptop / tablet, desktop first.
- Localisation-ready for English, Amharic, Tigrinya.
- Architecture prepared for Flutter field app, PMO integration, AI analytics, automated reports.

### Optional enhancements added because they materially improve executive decision-making
*(each is isolated and can be removed without touching required functionality)*

| Enhancement | Why it earns its place |
|---|---|
| **Decision Queue** (alerts with "decision required", acknowledge / assign / resolve, with notes) | Converts a passive dashboard into a command tool. Every action is audited, which also satisfies P4 audit needs. |
| **Printable Daily Executive Brief** (`/briefing`) | Direct precursor of the P4 automated digests. The same server-side aggregation will feed the PDF / email generator in Phase 3. |
| **Schedule & cost performance indices (SPI / CPI) and a transparent forecast completion date** | Gives the executive a defensible early-warning signal today; the P5 AI model will later replace the estimator behind the same API field. |
| **Wereda heat table ("where are we failing") alongside the map** | Tablets and projectors in briefing rooms often render tables faster and more legibly than maps. |
| **Funding-source visibility** (treasury, federal, donor, diaspora) | Reconstruction financing is multi-source; executives are routinely asked "whose money is stuck". |
| **Data freshness indicators** on every panel | Field data arrives in bursts when teams regain connectivity. Showing "last report 9 days ago" prevents decisions on stale data. |
| **Global command search (⌘K)** | Fastest path to any wereda, facility or project for a time-constrained executive. |
| **Idempotent sync ingest + device registry tables** | Lets the Flutter app be developed in parallel against a stable contract. |

### Deliberately deferred (out of Phase 1 web scope)
- Flutter field app and site-manager app.
- PMO federated identity (SAML / OIDC federation). Local accounts with strong password hashing now; the security module is isolated so an identity provider can be swapped in.
- AI model training and inference service. Interface defined (`ForecastProvider`), baseline implementation shipped.
- PDF / email digest scheduler. Printable brief shipped; scheduler is a Phase 3 task.
- TimescaleDB extension. Schema is hypertable-ready; enabling it is a one-line migration when the extension is present on the target cluster.

## 4. Key professional recommendations

1. **Treat data freshness as a first-class KPI.** Executive error risk comes from stale field data far more than from UI issues.
2. **Keep alert rules declarative and reviewable** by the executive office (thresholds in config, each alert shows the rule that fired).
3. **Audit every read by federal users** and every write by anyone. The audit log is append-only.
4. **Use official wereda boundary geometries** (CSA / EthioGIS shapefiles) when they are supplied; the schema stores `MultiPolygon` boundaries and falls back to centroid-based proportional symbols until then. No synthetic boundaries are drawn.
5. **Self-host map tiles for the executive office** (offline-capable) before go-live; the frontend's tile URL is a single environment variable.
