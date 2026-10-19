import { getRequestConfig } from 'next-intl/server';
import { routing, type Locale } from './routing';

type Messages = Record<string, unknown>;

/** Deep-merge so a locale with partial translations falls back to English key-by-key. */
function merge(base: Messages, over: Messages): Messages {
  const out: Messages = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const b = out[k];
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && b && typeof b === 'object' ? merge(b as Messages, v as Messages) : v;
  }
  return out;
}

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = (await requestLocale) as Locale | undefined;
  if (!locale || !routing.locales.includes(locale)) locale = routing.defaultLocale;
  const en = (await import('../../messages/en.json')).default as Messages;
  const messages = locale === 'en' ? en : merge(en, (await import(`../../messages/${locale}.json`)).default as Messages);
  return { locale, messages: messages as unknown as import('next-intl').AbstractIntlMessages, timeZone: 'Africa/Addis_Ababa', now: new Date() };
});
