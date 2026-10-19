import createIntlMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { routing } from './i18n/routing';
import { REFRESH_COOKIE } from './lib/auth/cookies';

const intl = createIntlMiddleware(routing);
const PUBLIC = ['/login'];

/** Locale routing + a cheap cookie-presence gate. Real authorization happens on every API call. */
export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const segments = pathname.split('/').filter(Boolean);
  const maybeLocale = segments[0];
  const hasLocale = (routing.locales as readonly string[]).includes(maybeLocale);
  const locale = hasLocale ? maybeLocale : routing.defaultLocale;
  const rest = '/' + (hasLocale ? segments.slice(1) : segments).join('/');
  const isPublic = PUBLIC.some((p) => rest === p || rest.startsWith(p + '/'));
  const authenticated = Boolean(req.cookies.get(REFRESH_COOKIE)?.value);

  if (!isPublic && !authenticated) {
    const url = req.nextUrl.clone();
    url.pathname = `/${locale}/login`;
    url.search = rest !== '/' ? `?next=${encodeURIComponent(rest + req.nextUrl.search)}` : '';
    return NextResponse.redirect(url);
  }
  if (isPublic && authenticated && rest === '/login') {
    const url = req.nextUrl.clone();
    url.pathname = `/${locale}`;
    url.search = '';
    return NextResponse.redirect(url);
  }
  return intl(req);
}

export const config = { matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'] };
