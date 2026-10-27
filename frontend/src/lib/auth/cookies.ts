/** Cookie names shared by middleware and route handlers. Tokens never reach client-side JavaScript. */
export const ACCESS_COOKIE = 'rpis_at';
export const REFRESH_COOKIE = 'rpis_rt';

export function cookieOptions(maxAgeSeconds: number, path = '/') {
  // Secure by default in production; RPIS_COOKIE_SECURE=false allows a plain-HTTP deployment (browsers drop Secure cookies over HTTP).
  const flag = process.env.RPIS_COOKIE_SECURE;
  const secure = flag ? flag === 'true' : process.env.NODE_ENV === 'production';
  return { httpOnly: true, secure, sameSite: 'lax' as const, path, maxAge: maxAgeSeconds };
}
