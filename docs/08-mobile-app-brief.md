# ReconstructTigray RPIS — Phase 2 Mobile App Brief (prompt for the mobile engineer)

> Copy everything below the line into your working session (or hand it to your AI assistant) as the
> opening prompt. It is self-contained, but the repository `RPIS/` (docs, backend, OpenAPI) is the
> source of truth whenever this document and the code disagree.

---

## Your task

Build the **RPIS Field Companion**: a single, offline-first **Flutter** application with two
role-based modes that feed the ReconstructTigray RPIS executive command system:

1. **Field Damage Recorder** (role `FIELD_OFFICER`) — assess damaged facilities (schools, health
   facilities, factories, irrigation schemes, …) in remote weredas with no connectivity: GPS,
   structural impact score, inventory loss, geotagged photos, audio notes, replacement estimate.
2. **Site Manager Progress** (role `SITE_MANAGER`) — log daily/weekly physical progress on assigned
   reconstruction projects, with site photos/videos and compliance documents.

Everything recorded offline must **sync automatically and safely** to the central API when the
device regains coverage. The executive web dashboard (already built, Phase 1) shows this data live.

This is a **production government information system**, not a demo. Treat security, data
integrity, offline resilience, accessibility, localisation (English, Amharic, Tigrinya) and
maintainability as first-class requirements. Do not build a superficial prototype.

## What already exists (do not rebuild)

- **Backend**: Spring Boot 3.3 REST API at `/api/v1`, JWT auth, PostgreSQL + PostGIS, STOMP
  WebSocket, audit log. OpenAPI spec: `GET http://<host>:8080/v3/api-docs` (Swagger UI at
  `/swagger-ui.html` in non-prod). Docs in `RPIS/docs/` — read `04-domain-model.md`,
  `05-api-and-developer-guide.md`, `06-security.md`.
- **Web dashboard**: Next.js app consuming the same API. Your data appears in its incident stream,
  project pages and alerts within seconds of sync.
- **Demo environment**: `docker compose up -d db`, then
  `cd backend && SPRING_PROFILES_ACTIVE=demo mvn spring-boot:run`. Demo users (password
  `Rpis@2026!`): `field.officer` (FIELD_OFFICER), `site.manager` (SITE_MANAGER), `analyst`,
  `admin`. The demo profile already registers device `demo-tablet-01`.

## Users and constraints

- Field teams of 2–4 people, Android tablets/phones (mid-range, Android 10+), days without network,
  intermittent 2G/3G when back in towns, limited power. iOS support is desirable but secondary.
- Users are engineers and assessors, not IT staff. Forms must be fast, forgiving and usable in
  bright sunlight with one hand; many fields are numeric scores.
- Data is sensitive (damage valuations, locations). Devices may be lost or seized: all local data
  must be encrypted at rest and remotely disable-able (the backend has a `field_device.enabled`
  flag; a disabled device gets HTTP 403 on sync and must wipe its queue after the user confirms).

## Authentication (talk to Spring directly, not to the Next.js web server)

| Call | Body → Response |
|---|---|
| `POST /api/v1/auth/login` | `{username, password}` → `{accessToken, accessExpiresInSeconds (900), refreshToken, refreshExpiresInSeconds (28800), user{id, username, fullName, roles[], sectorScope}}` |
| `POST /api/v1/auth/refresh` | `{refreshToken}` → same shape, **new refresh token** |
| `POST /api/v1/auth/logout` | `{refreshToken}` → 204 |
| `GET /api/v1/auth/me` | profile |

Rules you must honour:
- Send `Authorization: Bearer <accessToken>` on every call. Access tokens live 15 minutes.
- Refresh tokens **rotate on every use**; reusing an old one revokes the whole family and forces
  re-login (theft protection). Persist the newest refresh token atomically in secure storage
  (`flutter_secure_storage`/Keystore) *before* using it, and never run two refreshes concurrently.
- 5 failed logins lock the account for 15 minutes (HTTP 423). Show the message, do not retry.
- Offline sign-in: cache the last successful profile and allow app unlock with device biometrics or
  PIN while offline; API calls will refresh when connectivity returns. If the refresh token has
  expired (8 h idle on the server side) the user re-enters credentials when online; local queue is
  preserved.
- Errors are RFC 7807 Problem Details: `{type, title, status, detail, correlationId, code?,
  errors?[{field,message}]}`. Surface `correlationId` in a support screen.

## Reference data to download (read endpoints, all authenticated)

Download on first sync and refresh opportunistically; store in the local database.

| Data | Endpoint | Notes |
|---|---|---|
| Zones | `GET /api/v1/geo/zones` | `{id, code, name{en,ti,am}, centroid{lat,lng}, weredaCount}` |
| Weredas | `GET /api/v1/geo/weredas` | `{id, code, name{en,ti,am}, zoneId, zoneCode, zoneName}` |
| Facilities | `GET /api/v1/facilities?size=500&page=n` (filters `sector`, `zoneId`, `weredaId`) | paged `{content[], page, size, totalElements, totalPages, last}`; each has `location{lat,lng}`, `latestSeverity`, `operationalStatus` |
| Facility history | `GET /api/v1/facilities/{id}/assessments` | prior assessments for comparison |
| Projects (site managers) | `GET /api/v1/projects?status=ACTIVE&size=200` | each has `physicalProgressPct`, `plannedProgressPct`, `wereda`, `location` |
| Project dossier | `GET /api/v1/projects/{id}` | milestones, progress history, documents |

Enumerations are stable codes; render labels client-side in all three languages:
- `Sector`: EDUCATION, HEALTH, MANUFACTURING, AGRICULTURE
- `DamageSeverity`: NONE, MINOR, MODERATE, SEVERE, DESTROYED
- `FacilityType` (18 codes), `ProjectStatus`, `ProjectHealth`, `OperationalStatus` — full lists in
  `docs/04-domain-model.md` and the OpenAPI schema.

## Sync contract (already implemented server-side)

All sync endpoints require role `FIELD_OFFICER`, `SITE_MANAGER` or `ADMIN`.

### 1. Register the device (once per install, and after app upgrade)
`POST /api/v1/sync/devices`
```json
{ "deviceUid": "<stable per-install UUID>", "label": "Tablet 07 – Eastern team", "platform": "android", "appVersion": "1.0.0+12" }
```
→ `{ "id": 3, "deviceUid": "...", "label": "...", "enabled": true, "lastSyncAt": null }`

### 2. Upload damage assessments
`POST /api/v1/sync/damage-assessments`
```json
{
  "deviceUid": "<same uid>",
  "batchUid": "<UUID per upload attempt set>",
  "items": [
    {
      "facilityId": 42,
      "clientReference": "<UUID generated when the record was created offline>",
      "assessedOn": "2026-10-19",
      "assessorName": "Selam Tesfay",
      "severity": "SEVERE",
      "structuralImpactScore": 72,
      "inventoryLossPct": 80,
      "functionalCapacityPct": 15,
      "estimatedRepairCostEtb": 12500000,
      "estimatedReplacementCostEtb": 48000000,
      "notes": "Roof collapsed over two classroom blocks …",
      "audioNoteUrl": null,
      "location": { "lat": 14.277, "lng": 39.462 },
      "photos": [ { "url": "<see media section>", "caption": "North block", "takenAt": "2026-10-19T08:12:00Z", "location": { "lat": 14.2771, "lng": 39.4621 } } ]
    }
  ]
}
```
→
```json
{ "batchUid": "...", "accepted": 1, "duplicates": 0, "rejected": 0,
  "items": [ { "index": 0, "clientReference": "...", "status": "ACCEPTED|DUPLICATE|REJECTED", "serverId": 901, "error": null } ],
  "serverTime": "2026-10-19T09:00:00Z" }
```
Idempotency: the server de-duplicates on `(deviceUid, clientReference)`. **Retrying a batch is
always safe**; treat `DUPLICATE` as success and store `serverId`. `REJECTED` items carry a
validation message; keep them in a local "needs attention" state, never silently drop them.
Validation limits: scores/percentages 0–100, `assessedOn` not in the future, notes ≤ 4000 chars,
`assessorName` ≤ 160 chars.

### 3. Upload progress logs (site managers)
`POST /api/v1/sync/progress-logs`
```json
{ "deviceUid": "...", "batchUid": "...",
  "items": [ { "projectId": 17, "clientReference": "<UUID>",
               "entry": { "logDate": "2026-10-19", "physicalProgressPct": 43.5, "workforceCount": 64, "notes": "Level-2 slab poured" } } ] }
```
Same `BatchResult` shape. Server rules that will produce `REJECTED`: project not `ACTIVE`;
`logDate` earlier than the latest stored report; `physicalProgressPct` lower than the latest value
(progress cannot regress without a formal re-baseline); value outside 0–100. Enforce these
client-side before queueing so users get immediate feedback. One log per project per day: a second
upload for the same `logDate` overwrites the first (upsert).

### 4. Sync behaviour you must implement
- Outbox pattern: every record is written locally first with state `DRAFT → QUEUED → SENDING →
  SYNCED | REJECTED`. Batches of ≤ 50 items, oldest first, assessments before progress logs.
- Trigger: connectivity regained, app foregrounded, manual "Sync now", and a background periodic job
  (WorkManager / BGTaskScheduler) with exponential back-off (30 s → 1 h) and jitter.
- Only upload on a successful token refresh; on 401 refresh once and retry; on 403 with
  `code = device_disabled` stop and show the wipe prompt.
- Show per-record and per-batch status, last successful sync time, and pending counts prominently
  (field leads are asked "is everything uploaded?" before leaving a site).
- Never lose data on crash mid-sync: mark `SENDING` records back to `QUEUED` on restart; server
  idempotency makes this safe.

## Media (photos, audio, video) — implemented contract

- `POST /api/v1/media/upload-url` `{deviceUid, clientReference, kind: PHOTO|VIDEO|AUDIO|DOCUMENT,
  mediaType, sizeBytes, sha256?}` → `{token, uploadUrl: "/api/v1/media/upload/{token}", publicUrl,
  expiresAt, maxBytes}`. Allowed types: JPEG, PNG, WebP, HEIC, MP4, WebM, AAC, OGG, MP3, PDF.
- `PUT {uploadUrl}` with the raw bytes (`Content-Type` = mediaType). The server verifies size and,
  when supplied, SHA-256; the ticket is single-use and expires after 30 minutes. Response:
  `{url, storageKey, sha256, sizeBytes, mediaType}`. Re-PUT of a consumed ticket returns the same result (safe retry).
- Reference `url` in the structured record: `photos[]` of an assessment, or `media[]` of an
  inspection (`POST /api/v1/sync/inspections`, items shaped like `CreateInspectionRequest`:
  projectId | facilityId, inspectionType, visitedOn, startedAt/endedAt, inspectorName, organization,
  location{lat,lng}, gpsAccuracyM, observedProgressPct, workforceObserved, qualityRating 1–5,
  safetyRating 1–5, findings, recommendedAction, clientReference, media[{kind, url, mediaType,
  sizeBytes, sha256, width, height, durationSeconds, caption, capturedAt, location, gpsAccuracyM,
  headingDeg, clientReference}]).
- Upload order on slow links: structured record first, media after; a follow-up `PATCH` to attach
  late media is still to be agreed (keep media in the local outbox until it is accepted).
- Executives see unverified evidence immediately and verify / dispute / reject it from the web; the
  outcome is visible in `GET /api/v1/evidence/inspections/{id}` (`verificationStatus`).

Compress photos to ≤ 1600 px / ~300 KB with EXIF GPS and timestamp retained; record audio as
Opus/AAC; cap video at 60 s, 720p.

## Functional scope (screens)

**Shared**: sign-in · offline unlock (PIN/biometric) · home with sync status and pending work ·
settings (language EN/አማ/ትግ, map cache, device info, diagnostics with correlation ids) ·
“about this device” (device uid, enabled state, last sync).

**Field Damage Recorder**
1. Facility finder: offline map (MapLibre with pre-downloaded tiles for Tigray) + list, filter by
   wereda / sector / type, nearest-first using GPS, search by name/code. Create “unregistered
   facility” locally when a site is missing (server-side creation endpoint to be agreed; queue it).
2. Assessment form (multi-step, autosave each step): severity, structural impact score (0–100 with
   descriptive anchors), inventory loss %, functional capacity %, repair and replacement estimates
   (ETB, with calculator helpers), notes, audio note, photos (min 1 recommended; warn if none),
   GPS capture with accuracy shown; warn when > 50 m from the facility’s known location.
3. Review & sign-off: assessor name prefilled from profile, summary, “queue for upload”.
4. History: previous assessments for the facility (downloaded), own queued/synced records.

**Site Manager Progress**
1. My projects (assigned list; until server-side assignment exists, show ACTIVE projects filtered by
   the user’s wereda selection), each with latest physical %, planned %, health, last report date.
2. Progress log form: date (default today, no future), physical % (slider + numeric, cannot be below
   last value), workforce count, notes, site photos/video, compliance document attach.
3. Milestone view (read-only from dossier) and progress history chart (offline, from cache).

## Architecture expectations

- Flutter 3.x, Dart 3, null-safe. Clean architecture: `features/<name>/{data,domain,presentation}`,
  shared `core/` (network, db, sync, auth, i18n, theme). State management: Riverpod (preferred) or
  BLoC — choose one and apply consistently.
- Local store: SQLite via `drift` with **SQLCipher** encryption (key in Keystore/Keychain).
  Tables mirror server DTOs plus outbox columns (`clientReference`, `syncState`, `serverId`,
  `lastError`, `attempts`, `updatedAt`).
- Networking: `dio` with interceptors for bearer auth, single-flight refresh, correlation-id header
  (`X-Correlation-Id`, UUID per request), retry with back-off on 5xx/timeouts only (never on 4xx).
  Generate models from the OpenAPI spec or hand-write with `freezed` + `json_serializable`; keep
  field names identical to the API.
- Background sync: `workmanager` (Android) / BGTaskScheduler (iOS). Connectivity via
  `connectivity_plus` plus a real reachability probe (`GET /actuator/health`).
- Maps: `maplibre_gl` with an offline tile pack for Tigray (bounds 36.3–40.1 E, 12.2–14.9 N);
  tile source URL configurable (government will self-host).
- Localisation: `flutter_localizations` + ARB files for `en`, `am`, `ti`; Ethiopic font bundled
  (Noto Sans Ethiopic). Numbers/dates via `intl`; Ethiopian calendar display is a desired toggle.
- Accessibility: 48 dp targets, text scaling to 200 % without clipping, semantics labels, status
  never by colour alone, high-contrast outdoor theme.
- Security: certificate pinning (configurable), no secrets in the binary, screenshots disabled on
  sensitive screens (`FLAG_SECURE`), encrypted DB, logs scrubbed of PII, remote wipe on
  `device_disabled`, auto-lock after 5 minutes.
- Observability: structured local log ring buffer exportable from diagnostics; crash reporting
  must be self-hostable (e.g. Sentry self-hosted) or disabled by config — no third-party SaaS by
  default for a government deployment.
- Config per flavour (`dev`, `staging`, `prod`): API base URL, tile URL, pinning, feature flags.

## Quality bar and deliverables

- Unit tests for sync state machine, validation rules, token refresh single-flight, and mappers;
  widget tests for the two forms; an integration test that records offline, goes online, syncs,
  and verifies `ACCEPTED`/`DUPLICATE` handling against the demo backend.
- CI: `flutter analyze`, tests, build APK/AAB (and IPA if iOS is in scope).
- README: setup, flavours, how to point at the demo backend, how to run the offline/online
  integration test, release/signing notes.
- `docs/mobile-sync-protocol.md` describing the outbox states and any backend contract you agreed
  beyond what is listed here (send a PR to `RPIS/docs/` as well).
- Keep an `OPEN_QUESTIONS.md` for backend gaps you hit; raise them early rather than working around
  them silently.

## Known backend gaps to coordinate (not your fault, but your blockers)

1. ~~Media upload / object storage~~ — implemented (local storage in dev; production object store pending).
1b. Late attachment of media to an already-synced record (`PATCH`) — to be agreed.
2. Delta download (`?updatedSince=` on facilities/projects) — today you must page full lists;
   fine for ~100 facilities, not for thousands. Propose the parameter.
3. Site-manager → project assignment is not enforced server-side yet; a site manager can post
   progress to any ACTIVE project. Needs an assignment table and a `GET /projects/mine`.
4. Creating a *new* facility from the field is not exposed; only assessments on existing ones.
5. Progress-log de-duplication is by `(project, logDate)`, not by `clientReference`; the
   `clientReference` you send is echoed back for your bookkeeping only.
6. No push notifications; the dashboard’s WebSocket topics are for the web and are not a mobile
   notification channel.

## Acceptance criteria (Phase 2 exit)

- A field officer can complete and queue 20 assessments with photos on a device in airplane mode,
  survive an app kill, then sync everything in one go when online; the executive dashboard shows
  them in the incident stream and the facility pages within 30 seconds.
- Re-sending the same batch creates no duplicates.
- A site manager cannot submit regressing or future-dated progress; valid logs update the project
  page and may raise/clear alerts on the dashboard.
- Disabling the device in the database makes the next sync fail safely and offer a wipe.
- All screens work in English, Amharic and Tigrinya at 200 % text scale.
- Static analysis clean, tests green, release build reproducible from the README.
