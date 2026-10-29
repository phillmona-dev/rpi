'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronDown, Search, X } from 'lucide-react';
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
import { cn } from '@/lib/utils';

const TYPES = ['PRIMARY_SCHOOL', 'SECONDARY_SCHOOL', 'TVET_COLLEGE', 'UNIVERSITY', 'HEALTH_POST', 'HEALTH_CENTER', 'PRIMARY_HOSPITAL', 'GENERAL_HOSPITAL', 'REFERRAL_HOSPITAL', 'FACTORY', 'INDUSTRIAL_PARK', 'AGRO_PROCESSING_PLANT', 'WAREHOUSE', 'IRRIGATION_SCHEME', 'VETERINARY_CLINIC', 'SEED_MULTIPLICATION_CENTER', 'FARMERS_TRAINING_CENTER', 'AGRICULTURAL_RESEARCH_CENTER'];
const SEV = ['DESTROYED', 'SEVERE', 'MODERATE', 'MINOR', 'NONE'];
const OPS = ['NON_FUNCTIONAL', 'PARTIALLY_FUNCTIONAL', 'FUNCTIONAL'];

/** One-click views; each is a plain combination of the damage and working-status filters. */
const QUICK: { key: string; severity: string | null; status: string | null }[] = [
  { key: 'all', severity: null, status: null },
  { key: 'destroyed', severity: 'DESTROYED', status: null },
  { key: 'heavy', severity: 'SEVERE', status: null },
  { key: 'notWorking', severity: null, status: 'NON_FUNCTIONAL' },
];

export default function FacilitiesPage() {
  const t = useTranslations('facilities');
  const tc = useTranslations('common');
  const te = useTranslations('enums');
  const ts = useTranslations('scope');
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
  const quick = QUICK.find((x) => x.severity === get('severity') && x.status === get('status'))?.key ?? null;
  const [more, setMore] = React.useState(Boolean(get('type') || (quick === null && (get('severity') || get('status')))));
  const sel = (k: string, label: string, opts: string[], ns: string, w = 'w-[190px]') => (
    <Select value={get(k) ?? 'ALL'} onValueChange={(v) => set({ [k]: v === 'ALL' ? null : v, page: null })}><SelectTrigger className={w} aria-label={label}><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="ALL">{label}: {tc('all')}</SelectItem>{opts.map((o) => <SelectItem key={o} value={o}>{te(`${ns}.${o}` as 'severity.SEVERE')}</SelectItem>)}</SelectContent></Select>
  );
  const hasAny = ['q', 'sector', 'type', 'zoneId', 'severity', 'status', 'weredaId'].some((k) => get(k));
  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <div className="space-y-3">
        <div role="radiogroup" aria-label={t('filters.show')} className="flex flex-wrap gap-2">
          {QUICK.map((x) => (
            <button key={x.key} type="button" role="radio" aria-checked={quick === x.key} onClick={() => set({ severity: x.severity, status: x.status, page: null })}
              className={cn('rounded-full border px-4 py-1.5 text-sm font-medium transition-colors', quick === x.key ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted/50')}>
              {t(`filters.quick.${x.key}`)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full tablet:w-72"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('filters.search')} className="pl-9" aria-label={t('filters.search')} /></div>
          {!user.sectorScope && sel('sector', t('columns.sector'), SECTORS, 'sector', 'w-[170px]')}
          <Select value={get('zoneId') ?? 'ALL'} onValueChange={(v) => set({ zoneId: v === 'ALL' ? null : v, page: null })}><SelectTrigger className="w-[170px]" aria-label={ts('zone')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">{ts('zone')}: {tc('all')}</SelectItem>{zones?.map((z) => <SelectItem key={z.id} value={String(z.id)}>{localizedName(z.name, locale)}</SelectItem>)}</SelectContent></Select>
          <Button variant="ghost" size="sm" onClick={() => setMore((m) => !m)} aria-expanded={more}><ChevronDown className={cn('transition-transform', more && 'rotate-180')} />{t('filters.more')}</Button>
          {hasAny && <Button variant="ghost" size="sm" onClick={() => { setQ(''); set({ q: null, sector: null, type: null, zoneId: null, severity: null, status: null, weredaId: null }); }}><X />{tc('clearFilters')}</Button>}
        </div>
        {more && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed p-3">
            {sel('type', t('filters.type'), TYPES, 'facilityType', 'w-[230px]')}
            {sel('severity', t('filters.severity'), SEV, 'severity')}
            {sel('status', t('filters.status'), OPS, 'operational', 'w-[210px]')}
          </div>
        )}
      </div>
      {data && <p className="text-sm text-muted-foreground" role="status">{t('count', { count: data.totalElements })}</p>}
      <div className="rounded-lg border bg-card shadow-card">
        <DataState isLoading={isLoading} error={error} onRetry={refetch} isEmpty={!data?.content.length} emptyTitle={tc('noResults')} skeleton={<div className="p-4"><TableSkeleton cols={6} rows={10} /></div>} className="p-4">
          <FacilityTable rows={data?.content ?? []} sort={{ field: sortField, dir: sortDir }} onSort={(s) => set({ sort: s.field, dir: s.dir })} />
          {data && <Pagination page={data.page} totalPages={data.totalPages} totalElements={data.totalElements} size={data.size} onPage={(p) => set({ page: String(p) }, false)} onSize={(s) => set({ size: String(s) })} />}
        </DataState>
      </div>
    </>
  );
}
