'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { WeredaMetrics } from '@/lib/api/types';
import type { MapMetric } from '@/components/map/wereda-map';
import { useRouter } from '@/i18n/navigation';
import { localizedName, money, num, pct } from '@/lib/format';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** Ranked list with inline bars: projector-friendly companion to the map. */
export function WeredaHeatTable({ weredas, metric, isLoading, limit = 12 }: { weredas?: WeredaMetrics[]; metric: MapMetric; isLoading: boolean; limit?: number }) {
  const locale = useLocale();
  const t = useTranslations('dashboard.metric');
  const router = useRouter();
  if (isLoading || !weredas) return <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-7" />)}</div>;
  const inverse = metric === 'avgProgressPct';
  const rows = [...weredas].filter((w) => w.projectsTotal + w.facilitiesTotal > 0).sort((a, b) => (inverse ? Number(a[metric] ?? 0) - Number(b[metric] ?? 0) : Number(b[metric] ?? 0) - Number(a[metric] ?? 0))).slice(0, limit);
  const max = Math.max(1, ...rows.map((w) => Number(w[metric] ?? 0)));
  const fmt = (w: WeredaMetrics) => metric === 'budgetEtb' ? money(w.budgetEtb, locale) : metric === 'avgProgressPct' ? pct(w.avgProgressPct) : metric === 'avgImpactScore' ? num(w.avgImpactScore, locale, 1) : num(Number(w[metric]), locale);
  return (
    <ol className="space-y-1" aria-label={t(metric)}>
      {rows.map((w, i) => {
        const v = Number(w[metric] ?? 0);
        const width = inverse ? (100 - v) : (v / max) * 100;
        return (
          <li key={w.id}>
            <button type="button" onClick={() => router.push(`/weredas/${w.id}`)} className="group grid w-full grid-cols-[1.25rem_1fr_auto] items-center gap-2 rounded px-1 py-1 text-left text-sm hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring">
              <span className="text-2xs text-muted-foreground tabular">{i + 1}</span>
              <span className="min-w-0">
                <span className="flex items-center justify-between gap-2"><span className="truncate group-hover:underline">{localizedName(w.name, locale)}</span><span className="text-2xs text-muted-foreground truncate hidden wide:inline">{localizedName(w.zoneName, locale)}</span></span>
                <span className="mt-0.5 block h-1.5 w-full rounded-full bg-muted"><span className={cn('block h-full rounded-full')} style={{ width: `${Math.max(2, width)}%`, background: 'var(--seq-450)' }} /></span>
              </span>
              <span className="tabular text-sm font-medium">{fmt(w)}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
