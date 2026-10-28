import { formatDistanceToNowStrict, parseISO } from 'date-fns';

const intlLocale = (locale: string) => (locale === 'am' ? 'am-ET' : locale === 'ti' ? 'ti-ET' : 'en-GB');

/** ETB with compact notation for executive views (ETB 1.4 B). Full value belongs in tooltips. */
export function money(value: number | null | undefined, locale = 'en', opts: { compact?: boolean; digits?: number } = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const { compact = true, digits } = opts;
  const abs = Math.abs(value);
  if (compact && abs >= 1_000_000_000) return `ETB ${(value / 1_000_000_000).toLocaleString(intlLocale(locale), { maximumFractionDigits: digits ?? 2 })} B`;
  if (compact && abs >= 1_000_000) return `ETB ${(value / 1_000_000).toLocaleString(intlLocale(locale), { maximumFractionDigits: digits ?? 1 })} M`;
  if (compact && abs >= 10_000) return `ETB ${(value / 1_000).toLocaleString(intlLocale(locale), { maximumFractionDigits: 0 })} K`;
  return `ETB ${value.toLocaleString(intlLocale(locale), { maximumFractionDigits: digits ?? 0 })}`;
}
export function moneyFull(value: number | null | undefined, locale = 'en') { return money(value, locale, { compact: false }); }

export function num(value: number | null | undefined, locale = 'en', digits = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toLocaleString(intlLocale(locale), { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}
export function compactNum(value: number | null | undefined, locale = 'en') {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat(intlLocale(locale), { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}
export function pct(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${Number(value).toFixed(digits)}%`;
}
/** Difference between actual and planned progress, shown the way non-specialists read it ("+16%", "−10%"). */
export function signedPp(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined) return '—';
  const v = Number(value);
  return `${v > 0 ? '+' : ''}${v.toFixed(digits)}%`;
}
export function ratio(value: number | null | undefined) { return value === null || value === undefined ? '—' : Number(value).toFixed(2); }

export function fmtDate(iso: string | null | undefined, locale = 'en', style: 'short' | 'medium' | 'long' = 'medium') {
  if (!iso) return '—';
  const d = iso.length === 10 ? parseISO(iso) : new Date(iso);
  if (style === 'short') return new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'Africa/Addis_Ababa' }).format(d);
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: style, timeZone: 'Africa/Addis_Ababa' }).format(d);
}
export function fmtDateTime(iso: string | null | undefined, locale = 'en') {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Addis_Ababa' }).format(new Date(iso));
}
export function relTime(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (d.getTime() > Date.now()) return 'just now';
  return formatDistanceToNowStrict(d, { addSuffix: true });
}
export function daysSince(iso: string | null | undefined) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}
export function bytes(n: number | null | undefined) {
  if (!n) return '—';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} GB`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} MB`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)} KB`;
  return `${n} B`;
}
export function localizedName(name: { en: string; ti: string | null; am: string | null } | null | undefined, locale: string) {
  if (!name) return '—';
  if (locale === 'ti' && name.ti) return name.ti;
  if (locale === 'am' && name.am) return name.am;
  return name.en;
}
