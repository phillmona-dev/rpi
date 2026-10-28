'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, Target } from 'lucide-react';
import { useRouter, usePathname, Link } from '@/i18n/navigation';
import { useOverview, useZones } from '@/lib/api/hooks';
import { useUser } from '@/providers/session';
import { canSeeIntelligence, healthTone, toneVar } from '@/lib/domain';
import { SECTORS, type ProjectSummary, type Sector } from '@/lib/api/types';
import { PageHeader, Section } from '@/components/common/page-header';
import { KpiStrip, useProgressPhrase } from '@/components/dashboard/kpi-strip';
import { DecisionQueue } from '@/components/dashboard/decision-queue';
import { SectorCards } from '@/components/dashboard/sector-cards';
import { ChartCard } from '@/components/charts/chart-card';
import { ProgressCurve } from '@/components/charts/progress-curve';
import { BudgetBars } from '@/components/charts/budget-bars';
import { HealthBadge, SectorDot } from '@/components/common/badges';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ChartSkeleton, DataState } from '@/components/common/data-state';
import { fmtDateTime, localizedName, money, relTime } from '@/lib/format';

/**
 * Overview: one calm page that answers, in order, how reconstruction is going, what needs attention,
 * how each sector is doing, and how progress and money have moved over time. Detail lives on the linked pages.
 */
export default function OverviewPage() {
  const t = useTranslations('dashboard');
  const ts = useTranslations('scope');
  const te = useTranslations('enums.sector');
  const locale = useLocale();
  const user = useUser();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const sector = (user.sectorScope ?? (params.get('sector') as Sector | null)) || null;
  const zoneId = params.get('zoneId') ? Number(params.get('zoneId')) : null;
  const { data, isLoading, error, refetch } = useOverview({ sector, zoneId });
  const { data: zones } = useZones();
  const setParam = (k: string, v: string | null) => { const p = new URLSearchParams(params.toString()); if (v) p.set(k, v); else p.delete(k); router.replace(`${pathname}?${p.toString()}` as '/'); };
  const scopeQuery = `${sector ? `&sector=${sector}` : ''}${zoneId ? `&zoneId=${zoneId}` : ''}`;

  const trend = data?.trend.map((p) => ({ date: p.period, planned: p.plannedPct, actual: p.actualPct })) ?? [];
  const budget = data?.budgetBySector.map((b) => ({ label: te(b.key as Sector), allocated: b.budgetEtb, disbursed: b.disbursedEtb, spent: b.expendedEtb })) ?? [];

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')}
        actions={<div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">{t('show')}</span>
          {!user.sectorScope && (
            <Select value={sector ?? 'ALL'} onValueChange={(v) => setParam('sector', v === 'ALL' ? null : v)}>
              <SelectTrigger className="w-[170px]" aria-label={ts('sector')}><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="ALL">{ts('allSectors')}</SelectItem>{SECTORS.map((s) => <SelectItem key={s} value={s}>{te(s)}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Select value={zoneId ? String(zoneId) : 'ALL'} onValueChange={(v) => setParam('zoneId', v === 'ALL' ? null : v)}>
            <SelectTrigger className="w-[170px]" aria-label={ts('zone')}><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="ALL">{ts('allZones')}</SelectItem>{zones?.map((z) => <SelectItem key={z.id} value={String(z.id)}>{localizedName(z.name, locale)}</SelectItem>)}</SelectContent>
          </Select>
        </div>} />

      <section aria-labelledby="how" className="space-y-3">
        <h2 id="how" className="text-lg font-semibold">{t('q.how')}</h2>
        <KpiStrip kpis={data?.kpis} isLoading={isLoading} scopeQuery={scopeQuery} />
      </section>

      <section aria-labelledby="attention" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="attention" className="text-lg font-semibold">{t('q.attention')}</h2>
          {canSeeIntelligence(user.roles) && <Link href={`/intelligence?${scopeQuery.replace(/^&/, '')}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"><Target className="h-4 w-4" />{t('openIntelligence')}</Link>}
        </div>
        <div className="grid gap-6 desktop:grid-cols-2">
          <DecisionQueue alerts={data?.decisionQueue?.slice(0, 5)} isLoading={isLoading} error={error} refetch={refetch} />
          <Section title={t('attentionTable')} hint={t('attentionHint')} actions={<Button asChild variant="ghost" size="sm"><Link href={`/projects?health=DELAYED&health=STALLED&health=AT_RISK${scopeQuery}`}>{t('seeAll')}<ArrowRight /></Link></Button>}>
            <DataState isLoading={isLoading} error={error} onRetry={refetch} isEmpty={!data?.attentionProjects.length} emptyTitle={t('attentionEmpty')} rows={5}>
              <LateProjects projects={(data?.attentionProjects ?? []).slice(0, 5)} />
            </DataState>
          </Section>
        </div>
      </section>

      <SectorCards sectors={data?.sectors} isLoading={isLoading} />

      <section aria-labelledby="over-time" className="space-y-3">
        <h2 id="over-time" className="text-lg font-semibold">{t('q.overTime')}</h2>
        <div className="grid gap-6 desktop:grid-cols-2">
          <ChartCard id="trend" title={t('trend')} hint={t('trendHint')} table={{ columns: [t('month'), t('planned'), t('actual')], rows: trend.map((p) => [p.date.slice(0, 7), p.planned, p.actual]) }}>
            <DataState isLoading={isLoading} error={error} onRetry={refetch} isEmpty={trend.every((p) => p.actual === null)} skeleton={<ChartSkeleton />}><ProgressCurve data={trend} /></DataState>
          </ChartCard>
          <ChartCard id="budget" title={t('budget')} hint={t('budgetHint')} table={{ columns: [ts('sector'), t('allocated'), t('released'), t('spent')], rows: budget.map((b) => [b.label, money(b.allocated, locale), money(b.disbursed, locale), money(b.spent, locale)]) }}>
            <DataState isLoading={isLoading} error={error} onRetry={refetch} isEmpty={!budget.length} skeleton={<ChartSkeleton />}><BudgetBars data={budget} /></DataState>
          </ChartCard>
        </div>
      </section>

      {data && <p className="text-right text-sm text-muted-foreground" title={fmtDateTime(data.generatedAt, locale)}>{t('updated', { time: relTime(data.kpis.lastFieldDataAt ?? data.generatedAt) })}</p>}
    </>
  );
}

/** Projects falling behind, as a short readable list: what, where, how far behind, last news. */
function LateProjects({ projects }: { projects: ProjectSummary[] }) {
  const t = useTranslations('dashboard');
  const tc = useTranslations('common');
  const locale = useLocale();
  const phrase = useProgressPhrase();
  return (
    <ul className="-mx-2 divide-y">
      {projects.map((p) => (
        <li key={p.id}>
          <Link href={`/projects/${p.id}`} className="flex items-start gap-3 rounded-md px-2 py-3 hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 font-medium"><SectorDot sector={p.sector} /><span className="truncate">{p.name}</span></div>
              <div className="mt-0.5 text-sm text-muted-foreground">{localizedName(p.wereda.name, locale)} · <span style={{ color: toneVar[healthTone[p.health]] }}>{phrase(p.physicalProgressPct, p.plannedProgressPct)}</span>
                {' · '}{p.daysSinceReport === null ? t('noNews') : t('lastNews', { when: tc('daysAgo', { count: p.daysSinceReport }) })}</div>
            </div>
            <HealthBadge value={p.health} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
