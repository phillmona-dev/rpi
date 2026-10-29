'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { Camera, ChevronDown, MapPin } from 'lucide-react';
import { useEvidenceGeo, useEvidenceSummary, useFacilitiesGeo, useFacility, useInspections, useMedia } from '@/lib/api/hooks';
import { EvidenceGallery } from '@/components/evidence/evidence-gallery';
import { EvidenceSummaryStrip } from '@/components/evidence/evidence-summary';
import { InspectionTable } from '@/components/evidence/inspection-table';
import { InspectionDrawer } from '@/components/evidence/inspection-drawer';
import { CommandMap } from '@/components/map/command-map';
import * as React from 'react';
import { useBreadcrumbs } from '@/components/layout/breadcrumbs';
import { PageHeader, Section, Stat } from '@/components/common/page-header';
import { DataState } from '@/components/common/data-state';
import { AssessmentStatusBadge, HealthBadge, OperationalBadge, SectorLabel, SeverityBadge, StatusBadge, ToneBadge } from '@/components/common/badges';
import { Link, useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { useUser } from '@/providers/session';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fmtDate, localizedName, money, num, pct } from '@/lib/format';
import { canManageCampaigns, sectorSlug, toneVar, severityTone } from '@/lib/domain';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { DataState as DS } from '@/components/common/data-state';

export default function FacilityPage() {
  const { id } = useParams<{ id: string }>();
  const fid = Number(id);
  const t = useTranslations('facilities');
  const tc = useTranslations('common');
  const te = useTranslations('enums');
  const tp = useTranslations('projects.columns');
  const locale = useLocale();
  const { data, isLoading, error, refetch } = useFacility(fid);
  const f = data?.facility;
  const tev = useTranslations('evidence');
  const [openInspection, setOpenInspection] = React.useState<number | null>(null);
  const { data: summary } = useEvidenceSummary({ facilityId: fid });
  const { data: media, isLoading: ml, error: me, refetch: mr } = useMedia({ facilityId: fid, size: 24 });
  const { data: inspections, isLoading: il, error: ie, refetch: ir } = useInspections({ facilityId: fid, size: 20, sort: 'visitedOn,desc' });
  const { data: siteFacilities } = useFacilitiesGeo({ weredaId: f?.wereda.id }, Boolean(f));
  const { data: siteEvidence } = useEvidenceGeo({ facilityId: fid }, Boolean(f));
  const router = useRouter();
  const user = useUser();
  useBreadcrumbs(f ? [{ href: `/sectors/${sectorSlug[f.sector]}`, label: te(`sector.${f.sector}`) }, { href: `/weredas/${f.wereda.id}`, label: localizedName(f.wereda.name, locale) }, { label: f.name }] : [{ label: t('title') }]);
  return (
    <DataState isLoading={isLoading} error={error} onRetry={refetch} skeleton={<div className="space-y-4"><Skeleton className="h-16" /><Skeleton className="h-28" /><Skeleton className="h-96" /></div>}>
      {data && f && (() => { const a = data.latestAssessment; return (
        <>
          <PageHeader title={f.name} subtitle={<span className="flex flex-wrap items-center gap-x-3 gap-y-1"><SectorLabel sector={f.sector} /><span>{te(`facilityType.${f.facilityType}` as 'facilityType.FACTORY')}</span><Link href={`/weredas/${f.wereda.id}`} className="inline-flex items-center gap-1 hover:underline"><MapPin className="h-3 w-3" />{localizedName(f.wereda.name, locale)}{f.kebele && <> · {t('detail.kebele')} {f.kebele}</>}</Link></span>}
            meta={<><SeverityBadge value={f.latestSeverity} /><OperationalBadge value={f.operationalStatus} /></>} />
          <p className="rounded-lg border bg-card px-5 py-4 text-base leading-relaxed shadow-card">
            {a ? t('detail.summary', { date: fmtDate(a.assessedOn, locale), name: a.assessorName }) : t('detail.noAssessment')}{' '}
            {data.projects.length > 0 ? t('detail.summaryProjects', { count: data.projects.length }) : (f.latestSeverity === 'SEVERE' || f.latestSeverity === 'DESTROYED') ? <b>{t('detail.summaryNoProject')}</b> : null}
          </p>
          <div className="grid grid-cols-2 gap-3 desktop:grid-cols-4">
            <Stat label={t('detail.structural')} value={a ? <>{a.structuralImpactScore}<span className="text-sm text-muted-foreground font-normal"> / 100</span></> : '—'} hint={a && <Progress value={a.structuralImpactScore} tone={toneVar[severityTone[a.severity]]} className="mt-1.5" label={t('detail.structural')} />} />
            <Stat label={t('detail.functional')} value={pct(a?.functionalCapacityPct)} hint={t('detail.functionalHint')} />
            <Stat label={t('detail.replacementCost')} value={money(f.replacementEstimateEtb, locale)} hint={a?.estimatedRepairCostEtb ? t('detail.repairHint', { value: money(a.estimatedRepairCostEtb, locale) }) : undefined} />
            <Stat label={tc('beneficiaries')} value={num(f.beneficiaries, locale)} hint={f.preCrisisCapacity ? t('detail.capacityHint', { value: `${num(f.preCrisisCapacity, locale)} ${f.capacityUnit ?? ''}`.trim() }) : undefined} />
          </div>
          <div className="grid gap-5 desktop:grid-cols-12">
            <div className="desktop:col-span-7 space-y-5">
              <Section title={t('detail.latest')} hint={a ? t('detail.latestHint', { name: a.assessorName, date: fmtDate(a.assessedOn, locale) }) : undefined}>
                {!a ? <p className="text-sm text-muted-foreground">{t('detail.noAssessment')}</p> : <LatestAssessment id={a.id} photos={a.photoCount} inventory={a.inventoryLossPct} />}
              </Section>
              <Section title={t('detail.history')} actions={canManageCampaigns(user.roles) && <Button size="sm" variant="outline" asChild><Link href={`/damage/assessments/new?facilityId=${f.id}`}>{t('detail.recordAssessment')}</Link></Button>}>
                <Table><TableHeader><TableRow><TableHead>{t('columns.assessed')}</TableHead><TableHead>{t('columns.severity')}</TableHead><TableHead className="text-right">{t('detail.functional')}</TableHead><TableHead>{t('detail.assessor')}</TableHead><TableHead>{t('detail.review')}</TableHead></TableRow></TableHeader>
                  <TableBody>{data.assessmentHistory.map((h) => <TableRow key={h.id} className="cursor-pointer" onClick={() => router.push(`/damage/assessments/${h.id}`)}><TableCell className="tabular"><Link href={`/damage/assessments/${h.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>{fmtDate(h.assessedOn, locale, 'short')}</Link></TableCell><TableCell><SeverityBadge value={h.severity} /></TableCell><TableCell className="text-right tabular">{pct(h.functionalCapacityPct)}</TableCell><TableCell className="text-xs">{h.assessorName}</TableCell><TableCell><AssessmentStatusBadge value={h.status} /></TableCell></TableRow>)}</TableBody></Table>
              </Section>
            </div>
            <div className="desktop:col-span-5 space-y-5">
              <Section title={t('detail.projects')}>
                {data.projects.length === 0 ? <ToneBadge tone="serious" label={t('detail.noProjects')} /> : (
                  <ul className="divide-y">{data.projects.map((p) => (
                    <li key={p.id} className="py-2.5">
                      <Link href={`/projects/${p.id}`} className="text-sm font-medium hover:underline">{p.name}</Link>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs"><StatusBadge value={p.status} /><HealthBadge value={p.health} /><span className="tabular">{pct(p.physicalProgressPct)}</span><span className="text-muted-foreground">{tp('plannedEnd')} {fmtDate(p.plannedEnd, locale, 'short')}</span></div>
                      <Progress value={p.physicalProgressPct} className="mt-1.5" label={p.name} />
                    </li>
                  ))}</ul>
                )}
              </Section>
              <Section title={t('detail.siteMap')}>{siteFacilities ? <CommandMap facilities={siteFacilities} evidence={siteEvidence} layers={{ boundaries: false, weredas: false, projects: false, facilities: true, evidence: true }} height={260} fitTo="data" focus={f.location ? { lng: f.location.lng, lat: f.location.lat, zoom: 14 } : null} selected={{ kind: 'FACILITY', id: f.id, props: { kind: 'FACILITY' } as never }} interactive /> : <Skeleton className="h-[260px]" />}</Section>
            </div>
          </div>
          <Section title={t('detail.evidence')} hint={tev('galleryHint')}>
            {summary && <div className="mb-3"><EvidenceSummaryStrip s={summary} /></div>}
            <EvidenceGallery items={media?.content} isLoading={ml} error={me} onRetry={mr} demoNote />
          </Section>
          <Section title={tev('inspections')} hint={tev('inspectionsHint')}>
            <DS isLoading={il} error={ie} onRetry={ir} isEmpty={!inspections?.content.length} emptyTitle={tev('empty')} rows={3}><InspectionTable rows={inspections?.content ?? []} onOpen={(i) => setOpenInspection(i.id)} hideSubject /></DS>
          </Section>
          <InspectionDrawer id={openInspection} onClose={() => setOpenInspection(null)} />
        </>
      ); })()}
    </DataState>
  );
}

function LatestAssessment({ id, photos, inventory }: { id: number; photos: number; inventory: number | null }) {
  const t = useTranslations('facilities.detail');
  const { data } = useAssessmentDetail(id);
  const [more, setMore] = React.useState(false);
  if (!data) return <Skeleton className="h-10" />;
  return (
    <div className="space-y-3 text-sm">
      <p className="rounded-md bg-muted/40 p-3"><span className="block text-xs text-muted-foreground">{t('notes')}</span>{data.notes ?? '—'}</p>
      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><Camera className="h-4 w-4" />{t('photos', { count: photos })}</span>
        <Link href={`/damage/assessments/${id}`} className="text-primary hover:underline">{t('openAssessment')}</Link>
        <button type="button" onClick={() => setMore((m) => !m)} aria-expanded={more} className="inline-flex items-center gap-1 hover:text-foreground"><ChevronDown className={cn('h-4 w-4 transition-transform', more && 'rotate-180')} />{t('moreFigures')}</button>
      </div>
      {more && <dl className="grid grid-cols-2 gap-2 rounded-md border border-dashed p-3 text-sm"><dt className="text-muted-foreground">{t('inventory')}</dt><dd className="tabular">{pct(inventory)}</dd></dl>}
    </div>
  );
}

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { AssessmentDetail } from '@/lib/api/types';
function useAssessmentDetail(id: number) { return useQuery({ queryKey: ['assessment', id], queryFn: () => api<AssessmentDetail>(`damage/assessments/${id}`), staleTime: 60_000 }); }
