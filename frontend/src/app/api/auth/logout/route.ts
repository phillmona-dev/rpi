import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { API_BASE, clearTokens, forwardedHeaders } from '@/lib/api/server';
import { REFRESH_COOKIE } from '@/lib/auth/cookies';

export const dynamic = 'force-dynamic';

export async function POST() {
  const rt = cookies().get(REFRESH_COOKIE)?.value;
  if (rt) {
    try {
      await fetch(`${API_BASE}/api/v1/auth/logout`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...forwardedHeaders() }, body: JSON.stringify({ refreshToken: rt }), cache: 'no-store' });
    } catch { /* best effort: cookies are cleared regardless */ }
  }
  clearTokens();
  return NextResponse.json({ ok: true });
}
