'use client';

/** Browser-side API client. Talks only to the Next.js BFF (`/api/proxy/*`); never to Spring directly. */
export class ApiError extends Error {
  constructor(public status: number, public title: string, public detail: string, public correlationId?: string, public code?: string, public errors?: { field: string; message: string }[]) {
    super(detail || title);
  }
}

export async function api<T>(path: string, init: RequestInit & { query?: Record<string, unknown> } = {}): Promise<T> {
  const { query, ...rest } = init;
  const qs = query ? '?' + Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0))
    .flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, String(x)]) : [[k, String(v)]]))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&') : '';
  const res = await fetch(`/api/proxy/${path.replace(/^\//, '')}${qs}`, {
    ...rest,
    headers: { Accept: 'application/json', ...(rest.body ? { 'Content-Type': 'application/json' } : {}), ...(rest.headers ?? {}) },
    credentials: 'same-origin',
  });
  if (res.status === 401 && typeof window !== 'undefined') {
    const [, first = '', ...rest] = window.location.pathname.split('/');
    const hasLocale = ['en', 'am', 'ti'].includes(first);
    const locale = hasLocale ? first : 'en';
    // `next` is locale-free, like the middleware's: the login page navigates with the locale-aware router.
    const path = '/' + (hasLocale ? rest : [first, ...rest]).filter(Boolean).join('/');
    window.location.assign(`/${locale}/login?next=${encodeURIComponent(path + window.location.search)}`);
  }
  if (!res.ok) {
    let body: Record<string, unknown> = {};
    try { body = await res.json(); } catch { /* non-JSON error */ }
    throw new ApiError(res.status, String(body.title ?? res.statusText), String(body.detail ?? ''), body.correlationId as string | undefined, body.code as string | undefined, body.errors as ApiError['errors']);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
