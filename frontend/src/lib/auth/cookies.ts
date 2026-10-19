/** Cookie names shared by middleware and route handlers. Tokens never reach client-side JavaScript. */
export const ACCESS_COOKIE = 'rpis_at';
export const REFRESH_COOKIE = 'rpis_rt';

export function cookieOptions(maxAgeSeconds: number, path = '/') {
  const secure = process.env.NODE_ENV === 'production' || process.env.RPIS_COOKIE_SECURE === 'true';
  return { httpOnly: true, secure, sameSite: 'lax' as const, path, maxAge: maxAgeSeconds };
}
