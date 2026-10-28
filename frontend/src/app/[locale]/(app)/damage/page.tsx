'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ClipboardCheck, FolderPlus, HardHat, Hourglass, ListChecks, MapPinned, Plus } from 'lucide-react';
import { PageHeader, Section } from '@/components/common/page-header';
import { useBreadcrumbs } from '@/components/layout/breadcrumbs';
import { useAssessments } from '@/lib/api/hooks';
import { useCampaigns, useDamageOverview, useNeeds } from '@/lib/api/damage';
import { useQueryParams } from '@/lib/use-query-params';
import { DataState, TableSkeleton } from '@/components/common/data-state';
import { DataTable, Pagination, type Column } from '@/components/common/data-table';
import { KpiRow, KpiTile } from '@/components/common/kpi-tile';
import { AssessmentStatusBadge, CampaignStatusBadge, NeedPriorityBadge, SectorDot, SeverityBadge } from '@/components/common/badges';
import { CampaignProgressBar } from '@/components/damage/shared';
import { MyTasks } from '@/components/damage/my-tasks';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import type { AssessmentSummary, CampaignSummary, DamageSeverity, Need } from '@/lib/api/types';
import { SECTORS } from '@/lib/api/types';
import { Link, useRouter } from '@/i18n/navigation';
import { fmtDate, localizedName, money, num, relTime } from '@/lib/format';
import { canCreateProject, canManageCampaigns, canSeeDamage, isFieldTeam, severityTone, toneVar } from '@/lib/domain';
import { useUser } from '@/providers/session';

const VIEWS = ['overview', 'campaigns', 'review', 'register', 'needs'] as const;
const SEVERITIES: DamageSeverity[] = ['DESTROYED', 'SEVERE', 'MODERATE', 'MINOR', 'NONE'];

export default function DamagePage() {
  const t = useTranslations('damage');
  const user = useUser();
  useBreadcrumbs([{ label: t('title') }]);
  // Field team members work from their own site list.
  if (!canSeeDamage(user.roles)) {
    return <>
      <PageHeader title={t('mine.title')} subtitle={t('mine.subtitle')} />
      {isFieldTeam(user.roles) ? <MyTasks /> : <DataState isLoading={false} isEmpty emptyTitle={t('noAccess')}>{null}</DataState>}
    </>;
  }
  return <Hub />;
}

function Hub() {
  const t = useTranslations('damage');
  const te = useTranslations('enums');
  const user = useUser();
  const { get, set } = useQueryParams();
  const view = (VIEWS as readonly string[]).includes(get('view') ?? '') ? (get('view') as (typeof VIEWS)[number]) : 'overview';
  const sector = user.sectorScope ?? get('sector');
  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} actions={<>
        {!user.sectorScope && (
          <Select value={get('sector') ?? 'ALL'} onValueChange={(v) => set({ sector: v === 'ALL' ? null : v })}>
            <SelectTrigger className="w-[170px]" aria-label={t('filters.sector')}><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="ALL">{t('filters.allSectors')}</SelectItem>{SECTORS.map((s) => <SelectItem key={s} value={s}>{te(`sector.${s}`)}</SelectItem>)}</SelectContent>
          </Select>
        )}
        {canManageCampaigns(user.roles) && <Button asChild size="lg"><Link href="/damage/campaigns/new"><Plus />{t('newCampaign')}</Link></Button>}
      </>} />
      <Tabs value={view} onValueChange={(v) => set({ view: v === 'overview' ? null : v, page: null, status: null })}>
        <TabsList aria-label={t('title')}>{VIEWS.map((v) => <TabsTrigger key={v} value={v}>{t(`views.${v}`)}</TabsTrigger>)}</TabsList>
        <TabsContent value="overview"><Overview sector={sector} /></TabsContent>
        <TabsContent value="campaigns"><Campaigns sector={sector} /></TabsContent>
        <TabsContent value="review"><Register sector={sector} review /></TabsContent>
        <TabsContent value="register"><Register sector={sector} /></TabsContent>
        <TabsContent value="needs"><Needs sector={sector} /></TabsContent>
      </Tabs>
    </>
  );
}

/* ─── Overview ─────────────────────────────────────────────────────────────── */
function Overview({ sector }: { sector: string | null }) {
  const t = useTranslations('damage');
  const te = useTranslations('enums.severity');
  const locale = useLocale();
  const { data: o, isLoading } = useDamageOverview(sector as never);
  const { data: campaigns } = useCampaigns({ sector: sector ?? undefined });
  const live = (campaigns ?? []).filter((c) => c.status === 'ACTIVE' || c.status === 'REVIEW' || c.status === 'PLANNING');
  const sevTotal = o ? SEVERITIES.reduce((a, s) => a + (o.facilitiesBySeverity[s] ?? 0), 0) : 0;
  const mine = o?.mine;
  return (
    <div className="space-y-6">
      {mine && (mine.toAssess > 0 || mine.returned > 0 || mine.toReview > 0) && (
        <section className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border-2 border-primary/40 bg-card px-5 py-4 shadow-card" aria-label={t('queue.title')}>
          <h2 className="text-base font-semibold">{t('queue.title')}</h2>
          {mine.toReview > 0 && <Link href="/damage?view=review" className="font-medium text-primary hover:underline">{t('queue.toReview', { count: mine.toReview })}</Link>}
          {mine.toAssess > 0 && <Link href="/damage/my-tasks" className="font-medium text-primary hover:underline">{t('queue.toAssess', { count: mine.toAssess })}</Link>}
          {mine.returned > 0 && <Link href="/damage/my-tasks" className="font-medium hover:underline" style={{ color: toneVar.serious }}>{t('queue.returned', { count: mine.returned })}</Link>}
        </section>
      )}
      <KpiRow>
        <KpiTile loading={isLoading} icon={HardHat} label={t('kpi.campaigns')} value={o?.campaignsActive ?? 0} href="/damage?view=campaigns"
          hint={o && t('kpi.campaignsHint', { planning: o.campaignsPlanning, review: o.campaignsInReview, completed: o.campaignsCompleted })} />
        <KpiTile loading={isLoading} icon={MapPinned} label={t('kpi.sites')} value={o ? `${num(o.sitesVerified, locale)} / ${num(o.sitesTotal, locale)}` : '—'}
          hint={o && t('kpi.sitesHint', { outstanding: o.sitesOutstanding, inaccessible: o.sitesInaccessible })} />
        <KpiTile loading={isLoading} icon={Hourglass} label={t('kpi.review')} value={o?.awaitingReview ?? 0} href="/damage?view=review"
          accent={o && o.awaitingReview > 0 ? toneVar.warning : undefined} hint={o && t('kpi.reviewHint', { days: o.oldestAwaitingDays ?? 0, returned: o.returned })} />
        <KpiTile loading={isLoading} icon={FolderPlus} label={t('kpi.needs')} value={o?.needsAwaitingProject ?? 0} href="/damage?view=needs"
          accent={o && o.needsAwaitingProject > 0 ? toneVar.serious : undefined} hint={o && t('kpi.needsHint', { estimate: money(o.needsEstimateEtb, locale) })} />
      </KpiRow>

      <div className="grid gap-6 laptop:grid-cols-5">
        <Section title={t('picture.title')} hint={t('picture.hint')} className="laptop:col-span-2">
          {o && (
            <div className="space-y-3">
              <div className="flex h-4 overflow-hidden rounded-full bg-muted" role="img" aria-label={SEVERITIES.map((s) => `${te(s)} ${o.facilitiesBySeverity[s] ?? 0}`).join(', ')}>
                {SEVERITIES.map((s) => <div key={s} style={{ width: `${((o.facilitiesBySeverity[s] ?? 0) / Math.max(sevTotal, 1)) * 100}%`, background: toneVar[severityTone[s]] }} />)}
              </div>
              <ul className="grid grid-cols-2 gap-2 text-sm">
                {SEVERITIES.map((s) => (
                  <li key={s}><Link href={`/facilities?severity=${s}`} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 hover:bg-muted/40">
                    <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm" style={{ background: toneVar[severityTone[s]] }} />{te(s)}</span>
                    <span className="font-semibold tabular">{num(o.facilitiesBySeverity[s] ?? 0, locale)}</span></Link></li>
                ))}
                <li className="flex items-center justify-between gap-2 rounded-md border border-dashed px-3 py-2"><span>{t('picture.never')}</span><span className="font-semibold tabular">{num(o.facilitiesNeverAssessed, locale)}</span></li>
              </ul>
              <p className="text-sm text-muted-foreground">{t('picture.replacement', { amount: money(o.verifiedReplacementEtb, locale) })}</p>
            </div>
          )}
        </Section>
        <Section title={t('live.title')} className="laptop:col-span-3" actions={<Link href="/damage?view=campaigns" className="text-sm font-medium text-primary hover:underline">{t('live.all')}</Link>}>
          {!live.length ? <p className="text-sm text-muted-foreground">{t('live.none')}</p> : (
            <ul className="divide-y">
              {live.map((c) => (
                <li key={c.id} className="py-3 first:pt-0 last:pb-0">
                  <Link href={`/damage/campaigns/${c.id}`} className="block rounded-md hover:bg-muted/30">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0"><div className="font-semibold">{c.name}</div><div className="text-sm text-muted-foreground">{c.code} · {c.coordinatorName}</div></div>
                      <CampaignStatusBadge value={c.status} />
                    </div>
                    <CampaignProgressBar progress={c.progress} className="mt-2" />
                    <div className="mt-1 text-sm text-muted-foreground tabular">{t('live.progress', { pct: Math.round(c.progress.completionPct), verified: c.progress.verified, total: c.progress.total })}</div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}

/* ─── Campaigns ────────────────────────────────────────────────────────────── */
function Campaigns({ sector }: { sector: string | null }) {
  const t = useTranslations('damage');
  const te = useTranslations('enums');
  const locale = useLocale();
  const router = useRouter();
  const { get, set } = useQueryParams();
  const status = get('status');
  const { data, isLoading, error, refetch } = useCampaigns({ sector: sector ?? undefined, status: status ?? undefined });
  const cols: Column<CampaignSummary>[] = [
    { key: 'name', header: t('campaign.columns.campaign'), cell: (c) => <div className="min-w-[240px]"><div className="font-semibold">{c.name}</div><div className="flex items-center gap-1.5 text-sm text-muted-foreground">{c.sector ? <><SectorDot sector={c.sector} />{te(`sector.${c.sector}`)}</> : t('campaign.multiSector')} · {c.code}</div></div> },
    { key: 'status', header: t('campaign.columns.status'), cell: (c) => <CampaignStatusBadge value={c.status} /> },
    { key: 'dates', header: t('campaign.columns.dates'), cell: (c) => <div className="whitespace-nowrap text-sm">{fmtDate(c.plannedStart, locale, 'short')} – {fmtDate(c.plannedEnd, locale, 'short')}
      {c.daysLeft !== null && <div className="text-xs" style={{ color: c.daysLeft < 0 ? toneVar.critical : undefined }}>{c.daysLeft < 0 ? t('campaign.overdueBy', { days: -c.daysLeft }) : t('campaign.daysLeft', { days: c.daysLeft })}</div>}</div> },
    { key: 'progress', header: t('campaign.columns.progress'), cell: (c) => <div className="w-48"><CampaignProgressBar progress={c.progress} /><div className="mt-1 text-xs text-muted-foreground tabular">{t('live.progress', { pct: Math.round(c.progress.completionPct), verified: c.progress.verified, total: c.progress.total })}</div></div> },
    { key: 'team', header: t('campaign.columns.team'), align: 'right', cell: (c) => <span className="tabular">{c.memberCount}</span> },
    { key: 'weredas', header: t('campaign.columns.weredas'), align: 'right', cell: (c) => <span className="tabular">{c.weredaCount}</span> },
    { key: 'estimate', header: t('campaign.columns.estimate'), align: 'right', cell: (c) => money(c.verifiedEstimateEtb, locale) },
  ];
  return (
    <Section title={t('views.campaigns')} actions={
      <Select value={status ?? 'ALL'} onValueChange={(v) => set({ status: v === 'ALL' ? null : v })}>
        <SelectTrigger className="w-[180px]" aria-label={t('campaign.columns.status')}><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="ALL">{t('filters.allStatuses')}</SelectItem>{(['PLANNING', 'ACTIVE', 'REVIEW', 'COMPLETED', 'CANCELLED'] as const).map((s) => <SelectItem key={s} value={s}>{te(`campaignStatus.${s}`)}</SelectItem>)}</SelectContent>
      </Select>}>
      <DataState isLoading={isLoading} error={error} onRetry={refetch} isEmpty={!data?.length} emptyTitle={t('campaign.empty')} emptyHint={t('campaign.emptyHint')} skeleton={<TableSkeleton cols={7} />}>
        <DataTable columns={cols} rows={data ?? []} rowKey={(c) => c.id} onRowClick={(c) => router.push(`/damage/campaigns/${c.id}`)} rowClassName={(c) => c.status === 'CANCELLED' ? 'opacity-60' : undefined} />
      </DataState>
    </Section>
  );
}

/* ─── Register / review queue ──────────────────────────────────────────────── */
function Register({ sector, review }: { sector: string | null; review?: boolean }) {
  const t = useTranslations('damage');
  const te = useTranslations('enums');
  const tf = useTranslations('facilities.filters');
  const locale = useLocale();
  const router = useRouter();
  const { get, set } = useQueryParams();
  const page = Number(get('page') ?? 0), size = Number(get('size') ?? 25);
  const status = review ? (get('status') ?? 'SUBMITTED') : get('status');
  const { data, isLoading, error, refetch } = useAssessments({ page, size, sort: review ? 'submittedAt,asc' : 'assessedOn,desc', sector: sector ?? undefined, severity: get('severity'), status: status ?? undefined });
  const cols: Column<AssessmentSummary>[] = [
    { key: 'date', header: review ? t('columns.submitted') : t('columns.date'), cell: (a) => <div className="whitespace-nowrap tabular">{fmtDate(review ? a.submittedAt : a.assessedOn, locale, 'short')}{review && a.submittedAt && <div className="text-xs text-muted-foreground">{relTime(a.submittedAt)}</div>}</div> },
    { key: 'facility', header: t('columns.facility'), cell: (a) => <div className="min-w-[220px]"><div className="flex items-center gap-1.5 font-medium"><SectorDot sector={a.facility.sector} />{a.facility.name}</div><div className="text-sm text-muted-foreground">{te(`facilityType.${a.facility.facilityType}` as 'facilityType.FACTORY')} · {localizedName(a.facility.wereda.name, locale)}</div></div> },
    { key: 'status', header: t('columns.status'), cell: (a) => <AssessmentStatusBadge value={a.status} /> },
    { key: 'severity', header: t('columns.severity'), cell: (a) => <SeverityBadge value={a.severity} /> },
    { key: 'intervention', header: t('columns.intervention'), cell: (a) => a.recommendedIntervention ? te(`intervention.${a.recommendedIntervention}`) : <span className="text-muted-foreground">—</span> },
    { key: 'replacement', header: t('columns.replacement'), align: 'right', cell: (a) => money(a.estimatedReplacementCostEtb, locale) },
    { key: 'campaign', header: t('columns.campaign'), cell: (a) => a.campaignCode ? <span className="font-mono text-sm">{a.campaignCode}</span> : <span className="text-sm text-muted-foreground">{t('adHoc')}</span> },
    { key: 'assessor', header: t('columns.assessor'), cell: (a) => <div className="text-sm">{a.assessorName}<div className="text-xs text-muted-foreground">{te(`source.${a.source}`)}{a.photoCount ? ` · ${t('photos', { count: a.photoCount })}` : ''}</div></div> },
  ];
  return (
    <Section title={review ? t('views.review') : t('views.register')} hint={review ? t('reviewHint') : undefined} actions={<>
      <Select value={status ?? 'ALL'} onValueChange={(v) => set({ status: v === (review ? 'SUBMITTED' : 'ALL') ? null : v, page: null })}>
        <SelectTrigger className="w-[180px]" aria-label={t('columns.status')}><SelectValue /></SelectTrigger>
        <SelectContent>{!review && <SelectItem value="ALL">{t('filters.allStatuses')}</SelectItem>}{(['SUBMITTED', 'RETURNED', 'VERIFIED', 'REJECTED'] as const).map((s) => <SelectItem key={s} value={s}>{te(`assessmentStatus.${s}`)}</SelectItem>)}</SelectContent>
      </Select>
      {!review && <Select value={get('severity') ?? 'ALL'} onValueChange={(v) => set({ severity: v === 'ALL' ? null : v, page: null })}><SelectTrigger className="w-[180px]" aria-label={tf('severity')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">{tf('severity')}: {t('filters.all')}</SelectItem>{SEVERITIES.map((s) => <SelectItem key={s} value={s}>{te(`severity.${s}`)}</SelectItem>)}</SelectContent></Select>}
    </>}>
      <DataState isLoading={isLoading} error={error} onRetry={refetch} isEmpty={!data?.content.length} emptyTitle={review ? t('reviewEmpty') : t('registerEmpty')} skeleton={<TableSkeleton cols={8} rows={10} />}>
        <DataTable columns={cols} rows={data?.content ?? []} rowKey={(a) => a.id} onRowClick={(a) => router.push(`/damage/assessments/${a.id}`)} />
        {data && <Pagination page={data.page} totalPages={data.totalPages} totalElements={data.totalElements} size={data.size} onPage={(p) => set({ page: String(p) }, false)} onSize={(s) => set({ size: String(s) })} />}
      </DataState>
    </Section>
  );
}

/* ─── Verified needs ───────────────────────────────────────────────────────── */
function Needs({ sector }: { sector: string | null }) {
  const t = useTranslations('damage');
  const te = useTranslations('enums');
  const locale = useLocale();
  const user = useUser();
  const router = useRouter();
  const { get, set } = useQueryParams();
  const { data, isLoading, error, refetch } = useNeeds({ sector: sector ?? undefined, priority: get('priority') ?? undefined });
  const create = canCreateProject(user.roles);
  const cols: Column<Need>[] = [
    { key: 'priority', header: t('columns.priority'), cell: (n) => <NeedPriorityBadge value={n.assessment.interventionPriority} /> },
    { key: 'facility', header: t('columns.facility'), cell: (n) => <div className="min-w-[220px]"><div className="flex items-center gap-1.5 font-medium"><SectorDot sector={n.assessment.facility.sector} />{n.assessment.facility.name}</div><div className="text-sm text-muted-foreground">{localizedName(n.assessment.facility.wereda.name, locale)} · {localizedName(n.assessment.facility.wereda.zoneName, locale)}</div></div> },
    { key: 'severity', header: t('columns.severity'), cell: (n) => <SeverityBadge value={n.assessment.severity} /> },
    { key: 'intervention', header: t('columns.intervention'), cell: (n) => n.assessment.recommendedIntervention ? te(`intervention.${n.assessment.recommendedIntervention}`) : <span className="text-muted-foreground">{t('needs.unspecified')}</span> },
    { key: 'estimate', header: t('columns.estimate'), align: 'right', cell: (n) => <span className="font-medium">{money(n.estimateEtb, locale)}</span> },
    { key: 'people', header: t('columns.beneficiaries'), align: 'right', cell: (n) => <span className="tabular">{num(n.assessment.beneficiariesAffected, locale)}</span> },
    { key: 'source', header: t('columns.source'), cell: (n) => <div className="text-sm">{n.campaignName ?? t('adHoc')}<div className="text-xs text-muted-foreground">{t('needs.verifiedAgo', { days: n.ageDays })}</div></div> },
    ...(create ? [{ key: 'act', header: <span className="sr-only">{t('needs.register')}</span>, cell: (n: Need) => (
      <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); router.push(`/projects/new?assessment=${n.assessment.id}`); }}><FolderPlus />{t('needs.register')}</Button>) }] : []),
  ];
  return (
    <div className="space-y-4">
      {data && (
        <KpiRow>
          <KpiTile icon={ListChecks} label={t('needs.count')} value={num(data.summary.count, locale)} />
          <KpiTile icon={FolderPlus} label={t('needs.estimate')} value={money(data.summary.totalEstimateEtb, locale)} />
          <KpiTile icon={ClipboardCheck} label={t('needs.urgent')} value={num(data.summary.urgent, locale)} accent={data.summary.urgent ? toneVar.critical : undefined} />
          <KpiTile icon={MapPinned} label={t('needs.people')} value={num(data.summary.beneficiaries, locale)} />
        </KpiRow>
      )}
      <Section title={t('views.needs')} hint={t('needs.hint')} actions={
        <Select value={get('priority') ?? 'ALL'} onValueChange={(v) => set({ priority: v === 'ALL' ? null : v })}>
          <SelectTrigger className="w-[170px]" aria-label={t('columns.priority')}><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="ALL">{t('filters.allPriorities')}</SelectItem>{(['URGENT', 'HIGH', 'MEDIUM', 'LOW'] as const).map((p) => <SelectItem key={p} value={p}>{te(`needPriority.${p}`)}</SelectItem>)}</SelectContent>
        </Select>}>
        <DataState isLoading={isLoading} error={error} onRetry={refetch} isEmpty={!data?.items.length} emptyTitle={t('needs.empty')} emptyHint={t('needs.emptyHint')} skeleton={<TableSkeleton cols={8} />}>
          <DataTable columns={cols} rows={data?.items ?? []} rowKey={(n) => n.assessment.id} onRowClick={(n) => router.push(`/damage/assessments/${n.assessment.id}`)} />
        </DataState>
      </Section>
    </div>
  );
}
