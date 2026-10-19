'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useBreadcrumbs } from '@/components/layout/breadcrumbs';
import { PageHeader, Section } from '@/components/common/page-header';
import { useWeredaMetrics, useZones } from '@/lib/api/hooks';
import { useQueryParams } from '@/lib/use-query-params';
import { WeredaMap, type MapMetric } from '@/components/map/wereda-map';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DataTable, type Column } from '@/components/common/data-table';
import { DataState, TableSkeleton } from '@/components/common/data-state';
import type { WeredaMetrics } from '@/lib/api/types';
import { useRouter } from '@/i18n/navigation';
import { localizedName, money, num, pct } from '@/lib/format';
import { Skeleton } from '@/components/ui/skeleton';
import { toneVar } from '@/lib/domain';
import { useUser } from '@/providers/session';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { Globe2 } from 'lucide-react';

const METRICS: MapMetric[] = ['projectsDelayed', 'facilitiesSevere', 'avgProgressPct', 'openAlerts', 'budgetEtb', 'avgImpactScore'];

export default function GeographyPage() {
  const t = useTranslations('geo');
  const td = useTranslations('dashboard');
  const ts = useTranslations('scope');
  const tc = useTranslations('common');
  const locale = useLocale();
  const user = useUser();
  const router = useRouter();
  const { get, set } = useQueryParams();
  useBreadcrumbs([{ label: t('title') }]);
  const zoneId = get('zoneId') ? Number(get('zoneId')) : null;
  const [metric, setMetric] = React.useState<MapMetric>('projectsDelayed');
  const { data: zones } = useZones();
  const { data, isLoading, error, refetch } = useWeredaMetrics({ zoneId, sector: user.sectorScope });
  const [sort, setSort] = React.useState<{ field: string; dir: 'asc' | 'desc' }>({ field: 'projectsDelayed', dir: 'desc' });
  const rows = React.useMemo(() => [...(data ?? [])].sort((a, b) => { const k = sort.field as keyof WeredaMetrics; const av = a[k], bv = b[k]; const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(k === 'name' ? localizedName(a.name, locale) : av).localeCompare(String(k === 'name' ? localizedName(b.name, locale) : bv)); return sort.dir === 'asc' ? cmp : -cmp; }), [data, sort, locale]);
  const cols: Column<WeredaMetrics>[] = [
    { key: 'name', header: t('weredas'), sortable: true, cell: (w) => <div><div className="font-medium">{localizedName(w.name, locale)}</div><div className="text-2xs text-muted-foreground">{localizedName(w.zoneName, locale)} · {w.urban ? t('urban') : t('rural')} · {tc('population')} {num(w.population, locale)}</div></div> },
    { key: 'facilitiesTotal', header: t('facilitiesInWereda'), sortable: true, align: 'right', cell: (w) => <span>{w.facilitiesTotal}<span className="block text-2xs" style={{ color: w.facilitiesSevere ? toneVar.serious : undefined }}>{w.facilitiesSevere} {td('metric.facilitiesSevere').toLowerCase()}</span></span> },
    { key: 'avgImpactScore', header: td('metric.avgImpactScore'), sortable: true, align: 'right', cell: (w) => num(w.avgImpactScore, locale, 1) },
    { key: 'projectsTotal', header: t('projectsInWereda'), sortable: true, align: 'right', cell: (w) => <span>{w.projectsTotal}<span className="block text-2xs text-muted-foreground">{w.projectsActive} active · {w.projectsCompleted} done</span></span> },
    { key: 'projectsDelayed', header: td('metric.projectsDelayed'), sortable: true, align: 'right', cell: (w) => <span style={{ color: w.projectsDelayed ? toneVar.serious : undefined }} className="font-medium">{w.projectsDelayed}</span> },
    { key: 'avgProgressPct', header: td('metric.avgProgressPct'), sortable: true, align: 'right', cell: (w) => pct(w.avgProgressPct) },
    { key: 'budgetEtb', header: td('metric.budgetEtb'), sortable: true, align: 'right', cell: (w) => <span>{money(w.budgetEtb, locale)}<span className="block text-2xs text-muted-foreground">{td('released')} {pct(w.budgetEtb ? (w.disbursedEtb / w.budgetEtb) * 100 : 0)}</span></span> },
    { key: 'openAlerts', header: td('metric.openAlerts'), sortable: true, align: 'right', cell: (w) => <span style={{ color: w.criticalAlerts ? toneVar.critical : undefined }}>{w.openAlerts}{w.criticalAlerts ? ` (${w.criticalAlerts})` : ''}</span> },
  ];
  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} actions={<>
        <Button asChild variant="outline" size="sm"><Link href={`/map${zoneId ? `?zoneId=${zoneId}` : ''}`}><Globe2 />{td('openMap')}</Link></Button>
        <Select value={zoneId ? String(zoneId) : 'ALL'} onValueChange={(v) => set({ zoneId: v === 'ALL' ? null : v })}><SelectTrigger className="w-[180px]" aria-label={ts('zone')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">{ts('allZones')}</SelectItem>{zones?.map((z) => <SelectItem key={z.id} value={String(z.id)}>{localizedName(z.name, locale)} ({z.weredaCount})</SelectItem>)}</SelectContent></Select>
        <Select value={metric} onValueChange={(v) => setMetric(v as MapMetric)}><SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger><SelectContent>{METRICS.map((m) => <SelectItem key={m} value={m}>{td(`metric.${m}`)}</SelectItem>)}</SelectContent></Select>
      </>} />
      <Section title={td('map')} hint={td('mapHint')}>{isLoading || !data ? <Skeleton className="h-[460px]" /> : <WeredaMap weredas={data} metric={metric} height={460} />}</Section>
      <Section title={t('weredas')}>
        <DataState isLoading={isLoading} error={error} onRetry={refetch} isEmpty={!rows.length} skeleton={<TableSkeleton cols={8} rows={10} />}>
          <DataTable columns={cols} rows={rows} rowKey={(w) => w.id} onRowClick={(w) => router.push(`/weredas/${w.id}`)} sort={sort} onSort={setSort} dense caption={t('weredas')} />
        </DataState>
      </Section>
    </>
  );
}
