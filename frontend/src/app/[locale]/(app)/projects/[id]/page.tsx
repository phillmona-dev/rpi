'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { Bell, Building2, CalendarDays, Landmark, Users, HardHat, ArrowRight as ArrowRightIcon } from 'lucide-react';
import { useEvidenceGeo, useMedia, useProject, useProjectIntelligence, useProjectsGeo, useRecordProgress } from '@/lib/api/hooks';
import { LifecycleStepper, GovernancePanel } from '@/components/projects/lifecycle';
import { ApprovalBanner } from '@/components/approvals/approval-banner';
import { AssignmentList } from '@/components/field-team/assignment-list';
import { AssignDialog } from '@/components/field-team/assign-dialog';
import { useAssignments } from '@/lib/api/hooks';
import { ClipboardPlus } from 'lucide-react';
import { canManageFieldTeam, canSeeFieldTeam } from '@/lib/domain';
import { RiskScoreCard } from '@/components/projects/risk-score';
import { ProjectTimeline } from '@/components/projects/project-timeline';
import { EvidenceGallery } from '@/components/evidence/evidence-gallery';
import { EvidenceSummaryStrip } from '@/components/evidence/evidence-summary';
import { InspectionTable } from '@/components/evidence/inspection-table';
import { InspectionDrawer } from '@/components/evidence/inspection-drawer';
import { InsightCard } from '@/components/intelligence/insight-card';
import { CommandMap } from '@/components/map/command-map';
import { useInspections } from '@/lib/api/hooks';
import { Info } from 'lucide-react';
import { useBreadcrumbs } from '@/components/layout/breadcrumbs';
import { PageHeader, Section, Stat } from '@/components/common/page-header';
import { DataState } from '@/components/common/data-state';
import { HealthBadge, SeverityBadge, SectorLabel, StatusBadge, OperationalBadge } from '@/components/common/badges';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RecordDiscussion } from '@/components/messaging/record-discussion';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input, Label, Textarea } from '@/components/ui/input';
import { Link } from '@/i18n/navigation';
import { ProgressCurve } from '@/components/charts/progress-curve';
import { ChartCard } from '@/components/charts/chart-card';
import { MilestoneTimeline, ProgressLogTab, FinanceTab, RisksTab, DocumentsTab, AuditTab } from '@/components/projects/project-tabs';
import { fmtDate, localizedName, money, num, pct } from '@/lib/format';
import { healthTone, sectorSlug, toneVar, canRecordProgress, canSeeIntelligence } from '@/lib/domain';
import { useUser } from '@/providers/session';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api/client';
import { useProgressPhrase } from '@/components/dashboard/kpi-strip';

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const pid = Number(id);
  const t = useTranslations('projects');
  const tc = useTranslations('common');
  const te = useTranslations('enums');
  const locale = useLocale();
  const user = useUser();
  const { data: d, isLoading, error, refetch } = useProject(pid);
  const [tab, setTab] = React.useState('overview');
  const [openInspection, setOpenInspection] = React.useState<number | null>(null);
  const { data: siteProjects } = useProjectsGeo({ weredaId: d?.project.wereda.id }, Boolean(d));
  const { data: siteEvidence } = useEvidenceGeo({ projectId: pid }, Boolean(d));
  const { data: media, isLoading: ml, error: me, refetch: mr } = useMedia({ projectId: pid, size: 24 }, tab === 'evidence' || tab === 'overview');
  const { data: inspections, isLoading: il, error: ie, refetch: ir } = useInspections({ projectId: pid, size: 50, sort: 'visitedOn,desc' });
  const { data: intel, isLoading: xl, error: xe, refetch: xr } = useProjectIntelligence(pid, canSeeIntelligence(user.roles));
  const ti = useTranslations('intelligence');
  const tft = useTranslations('fieldTeam');
  const tm = useTranslations('messaging');
  const tev = useTranslations('evidence');
  useBreadcrumbs(d ? [
    { href: `/sectors/${sectorSlug[d.project.sector]}`, label: te(`sector.${d.project.sector}`) },
    { href: `/weredas/${d.project.wereda.id}`, label: localizedName(d.project.wereda.name, locale) },
    { label: d.project.code },
  ] : [{ label: t('title') }]);

  const phrase = useProgressPhrase();
  /** One plain sentence on where the project stands, so nobody has to read the figures to know. */
  const summary = (p: import('@/lib/api/types').ProjectDetail['project'], ms: import('@/lib/api/types').MilestoneDto[]) => {
    if (p.status === 'COMPLETED') return t('summary.completed', { date: fmtDate(p.actualEnd ?? p.plannedEnd, locale) });
    if (p.status === 'CANCELLED') return t('summary.cancelled');
    if (p.status === 'SUSPENDED') return t('summary.suspended', { done: pct(p.physicalProgressPct) });
    if (p.status !== 'ACTIVE') return t('summary.notStarted', { status: te(`status.${p.status}`), start: fmtDate(p.plannedStart, locale) });
    const finish = fmtDate(p.forecastEnd ?? p.revisedEnd ?? p.plannedEnd, locale);
    const base = t('summary.active', { done: pct(p.physicalProgressPct), planned: pct(p.plannedProgressPct), how: phrase(p.physicalProgressPct, p.plannedProgressPct).toLowerCase(), finish,
      report: p.daysSinceReport === null ? t('summary.noReport') : tc('daysAgo', { count: p.daysSinceReport }) });
    // Say why the health label is what it is when overall progress alone would not explain it.
    const today = new Date().toISOString().slice(0, 10);
    const overdue = ms.filter((m) => !m.actualDate && m.plannedDate < today).sort((a, b) => a.plannedDate.localeCompare(b.plannedDate))[0];
    const days = overdue ? Math.round((Date.parse(today) - Date.parse(overdue.plannedDate)) / 86_400_000) : 0;
    if (p.health === 'STALLED') return `${base} ${t('summary.whyStalled')}`;
    if ((p.health === 'DELAYED' || p.health === 'AT_RISK') && p.scheduleVariancePp > -5 && overdue) return `${base} ${t('summary.whyMilestone', { label: te(`health.${p.health}`), name: overdue.name, days })}`;
    if (p.health === 'AT_RISK' && p.scheduleVariancePp > -5) return `${base} ${t('summary.whyCost')}`;
    return base;
  };

  const [open, setOpen] = React.useState(false);
  const record = useRecordProgress(pid);
  const [form, setForm] = React.useState({ logDate: new Date().toISOString().slice(0, 10), physicalProgressPct: '', workforceCount: '', notes: '' });
  const [msg, setMsg] = React.useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null);
    try {
      await record.mutateAsync({ logDate: form.logDate, physicalProgressPct: Number(form.physicalProgressPct), workforceCount: form.workforceCount ? Number(form.workforceCount) : undefined, notes: form.notes || undefined });
      setMsg(t('progress.submitted')); setTimeout(() => setOpen(false), 900);
    } catch (err) { setMsg(err instanceof ApiError ? (err.errors?.map((x) => `${x.field}: ${x.message}`).join('; ') || err.detail || err.title) : tc('error')); }
  };

  return (
    <DataState isLoading={isLoading} error={error} onRetry={refetch} skeleton={<div className="space-y-4"><Skeleton className="h-16" /><Skeleton className="h-28" /><Skeleton className="h-96" /></div>}>
      {d && (() => {
        const p = d.project;
        const curve = d.progress.map((x) => ({ date: x.date, planned: x.plannedPct, actual: x.physicalPct }));
        return (
          <>
            <PageHeader
              title={<span className="flex flex-wrap items-center gap-2">{p.name}</span>}
              subtitle={<span className="flex flex-wrap items-center gap-x-3 gap-y-1"><span className="font-mono text-xs">{p.code}</span><SectorLabel sector={p.sector} /><Link href={`/weredas/${p.wereda.id}`} className="hover:underline">{localizedName(p.wereda.name, locale)} · {localizedName(p.wereda.zoneName, locale)}</Link></span>}
              meta={<><StatusBadge value={p.status} /><HealthBadge value={p.health} />{d.openAlerts > 0 && <Link href={`/alerts?entityType=PROJECT&q=${p.code}`} className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-sm font-medium" style={{ borderColor: toneVar.critical, color: toneVar.critical }}><Bell className="h-3.5 w-3.5" />{t('overview.openAlerts', { count: d.openAlerts })}</Link>}</>}
              actions={canRecordProgress(user.roles) && p.status === 'ACTIVE' && p.approvalStatus === 'APPROVED' ? <Button onClick={() => setOpen(true)}><HardHat />{t('progress.record')}</Button> : undefined}
            />

            <p className="rounded-lg border bg-card px-5 py-4 text-base leading-relaxed shadow-card">{summary(p, d.milestones)}</p>

            <div className="grid grid-cols-2 gap-3 laptop:grid-cols-4">
              <Stat label={t('columns.progress')} value={pct(p.physicalProgressPct)} hint={<><Progress value={p.physicalProgressPct} planned={p.plannedProgressPct} tone={toneVar[healthTone[p.health]]} className="mt-1.5" label={t('columns.progress')} /><span className="mt-1 block" style={{ color: p.scheduleVariancePp <= -5 ? toneVar.serious : undefined }}>{phrase(p.physicalProgressPct, p.plannedProgressPct)}</span></>} />
              <Stat label={t('columns.budget')} value={money(p.totalBudgetEtb, locale)} hint={te(`funding.${p.fundingSource}`)} />
              <Stat label={t('columns.disbursed')} value={money(p.disbursedEtb, locale)} hint={t('overview.spentOf', { spent: money(p.expendedEtb, locale), pct: pct(p.totalBudgetEtb ? (p.disbursedEtb / p.totalBudgetEtb) * 100 : 0) })} />
              <Stat label={t('overview.forecastEnd')} value={fmtDate(p.status === 'ACTIVE' && p.forecastEnd ? p.forecastEnd : (p.actualEnd ?? p.revisedEnd ?? p.plannedEnd), locale, 'short')} hint={<span style={{ color: p.forecastEnd && p.forecastEnd > (p.revisedEnd ?? p.plannedEnd) ? toneVar.serious : undefined }}>{t('overview.plannedEnd')} {fmtDate(p.revisedEnd ?? p.plannedEnd, locale, 'short')}</span>} />
            </div>

            <ApprovalBanner projectId={p.id} approval={d.approval} />

            <LifecycleStepper d={d} onChange={() => refetch()} />

            <Tabs value={tab} onValueChange={setTab}>
              <TabsList aria-label={t('title')}>
                {(['overview', 'progress', 'finance', 'evidence', 'risks', 'fieldTeam', 'discussion', 'documents', 'timeline'] as const).filter((k) => k !== 'fieldTeam' || canSeeFieldTeam(user.roles)).map((k) => <TabsTrigger key={k} value={k}>{k === 'fieldTeam' ? tft('projectTab') : k === 'discussion' ? tm('discussion') : t(`tabs.${k}`)}</TabsTrigger>)}
              </TabsList>
              <TabsContent value="overview">
                <div className="grid gap-4 desktop:grid-cols-12">
                  <div className="desktop:col-span-7 space-y-4">
                    <Section title={t('overview.description')}>
                      <p className="text-sm leading-relaxed">{d.description}</p>
                      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                        <div><dt className="text-xs text-muted-foreground flex items-center gap-1"><Landmark className="h-3 w-3" />{t('overview.agency')}</dt><dd>{p.implementingAgency ?? '—'}</dd></div>
                        <div><dt className="text-xs text-muted-foreground flex items-center gap-1"><HardHat className="h-3 w-3" />{t('overview.contractor')}</dt><dd>{p.contractorName ?? '—'}</dd></div>
                        <div><dt className="text-xs text-muted-foreground flex items-center gap-1"><CalendarDays className="h-3 w-3" />{t('overview.schedule')}</dt><dd className="tabular">{fmtDate(p.plannedStart, locale, 'short')} → {fmtDate(p.revisedEnd ?? p.plannedEnd, locale, 'short')}{p.actualStart && <span className="block text-xs text-muted-foreground">{t('overview.actualStart')} {fmtDate(p.actualStart, locale, 'short')}{p.actualEnd && <> · {t('overview.actualEnd')} {fmtDate(p.actualEnd, locale, 'short')}</>}</span>}</dd></div>
                        <div><dt className="text-xs text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" />{t('overview.beneficiaries')}</dt><dd className="tabular">{num(p.beneficiaries, locale)}</dd></div>
                      </dl>
                      {d.forecast && <p className="mt-4 rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">{t('overview.forecastBy', { provider: d.forecast.provider.replace(/_/g, ' ').toLowerCase(), confidence: Math.round((d.forecast.confidence ?? 0) * 100) })}: {d.forecast.rationale}</p>}
                    </Section>
                  </div>
                  <div className="desktop:col-span-5 space-y-4">
                    <Section title={t('overview.facilities')}>
                      <ul className="divide-y">{d.facilities.map((f) => (
                        <li key={f.id} className="flex items-center justify-between gap-3 py-2">
                          <Link href={`/facilities/${f.id}`} className="min-w-0 flex items-center gap-2 hover:underline"><Building2 className="h-4 w-4 text-muted-foreground shrink-0" /><span className="truncate text-sm font-medium">{f.name}</span></Link>
                          <span className="flex items-center gap-1.5"><SeverityBadge value={f.latestSeverity} /><OperationalBadge value={f.operationalStatus} /></span>
                        </li>
                      ))}</ul>
                    </Section>
                    <Section title={t('risk.title')} hint={t('risk.hint')}><RiskScoreCard score={d.risk.score} band={d.risk.band} components={d.risk.components} computedAt={d.risk.computedAt} lastVerifiedAt={p.lastVerifiedAt} compact /></Section>
                    <Section title={tev('title')} actions={<Button variant="ghost" size="sm" onClick={() => setTab('evidence')}>{tc('viewAll')}<ArrowRightIcon /></Button>}>
                      <EvidenceSummaryStrip s={d.evidence} />
                      <div className="mt-3"><EvidenceGallery items={media?.content.slice(0, 4)} isLoading={ml} error={me} onRetry={mr} compact /></div>
                    </Section>
                    <Section title={tev('siteMap')}>
                      <CommandMap projects={siteProjects} evidence={siteEvidence} layers={{ boundaries: false, weredas: false, projects: true, facilities: false, evidence: true }} height={240} fitTo="data" focus={p.location ? { lng: p.location.lng, lat: p.location.lat, zoom: 13 } : null} selected={{ kind: 'PROJECT', id: p.id, props: { kind: 'PROJECT' } as never }} interactive />
                    </Section>
                  </div>
                </div>
                <div className="mt-4"><Section title={t('lifecycle.governance')}><GovernancePanel g={d.governance} /></Section></div>
              </TabsContent>
              <TabsContent value="timeline" className="space-y-4"><Section title={t('timeline.title')} hint={t('timeline.hint')}><ProjectTimeline projectId={pid} /></Section><AuditTab projectId={pid} /></TabsContent>
              <TabsContent value="evidence">
                <div className="space-y-4">
                  <EvidenceSummaryStrip s={d.evidence} />
                  <Section title={tev('gallery')} hint={tev('galleryHint')}><EvidenceGallery items={media?.content} isLoading={ml} error={me} onRetry={mr} demoNote /></Section>
                  <Section title={tev('inspections')} hint={tev('inspectionsHint')}>
                    <DataState isLoading={il} error={ie} onRetry={ir} isEmpty={!inspections?.content.length} emptyTitle={tev('empty')} rows={4}><InspectionTable rows={inspections?.content ?? []} onOpen={(i) => setOpenInspection(i.id)} hideSubject /></DataState>
                  </Section>
                  <Section title={tev('siteMap')}><CommandMap projects={siteProjects} evidence={siteEvidence} layers={{ boundaries: false, weredas: false, projects: true, facilities: false, evidence: true }} height={360} fitTo="data" focus={p.location ? { lng: p.location.lng, lat: p.location.lat, zoom: 14 } : null} interactive /></Section>
                </div>
              </TabsContent>
              <TabsContent value="risks" className="space-y-4">
                <RisksTab d={d} />
                {canSeeIntelligence(user.roles) && <>
                <DataState isLoading={xl} error={xe} onRetry={xr} rows={6}>
                  {intel && (
                    <div className="grid gap-4 desktop:grid-cols-12">
                      <div className="desktop:col-span-4 space-y-4">
                        <Section title={t('risk.title')} hint={t('risk.hint')}><RiskScoreCard score={intel.riskScore} band={intel.riskBand} components={intel.riskComponents} computedAt={intel.riskComputedAt} lastVerifiedAt={p.lastVerifiedAt} /></Section>
                        <Section title={ti('forecastHistory')}>
                          {intel.forecastHistory.length === 0 ? <p className="text-sm text-muted-foreground">{tc('noneRecorded')}</p> : (
                            <ul className="divide-y text-xs">{intel.forecastHistory.slice(0, 8).map((f, i) => <li key={i} className="flex items-center justify-between gap-2 py-1.5"><span className="tabular text-muted-foreground">{fmtDate(f.computedAt, locale, 'short')}</span><span className="font-medium tabular">{fmtDate(f.forecastEnd, locale, 'short')}</span><span className="tabular">{money(f.forecastCostEtb, locale)}</span><span className="text-muted-foreground">{f.confidence !== null ? `${Math.round(f.confidence * 100)}%` : '—'}</span></li>)}</ul>
                          )}
                        </Section>
                      </div>
                      <div className="desktop:col-span-8 space-y-3">
                        {intel.insights.filter((i) => i.kind !== 'RISK_SCORE').length === 0 ? <p className="text-sm text-muted-foreground">{ti('noInsights')}</p> : intel.insights.filter((i) => i.kind !== 'RISK_SCORE').map((i) => <InsightCard key={i.id} i={i} />)}
                        <p className="flex items-start gap-1.5 text-2xs text-muted-foreground"><Info className="mt-0.5 h-3 w-3 shrink-0" />{intel.disclaimer.text}</p>
                      </div>
                    </div>
                  )}
                </DataState>
                </>}
              </TabsContent>
              <TabsContent value="progress" className="space-y-4">
                <ChartCard title={t('progress.title')} table={{ columns: [t('progress.date'), t('progress.plannedPct'), t('progress.physical')], rows: curve.map((c) => [fmtDate(c.date, locale, 'short'), c.planned, c.actual]) }}>
                  {curve.length ? <ProgressCurve data={curve} height={260} /> : <p className="text-sm text-muted-foreground">{t('progress.empty')}</p>}
                </ChartCard>
                <Section title={t('milestones.title')}><MilestoneTimeline d={d} /></Section>
                <ProgressLogTab d={d} />
              </TabsContent>
              <TabsContent value="finance"><FinanceTab d={d} /></TabsContent>
              <TabsContent value="documents"><DocumentsTab d={d} /></TabsContent>
              <TabsContent value="discussion">{tab === 'discussion' && <RecordDiscussion type="PROJECT" id={pid} />}</TabsContent>
              <TabsContent value="fieldTeam"><ProjectFieldTeam projectId={pid} code={p.code} name={p.name} status={p.status} approved={p.approvalStatus === 'APPROVED'} enabled={tab === 'fieldTeam'} /></TabsContent>
            </Tabs>

            <InspectionDrawer id={openInspection} onClose={() => setOpenInspection(null)} />
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogContent>
                <form onSubmit={submit} className="space-y-4">
                  <DialogHeader><DialogTitle>{t('progress.record')}</DialogTitle><DialogDescription>{t('progress.recordHint')} · {p.code}</DialogDescription></DialogHeader>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1"><Label htmlFor="logDate">{t('progress.logDate')}</Label><Input id="logDate" type="date" required value={form.logDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setForm({ ...form, logDate: e.target.value })} /></div>
                    <div className="space-y-1"><Label htmlFor="pct">{t('progress.physicalPct')}</Label><Input id="pct" type="number" min={p.physicalProgressPct} max={100} step="0.1" required value={form.physicalProgressPct} onChange={(e) => setForm({ ...form, physicalProgressPct: e.target.value })} /></div>
                    <div className="space-y-1"><Label htmlFor="wf">{t('progress.workforceCount')}</Label><Input id="wf" type="number" min={0} value={form.workforceCount} onChange={(e) => setForm({ ...form, workforceCount: e.target.value })} /></div>
                  </div>
                  <div className="space-y-1"><Label htmlFor="notes">{t('progress.notes')}</Label><Textarea id="notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={2000} /></div>
                  {msg && <p role="status" className="text-sm">{msg}</p>}
                  <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>{tc('cancel')}</Button><Button type="submit" disabled={record.isPending}>{t('progress.submit')}</Button></DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </>
        );
      })()}
    </DataState>
  );
}

function ProjectFieldTeam({ projectId, code, name, status, approved, enabled }: { projectId: number; code: string; name: string; status: import('@/lib/api/types').ProjectStatus; approved: boolean; enabled: boolean }) {
  const t = useTranslations('fieldTeam');
  const user = useUser();
  const manage = canManageFieldTeam(user.roles);
  const [open, setOpen] = React.useState(false);
  const { data, isLoading, error, refetch } = useAssignments({ projectId }, enabled);
  const finished = status === 'COMPLETED' || status === 'CANCELLED';
  return (
    <Section title={t('projectTab')} hint={t('projectTabHint')} actions={manage && approved && !finished && <Button onClick={() => setOpen(true)}><ClipboardPlus />{t('assign')}</Button>}>
      {!approved && <p className="mb-4 text-sm text-muted-foreground">{t('pendingProject')}</p>}
      <DataState isLoading={isLoading} error={error} onRetry={refetch} isEmpty={!data?.length} emptyTitle={t('empty.projectAssignments')}>
        <AssignmentList rows={data ?? []} show="agent" canManage={manage} />
      </DataState>
      {open && <AssignDialog open onOpenChange={setOpen} project={{ id: projectId, code, name, status }} />}
    </Section>
  );
}
