import { NextResponse } from 'next/server';
import { backendFetch, clearTokens } from '@/lib/api/server';

export const dynamic = 'force-dynamic';

/** Returns the authenticated profile, refreshing tokens transparently. 401 clears cookies. */
export async function GET() {
  const res = await backendFetch('/api/v1/auth/me');
  if (res.status === 401) { clearTokens(); return NextResponse.json({ title: 'Unauthorized', status: 401 }, { status: 401 }); }
  const text = await res.text();
  return new NextResponse(text, { status: res.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
