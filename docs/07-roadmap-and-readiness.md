# 07 · Phase Roadmap & Readiness Checklist

## Phase 1 (this delivery) — Executive Web Command Dashboard
Delivered: Command Center, sector / geography / wereda drill-down, project dossier (milestones,
progress, finance, risks, documents, audit), facilities & damage register, Decision Queue with
audited actions, Finance view, printable Daily Brief, admin (users, audit), live updates, three
locales, dark mode, responsive to tablet, Dockerised stack, demo dataset.

## Increment 2 (19 Oct 2026) — Command, Monitoring & Decision Intelligence
Delivered on top of Phase 1 without rewrites (see `09-command-platform-evolution.md`): project lifecycle
passport and responsible organisations, unified project timeline, field-evidence domain (inspections,
geotagged media, verification, media upload tickets, `POST /sync/inspections`), Geospatial Command page
with project / facility / boundary / evidence layers, executive decision support (early-warning signals,
action cards, sector / zone / contractor comparisons, funding priorities, composite risk register),
rule-based predictive insights with human review, typed reports with CSV export and run history,
versioned federal summary, two new alert rules (field verification overdue, reported-vs-observed
discrepancy), offline banner, grouped navigation.

## Increment 3 (28 Oct 2026) — Damage assessment campaigns
Delivered (see `10-damage-assessment.md`): assessment campaigns over a wereda scope with coordinator and
dates; campaign team in roles (team lead, assessor, engineer, verifier) drawn from the field team; site
assignment with assessor/verifier separation, due dates and priorities; detailed assessment form
(access and UXO, current use, causes, per-element condition and cost, recommended response and priority,
photos, GPS); verify / return / reject review by someone other than the author; endorsement of findings by
the sector head or Chief Executive; campaign results; verified-needs register; project registration from a
verified need, with verified assessments required for linked facilities; field officers' own site list.

## Review items before Phase 2 sign-off
- [ ] Review the component catalogue, severity score bands and need-priority definitions with the sector bureaus.
- [ ] Decide whether reconstruction projects without any linked facility should also be blocked (today: warning).
- [ ] Review composite-risk weights (`rpis.analytics.weight-*`), the inflation assumption and anomaly thresholds with the executive office; they are configuration, not code.
- [ ] Agree the evidence verification SLA (`rpis.media.evidence-stale-days`) and who may verify.
- [ ] Decide the production `MediaStorage` (S3-compatible object store) and retention for field media.
- [ ] Validate alert thresholds (`rpis.alerts.*`) with the executive office.
- [ ] Load official wereda boundaries (CSA / EthioGIS) into `wereda.boundary`; map switches to choropleth automatically once polygons exist (frontend layer addition).
- [ ] Native-speaker review of Amharic and Tigrinya message bundles (`frontend/messages`).
- [ ] Decide on Ethiopian-calendar display toggle.
- [ ] Self-host map tiles for the executive office network.
- [ ] Production secrets, TLS, backup policy, log shipping.

## Phase 2 — Field & Site Apps (Flutter)
Backend already provides: device registry, idempotent batch ingest for assessments, progress
logs and inspections, media upload tickets (`/media/upload-url` → `PUT /media/upload/{token}`),
conflict table, `FIELD_OFFICER` / `SITE_MANAGER` roles. Remaining: S3-compatible `MediaStorage`
for production, thumbnail generation, delta-download endpoints (facility and project lists per
device scope), app build.

## Phase 3 — Federal / PMO linkage & AI
- Federal gateway: expose `/api/v1/federal/*` read models (subset of dashboard DTOs), issue
  `PMO_FEDERAL` credentials or federate identities; audit-on-read already active.
- Digests: schedule `DailyBriefService` output, render to PDF/e-mail, deliver per distribution list.
- AI: implement `analytics.ForecastProvider` with a trained model and write delay / cost / supply
  insights to `analytics_insight` with `basis = MODEL`; the UI already labels provider, confidence and
  the data behind each insight and records human review. Rule-based baselines stay as the fallback.
- Prioritisation: the funding-priority ranking ships now as a transparent heuristic; replace or
  calibrate the formula with the executive office, keeping the same insight kind.
- Reports: XLSX / PDF `ReportRenderer`, scheduled generation and distribution; `report_run` is in place.

## Phase 4 — Executive handover
Onboarding material, role provisioning, briefing-room display mode (large-screen layout of the
Command Center), operational runbooks.
