'use client';
/** Reads the design tokens from CSS so MapLibre paint (which cannot use CSS variables) stays in sync with the theme. */
export interface MapPalette { good: string; warning: string; serious: string; critical: string; neutral: string; info: string; seq250: string; seq450: string; seq650: string; sector: Record<string, string>; text: string; halo: string; stroke: string; fill: string; isDark: boolean }

export function readPalette(): MapPalette {
  const fallback: MapPalette = { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b', neutral: '#8a8f98', info: '#2a78d6', seq250: '#86b6ef', seq450: '#2a78d6', seq650: '#104281', sector: { EDUCATION: '#2a78d6', HEALTH: '#eb6834', MANUFACTURING: '#1baf7a', AGRICULTURE: '#eda100' }, text: '#1f2937', halo: '#ffffff', stroke: '#ffffff', fill: '#104281', isDark: false };
  if (typeof document === 'undefined') return fallback;
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, d: string) => (cs.getPropertyValue(name).trim() || d);
  const isDark = document.documentElement.classList.contains('dark');
  return {
    good: v('--status-good', fallback.good), warning: v('--status-warning', fallback.warning), serious: v('--status-serious', fallback.serious), critical: v('--status-critical', fallback.critical), neutral: v('--status-neutral', fallback.neutral),
    info: v('--seq-450', fallback.info), seq250: v('--seq-250', fallback.seq250), seq450: v('--seq-450', fallback.seq450), seq650: v('--seq-650', fallback.seq650),
    sector: { EDUCATION: v('--sector-education', fallback.sector.EDUCATION), HEALTH: v('--sector-health', fallback.sector.HEALTH), MANUFACTURING: v('--sector-manufacturing', fallback.sector.MANUFACTURING), AGRICULTURE: v('--sector-agriculture', fallback.sector.AGRICULTURE) },
    text: isDark ? '#e5e7eb' : '#1f2937', halo: isDark ? '#0b1220' : '#ffffff', stroke: isDark ? '#0b1220' : '#ffffff', fill: isDark ? '#9ec5f4' : '#104281', isDark,
  };
}

export const healthColor = (p: MapPalette, h: string) => ({ ON_TRACK: p.good, AT_RISK: p.warning, DELAYED: p.serious, STALLED: p.critical, COMPLETED: p.info, NOT_STARTED: p.neutral } as Record<string, string>)[h] ?? p.neutral;
export const severityColor = (p: MapPalette, s: string | null) => ({ NONE: p.good, MINOR: p.neutral, MODERATE: p.warning, SEVERE: p.serious, DESTROYED: p.critical } as Record<string, string>)[s ?? ''] ?? p.neutral;
export const operationalColor = (p: MapPalette, s: string) => ({ NON_FUNCTIONAL: p.critical, PARTIALLY_FUNCTIONAL: p.warning, FUNCTIONAL: p.good } as Record<string, string>)[s] ?? p.neutral;
export const riskColor = (p: MapPalette, score: number | null) => score === null || score === undefined ? p.neutral : score >= 75 ? p.critical : score >= 50 ? p.serious : score >= 25 ? p.warning : p.good;
export const verificationColor = (p: MapPalette, s: string) => ({ VERIFIED: p.good, DISPUTED: p.serious, REJECTED: p.critical } as Record<string, string>)[s] ?? p.neutral;
/** Progress 0–100 → sequential blue (light = little progress, dark = near completion). */
export const progressColor = (p: MapPalette, pct: number) => pct >= 75 ? p.seq650 : pct >= 35 ? p.seq450 : p.seq250;
