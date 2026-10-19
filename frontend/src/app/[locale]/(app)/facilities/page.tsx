'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { useBreadcrumbs } from '@/components/layout/breadcrumbs';
import { useFacilities, useZones } from '@/lib/api/hooks';
import { useQueryParams } from '@/lib/use-query-params';
import { FacilityTable } from '@/components/facilities/facility-table';
import { DataState, TableSkeleton } from '@/components/common/data-state';
import { Pagination } from '@/components/common/data-table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { SECTORS } from '@/lib/api/types';
import { localizedName } from '@/lib/format';
import { useUser } from '@/providers/session';

const TYPES = ['PRIMARY_SCHOOL', 'SECONDARY_SCHOOL', 'TVET_COLLEGE', 'UNIVERSITY', 'HEALTH_POST', 'HEALTH_CENTER', 'PRIMARY_HOSPITAL', 'GENERAL_HOSPITAL', 'REFERRAL_HOSPITAL', 'FACTORY', 'INDUSTRIAL_PARK', 'AGRO_PROCESSING_PLANT', 'WAREHOUSE', 'IRRIGATION_SCHEME', 'VETERINARY_CLINIC', 'SEED_MULTIPLICATION_CENTER', 'FARMERS_TRAINING_CENTER', 'AGRICULTURAL_RESEARCH_CENTER'];
const SEV = ['DESTROYED', 'SEVERE', 'MODERATE', 'MINOR', 'NONE'];
const OPS = ['NON_FUNCTIONAL', 'PARTIALLY_FUNCTIONAL', 'FUNCTIONAL'];

export default function FacilitiesPage() {
  const t = useTranslations('facilities');
  const tc = useTranslations('common');
  const te = useTranslations('enums');
  const locale = useLocale();
  const user = useUser();
  const { get, set } = useQueryParams();
  useBreadcrumbs([{ label: t('title') }]);
  const { data: zones } = useZones();
  const [q, setQ] = React.useState(get('q') ?? '');
  React.useEffect(() => { const id = setTimeout(() => { if ((get('q') ?? '') !== q) set({ q: q || null }); }, 350); return () => clearTimeout(id); }, [q, get, set]);
  const page = Number(get('page') ?? 0), size = Number(get('size') ?? 25);
  const sortField = get('sort') ?? 'name', sortDir = (get('dir') ?? 'asc') as 'asc' | 'desc';
  const query = { page, size, sort: `${sortField},${sortDir}`, q: get('q'), sector: user.sectorScope ?? get('sector'), type: get('type'), zoneId: get('zoneId'), weredaId: get('weredaId'), severity: get('severity'), status: get('status') };
  const { data, isLoading, error, refetch } = useFacilities(query);
  const sel = (k: string, label: string, opts: string[], ns: string, w = 'w-[170px]') => (
    <Select value={get(k) ?? 'ALL'} onValueChange={(v) => set({ [k]: v === 'ALL' ? null : v })}><SelectTrigger className={w} aria-label={label}><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="ALL">{label}: {tc('all')}</SelectItem>{opts.map((o) => <SelectItem key={o} value={o}>{te(`${ns}.${o}` as 'severity.SEVERE')}</SelectItem>)}</SelectContent></Select>
  );
  const hasAny = ['q', 'sector', 'type', 'zoneId', 'severity', 'status', 'weredaId'].some((k) => get(k));
  return (
    <>
      <PageHeader title={t('title')} subtitle={data ? t('count', { count: data.totalElements }) : t('subtitle')} />
      <div className="flex flex-wrap items-center gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('filters.search')} className="w-[240px]" aria-label={t('filters.search')} />
        {!user.sectorScope && sel('sector', t('columns.sector'), SECTORS, 'sector', 'w-[150px]')}
        {sel('type', t('filters.type'), TYPES, 'facilityType', 'w-[210px]')}
        <Select value={get('zoneId') ?? 'ALL'} onValueChange={(v) => set({ zoneId: v === 'ALL' ? null : v })}><SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">{te('entityType.WEREDA')}: {tc('all')}</SelectItem>{zones?.map((z) => <SelectItem key={z.id} value={String(z.id)}>{localizedName(z.name, locale)}</SelectItem>)}</SelectContent></Select>
        {sel('severity', t('filters.severity'), SEV, 'severity')}
        {sel('status', t('filters.status'), OPS, 'operational', 'w-[200px]')}
        {hasAny && <Button variant="ghost" size="sm" onClick={() => { setQ(''); set({ q: null, sector: null, type: null, zoneId: null, severity: null, status: null, weredaId: null }); }}><X />{tc('clearFilters')}</Button>}
      </div>
      <div className="rounded-lg border bg-card shadow-card">
        <DataState isLoading={isLoading} error={error} onRetry={refetch} isEmpty={!data?.content.length} emptyTitle={tc('noResults')} skeleton={<div className="p-4"><TableSkeleton cols={8} rows={10} /></div>} className="p-4">
          <FacilityTable rows={data?.content ?? []} sort={{ field: sortField, dir: sortDir }} onSort={(s) => set({ sort: s.field, dir: s.dir })} />
          {data && <Pagination page={data.page} totalPages={data.totalPages} totalElements={data.totalElements} size={data.size} onPage={(p) => set({ page: String(p) }, false)} onSize={(s) => set({ size: String(s) })} />}
        </DataState>
      </div>
    </>
  );
}
