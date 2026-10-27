'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { useRouter, usePathname, Link } from '@/i18n/navigation';
import { useBriefing, useOverview, useZones } from '@/lib/api/hooks';
import { SignalStrip } from '@/components/intelligence/signal-strip';
import { ActionCards } from '@/components/intelligence/action-cards';
import { Globe2, BrainCircuit } from 'lucide-react';
import { useUser } from '@/providers/session';
import { canSeeIntelligence } from '@/lib/domain';
import { SECTORS, type Sector } from '@/lib/api/types';
import { PageHeader, Section } from '@/components/common/page-header';
import { KpiStrip } from '@/components/dashboard/kpi-strip';
import { DecisionQueue } from '@/components/dashboard/decision-queue';
import { SectorCards } from '@/components/dashboard/sector-cards';
import { WeredaHeatTable } from '@/components/dashboard/wereda-heat-table';
import { LiveStream } from '@/components/dashboard/live-stream';
import { AttentionTable } from '@/components/dashboard/attention-table';
import { WeredaMap, type MapMetric } from '@/components/map/wereda-map';
import { ChartCard } from '@/components/charts/chart-card';
import { ProgressCurve } from '@/components/charts/progress-curve';
import { BudgetBars } from '@/components/charts/budget-bars';
import { Donut } from '@/components/charts/donut';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FreshnessChip } from '@/components/common/freshness';
import { fmtDateTime, localizedName, money, relTime } from '@/lib/format';
import { toneVar } from '@/lib/domain';
import { ChartSkeleton, DataState } from '@/components/common/data-state';
import { Skeleton } from '@/components/ui/skeleton';

const VIEWS = ['overview', 'map', 'finance', 'activity'] as const;
type View = (typeof VIEWS)[number];
const METRICS: MapMetric[] = ['projectsDelayed', 'facilitiesSevere', 'avgProgressPct', 'openAlerts', 'budgetEtb', 'avgImpactScore'];

export default function CommandCenterPage() {
  const t = useTranslations('dashboard');
  const tc = useTranslations('common');
  const ts = useTranslations('scope');
  const te = useTranslations('enums.sector');
  const tst = useTranslations('enums.status');
  const tf = useTranslations('enums.funding');
  const locale = useLocale();
  const user = useUser();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const sector = (user.sectorScope ?? (params.get('sector') as Sector | null)) || null;
  const zoneId = params.get('zoneId') ? Number(params.get('zoneId')) : null;
  const [metric, setMetric] = React.useState<MapMetric>('projectsDelayed');
  const scope = { sector, zoneId };
  const intel = canSeeIntelligence(user.roles);
  const { data, isLoading, error, refetch, isFetching, dataUpdatedAt } = useOverview(scope);
  const { data: brief, isLoading: bl, error: be, refetch: br } = useBriefing(scope, intel);
  const { data: zones } = useZones();

  const setParam = (k: string, v: string | null) => { const p = new URLSearchParams(params.toString()); if (v) p.set(k, v); else p.delete(k); router.replace(`${pathname}?${p.toString()}` as '/'); };
  const scopeQuery = `${sector ? `&sector=${sector}` : ''}${zoneId ? `&zoneId=${zoneId}` : ''}`;

  const trend = data?.trend.map((p) => ({ date: p.period, planned: p.plannedPct, actual: p.actualPct })) ?? [];
  const budget = data?.budgetBySector.map((b) => ({ label: te(b.key as Sector), allocated: b.budgetEtb, disbursed: b.disbursedEtb, spent: b.expendedEtb })) ?? [];
  const sc = data?.statusCounts;
  const statusSlices = sc ? [
    { key: 'ACTIVE', label: tst('ACTIVE'), value: sc.active, color: 'var(--seq-450)' }, { key: 'COMPLETED', label: tst('COMPLETED'), value: sc.completed, color: toneVar.good },
    { key: 'PROCUREMENT', label: tst('PROCUREMENT'), value: sc.procurement, color: 'var(--seq-250)' }, { key: 'PLANNED', label: tst('PLANNED'), value: sc.planned, color: toneVar.neutral },
    { key: 'SUSPENDED', label: tst('SUSPENDED'), value: sc.suspended, color: toneVar.critical },
  ].filter((s) => s.value > 0) : [];

  const view = (params.get('view') as View | null) ?? 'overview';

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')}
        meta={data && <><FreshnessChip at={data.kpis.lastFieldDataAt} label={t('kpi.fieldData')} /><FreshnessChip at={data.kpis.lastProgressDataAt} label={t('kpi.reports7d', { count: data.kpis.progressReportsLast7Days }).replace(/^\d+ /, '')} /><span className="text-xs text-muted-foreground">{t('generated', { time: relTime(new Date(dataUpdatedAt).toISOString()) })}</span></>}
        actions={<>
          {!user.sectorScope && (
            <Select value={sector ?? 'ALL'} onValueChange={(v) => setParam('sector', v === 'ALL' ? null : v)}>
              <SelectTrigger className="w-[180px]" aria-label={ts('sector')}><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="ALL">{ts('allSectors')}</SelectItem>{SECTORS.map((s) => <SelectItem key={s} value={s}>{te(s)}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Select value={zoneId ? String(zoneId) : 'ALL'} onValueChange={(v) => setParam('zoneId', v === 'ALL' ? null : v)}>
            <SelectTrigger className="w-[180px]" aria-label={ts('zone')}><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="ALL">{ts('allZones')}</SelectItem>{zones?.map((z) => <SelectItem key={z.id} value={String(z.id)}>{localizedName(z.name, locale)}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => refetch()} aria-label={tc('refresh')} disabled={isFetching}><RefreshCw className={isFetching ? 'animate-spin' : ''} /></Button>
        </>} />

      {/* The six headline figures are always visible; everything else lives in one of four views
          so a single screen never carries more than two or three blocks. */}
      <KpiStrip kpis={data?.kpis} alerts={data?.alertCounts} isLoading={isLoading} scopeQuery={scopeQuery} />

      <Tabs value={view} onValueChange={(v) => setParam('view', v === 'overview' ? null : v)}>
        <TabsList aria-label={t('title')}>
          {VIEWS.map((v) => <TabsTrigger key={v} value={v}>{t(`views.${v}`)}</TabsTrigger>)}
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {intel && <Section id="attention" title={t('attentionRow')} hint={t('attentionRowHint')} actions={<Button asChild variant="ghost" size="sm"><Link href={`/intelligence?${scopeQuery.replace(/^&/, '')}`}><BrainCircuit />{t('openIntelligence')}<ArrowRight /></Link></Button>}>
            <div className="space-y-5">
              <SignalStrip signals={brief?.signals} isLoading={bl} />
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><span className="font-medium text-foreground">{t('question.decision')}</span><span>· {t('actionsHint')}</span></div>
              <ActionCards actions={brief?.actions} isLoading={bl} error={be} refetch={br} limit={2} columns={2} />
            </div>
          </Section>}
          <div className="grid gap-6 desktop:grid-cols-12">
            <div className="desktop:col-span-5"><DecisionQueue alerts={data?.decisionQueue} isLoading={isLoading} error={error} refetch={refetch} /></div>
            <div className="desktop:col-span-7"><SectorCards sectors={data?.sectors} isLoading={isLoading} /></div>
          </div>
        </TabsContent>

        <TabsContent value="map">
          <div className="grid gap-6 desktop:grid-cols-12">
            <div className="desktop:col-span-8">
              <Section id="map" title={t('map')} hint={t('mapHint')} actions={<>
                <Button asChild variant="ghost" size="sm"><Link href={`/map?${scopeQuery.replace(/^&/, '')}`}><Globe2 />{t('openMap')}</Link></Button>
                <Select value={metric} onValueChange={(v) => setMetric(v as MapMetric)}>
                  <SelectTrigger className="w-[230px]" aria-label={t('metric.projectsDelayed')}><SelectValue /></SelectTrigger>
                  <SelectContent>{METRICS.map((m) => <SelectItem key={m} value={m}>{t(`metric.${m}`)}</SelectItem>)}</SelectContent>
                </Select></>}>
                {isLoading || !data ? <Skeleton className="h-[520px]" /> : <WeredaMap weredas={data.weredas} metric={metric} height={520} />}
              </Section>
            </div>
            <div className="desktop:col-span-4">
              <Section id="heat" title={t('heatTable')} hint={t('heatHint')} actions={<Button asChild variant="ghost" size="sm"><Link href="/geography">{tc('viewAll')}<ArrowRight /></Link></Button>}>
                <WeredaHeatTable weredas={data?.weredas} metric={metric} isLoading={isLoading} />
              </Section>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="finance" className="space-y-6">
          <div className="grid gap-6 desktop:grid-cols-2">
            <ChartCard id="trend" title={t('trend')} hint={t('trendHint')} table={{ columns: ['Month', t('planned'), t('actual')], rows: trend.map((p) => [p.date.slice(0, 7), p.planned, p.actual]) }}>
              <DataState isLoading={isLoading} error={error} onRetry={refetch} isEmpty={trend.every((p) => p.actual === null)} skeleton={<ChartSkeleton />}><ProgressCurve data={trend} /></DataState>
            </ChartCard>
            <ChartCard id="budget" title={t('budget')} hint={t('budgetHint')} table={{ columns: [ts('sector'), t('allocated'), t('released'), t('spent')], rows: budget.map((b) => [b.label, money(b.allocated, locale), money(b.disbursed, locale), money(b.spent, locale)]) }}>
              <DataState isLoading={isLoading} error={error} onRetry={refetch} isEmpty={!budget.length} skeleton={<ChartSkeleton />}><BudgetBars data={budget} /></DataState>
            </ChartCard>
          </div>
          <div className="grid gap-6 desktop:grid-cols-2">
            <Section id="pipeline" title={t('statusMix')}>
              <DataState isLoading={isLoading} error={error} onRetry={refetch} isEmpty={!statusSlices.length} skeleton={<ChartSkeleton height={200} />}><Donut data={statusSlices} centerLabel={tc('total')} height={200} ariaLabel={t('statusMix')} /></DataState>
            </Section>
            <Section id="funding" title={t('fundingMix')}>
              <DataState isLoading={isLoading} error={error} onRetry={refetch} isEmpty={!data?.budgetByFundingSource.length} rows={4}>
                <ul className="space-y-3">
                  {data?.budgetByFundingSource.map((f) => { const total = data.kpis.budgetEtb || 1; return (
                    <li key={f.key}><div className="flex justify-between gap-2 text-sm"><span className="truncate">{tf(f.key as 'DONOR_GRANT')}</span><span className="tabular font-medium">{money(f.budgetEtb, locale)}</span></div><div className="mt-1.5 h-2 rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${(f.budgetEtb / total) * 100}%`, background: 'var(--seq-450)' }} /></div></li>
                  ); })}
                </ul>
              </DataState>
            </Section>
          </div>
        </TabsContent>

        <TabsContent value="activity">
          <div className="grid gap-6 desktop:grid-cols-12">
            <div className="desktop:col-span-8">
              <Section id="attention-projects" title={t('attentionTable')} hint={t('attentionHint')} actions={<Button asChild variant="ghost" size="sm"><Link href={`/projects?health=DELAYED&health=STALLED&health=AT_RISK${scopeQuery}`}>{tc('viewAll')}<ArrowRight /></Link></Button>}>
                <AttentionTable projects={data?.attentionProjects} isLoading={isLoading} error={error} refetch={refetch} />
              </Section>
            </div>
            <div className="desktop:col-span-4">
              <Section id="stream" title={t('stream')} hint={t('streamHint')} actions={<Button asChild variant="ghost" size="sm"><Link href="/damage">{tc('viewAll')}<ArrowRight /></Link></Button>}>
                <LiveStream items={data?.stream} isLoading={isLoading} error={error} refetch={refetch} compact />
              </Section>
            </div>
          </div>
        </TabsContent>
      </Tabs>
      {data && <p className="text-right text-xs text-muted-foreground">{tc('asOf', { date: fmtDateTime(data.generatedAt, locale) })}</p>}
    </>
  );
}
