import 'server-only';
import { cookies, headers } from 'next/headers';
import { ACCESS_COOKIE, REFRESH_COOKIE, cookieOptions } from '@/lib/auth/cookies';

/**
 * Server-side client used only by Next.js route handlers (the BFF layer).
 * Holds the token exchange with Spring Boot so the browser never sees a JWT.
 */
export const API_BASE = (process.env.RPIS_API_BASE_URL ?? 'http://localhost:8080').replace(/\/$/, '');

export interface TokenResponse {
  accessToken: string; accessExpiresInSeconds: number; refreshToken: string; refreshExpiresInSeconds: number;
  user: { id: number; username: string; fullName: string; title: string | null; email: string; locale: string; roles: string[]; sectorScope: string | null; lastLoginAt: string | null };
}

export function applyTokens(t: TokenResponse) {
  const jar = cookies();
  // Access cookie expires slightly before the JWT so the proxy refreshes proactively.
  jar.set(ACCESS_COOKIE, t.accessToken, cookieOptions(Math.max(60, t.accessExpiresInSeconds - 30)));
  jar.set(REFRESH_COOKIE, t.refreshToken, cookieOptions(t.refreshExpiresInSeconds));
}

export function clearTokens() {
  const jar = cookies();
  jar.set(ACCESS_COOKIE, '', cookieOptions(0));
  jar.set(REFRESH_COOKIE, '', cookieOptions(0));
}

// De-duplicate concurrent refreshes within this server process (parallel dashboard queries after expiry).
const inflight = new Map<string, Promise<TokenResponse | null>>();

export async function refreshTokens(): Promise<TokenResponse | null> {
  const rt = cookies().get(REFRESH_COOKIE)?.value;
  if (!rt) return null;
  let p = inflight.get(rt);
  if (!p) {
    p = (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...forwardedHeaders() }, body: JSON.stringify({ refreshToken: rt }), cache: 'no-store',
        });
        if (!res.ok) return null;
        const t = (await res.json()) as TokenResponse;
        applyTokens(t);
        return t;
      } catch { return null; } finally { setTimeout(() => inflight.delete(rt), 5000); }
    })();
    inflight.set(rt, p);
  }
  return p;
}

export async function getAccessToken(): Promise<string | null> {
  const at = cookies().get(ACCESS_COOKIE)?.value;
  if (at) return at;
  const t = await refreshTokens();
  return t?.accessToken ?? null;
}

export function forwardedHeaders(): Record<string, string> {
  const h = headers();
  const out: Record<string, string> = {};
  const cid = h.get('x-correlation-id'); if (cid) out['X-Correlation-Id'] = cid;
  const lang = h.get('accept-language'); if (lang) out['Accept-Language'] = lang;
  const ua = h.get('user-agent'); if (ua) out['User-Agent'] = ua;
  const ip = h.get('x-forwarded-for') ?? h.get('x-real-ip'); if (ip) out['X-Forwarded-For'] = ip;
  return out;
}

/** Calls the backend with the current access token; on 401 refreshes once and retries. */
export async function backendFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const doFetch = (t: string | null) => fetch(`${API_BASE}${path}`, {
    ...init, cache: 'no-store',
    headers: { ...(init.headers as Record<string, string> | undefined), ...forwardedHeaders(), ...(t ? { Authorization: `Bearer ${t}` } : {}) },
  });
  let res = await doFetch(token);
  if (res.status === 401) {
    const t = await refreshTokens();
    if (t) res = await doFetch(t.accessToken);
  }
  return res;
}
