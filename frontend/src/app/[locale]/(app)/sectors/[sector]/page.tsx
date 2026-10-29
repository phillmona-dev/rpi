'use client';
import { useLocale, useTranslations } from 'next-intl';
import { notFound, useParams } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { useOverview, useProjects, useAssessments, useFacilities } from '@/lib/api/hooks';
import { useBreadcrumbs } from '@/components/layout/breadcrumbs';
import { PageHeader, Section } from '@/components/common/page-header';
import { KpiStrip } from '@/components/dashboard/kpi-strip';
import { DecisionQueue } from '@/components/dashboard/decision-queue';
import { ChartCard } from '@/components/charts/chart-card';
import { ProgressCurve } from '@/components/charts/progress-curve';
import { Donut } from '@/components/charts/donut';
import { ProjectTable } from '@/components/projects/project-table';
import { DataState, TableSkeleton, ChartSkeleton } from '@/components/common/data-state';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { slugSector, toneVar, severityTone } from '@/lib/domain';
import { SeverityBadge, SectorDot } from '@/components/common/badges';
import { fmtDate, localizedName } from '@/lib/format';
import type { DamageSeverity } from '@/lib/api/types';
import { useUser } from '@/providers/session';

export default function SectorPage() {
  const { sector: slug } = useParams<{ sector: string }>();
  const sector = slugSector[slug];
  const t = useTranslations('sector');
  const td = useTranslations('dashboard');
  const tc = useTranslations('common');
  const te = useTranslations('enums');
  const tp = useTranslations('projects');
  const locale = useLocale();
  const user = useUser();
  useBreadcrumbs(sector ? [{ label: te(`sector.${sector}`) }] : []);
  const { data, isLoading, error, refetch } = useOverview({ sector });
  const { data: projects, isLoading: pl } = useProjects({ sector, size: 10, sort: 'scheduleVariancePp,asc', status: ['ACTIVE', 'SUSPENDED', 'PROCUREMENT', 'PLANNED'] });
  const { data: facilities } = useFacilities({ sector, size: 200 });
  const { data: assessments, isLoading: al } = useAssessments({ sector, size: 8 });
  if (!sector || (user.sectorScope && user.sectorScope !== sector)) notFound();

  const typeRows = (() => {
    const m = new Map<string, Record<string, number>>();
    facilities?.content.forEach((f) => { const r = m.get(f.facilityType) ?? {}; const s = f.latestSeverity ?? 'NONE'; r[s] = (r[s] ?? 0) + 1; m.set(f.facilityType, r); });
    return [...m.entries()].sort((a, b) => Object.values(b[1]).reduce((x, y) => x + y, 0) - Object.values(a[1]).reduce((x, y) => x + y, 0));
  })();
  const sevOrder: DamageSeverity[] = ['DESTROYED', 'SEVERE', 'MODERATE', 'MINOR', 'NONE'];
  const trend = data?.trend.map((p) => ({ date: p.period, planned: p.plannedPct, actual: p.actualPct })) ?? [];

  return (
    <>
      <PageHeader title={<span className="flex items-center gap-2"><SectorDot sector={sector} className="h-4 w-4" />{t('title', { sector: te(`sector.${sector}`) })}</span>} subtitle={t('subtitle', { sector: te(`sector.${sector}`) })} />
      <KpiStrip kpis={data?.kpis} alerts={data?.alertCounts} isLoading={isLoading} scopeQuery={`&sector=${sector}`} />
      <div className="grid gap-5 desktop:grid-cols-12">
        <div className="desktop:col-span-5"><DecisionQueue alerts={data?.decisionQueue} isLoading={isLoading} error={error} refetch={refetch} /></div>
        <div className="desktop:col-span-7">
          <Section title={t('facilitiesByType')} hint={t('facilitiesByTypeHint')}>
            <DataState isLoading={!facilities} error={undefined} isEmpty={typeRows.length === 0} rows={5}>
              <ul className="space-y-2">
                {typeRows.map(([type, counts]) => { const total = Object.values(counts).reduce((a, b) => a + b, 0); return (
                  <li key={type}>
                    <div className="flex items-center justify-between text-xs"><Link href={`/facilities?sector=${sector}&type=${type}`} className="font-medium hover:underline">{te(`facilityType.${type}` as 'facilityType.FACTORY')}</Link><span className="tabular text-muted-foreground">{total}</span></div>
                    <div className="mt-1 flex h-2.5 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={`${type}: ${sevOrder.map((s) => `${counts[s] ?? 0} ${te(`severity.${s}`)}`).join(', ')}`}>
                      {sevOrder.map((s) => counts[s] ? <span key={s} style={{ width: `${(counts[s] / total) * 100}%`, background: toneVar[severityTone[s]], marginRight: 2 }} title={`${te(`severity.${s}`)}: ${counts[s]}`} /> : null)}
                    </div>
                  </li>
                ); })}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">{sevOrder.map((s) => <SeverityBadge key={s} value={s} />)}</div>
            </DataState>
          </Section>
        </div>
      </div>
      <div className="grid gap-5 desktop:grid-cols-12">
        <div className="desktop:col-span-7">
          <ChartCard title={td('trend')} hint={td('trendHint')} table={{ columns: [td('month'), td('planned'), td('actual')], rows: trend.map((p) => [p.date.slice(0, 7), p.planned, p.actual]) }}>
            <DataState isLoading={isLoading} error={error} onRetry={refetch} isEmpty={trend.every((p) => p.actual === null)} skeleton={<ChartSkeleton />}><ProgressCurve data={trend} /></DataState>
          </ChartCard>
        </div>
        <div className="desktop:col-span-5">
          <Section title={t('projectsByHealth')}>
            <DataState isLoading={isLoading} error={error} onRetry={refetch} isEmpty={!data} skeleton={<ChartSkeleton height={180} />}>
              {data && <Donut ariaLabel={t('projectsByHealth')} height={170} centerLabel={tp('title')} data={[
                { key: 'ON_TRACK', label: te('health.ON_TRACK'), value: data.kpis.projectsActive - data.kpis.projectsDelayed - data.kpis.projectsAtRisk - data.kpis.projectsStalled, color: toneVar.good },
                { key: 'AT_RISK', label: te('health.AT_RISK'), value: data.kpis.projectsAtRisk, color: toneVar.warning },
                { key: 'DELAYED', label: te('health.DELAYED'), value: data.kpis.projectsDelayed, color: toneVar.serious },
                { key: 'STALLED', label: te('health.STALLED'), value: data.kpis.projectsStalled, color: toneVar.critical },
                { key: 'COMPLETED', label: te('health.COMPLETED'), value: data.kpis.projectsCompleted, color: 'var(--seq-450)' },
              ].filter((s) => s.value > 0)} />}
            </DataState>
          </Section>
        </div>
      </div>
      <Section title={t('projects')} hint={t('projectsHint')} actions={<Button asChild variant="ghost" size="sm"><Link href={`/projects?sector=${sector}`}>{tc('viewAll')}<ArrowRight /></Link></Button>}>
        <DataState isLoading={pl} isEmpty={!projects?.content.length} skeleton={<TableSkeleton cols={8} />}><ProjectTable rows={projects?.content ?? []} hideSector /></DataState>
      </Section>
      <Section title={t('assessments')} actions={<Button asChild variant="ghost" size="sm"><Link href={`/damage?sector=${sector}`}>{tc('viewAll')}<ArrowRight /></Link></Button>}>
        <DataState isLoading={al} isEmpty={!assessments?.content.length} rows={4}>
          <ul className="divide-y">{assessments?.content.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <Link href={`/facilities/${a.facility.id}`} className="font-medium hover:underline">{a.facility.name}</Link>
              <span className="flex items-center gap-3 text-xs text-muted-foreground"><span>{localizedName(a.facility.wereda.name, locale)}</span><span>{fmtDate(a.assessedOn, locale, 'short')}</span><SeverityBadge value={a.severity} /></span>
            </li>
          ))}</ul>
        </DataState>
      </Section>
    </>
  );
}
