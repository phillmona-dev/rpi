'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Activity, AlertOctagon, Building2, FolderKanban, TrendingDown, TrendingUp, Wallet, Receipt, type LucideIcon } from 'lucide-react';
import type { AlertCounts, Kpis } from '@/lib/api/types';
import { money, num, pct } from '@/lib/format';
import { Link } from '@/i18n/navigation';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { toneVar } from '@/lib/domain';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

function Tile({ icon: Icon, label, value, sub, href, accent, children, title }: { icon: LucideIcon; label: string; value: React.ReactNode; sub?: React.ReactNode; href?: string; accent?: string; children?: React.ReactNode; title?: string }) {
  const body = (
    <div className={cn('flex h-full flex-col rounded-lg border bg-card p-5 shadow-card transition-colors', href && 'hover:border-primary/40')} title={title}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <Icon className="h-5 w-5 text-muted-foreground" aria-hidden />
      </div>
      <div className="mt-3 text-3xl font-semibold tabular leading-none" style={accent ? { color: accent } : undefined}>{value}</div>
      {sub && <div className="mt-2 text-sm text-muted-foreground">{sub}</div>}
      {children}
    </div>
  );
  return href ? <Link href={href} className="block h-full rounded-lg focus-visible:ring-2 focus-visible:ring-ring">{body}</Link> : body;
}

export function KpiStrip({ kpis, alerts, isLoading, scopeQuery = '' }: { kpis?: Kpis; alerts?: AlertCounts; isLoading: boolean; scopeQuery?: string }) {
  const t = useTranslations('dashboard.kpi');
  const locale = useLocale();
  if (isLoading || !kpis) return <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2 laptop:grid-cols-3 wide:grid-cols-6">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[140px]" />)}</div>;
  const variance = (kpis.avgPhysicalProgressPct ?? 0) - (kpis.avgPlannedProgressPct ?? 0);
  const varianceText = Math.abs(variance) < 0.5 ? t('onPlan') : variance < 0 ? t('behind', { value: Math.abs(variance).toFixed(0) }) : t('ahead', { value: variance.toFixed(0) });
  const disbPct = kpis.budgetEtb ? (kpis.disbursedEtb / kpis.budgetEtb) * 100 : 0;
  const expOfDisb = kpis.disbursedEtb ? (kpis.expendedEtb / kpis.disbursedEtb) * 100 : 0;
  const decisions = alerts?.decisionRequired ?? 0;
  return (
    <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2 laptop:grid-cols-3 wide:grid-cols-6">
      <Tile icon={FolderKanban} label={t('activeProjects')} value={num(kpis.projectsActive, locale)} sub={<>{t('ofTotal', { total: kpis.projectsTotal })} · {t('completed', { count: kpis.projectsCompleted })}</>} href={`/projects?status=ACTIVE${scopeQuery}`} />
      <Tile icon={variance < -0.5 ? TrendingDown : TrendingUp} label={t('physicalProgress')} value={pct(kpis.avgPhysicalProgressPct)} sub={<span style={{ color: variance <= -5 ? toneVar.serious : undefined }}>{varianceText} · {t('planned', { value: (kpis.avgPlannedProgressPct ?? 0).toFixed(0) })}</span>}>
        <Progress value={kpis.avgPhysicalProgressPct ?? 0} planned={kpis.avgPlannedProgressPct} className="mt-3" label={t('physicalProgress')} />
      </Tile>
      <Tooltip>
        <TooltipTrigger asChild><div className="h-full"><Tile icon={Wallet} label={t('disbursed')} value={money(kpis.disbursedEtb, locale)} sub={<>{pct(disbPct)} {t('ofAllocated', { value: money(kpis.budgetEtb, locale) })}</>} href="/finance"><Progress value={disbPct} className="mt-3" tone="var(--seq-450)" label={t('disbursed')} /></Tile></div></TooltipTrigger>
        <TooltipContent>ETB {num(kpis.disbursedEtb, locale)} / {num(kpis.budgetEtb, locale)}</TooltipContent>
      </Tooltip>
      <Tile icon={Receipt} label={t('expended')} value={money(kpis.expendedEtb, locale)} sub={t('ofReleased', { value: expOfDisb.toFixed(0) })} href="/finance"><Progress value={expOfDisb} className="mt-3" tone="var(--seq-650)" label={t('expended')} /></Tile>
      <Tile icon={Building2} label={t('facilities')} value={<>{num(kpis.facilitiesRestored, locale)}<span className="text-lg text-muted-foreground font-normal"> / {num(kpis.facilitiesSevere, locale)}</span></>} sub={<>{t('ofDamaged', { value: kpis.facilitiesSevere })} · {t('replacementEstimate', { value: money(kpis.replacementEstimateEtb, locale) })}</>} href="/facilities?severity=SEVERE" />
      <Tile icon={decisions > 0 ? AlertOctagon : Activity} label={t('decisions')} value={num(decisions, locale)} accent={decisions > 0 ? toneVar.critical : toneVar.good} sub={<>{t('critical', { count: alerts?.critical ?? 0 })} · {t('openAlerts', { count: alerts?.open ?? 0 })}</>} href="/alerts?decisionRequired=true" />
    </div>
  );
}
