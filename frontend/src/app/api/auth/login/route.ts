import { NextRequest, NextResponse } from 'next/server';
import { API_BASE, applyTokens, forwardedHeaders, type TokenResponse } from '@/lib/api/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let payload: { username?: string; password?: string };
  try { payload = await req.json(); } catch { return NextResponse.json({ title: 'Bad Request', status: 400 }, { status: 400 }); }
  const upstream = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...forwardedHeaders() }, body: JSON.stringify(payload), cache: 'no-store',
  });
  const text = await upstream.text();
  if (!upstream.ok) return new NextResponse(text, { status: upstream.status, headers: { 'Content-Type': 'application/json' } });
  const tokens = JSON.parse(text) as TokenResponse;
  applyTokens(tokens);
  return NextResponse.json({ user: tokens.user });
}
