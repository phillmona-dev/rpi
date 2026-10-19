'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { Camera, MapPin, Mic } from 'lucide-react';
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
import { HealthBadge, OperationalBadge, SectorLabel, SeverityBadge, StatusBadge, ToneBadge } from '@/components/common/badges';
import { Link } from '@/i18n/navigation';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fmtDate, fmtDateTime, localizedName, money, num, pct } from '@/lib/format';
import { sectorSlug, toneVar, severityTone } from '@/lib/domain';
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
  useBreadcrumbs(f ? [{ href: `/sectors/${sectorSlug[f.sector]}`, label: te(`sector.${f.sector}`) }, { href: `/weredas/${f.wereda.id}`, label: localizedName(f.wereda.name, locale) }, { label: f.name }] : [{ label: t('title') }]);
  return (
    <DataState isLoading={isLoading} error={error} onRetry={refetch} skeleton={<div className="space-y-4"><Skeleton className="h-16" /><Skeleton className="h-28" /><Skeleton className="h-96" /></div>}>
      {data && f && (() => { const a = data.latestAssessment; return (
        <>
          <PageHeader title={f.name} subtitle={<span className="flex flex-wrap items-center gap-x-3 gap-y-1"><span className="font-mono text-xs">{f.code}</span><SectorLabel sector={f.sector} /><span>{te(`facilityType.${f.facilityType}` as 'facilityType.FACTORY')}</span><Link href={`/weredas/${f.wereda.id}`} className="inline-flex items-center gap-1 hover:underline"><MapPin className="h-3 w-3" />{localizedName(f.wereda.name, locale)}{f.kebele && <> · {t('detail.kebele')} {f.kebele}</>}</Link></span>}
            meta={<><SeverityBadge value={f.latestSeverity} /><OperationalBadge value={f.operationalStatus} /></>} />
          <div className="grid grid-cols-2 gap-3 tablet:grid-cols-3 desktop:grid-cols-6">
            <Stat label={t('detail.structural')} value={a ? <>{a.structuralImpactScore}<span className="text-sm text-muted-foreground font-normal">/100</span></> : '—'} hint={a && <Progress value={a.structuralImpactScore} tone={toneVar[severityTone[a.severity]]} className="mt-1.5" label={t('detail.structural')} />} />
            <Stat label={t('detail.inventory')} value={pct(a?.inventoryLossPct)} />
            <Stat label={t('detail.functional')} value={pct(a?.functionalCapacityPct)} />
            <Stat label={t('detail.repair')} value={money(a?.estimatedRepairCostEtb, locale)} />
            <Stat label={t('detail.replacementCost')} value={money(f.replacementEstimateEtb, locale)} />
            <Stat label={tc('beneficiaries')} value={num(f.beneficiaries, locale)} hint={f.preCrisisCapacity ? `${t('columns.capacity')}: ${num(f.preCrisisCapacity, locale)} ${f.capacityUnit ?? ''}` : undefined} />
          </div>
          <div className="grid gap-5 desktop:grid-cols-12">
            <div className="desktop:col-span-7 space-y-5">
              <Section title={t('detail.latest')} hint={a ? `${t('detail.assessor')}: ${a.assessorName} · ${fmtDate(a.assessedOn, locale)} · ${te(`source.${a.source}`)}${a.syncedAt ? ` · ${t('detail.synced', { time: fmtDateTime(a.syncedAt, locale) })}` : ''}` : undefined}>
                {!a ? <p className="text-sm text-muted-foreground">{t('detail.noAssessment')}</p> : (
                  <div className="space-y-3 text-sm">
                    <div className="flex flex-wrap items-center gap-3"><span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Camera className="h-3.5 w-3.5" />{t('detail.photos', { count: a.photoCount })}</span><span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Mic className="h-3.5 w-3.5" />{tc('none')}</span></div>
                    <AssessmentNotes id={a.id} />
                  </div>
                )}
              </Section>
              <Section title={t('detail.history')}>
                <Table><TableHeader><TableRow><TableHead>{t('columns.assessed')}</TableHead><TableHead>{t('columns.severity')}</TableHead><TableHead className="text-right">{t('columns.impact')}</TableHead><TableHead className="text-right">{t('detail.functional')}</TableHead><TableHead className="text-right">{t('detail.replacementCost')}</TableHead><TableHead>{t('detail.assessor')}</TableHead></TableRow></TableHeader>
                  <TableBody>{data.assessmentHistory.map((h) => <TableRow key={h.id}><TableCell className="tabular">{fmtDate(h.assessedOn, locale, 'short')}</TableCell><TableCell><SeverityBadge value={h.severity} /></TableCell><TableCell className="text-right tabular">{h.structuralImpactScore}</TableCell><TableCell className="text-right tabular">{pct(h.functionalCapacityPct)}</TableCell><TableCell className="text-right tabular">{money(h.estimatedReplacementCostEtb, locale)}</TableCell><TableCell className="text-xs">{h.assessorName} <span className="text-muted-foreground">· {te(`source.${h.source}`)}</span></TableCell></TableRow>)}</TableBody></Table>
              </Section>
            </div>
            <div className="desktop:col-span-5 space-y-5">
              <Section title={t('detail.projects')}>
                {data.projects.length === 0 ? <ToneBadge tone="serious" label={t('detail.noProjects')} /> : (
                  <ul className="divide-y">{data.projects.map((p) => (
                    <li key={p.id} className="py-2.5">
                      <Link href={`/projects/${p.id}`} className="text-sm font-medium hover:underline">{p.name}</Link>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs"><span className="font-mono text-muted-foreground">{p.code}</span><StatusBadge value={p.status} /><HealthBadge value={p.health} /><span className="tabular">{pct(p.physicalProgressPct)}</span><span className="text-muted-foreground">{tp('plannedEnd')} {fmtDate(p.plannedEnd, locale, 'short')}</span></div>
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

function AssessmentNotes({ id }: { id: number }) {
  const t = useTranslations('facilities.detail');
  const { data } = useAssessmentDetail(id);
  if (!data) return <Skeleton className="h-10" />;
  return <p className="rounded-md bg-muted/40 p-3 text-sm"><span className="text-xs text-muted-foreground">{t('notes')}: </span>{data.notes ?? '—'}</p>;
}

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { AssessmentDetail } from '@/lib/api/types';
function useAssessmentDetail(id: number) { return useQuery({ queryKey: ['assessment', id], queryFn: () => api<AssessmentDetail>(`damage/assessments/${id}`), staleTime: 60_000 }); }
