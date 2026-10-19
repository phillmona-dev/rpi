import type { Metadata, Viewport } from 'next';
import { Inter, Noto_Sans_Ethiopic } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing, type Locale } from '@/i18n/routing';
import { AppProviders } from '@/providers/app-providers';
import { ThemeProvider, themeInitScript } from '@/providers/theme';
import '../globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const ethiopic = Noto_Sans_Ethiopic({ subsets: ['ethiopic'], variable: '--font-ethiopic', display: 'swap', weight: ['400', '500', '600', '700'] });

export function generateStaticParams() { return routing.locales.map((locale) => ({ locale })); }

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'app' });
  return { title: { default: t('name'), template: `%s · ${t('short')}` }, description: t('tagline'), applicationName: t('name'), robots: { index: false, follow: false } };
}
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: [{ media: '(prefers-color-scheme: light)', color: '#f5f8fb' }, { media: '(prefers-color-scheme: dark)', color: '#0d1420' }] };

export default async function LocaleLayout({ children, params: { locale } }: { children: React.ReactNode; params: { locale: string } }) {
  if (!routing.locales.includes(locale as Locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();
  return (
    <html lang={locale} suppressHydrationWarning className={`${inter.variable} ${ethiopic.variable}`}>
      <head><script dangerouslySetInnerHTML={{ __html: themeInitScript }} /></head>
      <body className="min-h-screen font-sans">
        <NextIntlClientProvider messages={messages} timeZone="Africa/Addis_Ababa">
          <ThemeProvider><AppProviders>{children}</AppProviders></ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
