'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { useBreadcrumbs } from '@/components/layout/breadcrumbs';
import { PageHeader, Section } from '@/components/common/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { useInspections, useMedia, useZones } from '@/lib/api/hooks';
import { useQueryParams } from '@/lib/use-query-params';
import { useUser } from '@/providers/session';
import { InspectionTable } from '@/components/evidence/inspection-table';
import { InspectionDrawer } from '@/components/evidence/inspection-drawer';
import { EvidenceGallery } from '@/components/evidence/evidence-gallery';
import { DataState, TableSkeleton } from '@/components/common/data-state';
import { Pagination } from '@/components/common/data-table';
import { SECTORS, type Sector } from '@/lib/api/types';
import { localizedName } from '@/lib/format';

const TYPES = ['SITE_VISIT', 'PROGRESS_VERIFICATION', 'QUALITY_INSPECTION', 'DAMAGE_VERIFICATION', 'HANDOVER_INSPECTION', 'SAFETY_AUDIT'];
const STATUSES = ['UNVERIFIED', 'VERIFIED', 'DISPUTED', 'REJECTED'];

export default function EvidencePage() {
  const t = useTranslations('evidence');
  const tc = useTranslations('common');
  const ts = useTranslations('scope');
  const te = useTranslations('enums');
  const locale = useLocale();
  const user = useUser();
  const { get, set } = useQueryParams();
  useBreadcrumbs([{ label: t('title') }]);
  const sector = (user.sectorScope ?? get('sector')) as Sector | null;
  const zoneId = get('zoneId') ? Number(get('zoneId')) : null;
  const tab = get('tab') ?? 'inspections';
  const page = Number(get('page') ?? 0), size = Number(get('size') ?? 25);
  const sortField = get('sort') ?? 'visitedOn', sortDir = (get('dir') ?? 'desc') as 'asc' | 'desc';
  const [open, setOpen] = React.useState<number | null>(get('inspection') ? Number(get('inspection')) : null);
  React.useEffect(() => { const i = get('inspection'); if (i) setOpen(Number(i)); }, [get]);
  const { data, isLoading, error, refetch } = useInspections({ page, size, sort: `${sortField},${sortDir}`, sector, zoneId, type: get('type'), status: get('status') });
  const { data: media, isLoading: ml, error: me, refetch: mr } = useMedia({ page, size: 24, sector, weredaId: get('weredaId'), kind: get('kind'), status: get('status'), geotagged: get('geotagged') === 'true' ? true : undefined }, tab === 'gallery');
  const { data: zones } = useZones();
  const sel = (k: string, label: string, opts: string[], ns: string, w = 'w-[190px]') => (
    <Select value={get(k) ?? 'ALL'} onValueChange={(v) => set({ [k]: v === 'ALL' ? null : v })}><SelectTrigger className={w} aria-label={label}><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="ALL">{label}: {tc('all')}</SelectItem>{opts.map((o) => <SelectItem key={o} value={o}>{te(`${ns}.${o}` as 'verification.VERIFIED')}</SelectItem>)}</SelectContent></Select>
  );
  const hasAny = ['sector', 'zoneId', 'type', 'status', 'kind', 'geotagged'].some((k) => get(k));
  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <div className="flex flex-wrap items-center gap-2">
        {!user.sectorScope && sel('sector', t('filters.sector'), SECTORS, 'sector', 'w-[160px]')}
        <Select value={zoneId ? String(zoneId) : 'ALL'} onValueChange={(v) => set({ zoneId: v === 'ALL' ? null : v })}><SelectTrigger className="w-[160px]" aria-label={ts('zone')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">{ts('zone')}: {tc('all')}</SelectItem>{zones?.map((z) => <SelectItem key={z.id} value={String(z.id)}>{localizedName(z.name, locale)}</SelectItem>)}</SelectContent></Select>
        {tab === 'inspections' && sel('type', t('filters.type'), TYPES, 'inspectionType', 'w-[220px]')}
        {sel('status', t('filters.status'), STATUSES, 'verification')}
        {tab === 'gallery' && <Select value={get('kind') ?? 'ALL'} onValueChange={(v) => set({ kind: v === 'ALL' ? null : v })}><SelectTrigger className="w-[170px]" aria-label={t('filters.kind')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">{t('filters.kind')}: {tc('all')}</SelectItem>{(['PHOTO', 'VIDEO', 'AUDIO', 'DOCUMENT'] as const).map((o) => <SelectItem key={o} value={o}>{t(`kind.${o}`)}</SelectItem>)}</SelectContent></Select>}
        {tab === 'gallery' && <label className="inline-flex items-center gap-2 text-sm"><Switch checked={get('geotagged') === 'true'} onCheckedChange={(v) => set({ geotagged: v ? 'true' : null })} />{t('filters.geotagged')}</label>}
        {hasAny && <Button variant="ghost" size="sm" onClick={() => set({ sector: null, zoneId: null, type: null, status: null, kind: null, geotagged: null })}><X />{tc('clearFilters')}</Button>}
      </div>
      <Tabs value={tab} onValueChange={(v) => set({ tab: v, page: null })}>
        <TabsList aria-label={t('title')}><TabsTrigger value="inspections">{t('inspections')}</TabsTrigger><TabsTrigger value="gallery">{t('gallery')}</TabsTrigger></TabsList>
        <TabsContent value="inspections">
          <div className="rounded-lg border bg-card shadow-card">
            <DataState isLoading={isLoading} error={error} onRetry={refetch} isEmpty={!data?.content.length} emptyTitle={t('empty')} skeleton={<div className="p-4"><TableSkeleton cols={6} rows={10} /></div>} className="p-4">
              <InspectionTable rows={data?.content ?? []} onOpen={(i) => setOpen(i.id)} sort={{ field: sortField, dir: sortDir }} onSort={(s) => set({ sort: s.field, dir: s.dir })} />
              {data && <Pagination page={data.page} totalPages={data.totalPages} totalElements={data.totalElements} size={data.size} onPage={(p) => set({ page: String(p) }, false)} onSize={(s) => set({ size: String(s) })} />}
            </DataState>
          </div>
        </TabsContent>
        <TabsContent value="gallery">
          <Section id="gallery" title={t('gallery')} hint={t('galleryHint')}>
            <EvidenceGallery items={media?.content} isLoading={ml} error={me} onRetry={mr} showSubject demoNote />
            {media && <Pagination page={media.page} totalPages={media.totalPages} totalElements={media.totalElements} size={media.size} onPage={(p) => set({ page: String(p) }, false)} />}
          </Section>
        </TabsContent>
      </Tabs>
      <InspectionDrawer id={open} onClose={() => { setOpen(null); if (get('inspection')) set({ inspection: null }, false); }} />
    </>
  );
}
