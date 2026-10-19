import { defineRouting } from 'next-intl/routing';

export const locales = ['en', 'am', 'ti'] as const;
export type Locale = (typeof locales)[number];

export const localeNames: Record<Locale, string> = { en: 'English', am: 'አማርኛ', ti: 'ትግርኛ' };
export const localeShort: Record<Locale, string> = { en: 'EN', am: 'አማ', ti: 'ትግ' };

export const routing = defineRouting({ locales, defaultLocale: 'en', localePrefix: 'always' });
