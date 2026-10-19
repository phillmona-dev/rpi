'use client';
import { useLocale, useTranslations } from 'next-intl';
import type { ProjectSummary } from '@/lib/api/types';
import { useRouter } from '@/i18n/navigation';
import { DataTable, type Column } from '@/components/common/data-table';
import { HealthBadge, SectorDot } from '@/components/common/badges';
import { Progress } from '@/components/ui/progress';
import { fmtDate, localizedName, money, pct, signedPp } from '@/lib/format';
import { toneVar, healthTone } from '@/lib/domain';
import { DataState, TableSkeleton } from '@/components/common/data-state';

export function AttentionTable({ projects, isLoading, error, refetch }: { projects?: ProjectSummary[]; isLoading: boolean; error?: unknown; refetch: () => void }) {
  const t = useTranslations('projects.columns');
  const td = useTranslations('dashboard');
  const tc = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const cols: Column<ProjectSummary>[] = [
    { key: 'name', header: t('name'), cell: (p) => <div className="min-w-[220px]"><div className="flex items-center gap-1.5 font-medium"><SectorDot sector={p.sector} /><span className="truncate max-w-[320px]">{p.name}</span></div><div className="text-2xs text-muted-foreground">{p.code} · {localizedName(p.wereda.name, locale)}</div></div> },
    { key: 'health', header: t('health'), cell: (p) => <HealthBadge value={p.health} /> },
    { key: 'progress', header: t('progress'), cell: (p) => <div className="w-36"><div className="flex justify-between text-xs tabular"><span>{pct(p.physicalProgressPct)}</span><span className="text-muted-foreground">{pct(p.plannedProgressPct)}</span></div><Progress value={p.physicalProgressPct} planned={p.plannedProgressPct} tone={toneVar[healthTone[p.health]]} className="mt-1" label={p.name} /></div> },
    { key: 'variance', header: t('variance'), align: 'right', cell: (p) => <span className="font-medium" style={{ color: p.scheduleVariancePp <= -5 ? toneVar.serious : undefined }}>{signedPp(p.scheduleVariancePp)}</span> },
    { key: 'lastReport', header: t('lastReport'), align: 'right', cell: (p) => <span style={{ color: (p.daysSinceReport ?? 0) > 21 ? toneVar.critical : undefined }}>{p.daysSinceReport === null ? tc('never') : tc('daysAgo', { count: p.daysSinceReport })}</span> },
    { key: 'forecastEnd', header: t('forecastEnd'), align: 'right', cell: (p) => <span>{fmtDate(p.forecastEnd, locale, 'short')}<span className="block text-2xs text-muted-foreground">{t('plannedEnd')} {fmtDate(p.plannedEnd, locale, 'short')}</span></span> },
    { key: 'budget', header: t('budget'), align: 'right', cell: (p) => money(p.totalBudgetEtb, locale) },
  ];
  return (
    <DataState isLoading={isLoading} error={error} onRetry={refetch} isEmpty={!projects?.length} emptyTitle={td('attentionEmpty')} skeleton={<TableSkeleton cols={6} />}>
      <DataTable columns={cols} rows={projects ?? []} rowKey={(p) => p.id} onRowClick={(p) => router.push(`/projects/${p.id}`)} dense caption={td('attentionTable')} />
    </DataState>
  );
}
