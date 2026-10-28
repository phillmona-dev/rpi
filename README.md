# ReconstructTigray RPIS — Reconstruction Command, Monitoring & Decision Intelligence Platform

Integrated Reconstruction & Project Command System for the Office of the Chief Executive for
Economic Affairs and Reconstruction. The platform delivers the **single-window executive command
dashboard**, the **project lifecycle passport**, **field-evidence and remote-monitoring** read models,
a **geospatial command layer**, **executive decision support** (early warnings, action cards, risk
register, funding priorities), **typed government reports with exports and run history**, and the
**API contracts** that the offline Flutter field app, Federal/PMO linkage and AI engine build on.
The evolution from dashboard to command platform is recorded in [`docs/09`](docs/09-command-platform-evolution.md).

| Layer | Stack |
|---|---|
| Frontend | Next.js 14 (App Router, BFF), React 18, TypeScript, Tailwind, TanStack Query, Recharts, MapLibre GL, next-intl (en / am / ti) |
| Backend | Spring Boot 3.3 (Java 17), Spring Security (JWT, Argon2id), Spring Data JPA + Hibernate Spatial, Flyway, STOMP WebSocket, springdoc-openapi |
| Database | PostgreSQL 16 + PostGIS 3.4 (TimescaleDB-ready progress log) |

Design documents live in [`docs/`](docs/): proposal analysis & recommendations, information
architecture, system architecture, domain model, API & developer guide, security, roadmap,
mobile brief, the command-platform evolution record (`09`) and the damage assessment workflow (`10`).

## What the executive sees

| Question | Where |
|---|---|
| What is happening? | Command Center: KPIs, early-warning signals, live stream, sector cards |
| What was damaged, and is it verified? | Damage Assessment (`/damage`): campaigns, team roles, site assignment, verification, endorsement, verified needs |
| Where? | Geospatial Command (`/map`): boundary, wereda, project, facility and evidence layers; site maps on every project / facility page |
| Why? | Alert "why this fired", composite risk components, inspection findings, evidence galleries |
| What is at risk? | Decision Support (`/intelligence`): risk register, delay / cost / supply insights, anomalies |
| What requires my decision? | Executive action cards (Command Center and `/intelligence`), Decision Queue, funding-priority ranking |
| Can I prove it? | Verified field evidence, project timeline, decision log, report run history, audit trail |

## Quick start (development)

Prerequisites: Docker, Java 17+, Maven 3.8+, Node 18.18+.

```bash
cp .env.example .env                      # review secrets before any non-local use
docker compose up -d db                   # PostGIS on localhost:5433

# Backend (seeds realistic demo data + simulated live field updates)
cd backend && SPRING_PROFILES_ACTIVE=demo mvn spring-boot:run

# Frontend (second terminal)
cd frontend && cp .env.example .env.local && npm install && npm run dev
```

Open http://localhost:3000 → sign in with a demo account (password `Rpis@2026!`, configurable via `RPIS_DEMO_PASSWORD`):

| Username | Role | What you see |
|---|---|---|
| `executive` | EXECUTIVE | Everything; can act on the Decision Queue |
| `edu.head`, `health.head`, `industry.head`, `agri.head` | SECTOR_HEAD | Scoped to one sector |
| `analyst` | ANALYST | Full read, data entry (progress, assessments) |
| `pmo.observer` | PMO_FEDERAL | Read-only, every read audited |
| `admin` | ADMIN | Users and audit log |
| `field.officer`, `site.manager` | FIELD_OFFICER / SITE_MANAGER | Own assessment sites on the web (`/damage/my-tasks`); sync API for the Phase 2 apps |

API documentation: http://localhost:8080/swagger-ui.html (disabled under the `prod` profile).

## Full stack with Docker

```bash
docker compose --profile full up --build
```

## Repository layout

```
backend/    Spring Boot API — feature-modular monolith (see docs/03-architecture.md)
            project · evidence · analytics · intelligence · report · federal · geo · alert · sync · …
frontend/   Next.js executive command UI — BFF holds tokens in httpOnly cookies, proxies media binaries
docs/       Design decisions, phase readiness, platform evolution record
infra/db/   PostGIS init scripts (Docker)
backend/data/media   Local evidence-media store in development (git-ignored); S3-compatible storage in production
```

## Field app contract (Phase 2)

`POST /api/v1/media/upload-url` → `PUT /api/v1/media/upload/{token}` → reference the returned URL from
`POST /api/v1/sync/inspections`, `/sync/damage-assessments` or `/sync/progress-logs`. Batches are idempotent
per `(device, clientReference)`; inspections carry GPS, accuracy, observed vs reported progress and media.
See `docs/08-mobile-app-brief.md` and Swagger.

## Quality gates

```bash
cd backend  && mvn test                   # unit tests (schedule baseline, EVM forecast, health rules)
cd frontend && npm run typecheck && npm run lint && npm test && npm run build
```

## Demo vs. production

The `demo` Spring profile seeds synthetic figures on real place names and runs a live-feed
simulator. **Never enable it in production.** Production uses the `prod` profile, a managed
PostGIS database, real `RPIS_JWT_SECRET`, TLS termination at the reverse proxy, self-hosted map
tiles (`NEXT_PUBLIC_MAP_STYLE_URL`) and official wereda boundary geometries loaded into
`wereda.boundary` (the boundary map layer activates automatically), `RPIS_MEDIA_DIR` on durable storage
(or an S3-compatible `MediaStorage` implementation), and reviewed risk weights in `rpis.analytics.*`.
