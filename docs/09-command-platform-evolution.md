# 09 · From Executive Dashboard to Reconstruction Command Platform

**Date:** 19 October 2026 · **Status:** implemented in this increment (Flyway `V3__command_platform.sql`)

This record explains what was added on top of the Phase-1 dashboard, why, and which international
patterns were adapted. Nothing in Phase 1 was rewritten; every change is additive (new tables,
new feature packages, new pages) so the original delivery remains reviewable on its own.

## 1. Assessment of the Phase-1 platform

| Already strong — kept as-is | Gap against DREAM / GEMS / Gati Shakti class systems |
|---|---|
| Feature-modular Spring monolith with explicit DTO contracts and `@Audited` writes | No formal **project lifecycle** (planning → approval → funding → procurement → implementation → monitoring → completion) or responsible-organisation model |
| BFF with httpOnly cookies, RBAC with sector scoping, append-only audit | No **field evidence** model: inspections, geotagged photos/videos, verification status, media storage |
| Rule-based alert engine whose alerts carry the metrics that fired them | Map shows **wereda aggregates only**; no project / facility / boundary / evidence layers, no filtering by status, health or severity |
| Decision Queue with acknowledge / assign / resolve workflow | Dashboard reports status but does not synthesise **"what requires my decision"**, early-warning indicators or comparisons |
| Earned-value forecast provider slot | No **risk scoring**, anomaly detection or a place where a future AI engine writes explainable insights |
| Printable daily brief | **Reporting** limited to one brief; no sector / geographic / financial / risk reports, no exports, no run history |
| Design-token system, uniform loading / empty / error states, three locales | Offline state not surfaced; new domains need the same discipline |

## 2. Concepts adapted (not copied)

| Source | Concept | RPIS adaptation |
|---|---|---|
| Ukraine **DREAM** | Single project passport across the full lifecycle; every stage transition is public and auditable; responsible organisations named per project | `project.lifecycle_stage` + `project_stage_event` (actor, note, reference such as a decision minute), `organization` / `project_organization` with roles, `/projects/{id}/timeline` merging stage events, milestones, reports, disbursements, alerts, decisions, inspections |
| World Bank **GEMS** | Geo-enabled, remote supervision: geotagged, time-stamped evidence from the field reviewed remotely | `field_inspection` + `evidence_media` (GPS, accuracy, distance from site, EXIF flags, SHA-256), verification workflow (UNVERIFIED → VERIFIED / DISPUTED / REJECTED), evidence galleries and site maps, `POST /sync/inspections`, signed upload tickets |
| **PM Gati Shakti** | One geospatial layer across sectors with filters and drill-down | `/map` Geospatial Command: boundary, wereda, project, facility and evidence layers; filters by sector, status, health, severity; map → entity card → detail page |
| Government project-monitoring platforms (e.g. India PRAGATI, Kenya e-ProMIS) | Decision-oriented briefings, exception reporting, comparisons across units | `intelligence` module: early-warning signals, action cards, sector / zone / contractor comparisons, funding-priority ranking, risk register; typed reports with periods and exports |

## 3. Architecture decisions

1. **Operational status vs lifecycle stage.** `project.status` (PLANNED, PROCUREMENT, ACTIVE, …) stays the operational state used by alerts and metrics. `lifecycle_stage` is the governance stage. Transitions are validated (`ProjectLifecycleService`), audited and published as domain events. This avoids touching every query that already filters on `status`.
2. **Evidence is its own domain.** `evidence` package owns inspections, media and verification. Assessment photos (`assessment_photo`) remain where they are; the gallery read model unions both so executives see one evidence stream per facility or project.
3. **Media storage behind an interface.** `MediaStorage` with a `LocalMediaStorage` implementation (configurable directory) ships now; S3-compatible storage is a drop-in. Uploads use short-lived tickets (`POST /media/upload-url` → `PUT /media/upload/{token}`), exactly the contract proposed to the mobile team in `08-mobile-app-brief.md`. Binary responses stream through the BFF proxy with the cookie-held token, so `<img>` tags never need a bearer token.
4. **Risk and insights are explainable and persisted.** `RiskScoringService` computes a 0–100 composite with named components and configurable weights (`rpis.analytics.*`); `AnomalyDetector` applies deterministic rules. Both write to `analytics_insight` with `provider`, `basis = RULE`, and a feature list. A future AI engine writes the same table with `basis = MODEL`; the UI already labels provider, confidence and the data behind each insight. **AI remains decision support**: nothing in the platform changes state without a human action, and every human action is audited.
5. **Reports are data, renderers are pluggable.** `ReportService` builds a generic `Report` (sections of KPI grids, tables, lists) for executive, sector, geographic, project-progress, financial and risk reports over daily / weekly / monthly periods. `ReportRenderer` has a CSV implementation; PDF is produced by the browser's print pipeline today, and an XLSX/PDF renderer can be added without touching report logic. Every export is recorded in `report_run` with a SHA-256 of the payload.
6. **Federal read model is versioned and minimal.** `GET /federal/summary` (role `PMO_FEDERAL`, `EXECUTIVE`, `ADMIN`) carries `schemaVersion` and only aggregate figures; federal reads continue to be audited by the existing filter.
7. **No new runtime technologies.** PostGIS functions (`ST_AsGeoJSON`, `ST_SimplifyPreserveTopology`, `ST_Distance`) replace any need for a separate GIS server; MapLibre, Recharts, TanStack Query and next-intl are reused. No Apache POI, no ML runtime, no message broker.

## 4. What the executive can now do

| Question | Where it is answered |
|---|---|
| What is happening? | Command Center KPIs, live stream, sector cards (unchanged) + early-warning signal strip |
| Where? | `/map` Geospatial Command with project / facility / evidence layers; site maps on project and facility pages |
| Why? | Alert "why this fired", risk-score component breakdown, inspection findings and evidence galleries |
| What is at risk? | Risk register (composite score), delay / cost / supply insights, anomaly flags, funding-lag exposure |
| What requires my decision? | Action cards on the Command Center and `/intelligence`, Decision Queue, funding-priority ranking |
| Can I prove it? | Verified field evidence, lifecycle timeline, decision log, report run history, audit trail |

## 5. Deferred (documented, interfaces in place)

- Object storage (S3 / MinIO) implementation of `MediaStorage`; thumbnail generation worker.
- XLSX / PDF `ReportRenderer`; scheduled delivery of reports to distribution lists.
- Trained AI providers for delay, cost and supply risk (write to `analytics_insight`).
- Official wereda / zone boundary polygons (the boundary layer activates automatically when `wereda.boundary` is populated).
- Federated identity for PMO users; `ANALYTICS_ENGINE` service role for an external inference service.
