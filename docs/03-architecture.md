# 03 · System Architecture (Phase 1)

```
┌────────────────────────────────────────────────────────────────────────────────┐
│  Executive office / tablets                 PMO (Phase 3)        Field (Phase 2)│
│  Browser ──HTTPS──► Next.js 14 (BFF)                                            │
│                       │  httpOnly cookies, proxy /api/* ──► Spring Boot 3.3     │
│                       │  WebSocket /ws (STOMP) ◄────────────  REST /api/v1      │
│                       │                                      WS  /ws           │
│                       │                                      Sync /api/v1/sync │
│                       ▼                                        │               │
│                PostgreSQL 16 + PostGIS 3.4  ◄──────────────────┘               │
└────────────────────────────────────────────────────────────────────────────────┘
```

## Repository layout
```
RPIS/
├── docs/                 design & decision records
├── backend/              Spring Boot 3.3 · Java 17 · Maven · Flyway
├── frontend/             Next.js 14 · TypeScript · Tailwind · TanStack Query · MapLibre · Recharts · next-intl
├── infra/db/             PostGIS init scripts
├── docker-compose.yml    db + backend + frontend
└── .env.example
```

## Backend: feature-modular monolith (ready to split)
Package root `et.gov.tigray.rpis`. Each feature package owns its entities, repositories, services, DTOs and controller; cross-feature access goes through service interfaces, never repositories.

| Package | Responsibility |
|---|---|
| `common` | API error envelope (RFC 7807 Problem Details), pagination, base entity, correlation id filter |
| `config` | Security chain, CORS, OpenAPI, WebSocket broker, Jackson, async, cache |
| `security` | Users, roles, JWT issue/refresh/revoke, login throttling, password policy |
| `audit` | Append-only audit log (who, what, entity, before/after, ip, correlation id), AOP annotation `@Audited` |
| `geo` | Region / Zone / Wereda, PostGIS geometry, GeoJSON endpoints |
| `facility` | Facilities (sector-typed), with location |
| `damage` | Damage assessments (field data), photos metadata, replacement estimates |
| `project` | Projects, lifecycle stage + stage events (`ProjectLifecycleService`), responsible organisations, milestones, progress logs (time-series), budget lines, disbursements, expenditures, risks, issues, documents, unified timeline (`ProjectTimelineService`) |
| `alert` | Rule engine (scheduled + event-driven), alert lifecycle (OPEN → ACKNOWLEDGED → ASSIGNED → RESOLVED), decisions |
| `dashboard` | Read-model aggregations for the executive views (SQL projections, cached 30 s) |
| `analytics` | `ForecastProvider` (earned-value baseline); `RiskScoringService` (composite 0–100, weighted, explainable); `InsightEngine` (delay, completion, cost / inflation, supply-chain, anomalies, funding priority) writing `analytics_insight`; `InsightService` human review |
| `realtime` | Publishes domain events to STOMP topics `/topic/dashboard`, `/topic/alerts`, `/topic/projects.{id}` |
| `sync` | Idempotent ingest endpoints for the field app (device registry, sync batches) |
| `report` | Daily brief; typed reports (executive, sector, geographic, project progress, financial, risk, field evidence, decision log) over periods and scopes; `ReportRenderer` (CSV shipped); `report_run` accountability |
| `evidence` | Field inspections, geotagged media, verification workflow, `MediaStorage` (local filesystem shipped; S3-compatible drop-in), upload tickets |
| `intelligence` | Executive briefing read model: early-warning signals, action cards, sector / zone / contractor comparisons, funding priorities, risk register |
| `federal` | Versioned aggregate read model for the PMO (`/api/v1/federal/summary`, `schemaVersion`) |

### Cross-cutting rules
- **Validation** with Jakarta Bean Validation on every request DTO; domain invariants enforced in services.
- **Errors**: Problem Details JSON (`type`, `title`, `status`, `detail`, `instance`, `correlationId`, `errors[]`).
- **Security**: stateless JWT (HS256 dev / RS256 prod via config), access token 15 min, refresh 8 h rotating with revocation table. Method security `@PreAuthorize`. Role-based data scoping for `SECTOR_HEAD`. Rate-limited login. Security headers (CSP, HSTS, frame-deny).
- **Auditability**: `@Audited` on mutating service methods; federal reads audited by a dedicated filter.
- **Observability**: Actuator health/metrics, structured JSON logs with correlation id, OpenAPI at `/v3/api-docs` and Swagger UI (disabled in prod).
- **Caching**: Caffeine for dashboard, briefing and GeoJSON read-models (30 s TTL, evicted on domain events).
- **Binary media**: streamed by `MediaController` with cache headers; the Next.js proxy passes non-JSON bodies through untouched so `<img>` tags work with the cookie session.
- **Migrations**: Flyway. `V*__` for schema, `R__` repeatables for views. Sample data lives in `db/migration/demo` enabled only by the `demo` profile.

## Frontend: Next.js 14 App Router as a Backend-for-Frontend
- **Auth**: Route handlers `/api/auth/*` exchange credentials with Spring and set `httpOnly; Secure; SameSite=Lax` cookies. Tokens never reach client JavaScript. `/api/proxy/[...path]` forwards API calls with the bearer token and transparently refreshes once on 401. `middleware.ts` guards routes and handles locale prefixing.
- **Data layer**: `lib/api/*` typed clients with `zod` response schemas. One `ApiClient` abstraction; swapping the base URL or adding a mock adapter is configuration.
- **State**: TanStack Query for server state (stale-while-revalidate, 30 s), WebSocket messages invalidate or patch query caches. Minimal client state (locale, sidebar, theme) in a tiny store.
- **Realtime**: `@stomp/stompjs` client subscribes to topics; reconnect with back-off; connection status in top bar.
- **UI system**: Tailwind design tokens (`tokens.css`), Radix primitives, hand-maintained shadcn-style components under `components/ui`. Charts: Recharts wrappers under `components/charts` with a shared palette and data-table fallback. Map: MapLibre GL in `components/map`.
- **i18n**: `next-intl` with locale segment `/{locale}/…`; messages split per namespace; Ethiopic font via `next/font`.
- **Quality**: strict TypeScript, ESLint, Prettier, Vitest unit tests for formatters and reducers, Playwright smoke test for login → overview → drill-down.

## Deployment
- `docker compose up` brings up PostGIS, backend (`demo` profile), frontend.
- Production: backend container behind the government reverse proxy (TLS termination, HSTS), frontend container, managed PostgreSQL with PostGIS. Secrets via environment / vault, never in images.
- Backups: daily logical dump + WAL archiving recommended; `audit_log` and `progress_log` retention policies documented in 04.

## Readiness for later phases
| Future capability | Prepared hook |
|---|---|
| Flutter offline field app | `sync` module: device registry, idempotent batches, conflict policy (server timestamp wins, both versions kept in `sync_conflict`) |
| Site-manager app | Same `progress_log` and `project_document` tables; `SITE_MANAGER` role already scoped to assigned projects |
| Federal / PMO | `PMO_FEDERAL` read-only role, `/api/v1/federal/*` namespace reserved, audit-on-read, API versioning |
| AI predictive analytics | `analytics.ForecastProvider`; `analytics_insight` table with `provider`, `basis` (RULE / MODEL), `explanation` features; UI labels provider and confidence and records human review |
| Field evidence & media | `evidence` module, `MediaStorage`, upload tickets, `POST /sync/inspections`; evidence galleries and site maps already consume the data |
| GIS boundaries | `GET /geo/boundaries.geojson` returns simplified polygons once `wereda.boundary` / `zone.boundary` are loaded; the map layer activates automatically |
| Automated reporting | `ReportService` + `ReportRenderer` (CSV); add XLSX / PDF renderer and a scheduler for distribution lists; every run already recorded in `report_run` |
| TimescaleDB | `progress_log` keyed by `(project_id, log_date)`; `SELECT create_hypertable('progress_log','log_date')` migration guarded by extension presence |
