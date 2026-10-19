'use client';
import { useTranslations } from 'next-intl';
import { useBreadcrumbs } from '@/components/layout/breadcrumbs';
import { PageHeader } from '@/components/common/page-header';
import { SectorCards } from '@/components/dashboard/sector-cards';
import { useOverview } from '@/lib/api/hooks';
import { ChartCard } from '@/components/charts/chart-card';
import { BudgetBars } from '@/components/charts/budget-bars';
import { DataState, ChartSkeleton } from '@/components/common/data-state';
import { useLocale } from 'next-intl';
import { money } from '@/lib/format';
import type { Sector } from '@/lib/api/types';

export default function SectorsIndexPage() {
  const t = useTranslations('nav');
  const td = useTranslations('dashboard');
  const te = useTranslations('enums.sector');
  const ts = useTranslations('scope');
  const locale = useLocale();
  useBreadcrumbs([{ label: t('sectors') }]);
  const { data, isLoading, error, refetch } = useOverview();
  const budget = data?.budgetBySector.map((b) => ({ label: te(b.key as Sector), allocated: b.budgetEtb, disbursed: b.disbursedEtb, spent: b.expendedEtb })) ?? [];
  return (
    <>
      <PageHeader title={t('sectors')} subtitle={td('sectorHint')} />
      <SectorCards sectors={data?.sectors} isLoading={isLoading} />
      <ChartCard title={td('budget')} hint={td('budgetHint')} table={{ columns: [ts('sector'), td('allocated'), td('released'), td('spent')], rows: budget.map((b) => [b.label, money(b.allocated, locale), money(b.disbursed, locale), money(b.spent, locale)]) }}>
        <DataState isLoading={isLoading} error={error} onRetry={refetch} isEmpty={!budget.length} skeleton={<ChartSkeleton />}><BudgetBars data={budget} /></DataState>
      </ChartCard>
    </>
  );
}
