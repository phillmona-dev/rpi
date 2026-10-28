'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Building2, FolderKanban, TrendingDown, TrendingUp, Wallet, type LucideIcon } from 'lucide-react';
import type { AlertCounts, Kpis } from '@/lib/api/types';
import { money, num, pct } from '@/lib/format';
import { Link } from '@/i18n/navigation';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { toneVar } from '@/lib/domain';

function Tile({ icon: Icon, label, value, sub, href, accent, children }: { icon: LucideIcon; label: string; value: React.ReactNode; sub?: React.ReactNode; href?: string; accent?: string; children?: React.ReactNode }) {
  const body = (
    <div className={cn('flex h-full flex-col rounded-lg border bg-card p-5 shadow-card transition-colors', href && 'hover:border-primary/40')}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-base font-medium text-muted-foreground">{label}</span>
        <Icon className="h-5 w-5 text-muted-foreground" aria-hidden />
      </div>
      <div className="mt-3 text-3xl font-semibold tabular leading-none" style={accent ? { color: accent } : undefined}>{value}</div>
      {sub && <div className="mt-2 text-sm text-muted-foreground">{sub}</div>}
      {children}
    </div>
  );
  return href ? <Link href={href} className="block h-full rounded-lg focus-visible:ring-2 focus-visible:ring-ring">{body}</Link> : body;
}

/** Plain-language progress line: "Ahead of plan by 26%", "Behind plan by 4%", "On plan". */
export function useProgressPhrase() {
  const t = useTranslations('dashboard.kpi');
  return (actual: number | null | undefined, planned: number | null | undefined) => {
    const d = (actual ?? 0) - (planned ?? 0);
    return Math.abs(d) < 0.5 ? t('onPlan') : d < 0 ? t('behind', { value: Math.abs(d).toFixed(0) }) : t('ahead', { value: d.toFixed(0) });
  };
}

/** Four headline figures in everyday words: projects under way, work done, money released, facilities back in service. */
export function KpiStrip({ kpis, isLoading, scopeQuery = '' }: { kpis?: Kpis; alerts?: AlertCounts; isLoading: boolean; scopeQuery?: string }) {
  const t = useTranslations('dashboard.kpi');
  const locale = useLocale();
  const phrase = useProgressPhrase();
  if (isLoading || !kpis) return <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2 laptop:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[150px]" />)}</div>;
  const variance = (kpis.avgPhysicalProgressPct ?? 0) - (kpis.avgPlannedProgressPct ?? 0);
  const releasedPct = kpis.budgetEtb ? (kpis.disbursedEtb / kpis.budgetEtb) * 100 : 0;
  return (
    <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2 laptop:grid-cols-4">
      <Tile icon={FolderKanban} label={t('activeProjects')} value={num(kpis.projectsActive, locale)}
        sub={t('ofTotalDone', { total: num(kpis.projectsTotal, locale), done: num(kpis.projectsCompleted, locale) })} href={`/projects?status=ACTIVE${scopeQuery}`} />
      <Tile icon={variance < -0.5 ? TrendingDown : TrendingUp} label={t('physicalProgress')} value={pct(kpis.avgPhysicalProgressPct)}
        sub={<><span className="font-medium" style={{ color: variance <= -5 ? toneVar.serious : variance > 0.5 ? toneVar.good : undefined }}>{phrase(kpis.avgPhysicalProgressPct, kpis.avgPlannedProgressPct)}</span> · {t('planned', { value: (kpis.avgPlannedProgressPct ?? 0).toFixed(0) })}</>}>
        <Progress value={kpis.avgPhysicalProgressPct ?? 0} planned={kpis.avgPlannedProgressPct} className="mt-3" label={t('physicalProgress')} />
      </Tile>
      <Tile icon={Wallet} label={t('disbursed')} value={money(kpis.disbursedEtb, locale)}
        sub={t('releasedOf', { pct: releasedPct.toFixed(0), budget: money(kpis.budgetEtb, locale), spent: money(kpis.expendedEtb, locale) })} href="/finance">
        <Progress value={releasedPct} className="mt-3" tone="var(--seq-450)" label={t('disbursed')} />
      </Tile>
      <Tile icon={Building2} label={t('facilities')} value={<>{num(kpis.facilitiesRestored, locale)}<span className="text-lg font-normal text-muted-foreground"> / {num(kpis.facilitiesSevere, locale)}</span></>}
        sub={t('repairedOfDamaged')} href="/facilities?severity=SEVERE" />
    </div>
  );
}
