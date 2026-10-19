'use client';
import { useLocale, useTranslations } from 'next-intl';
import { PageHeader } from '@/components/common/page-header';
import { useBreadcrumbs } from '@/components/layout/breadcrumbs';
import { useAssessments } from '@/lib/api/hooks';
import { useQueryParams } from '@/lib/use-query-params';
import { DataState, TableSkeleton } from '@/components/common/data-state';
import { DataTable, Pagination, type Column } from '@/components/common/data-table';
import { SectorDot, SeverityBadge } from '@/components/common/badges';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { AssessmentSummary } from '@/lib/api/types';
import { SECTORS } from '@/lib/api/types';
import { useRouter } from '@/i18n/navigation';
import { fmtDate, localizedName, money } from '@/lib/format';
import { useUser } from '@/providers/session';

export default function DamagePage() {
  const t = useTranslations('damage');
  const tc = useTranslations('common');
  const te = useTranslations('enums');
  const tf = useTranslations('facilities.filters');
  const locale = useLocale();
  const router = useRouter();
  const user = useUser();
  const { get, set } = useQueryParams();
  useBreadcrumbs([{ label: t('title') }]);
  const page = Number(get('page') ?? 0), size = Number(get('size') ?? 25);
  const { data, isLoading, error, refetch } = useAssessments({ page, size, sort: 'assessedOn,desc', sector: user.sectorScope ?? get('sector'), severity: get('severity'), zoneId: get('zoneId'), weredaId: get('weredaId') });
  const cols: Column<AssessmentSummary>[] = [
    { key: 'date', header: t('columns.date'), cell: (a) => <span className="tabular">{fmtDate(a.assessedOn, locale, 'short')}</span> },
    { key: 'facility', header: t('columns.facility'), cell: (a) => <div><div className="flex items-center gap-1.5 font-medium"><SectorDot sector={a.facility.sector} />{a.facility.name}</div><div className="text-2xs text-muted-foreground">{te(`facilityType.${a.facility.facilityType}` as 'facilityType.FACTORY')} · {localizedName(a.facility.wereda.name, locale)}</div></div> },
    { key: 'severity', header: t('columns.severity'), cell: (a) => <SeverityBadge value={a.severity} /> },
    { key: 'impact', header: t('columns.impact'), align: 'right', cell: (a) => <span className="tabular font-medium">{a.structuralImpactScore}</span> },
    { key: 'replacement', header: t('columns.replacement'), align: 'right', cell: (a) => money(a.estimatedReplacementCostEtb, locale) },
    { key: 'assessor', header: t('columns.assessor'), cell: (a) => a.assessorName },
    { key: 'source', header: t('columns.source'), cell: (a) => <span className="text-xs text-muted-foreground">{te(`source.${a.source}`)}{a.photoCount ? ` · ${a.photoCount} 📷` : ''}</span> },
  ];
  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} actions={<>
        {!user.sectorScope && <Select value={get('sector') ?? 'ALL'} onValueChange={(v) => set({ sector: v === 'ALL' ? null : v })}><SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">{tc('all')}</SelectItem>{SECTORS.map((s) => <SelectItem key={s} value={s}>{te(`sector.${s}`)}</SelectItem>)}</SelectContent></Select>}
        <Select value={get('severity') ?? 'ALL'} onValueChange={(v) => set({ severity: v === 'ALL' ? null : v })}><SelectTrigger className="w-[180px]" aria-label={tf('severity')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">{tf('severity')}: {tc('all')}</SelectItem>{['DESTROYED', 'SEVERE', 'MODERATE', 'MINOR', 'NONE'].map((s) => <SelectItem key={s} value={s}>{te(`severity.${s}` as 'severity.SEVERE')}</SelectItem>)}</SelectContent></Select>
      </>} />
      <div className="rounded-lg border bg-card shadow-card">
        <DataState isLoading={isLoading} error={error} onRetry={refetch} isEmpty={!data?.content.length} skeleton={<div className="p-4"><TableSkeleton cols={7} rows={10} /></div>} className="p-4">
          <DataTable columns={cols} rows={data?.content ?? []} rowKey={(a) => a.id} onRowClick={(a) => router.push(`/facilities/${a.facility.id}`)} dense />
          {data && <Pagination page={data.page} totalPages={data.totalPages} totalElements={data.totalElements} size={data.size} onPage={(p) => set({ page: String(p) }, false)} onSize={(s) => set({ size: String(s) })} />}
        </DataState>
      </div>
    </>
  );
}
