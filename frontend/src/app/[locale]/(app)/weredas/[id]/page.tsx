'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { useWereda, useWeredaMetrics, useFacilities, useProjects, useOverview } from '@/lib/api/hooks';
import { useBreadcrumbs } from '@/components/layout/breadcrumbs';
import { PageHeader, Section, Stat } from '@/components/common/page-header';
import { DataState, TableSkeleton } from '@/components/common/data-state';
import { WeredaMap } from '@/components/map/wereda-map';
import { ProjectTable } from '@/components/projects/project-table';
import { KpiStrip } from '@/components/dashboard/kpi-strip';
import { LiveStream } from '@/components/dashboard/live-stream';
import { DecisionQueue } from '@/components/dashboard/decision-queue';
import { SeverityBadge, OperationalBadge, SectorLabel } from '@/components/common/badges';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { localizedName, money, num, pct } from '@/lib/format';
import { SECTORS } from '@/lib/api/types';
import { sectorSlug, sectorVar } from '@/lib/domain';
import { Skeleton } from '@/components/ui/skeleton';

export default function WeredaPage() {
  const { id } = useParams<{ id: string }>();
  const wid = Number(id);
  const t = useTranslations('geo');
  const tc = useTranslations('common');
  const te = useTranslations('enums');
  const tf = useTranslations('facilities');
  const tp = useTranslations('projects');
  const td = useTranslations('dashboard');
  const locale = useLocale();
  const { data, isLoading, error, refetch } = useWereda(wid);
  const { data: all } = useWeredaMetrics();
  const { data: ov, isLoading: ol, error: oe, refetch: orf } = useOverview({ weredaId: wid });
  const { data: facilities, isLoading: fl } = useFacilities({ weredaId: wid, size: 100, sort: 'sector,asc' });
  const { data: projects, isLoading: pl } = useProjects({ weredaId: wid, size: 50, sort: 'scheduleVariancePp,asc' });
  const m = data?.metrics;
  useBreadcrumbs(m ? [{ href: `/geography?zoneId=${m.zoneId}`, label: localizedName(m.zoneName, locale) }, { label: localizedName(m.name, locale) }] : [{ label: t('title') }]);
  return (
    <DataState isLoading={isLoading} error={error} onRetry={refetch} skeleton={<div className="space-y-4"><Skeleton className="h-16" /><Skeleton className="h-28" /><Skeleton className="h-96" /></div>}>
      {m && data && (
        <>
          <PageHeader title={t('weredaTitle', { name: localizedName(m.name, locale) })} subtitle={<>{t('inZone', { zone: localizedName(m.zoneName, locale) })} · {m.urban ? t('urban') : t('rural')} · {tc('population')} {num(m.population, locale)} · {m.code}</>} />
          <KpiStrip kpis={ov?.kpis} alerts={ov?.alertCounts} isLoading={ol} scopeQuery={`&weredaId=${wid}`} />
          <div className="grid gap-5 desktop:grid-cols-12">
            <div className="desktop:col-span-5 space-y-5">
              <Section title={t('mapFocus')}>{all ? <WeredaMap weredas={all} metric="projectsDelayed" height={280} focusId={wid} /> : <Skeleton className="h-[280px]" />}</Section>
              <Section title={t('sectorMix')}>
                <div className="grid grid-cols-2 gap-2">
                  {SECTORS.map((s) => { const sl = data.bySector[s]; return (
                    <Link key={s} href={`/projects?weredaId=${wid}&sector=${s}`} className="rounded-md border p-2.5 hover:border-primary/40" style={{ borderLeft: `3px solid ${sectorVar[s]}` }}>
                      <div className="text-xs font-medium">{te(`sector.${s}`)}</div>
                      <div className="mt-1 grid grid-cols-2 gap-1 text-2xs text-muted-foreground"><span>{tf('title').split(' ')[0]}: <b className="text-foreground">{sl?.facilities ?? 0}</b> ({sl?.facilitiesSevere ?? 0} sev.)</span><span>{tp('title')}: <b className="text-foreground">{sl?.projects ?? 0}</b> ({sl?.projectsDelayed ?? 0} del.)</span><span>{pct(sl?.avgProgressPct)}</span><span>{money(sl?.budgetEtb ?? 0, locale)}</span></div>
                    </Link>
                  ); })}
                </div>
              </Section>
            </div>
            <div className="desktop:col-span-7 space-y-5">
              <DecisionQueue alerts={ov?.decisionQueue} isLoading={ol} error={oe} refetch={orf} />
              <Section title={t('facilitiesInWereda')} actions={<Button asChild variant="ghost" size="sm"><Link href={`/facilities?weredaId=${wid}`}>{tc('viewAll')}<ArrowRight /></Link></Button>}>
                <DataState isLoading={fl} isEmpty={!facilities?.content.length} rows={5}>
                  <ul className="divide-y">{facilities?.content.map((f) => (
                    <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <Link href={`/facilities/${f.id}`} className="min-w-0 flex-1"><div className="truncate text-sm font-medium hover:underline">{f.name}</div><div className="text-2xs text-muted-foreground"><SectorLabel sector={f.sector} /> · {te(`facilityType.${f.facilityType}` as 'facilityType.FACTORY')}</div></Link>
                      <span className="flex items-center gap-1.5"><SeverityBadge value={f.latestSeverity} /><OperationalBadge value={f.operationalStatus} />{f.linkedProjects > 0 && <span className="text-2xs text-muted-foreground">{f.linkedProjects} proj.</span>}</span>
                    </li>
                  ))}</ul>
                </DataState>
              </Section>
            </div>
          </div>
          <Section title={t('projectsInWereda')} actions={<Button asChild variant="ghost" size="sm"><Link href={`/projects?weredaId=${wid}`}>{tc('viewAll')}<ArrowRight /></Link></Button>}>
            <DataState isLoading={pl} isEmpty={!projects?.content.length} skeleton={<TableSkeleton cols={8} />}><ProjectTable rows={projects?.content ?? []} /></DataState>
          </Section>
          <Section title={td('stream')}><LiveStream items={ov?.stream} isLoading={ol} error={oe} refetch={orf} compact /></Section>
          <div className="mt-2 text-2xs text-muted-foreground">{!m.hasBoundary && t('noBoundary')}</div>
        </>
      )}
    </DataState>
  );
}
