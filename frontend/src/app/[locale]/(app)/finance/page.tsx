'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useFinance, useZones } from '@/lib/api/hooks';
import { useBreadcrumbs } from '@/components/layout/breadcrumbs';
import { PageHeader, Section } from '@/components/common/page-header';
import { ChartCard } from '@/components/charts/chart-card';
import { BudgetBars } from '@/components/charts/budget-bars';
import { DataState, ChartSkeleton, TableSkeleton } from '@/components/common/data-state';
import { DataTable, type Column } from '@/components/common/data-table';
import { SectorDot, ToneBadge } from '@/components/common/badges';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQueryParams } from '@/lib/use-query-params';
import { useRouter } from '@/i18n/navigation';
import { fmtDate, localizedName, money, pct, ratio } from '@/lib/format';
import type { PipelineItem, VarianceItem, ZoneSlice, Sector } from '@/lib/api/types';
import { SECTORS } from '@/lib/api/types';
import { toneVar, type Tone } from '@/lib/domain';
import { useUser } from '@/providers/session';
import { Progress } from '@/components/ui/progress';

const disbTone: Record<string, Tone> = { PLANNED: 'neutral', REQUESTED: 'warning', APPROVED: 'info', RELEASED: 'good' };

export default function FinancePage() {
  const t = useTranslations('finance');
  const td = useTranslations('dashboard');
  const te = useTranslations('enums');
  const ts = useTranslations('scope');
  const tc = useTranslations('common');
  const locale = useLocale();
  const user = useUser();
  const router = useRouter();
  const { get, set } = useQueryParams();
  useBreadcrumbs([{ label: t('title') }]);
  const sector = (user.sectorScope ?? get('sector')) as Sector | null;
  const zoneId = get('zoneId') ? Number(get('zoneId')) : null;
  const { data, isLoading, error, refetch } = useFinance({ sector, zoneId });
  const { data: zones } = useZones();
  const bySector = data?.bySector.map((b) => ({ label: te(`sector.${b.key as Sector}`), allocated: b.budgetEtb, disbursed: b.disbursedEtb, spent: b.expendedEtb })) ?? [];
  const bySource = data?.byFundingSource.map((b) => ({ label: te(`funding.${b.key as 'DONOR_GRANT'}`), allocated: b.budgetEtb, disbursed: b.disbursedEtb, spent: b.expendedEtb })) ?? [];
  const zoneCols: Column<ZoneSlice>[] = [
    { key: 'zone', header: t('columns.zone'), cell: (z) => <span className="font-medium">{z.zoneName}</span> },
    { key: 'projects', header: t('columns.projects'), align: 'right', cell: (z) => z.projects },
    { key: 'allocated', header: t('columns.allocated'), align: 'right', cell: (z) => money(z.budgetEtb, locale) },
    { key: 'released', header: t('columns.released'), align: 'right', cell: (z) => money(z.disbursedEtb, locale) },
    { key: 'spent', header: t('columns.spent'), align: 'right', cell: (z) => money(z.expendedEtb, locale) },
    { key: 'util', header: t('columns.utilisation'), cell: (z) => <div className="w-28"><div className="text-xs tabular">{pct(z.budgetEtb ? (z.disbursedEtb / z.budgetEtb) * 100 : 0)}</div><Progress value={z.budgetEtb ? (z.disbursedEtb / z.budgetEtb) * 100 : 0} className="mt-1" label={z.zoneName} /></div> },
  ];
  const pipeCols: Column<PipelineItem>[] = [
    { key: 'project', header: t('columns.project'), cell: (p) => <div className="min-w-[240px]"><div className="flex items-center gap-1.5 font-medium"><SectorDot sector={p.sector} /><span className="truncate max-w-[320px]">{p.projectName}</span></div><div className="text-2xs text-muted-foreground">{p.projectCode} · {p.weredaName}</div></div> },
    { key: 'tranche', header: t('columns.tranche'), align: 'center', cell: (p) => `#${p.trancheNo}` },
    { key: 'amount', header: t('columns.amount'), align: 'right', cell: (p) => <span className="font-medium">{money(p.amountEtb, locale)}</span> },
    { key: 'source', header: t('columns.source'), cell: (p) => te(`funding.${p.fundingSource}`) },
    { key: 'planned', header: t('columns.planned'), align: 'right', cell: (p) => fmtDate(p.plannedDate, locale, 'short') },
    { key: 'lag', header: t('columns.lag'), align: 'right', cell: (p) => <span style={{ color: p.lagDays > 45 ? toneVar.serious : undefined }}>{p.lagDays > 0 ? `${p.lagDays} d` : '—'}</span> },
    { key: 'status', header: t('columns.status'), cell: (p) => <ToneBadge tone={disbTone[p.status]} label={te(`disbursement.${p.status}`)} /> },
  ];
  const varCols: Column<VarianceItem>[] = [
    { key: 'project', header: t('columns.project'), cell: (p) => <div className="min-w-[240px]"><div className="flex items-center gap-1.5 font-medium"><SectorDot sector={p.sector} /><span className="truncate max-w-[320px]">{p.projectName}</span></div><div className="text-2xs text-muted-foreground">{p.projectCode}</div></div> },
    { key: 'progress', header: t('columns.progress'), align: 'right', cell: (p) => pct(p.physicalPct) },
    { key: 'budget', header: t('columns.budget'), align: 'right', cell: (p) => money(p.budgetEtb, locale) },
    { key: 'spent', header: t('columns.spent'), align: 'right', cell: (p) => money(p.expendedEtb, locale) },
    { key: 'cpi', header: t('columns.cpi'), align: 'right', cell: (p) => <span className="font-medium" style={{ color: (p.cpi ?? 1) < 0.9 ? toneVar.critical : toneVar.serious }}>{ratio(p.cpi)}</span> },
    { key: 'forecast', header: t('columns.forecast'), align: 'right', cell: (p) => <span>{money(p.forecastCostEtb, locale)}{p.forecastCostEtb && <span className="block text-2xs text-muted-foreground">+{pct(((p.forecastCostEtb - p.budgetEtb) / p.budgetEtb) * 100)}</span>}</span> },
  ];
  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} actions={<>
        {!user.sectorScope && <Select value={sector ?? 'ALL'} onValueChange={(v) => set({ sector: v === 'ALL' ? null : v })}><SelectTrigger className="w-[170px]" aria-label={ts('sector')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">{ts('allSectors')}</SelectItem>{SECTORS.map((s) => <SelectItem key={s} value={s}>{te(`sector.${s}`)}</SelectItem>)}</SelectContent></Select>}
        <Select value={zoneId ? String(zoneId) : 'ALL'} onValueChange={(v) => set({ zoneId: v === 'ALL' ? null : v })}><SelectTrigger className="w-[170px]" aria-label={ts('zone')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">{ts('allZones')}</SelectItem>{zones?.map((z) => <SelectItem key={z.id} value={String(z.id)}>{localizedName(z.name, locale)}</SelectItem>)}</SelectContent></Select>
      </>} />
      <div className="grid gap-5 desktop:grid-cols-2">
        <ChartCard title={t('bySector')} hint={td('budgetHint')} table={{ columns: [ts('sector'), td('allocated'), td('released'), td('spent')], rows: bySector.map((b) => [b.label, money(b.allocated, locale), money(b.disbursed, locale), money(b.spent, locale)]) }}>
          <DataState isLoading={isLoading} error={error} onRetry={refetch} isEmpty={!bySector.length} skeleton={<ChartSkeleton />}><BudgetBars data={bySector} /></DataState>
        </ChartCard>
        <ChartCard title={t('bySource')} hint={td('budgetHint')} table={{ columns: [t('columns.source'), td('allocated'), td('released'), td('spent')], rows: bySource.map((b) => [b.label, money(b.allocated, locale), money(b.disbursed, locale), money(b.spent, locale)]) }}>
          <DataState isLoading={isLoading} error={error} onRetry={refetch} isEmpty={!bySource.length} skeleton={<ChartSkeleton />}><BudgetBars data={bySource} height={Math.max(220, bySource.length * 44)} /></DataState>
        </ChartCard>
      </div>
      <Section title={t('byZone')} hint={t('utilisationHint')}>
        <DataState isLoading={isLoading} error={error} onRetry={refetch} isEmpty={!data?.byZone.length} skeleton={<TableSkeleton cols={6} />}><DataTable columns={zoneCols} rows={data?.byZone ?? []} rowKey={(z) => z.zoneId} onRowClick={(z) => router.push(`/geography?zoneId=${z.zoneId}`)} dense /></DataState>
      </Section>
      <div className="grid gap-5 desktop:grid-cols-2">
        <Section title={t('pipeline')} hint={t('pipelineHint')}>
          <DataState isLoading={isLoading} error={error} onRetry={refetch} isEmpty={!data?.pendingDisbursements.length} emptyTitle={tc('noData')} skeleton={<TableSkeleton cols={7} />}><DataTable columns={pipeCols} rows={data?.pendingDisbursements ?? []} rowKey={(p) => `${p.projectId}-${p.trancheNo}`} onRowClick={(p) => router.push(`/projects/${p.projectId}`)} dense /></DataState>
        </Section>
        <Section title={t('variance')} hint={t('varianceHint')}>
          <DataState isLoading={isLoading} error={error} onRetry={refetch} isEmpty={!data?.costVariance.length} emptyTitle={tc('noData')} skeleton={<TableSkeleton cols={6} />}><DataTable columns={varCols} rows={data?.costVariance ?? []} rowKey={(p) => p.projectId} onRowClick={(p) => router.push(`/projects/${p.projectId}`)} dense /></DataState>
        </Section>
      </div>
    </>
  );
}
