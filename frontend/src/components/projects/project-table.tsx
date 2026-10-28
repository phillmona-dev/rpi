'use client';
import { useLocale, useTranslations } from 'next-intl';
import type { ProjectSummary } from '@/lib/api/types';
import { useRouter } from '@/i18n/navigation';
import { DataTable, type Column, type SortState } from '@/components/common/data-table';
import { HealthBadge, SectorDot, StatusBadge, ApprovalBadge } from '@/components/common/badges';
import { Progress } from '@/components/ui/progress';
import { useProgressPhrase } from '@/components/dashboard/kpi-strip';
import { fmtDate, localizedName, money, pct } from '@/lib/format';
import { healthTone, toneVar } from '@/lib/domain';

/** Six plain columns: what and where, how it is going, work done, money, expected finish, last report. */
export function ProjectTable({ rows, sort, onSort, hideSector }: { rows: ProjectSummary[]; sort?: SortState; onSort?: (s: SortState) => void; hideSector?: boolean }) {
  const t = useTranslations('projects.columns');
  const tc = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const phrase = useProgressPhrase();
  const cols: Column<ProjectSummary>[] = [
    { key: 'name', header: t('name'), sortable: true, cell: (p) => (
      <div className="min-w-[220px] max-w-[320px]">
        <div className="flex items-center gap-1.5 font-medium">{!hideSector && <SectorDot sector={p.sector} />}<span className="truncate">{p.name}</span></div>
        <div className="truncate text-sm text-muted-foreground">{localizedName(p.wereda.name, locale)}{p.contractorName ? ` · ${p.contractorName}` : ''}</div>
        {(p.approvalStatus && p.approvalStatus !== 'APPROVED') ? <div className="mt-1"><ApprovalBadge value={p.approvalStatus} /></div>
          : p.status !== 'ACTIVE' && <div className="mt-1"><StatusBadge value={p.status} /></div>}
      </div>) },
    { key: 'health', header: t('health'), sortable: true, cell: (p) => (
      <div className="min-w-[140px]"><HealthBadge value={p.health} />
        {p.status === 'ACTIVE' && <div className="mt-1 text-sm" style={{ color: p.scheduleVariancePp <= -5 ? toneVar.serious : undefined }}>{phrase(p.physicalProgressPct, p.plannedProgressPct)}</div>}
      </div>) },
    { key: 'physicalProgressPct', header: t('progress'), sortable: true, cell: (p) => (
      <div className="w-32"><div className="text-sm font-medium tabular">{pct(p.physicalProgressPct)}</div>
        <Progress value={p.physicalProgressPct} planned={p.plannedProgressPct} tone={toneVar[healthTone[p.health]]} className="mt-1" label={p.name} /></div>) },
    { key: 'totalBudgetEtb', header: t('budget'), sortable: true, align: 'right', cell: (p) => (
      <span className="whitespace-nowrap">{money(p.totalBudgetEtb, locale)}<span className="block text-sm text-muted-foreground">{t('releasedPct', { pct: pct(p.totalBudgetEtb ? (p.disbursedEtb / p.totalBudgetEtb) * 100 : 0) })}</span></span>) },
    { key: 'plannedEnd', header: t('plannedEnd'), sortable: true, align: 'right', cell: (p) => {
      const expected = p.status === 'ACTIVE' && p.forecastEnd ? p.forecastEnd : p.plannedEnd;
      const late = p.status === 'ACTIVE' && p.forecastEnd && p.forecastEnd > (p.revisedEnd ?? p.plannedEnd);
      return <span className="whitespace-nowrap" style={{ color: late ? toneVar.serious : undefined }}>{fmtDate(expected, locale, 'short')}
        {late && <span className="block text-sm text-muted-foreground">{t('wasPlanned', { date: fmtDate(p.revisedEnd ?? p.plannedEnd, locale, 'short') })}</span>}</span>;
    } },
    { key: 'lastProgressReportAt', header: t('lastReport'), sortable: true, align: 'right', cell: (p) => <span className="whitespace-nowrap" style={{ color: (p.daysSinceReport ?? 0) > 21 && p.status === 'ACTIVE' ? toneVar.critical : undefined }}>{p.daysSinceReport === null ? tc('never') : tc('daysAgo', { count: p.daysSinceReport })}</span> },
  ];
  return <DataTable columns={cols} rows={rows} rowKey={(p) => p.id} onRowClick={(p) => router.push(`/projects/${p.id}`)} sort={sort} onSort={onSort} />;
}
