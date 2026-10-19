# 06 · Security & Auditability

## Authentication
- Local accounts, passwords hashed with **Argon2id** (Spring Security defaults, v5.8 parameters).
- Login throttling: 5 failed attempts lock the account for 15 minutes (configurable). Unknown users still incur a hash cost to blunt enumeration by timing.
- **Access token**: HS512 JWT, 15 minutes, claims `sub`, `uid`, `name`, `roles`, `sector`.
- **Refresh token**: 256-bit random, stored as SHA-256 hash, 8 hours, **rotated on every use**. Reuse of a rotated token revokes the whole family (theft signal) and is audited.
- Browser session: tokens live only in `httpOnly; SameSite=Lax; Secure` cookies set by the Next.js BFF. No token is stored in `localStorage`.
- Logout revokes the refresh token server-side and clears cookies.

## Authorisation
- Role model: `EXECUTIVE`, `SECTOR_HEAD`, `ANALYST`, `PMO_FEDERAL`, `FIELD_OFFICER`, `SITE_MANAGER`, `ADMIN`.
- URL-level rules in `SecurityConfig`, method-level `@PreAuthorize` for actions, and **data scoping** in services (sector heads cannot widen their scope through query parameters).
- Federal observers are read-only by construction.

## Auditability
- Append-only `audit_log` (actor, roles, action, entity, HTTP method/path, IP, correlation id, JSON detail). Written in a separate transaction so failed operations still leave evidence.
- Automatic coverage: authentication events, every `@Audited` service method (alerts, progress, assessments, users), and every federal read.
- Every HTTP response carries `X-Correlation-Id`; Problem Details include it for support.
- Recommended database hardening: revoke `UPDATE`/`DELETE` on `audit_log` from the application role.

## Transport & headers
- TLS terminates at the government reverse proxy; HSTS, CSP (`frame-ancestors 'none'`), `X-Content-Type-Options`, Referrer-Policy set by both Spring and Next.js.
- CORS restricted to configured origins; credentials allowed only for them.
- WebSocket CONNECT requires a bearer token; unauthenticated connects are rejected before subscription.

## Input validation & errors
- Jakarta Bean Validation on all request bodies; typed query parameters; business invariants in services (e.g. progress cannot regress, backdated logs rejected).
- Errors never leak stack traces; messages are generic for 5xx.

## Secrets & environments
- Secrets via environment variables / vault; `.env` is git-ignored, `.env.example` documents keys.
- `demo` profile is opt-in and must never be enabled in production; `prod` profile disables Swagger and health details.

## Known Phase-1 limitations (tracked for Phase 2–3)
- No MFA yet; the security module is isolated so OIDC/SAML federation (federal identities) or TOTP can be added without touching features.
- Rate limiting beyond login lockout should be enforced at the reverse proxy / API gateway.
- Media (photos, videos, documents) are URL references; object storage with signed URLs is a Phase-2 deliverable alongside the field app.
