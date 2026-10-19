'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Info } from 'lucide-react';
import { useBreadcrumbs } from '@/components/layout/breadcrumbs';
import { PageHeader, Section } from '@/components/common/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBriefing, useInsights, useZones } from '@/lib/api/hooks';
import { useQueryParams } from '@/lib/use-query-params';
import { useUser } from '@/providers/session';
import { SignalStrip } from '@/components/intelligence/signal-strip';
import { ActionCards } from '@/components/intelligence/action-cards';
import { ContractorTable, PriorityTable, RiskRegisterTable, UnitComparisonTable } from '@/components/intelligence/comparisons';
import { InsightCard } from '@/components/intelligence/insight-card';
import { DataState, TableSkeleton } from '@/components/common/data-state';
import { Pagination } from '@/components/common/data-table';
import { SECTORS, type InsightKind, type Sector } from '@/lib/api/types';
import { localizedName, fmtDateTime } from '@/lib/format';
import { useRouter } from '@/i18n/navigation';

const KINDS: InsightKind[] = ['DELAY_PREDICTION', 'COMPLETION_FORECAST', 'COST_RISK', 'SUPPLY_RISK', 'ANOMALY', 'FUNDING_PRIORITY', 'RISK_SCORE'];

export default function IntelligencePage() {
  const t = useTranslations('intelligence');
  const tc = useTranslations('common');
  const ts = useTranslations('scope');
  const te = useTranslations('enums');
  const locale = useLocale();
  const user = useUser();
  const router = useRouter();
  const { get, set } = useQueryParams();
  useBreadcrumbs([{ label: t('title') }]);
  const sector = (user.sectorScope ?? get('sector')) as Sector | null;
  const zoneId = get('zoneId') ? Number(get('zoneId')) : null;
  const tab = get('tab') ?? 'brief';
  const kind = (get('kind') as InsightKind | null) ?? null;
  const page = Number(get('page') ?? 0);
  const { data, isLoading, error, refetch, dataUpdatedAt } = useBriefing({ sector, zoneId });
  const { data: insights, isLoading: il, error: ie, refetch: ir } = useInsights({ sector, zoneId: zoneId ?? undefined, kind: kind ?? undefined, page, size: 12, sort: 'severity,asc' });
  const { data: zones } = useZones();

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} meta={data && <span className="text-2xs text-muted-foreground">{tc('generatedAt', { time: fmtDateTime(new Date(dataUpdatedAt).toISOString(), locale) })}</span>} actions={<>
        {!user.sectorScope && <Select value={sector ?? 'ALL'} onValueChange={(v) => set({ sector: v === 'ALL' ? null : v })}><SelectTrigger className="w-[170px]" aria-label={ts('sector')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">{ts('allSectors')}</SelectItem>{SECTORS.map((s) => <SelectItem key={s} value={s}>{te(`sector.${s}`)}</SelectItem>)}</SelectContent></Select>}
        <Select value={zoneId ? String(zoneId) : 'ALL'} onValueChange={(v) => set({ zoneId: v === 'ALL' ? null : v })}><SelectTrigger className="w-[170px]" aria-label={ts('zone')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">{ts('allZones')}</SelectItem>{zones?.map((z) => <SelectItem key={z.id} value={String(z.id)}>{localizedName(z.name, locale)}</SelectItem>)}</SelectContent></Select>
      </>} />
      <Section id="signals" title={t('signals')}><SignalStrip signals={data?.signals} isLoading={isLoading} /></Section>
      <Tabs value={tab} onValueChange={(v) => set({ tab: v, page: null })}>
        <TabsList aria-label={t('title')}>{(['brief', 'risk', 'compare', 'priorities', 'insights'] as const).map((k) => <TabsTrigger key={k} value={k}>{t(`tabs.${k}`)}</TabsTrigger>)}</TabsList>
        <TabsContent value="brief">
          <Section id="actions" title={t('actions')} hint={t('actionsHint')}><ActionCards actions={data?.actions} isLoading={isLoading} error={error} refetch={refetch} columns={2} /></Section>
        </TabsContent>
        <TabsContent value="risk">
          <Section id="risk" title={t('riskRegister')} hint={t('riskHint')}>
            <DataState isLoading={isLoading} error={error} onRetry={refetch} isEmpty={!data?.riskRegister.length} emptyTitle={t('noRisk')} skeleton={<TableSkeleton cols={9} rows={10} />}><RiskRegisterTable rows={data?.riskRegister ?? []} /></DataState>
          </Section>
        </TabsContent>
        <TabsContent value="compare">
          <div className="space-y-5">
            {!sector && <Section id="sectors" title={t('sectorComparison')} hint={t('comparisonHint')}><DataState isLoading={isLoading} error={error} onRetry={refetch} isEmpty={!data?.sectors.length} skeleton={<TableSkeleton cols={10} rows={4} />}><UnitComparisonTable rows={data?.sectors ?? []} unitLabel={ts('sector')} onRow={(u) => router.push(`/sectors/${u.key.toLowerCase()}`)} /></DataState></Section>}
            <Section id="zones" title={t('zoneComparison')} hint={t('comparisonHint')}><DataState isLoading={isLoading} error={error} onRetry={refetch} isEmpty={!data?.zones.length} skeleton={<TableSkeleton cols={10} rows={7} />}><UnitComparisonTable rows={data?.zones ?? []} unitLabel={ts('zone')} onRow={(u) => router.push(`/geography?zoneId=${u.key}`)} /></DataState></Section>
            <Section id="contractors" title={t('contractorPerformance')} hint={t('comparisonHint')}><DataState isLoading={isLoading} error={error} onRetry={refetch} isEmpty={!data?.contractors.length} skeleton={<TableSkeleton cols={8} rows={8} />}><ContractorTable rows={data?.contractors ?? []} /></DataState></Section>
          </div>
        </TabsContent>
        <TabsContent value="priorities">
          <Section id="priorities" title={t('fundingPriorities')} hint={t('fundingHint')}><DataState isLoading={isLoading} error={error} onRetry={refetch} isEmpty={!data?.fundingPriorities.length} skeleton={<TableSkeleton cols={7} rows={8} />}><PriorityTable rows={data?.fundingPriorities ?? []} /></DataState></Section>
        </TabsContent>
        <TabsContent value="insights">
          <Section id="insights" title={t('insights')} hint={t('insightsHint')} actions={
            <Select value={kind ?? 'ALL'} onValueChange={(v) => set({ kind: v === 'ALL' ? null : v })}><SelectTrigger className="h-8 w-[220px] text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">{tc('all')}</SelectItem>{KINDS.map((k) => <SelectItem key={k} value={k}>{t(`insightKind.${k}`)}</SelectItem>)}</SelectContent></Select>}>
            <DataState isLoading={il} error={ie} onRetry={ir} isEmpty={!insights?.content.length} emptyTitle={t('noInsights')} rows={6}>
              <div className="grid gap-3 tablet:grid-cols-2 wide:grid-cols-3">{insights?.content.map((i) => <InsightCard key={i.id} i={i} showSubject />)}</div>
              {insights && <Pagination page={insights.page} totalPages={insights.totalPages} totalElements={insights.totalElements} size={insights.size} onPage={(p) => set({ page: String(p) }, false)} />}
            </DataState>
          </Section>
        </TabsContent>
      </Tabs>
      {data && <p className="flex items-start gap-1.5 text-2xs text-muted-foreground"><Info className="mt-0.5 h-3 w-3 shrink-0" />{data.disclaimer}</p>}
    </>
  );
}
