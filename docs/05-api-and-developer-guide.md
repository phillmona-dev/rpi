# 05 · API & Developer Guide

## REST API (v1)
Base path `/api/v1`. All responses JSON; errors are RFC 7807 Problem Details with `correlationId`.
Every list endpoint accepts `page`, `size`, `sort=field,dir`. Enum codes are stable (see 04).
Full, generated specification: `GET /v3/api-docs` (Swagger UI at `/swagger-ui.html`).

| Area | Endpoint | Notes |
|---|---|---|
| Auth | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me` | Access JWT 15 min, rotating refresh 8 h, reuse detection |
| Dashboard | `GET /dashboard/overview?sector&zoneId&weredaId` | One call renders the Command Center |
| | `GET /dashboard/trend?months`, `GET /dashboard/stream?limit`, `GET /dashboard/sectors` | |
| Geography | `GET /geo/zones`, `GET /geo/weredas`, `GET /geo/weredas/metrics`, `GET /geo/weredas/{id}`, `GET /geo/weredas.geojson` | PostGIS-backed |
| Projects | `GET /projects` (filters: sector, zoneId, weredaId, status[], health[], fundingSource, q, stage[], minRiskScore, contractor; sort `riskScore`), `GET /projects/{id}` (adds `governance`, `risk`, `evidence`), `GET /projects/{id}/timeline`, `POST /projects/{id}/progress`, `POST /projects/{id}/stage` | Stage transitions validated and audited |
| Geo layers | `GET /geo/projects.geojson?sector&zoneId&weredaId&status[]&health[]&minRiskScore`, `GET /geo/facilities.geojson?…&severity[]&operationalStatus&unaddressed`, `GET /geo/evidence.geojson?projectId|facilityId|weredaId`, `GET /geo/boundaries.geojson?level=zone|wereda&zoneId` | PostGIS; boundaries empty until official polygons are loaded |
| Evidence | `GET /evidence/inspections`, `GET /evidence/inspections/{id}`, `POST /evidence/inspections`, `POST /evidence/inspections/{id}/verify`, `GET /evidence/media` (gallery: inspection media ∪ assessment photos), `GET /evidence/summary?projectId|facilityId` | Verification audited; project `lastVerifiedAt` updated |
| Media | `POST /media/upload-url` → `PUT /media/upload/{token}` (raw bytes, SHA-256 checked) → `GET /media/files/{yyyy}/{MM}/{name}` | Local storage in dev; S3-compatible via `MediaStorage` |
| Analytics | `GET /analytics/insights?kind&entityType&entityId&sector&weredaId&status[]&minSeverity`, `GET /analytics/projects/{id}`, `POST /analytics/insights/{id}/review`, `POST /analytics/evaluate` | Advisory; providers labelled; review audited |
| Intelligence | `GET /intelligence/briefing?sector&zoneId` | Signals, action cards, comparisons, funding priorities, risk register (cached 30 s) |
| Federal | `GET /federal/summary?sector` | `schemaVersion` contract; roles PMO_FEDERAL, EXECUTIVE, ADMIN; audited on read |
| Facilities | `GET /facilities`, `GET /facilities/{id}`, `GET /facilities/{id}/assessments` | |
| Damage | `GET /damage/assessments`, `GET /damage/assessments/{id}`, `POST /damage/assessments` | |
| Alerts | `GET /alerts`, `GET /alerts/counts`, `GET /alerts/{id}`, `POST /alerts/{id}/actions`, `POST /alerts/evaluate` | Decision workflow, audited |
| Finance | `GET /finance/overview?sector&zoneId` | |
| Reports | `GET /reports/daily-brief?sector`, `GET /reports/catalog`, `GET /reports/{type}?period&from&to&sector&zoneId&weredaId&projectId`, `GET /reports/{type}/export?format=CSV`, `GET /reports/runs`, `POST /reports/runs` | Generic report model; exports and prints recorded with digest |
| Search | `GET /search?q=` | Weredas, projects, facilities |
| Admin | `GET/POST /admin/users`, `PATCH /admin/users/{id}`, `POST /admin/users/{id}/unlock`, `GET /admin/audit` | |
| Sync (Phase 2 contract) | `POST /sync/devices`, `POST /sync/damage-assessments`, `POST /sync/progress-logs`, `POST /sync/inspections` | Idempotent per `(device, clientReference)` |

### Realtime
STOMP over WebSocket at `/ws`. CONNECT must carry `Authorization: Bearer <access token>`.
Topics: `/topic/dashboard` (all events), `/topic/alerts`, `/topic/projects.{id}`.
Event shape: `{ id, type, entityType, entityId, sector, weredaId, occurredAt, payload }`.
Types emitted today: `PROGRESS_REPORTED`, `ASSESSMENT_RECORDED`, `ALERT_RAISED`, `ALERT_UPDATED`, `STAGE_CHANGED`, `INSPECTION_RECORDED`, `INSPECTION_VERIFIED`.
Clients treat events as *invalidation hints* and re-fetch; payloads are informational.

### Role-based data scoping
- `SECTOR_HEAD` requests are forced to their `sectorScope` regardless of the `sector` query parameter.
- `PMO_FEDERAL` is read-only (403 on actions) and every `GET` is written to `audit_log` as `FEDERAL_READ`.
- Finance, brief and admin endpoints are additionally role-gated (see `SecurityConfig` and `@PreAuthorize`).

## Frontend ↔ backend contract
The browser never calls Spring directly. `frontend/src/app/api/proxy/[...path]` forwards
allow-listed paths with the access token from an httpOnly cookie, refreshing once on 401 and
de-duplicating concurrent refreshes. The only token that reaches browser JavaScript is the
short-lived access token handed to the STOMP client via `/api/auth/ws-token`.

Types in `frontend/src/lib/api/types.ts` mirror backend DTOs one-to-one; hooks in
`frontend/src/lib/api/hooks.ts` own query keys and invalidation. Replacing or extending an
endpoint means: DTO → `types.ts` → hook → component.

## Adding a feature (checklist)
1. Flyway migration `V{n}__*.sql` (never edit applied migrations).
2. Entity + repository in the owning feature package; cross-feature access through services only.
3. DTO records + controller with Bean Validation; add `@Audited` on mutating service methods.
4. Publish a `DomainEvent` for anything the dashboard should reflect live.
5. Mirror the DTO in `types.ts`, add a hook, build the UI through `DataState` (loading / empty / error).
6. Add message keys to `messages/en.json` (am / ti fall back automatically).
7. Unit-test pure logic; run `mvn test` and `npm run build`.

## Configuration reference
| Variable | Purpose |
|---|---|
| `RPIS_JWT_SECRET` | ≥ 64 random bytes, base64 (HS512) |
| `RPIS_JWT_ACCESS_TTL_MINUTES`, `RPIS_JWT_REFRESH_TTL_HOURS` | token lifetimes |
| `RPIS_CORS_ALLOWED_ORIGINS` | comma-separated browser origins |
| `rpis.alerts.*` (application.yml) | alert thresholds and evaluation cron |
| `RPIS_API_BASE_URL` | Next.js server → Spring |
| `NEXT_PUBLIC_WS_URL` | browser → Spring WebSocket |
| `NEXT_PUBLIC_MAP_STYLE_URL` | MapLibre style; self-host for offline offices |
| `NEXT_PUBLIC_DEMO_BANNER` | shows the demonstration-data banner and demo account hints |
| `RPIS_MEDIA_DIR`, `RPIS_MEDIA_MAX_BYTES` | local evidence-media directory and upload cap (`rpis.media.*`) |
| `rpis.analytics.*` (application.yml) | composite-risk weights, inflation assumption, anomaly thresholds, insight evaluation cron |
| `RPIS_CONSTRUCTION_INFLATION_PCT` | annual construction-cost inflation used for cost exposure (default 18) |
