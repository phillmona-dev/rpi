'use client';
import { useLocale, useTranslations } from 'next-intl';
import type { FacilitySummary } from '@/lib/api/types';
import { useRouter } from '@/i18n/navigation';
import { DataTable, type Column, type SortState } from '@/components/common/data-table';
import { OperationalBadge, SectorDot, SeverityBadge } from '@/components/common/badges';
import { fmtDate, localizedName, money, num } from '@/lib/format';

export function FacilityTable({ rows, sort, onSort }: { rows: FacilitySummary[]; sort?: SortState; onSort?: (s: SortState) => void }) {
  const t = useTranslations('facilities.columns');
  const te = useTranslations('enums.facilityType');
  const locale = useLocale();
  const router = useRouter();
  const cols: Column<FacilitySummary>[] = [
    { key: 'name', header: t('name'), sortable: true, cell: (f) => <div className="min-w-[220px]"><div className="flex items-center gap-1.5 font-medium"><SectorDot sector={f.sector} /><span className="truncate max-w-[340px]">{f.name}</span></div><div className="text-2xs text-muted-foreground">{f.code} · {te(f.facilityType as 'FACTORY')} · {localizedName(f.wereda.name, locale)}</div></div> },
    { key: 'latestSeverity', header: t('severity'), sortable: true, cell: (f) => <SeverityBadge value={f.latestSeverity} /> },
    { key: 'impact', header: t('impact'), align: 'right', cell: (f) => <span className="tabular font-medium">{f.latestImpactScore ?? '—'}<span className="text-muted-foreground font-normal">/100</span></span> },
    { key: 'operationalStatus', header: t('status'), sortable: true, cell: (f) => <OperationalBadge value={f.operationalStatus} /> },
    { key: 'capacity', header: t('capacity'), align: 'right', cell: (f) => f.preCrisisCapacity ? `${num(f.preCrisisCapacity, locale)} ${f.capacityUnit ?? ''}` : '—' },
    { key: 'replacementEstimateEtb', header: t('replacement'), sortable: true, align: 'right', cell: (f) => money(f.replacementEstimateEtb, locale) },
    { key: 'assessed', header: t('assessed'), align: 'right', cell: (f) => fmtDate(f.lastAssessedOn, locale, 'short') },
    { key: 'projects', header: t('projects'), align: 'center', cell: (f) => <span className="tabular">{f.linkedProjects}</span> },
  ];
  return <DataTable columns={cols} rows={rows} rowKey={(f) => f.id} onRowClick={(f) => router.push(`/facilities/${f.id}`)} sort={sort} onSort={onSort} dense />;
}
