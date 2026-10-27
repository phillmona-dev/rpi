import { NextRequest, NextResponse } from 'next/server';
import { backendFetch } from '@/lib/api/server';

export const dynamic = 'force-dynamic';

const ALLOWED_PREFIXES = ['dashboard', 'geo', 'projects', 'facilities', 'damage', 'alerts', 'finance', 'reports', 'search', 'admin', 'users/assignable', 'auth/me', 'evidence', 'media', 'analytics', 'intelligence', 'federal', 'approvals', 'field-team', 'messaging', 'notifications'];
const TEXT_TYPES = /^(application\/(json|problem\+json|geo\+json)|text\/)/i;

async function handle(req: NextRequest, { params }: { params: { path: string[] } }) {
  const path = params.path.join('/');
  if (!ALLOWED_PREFIXES.some((p) => path === p || path.startsWith(p + '/') || path.startsWith(p + '.'))) {
    return NextResponse.json({ title: 'Not Found', status: 404 }, { status: 404 });
  }
  const url = `/api/v1/${path}${req.nextUrl.search}`;
  const hasBody = !['GET', 'HEAD'].includes(req.method);
  // Text bodies are forwarded as text; anything else (file uploads) as raw bytes so nothing is re-encoded.
  const reqType = req.headers.get('content-type') ?? 'application/json';
  const body = hasBody ? (TEXT_TYPES.test(reqType) && !path.startsWith('messaging/attachments') ? await req.text() : await req.arrayBuffer()) : undefined;
  const upstream = await backendFetch(url, {
    method: req.method,
    headers: hasBody ? { 'Content-Type': reqType } : undefined,
    body,
  });
  const contentType = upstream.headers.get('content-type') ?? 'application/json';
  const headers: Record<string, string> = { 'Content-Type': contentType, 'Cache-Control': path.startsWith('media/files/') ? 'private, max-age=86400' : 'no-store' };
  const disposition = upstream.headers.get('content-disposition');
  if (disposition) headers['Content-Disposition'] = disposition;
  const cid = upstream.headers.get('x-correlation-id');
  if (cid) headers['X-Correlation-Id'] = cid;
  // No-content responses must not carry a body (the Response constructor rejects one).
  if (upstream.status === 204 || upstream.status === 304) return new NextResponse(null, { status: upstream.status, headers });
  // Binary bodies (media files, exports) stream through untouched; JSON/text is buffered as before.
  if (!TEXT_TYPES.test(contentType) || disposition) {
    return new NextResponse(upstream.body, { status: upstream.status, headers });
  }
  const text = await upstream.text();
  return new NextResponse(text, { status: upstream.status, headers });
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
