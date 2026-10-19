import { NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/api/server';

export const dynamic = 'force-dynamic';

/**
 * The STOMP connection goes browser → backend directly (WebSockets cannot be proxied by route handlers),
 * so the short-lived access token is handed to the client for that single purpose.
 */
export async function GET() {
  const token = await getAccessToken();
  if (!token) return NextResponse.json({ title: 'Unauthorized', status: 401 }, { status: 401 });
  return NextResponse.json({ token }, { headers: { 'Cache-Control': 'no-store' } });
}
