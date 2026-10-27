'use client';
import { useLocale, useTranslations } from 'next-intl';
import type { ProjectSummary } from '@/lib/api/types';
import { useRouter } from '@/i18n/navigation';
import { DataTable, type Column, type SortState } from '@/components/common/data-table';
import { HealthBadge, SectorDot, StatusBadge, ApprovalBadge } from '@/components/common/badges';
import { Progress } from '@/components/ui/progress';
import { fmtDate, localizedName, money, pct, ratio, signedPp } from '@/lib/format';
import { healthTone, toneVar } from '@/lib/domain';
import { RiskChip } from '@/components/projects/risk-score';

export function ProjectTable({ rows, sort, onSort, hideSector }: { rows: ProjectSummary[]; sort?: SortState; onSort?: (s: SortState) => void; hideSector?: boolean }) {
  const t = useTranslations('projects.columns');
  const tc = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const cols: Column<ProjectSummary>[] = [
    { key: 'name', header: t('name'), sortable: true, cell: (p) => <div className="min-w-[200px] max-w-[280px]"><div className="flex items-center gap-1.5 font-medium">{!hideSector && <SectorDot sector={p.sector} />}<span className="truncate">{p.name}</span></div><div className="truncate text-xs text-muted-foreground">{p.code} · {localizedName(p.wereda.name, locale)} · {p.contractorName ?? '—'}</div>{p.approvalStatus && p.approvalStatus !== 'APPROVED' && <div className="mt-1"><ApprovalBadge value={p.approvalStatus} /></div>}</div> },
    { key: 'status', header: t('status'), sortable: true, cell: (p) => <StatusBadge value={p.status} /> },
    { key: 'health', header: t('health'), sortable: true, cell: (p) => <HealthBadge value={p.health} /> },
    { key: 'riskScore', header: t('risk'), sortable: true, cell: (p) => <RiskChip score={p.riskScore} /> },
    { key: 'physicalProgressPct', header: t('progress'), sortable: true, cell: (p) => <div className="w-32"><div className="flex justify-between text-xs tabular"><span>{pct(p.physicalProgressPct)}</span><span className="text-muted-foreground">{pct(p.plannedProgressPct)}</span></div><Progress value={p.physicalProgressPct} planned={p.plannedProgressPct} tone={toneVar[healthTone[p.health]]} className="mt-1" label={p.name} /></div> },
    { key: 'scheduleVariancePp', header: t('variance'), sortable: true, align: 'right', cell: (p) => <span style={{ color: p.scheduleVariancePp <= -5 ? toneVar.serious : undefined }}>{signedPp(p.scheduleVariancePp)}</span> },
    { key: 'spi', header: t('spi'), align: 'right', className: 'hidden wide:table-cell', headerClassName: 'hidden wide:table-cell', cell: (p) => ratio(p.spi) },
    { key: 'cpi', header: t('cpi'), align: 'right', cell: (p) => <span style={{ color: p.cpi !== null && p.cpi < 0.9 ? toneVar.serious : undefined }}>{ratio(p.cpi)}</span> },
    { key: 'totalBudgetEtb', header: t('budget'), sortable: true, align: 'right', cell: (p) => <span>{money(p.totalBudgetEtb, locale)}<span className="block text-2xs text-muted-foreground">{t('disbursed')} {pct(p.totalBudgetEtb ? (p.disbursedEtb / p.totalBudgetEtb) * 100 : 0)}</span></span> },
    { key: 'plannedEnd', header: t('plannedEnd'), sortable: true, align: 'right', cell: (p) => <span>{fmtDate(p.plannedEnd, locale, 'short')}{p.forecastEnd && p.status === 'ACTIVE' && <span className="block text-2xs text-muted-foreground">{t('forecastEnd')} {fmtDate(p.forecastEnd, locale, 'short')}</span>}</span> },
    { key: 'lastProgressReportAt', header: t('lastReport'), sortable: true, align: 'right', cell: (p) => <span style={{ color: (p.daysSinceReport ?? 0) > 21 && p.status === 'ACTIVE' ? toneVar.critical : undefined }}>{p.daysSinceReport === null ? tc('never') : tc('daysAgo', { count: p.daysSinceReport })}</span> },
  ];
  return <DataTable columns={cols} rows={rows} rowKey={(p) => p.id} onRowClick={(p) => router.push(`/projects/${p.id}`)} sort={sort} onSort={onSort} dense />;
}
