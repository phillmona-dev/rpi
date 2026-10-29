'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { CheckCircle2, Circle, ClipboardPlus, KeyRound, Pencil, Phone, Smartphone, UserCog } from 'lucide-react';
import { useFieldAgent } from '@/lib/api/hooks';
import { useBreadcrumbs } from '@/components/layout/breadcrumbs';
import { PageHeader, Section, Stat } from '@/components/common/page-header';
import { DataState } from '@/components/common/data-state';
import { AgentStatusBadge, SectorLabel, ToneBadge } from '@/components/common/badges';
import { AssignmentList } from '@/components/field-team/assignment-list';
import { AssignDialog } from '@/components/field-team/assign-dialog';
import { AccessDialog, StatusDialog } from '@/components/field-team/agent-dialogs';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Callout } from '@/components/projects/registration/ui';
import { Link } from '@/i18n/navigation';
import { useUser } from '@/providers/session';
import { canManageFieldTeam, canSeeFieldTeam, toneVar, verificationTone } from '@/lib/domain';
import type { AgentDetail } from '@/lib/api/types';
import { MessagePersonButton, RecordDiscussion } from '@/components/messaging/record-discussion';
import { fmtDate, fmtDateTime, localizedName, relTime } from '@/lib/format';

export default function FieldAgentPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations('fieldTeam');
  const user = useUser();
  const { data, isLoading, error, refetch } = useFieldAgent(Number(id));
  useBreadcrumbs([{ label: t('title'), href: '/field-team' }, { label: data?.summary.fullName ?? '…' }]);
  if (!canSeeFieldTeam(user.roles)) return <DataState isLoading={false} isEmpty emptyTitle={t('noAccess')} emptyHint={t('noAccessHint')}>{null}</DataState>;
  return (
    <DataState isLoading={isLoading} error={error} onRetry={refetch} skeleton={<div className="space-y-4"><Skeleton className="h-20" /><Skeleton className="h-28" /><Skeleton className="h-96" /></div>}>
      {data && <Profile a={data} />}
    </DataState>
  );
}

function Profile({ a }: { a: AgentDetail }) {
  const t = useTranslations('fieldTeam');
  const te = useTranslations('enums');
  const tm = useTranslations('messaging');
  const locale = useLocale();
  const user = useUser();
  const manage = canManageFieldTeam(user.roles);
  const s = a.summary;
  const [tab, setTab] = React.useState('overview');
  const [dialog, setDialog] = React.useState<'status' | 'access' | 'assign' | null>(null);
  const active = a.assignments.filter((x) => x.status === 'ACTIVE');
  const p = a.performance;

  return (
    <>
      <PageHeader
        title={s.fullName}
        subtitle={<span className="flex flex-wrap items-center gap-x-3 gap-y-1"><span className="font-mono text-sm">{s.code}</span><span>{te(`agentType.${s.agentType}`)}</span>{s.organizationName && <span>{s.organizationName}</span>}</span>}
        meta={<><AgentStatusBadge value={s.status} />{a.statusChangedAt && <span className="text-sm text-muted-foreground">{t('profile.statusSince', { date: fmtDate(a.statusChangedAt, locale) })}</span>}
          <ToneBadge tone={s.onboarded ? 'good' : 'warning'} label={s.onboarded ? t('profile.onboarded') : t('profile.notOnboarded')} />
          {s.hasAccount ? <span className="font-mono text-sm text-muted-foreground">{s.username}</span> : <span className="text-sm" style={{ color: toneVar.warning }}>{t('noAccount')}</span>}</>}
        actions={<>
          {s.username && <MessagePersonButton username={s.username} />}
          {manage && <>
          {s.status === 'ACTIVE' && <Button onClick={() => setDialog('assign')}><ClipboardPlus />{t('assign')}</Button>}
          {a.allowedTransitions.length > 0 && <Button variant="outline" onClick={() => setDialog('status')}><UserCog />{t('status.change')}</Button>}
          {s.status !== 'DEACTIVATED' && <Button variant="outline" onClick={() => setDialog('access')}><KeyRound />{s.hasAccount ? t('access.resetAction') : t('access.grant')}</Button>}
          <Button asChild variant="ghost"><Link href={`/field-team/${s.id}/edit`}><Pencil />{t('profile.edit')}</Link></Button>
          </>}
        </>}
      />

      {a.statusReason && s.status !== 'ACTIVE' && <Callout tone={s.status === 'SUSPENDED' ? 'error' : 'warning'}>{a.statusReason}</Callout>}

      <div className="grid grid-cols-1 gap-3 tablet:grid-cols-3">
        <Stat label={t('columns.workload')} value={t('workload', { active: s.activeAssignments, max: s.maxActiveAssignments })} />
        <Stat label={t('columns.overdue')} value={<span style={{ color: s.overdueVisits ? toneVar.critical : undefined }}>{s.overdueVisits}</span>} />
        <Stat label={t('columns.lastActivity')} value={s.lastInspectionOn ? fmtDate(s.lastInspectionOn, locale, 'short') : t('noVisitYet')} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label={s.fullName}>
          <TabsTrigger value="overview">{t('profile.overview')}</TabsTrigger>
          <TabsTrigger value="assignments">{t('profile.assignments')} <span className="ml-1.5 text-sm text-muted-foreground tabular">{active.length}</span></TabsTrigger>
          <TabsTrigger value="performance">{t('profile.performance')}</TabsTrigger>
          <TabsTrigger value="history">{t('profile.history')}</TabsTrigger>
          <TabsTrigger value="messages">{tm('discussion')}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-6 laptop:grid-cols-3">
            <Section title={t('profile.contact')}>
              <dl className="space-y-3 text-sm">
                <Item label={t('form.phone')} value={<a href={`tel:${s.phone}`} className="inline-flex items-center gap-1.5 font-mono hover:underline"><Phone className="h-3.5 w-3.5" />{s.phone}</a>} />
                {a.altPhone && <Item label={t('form.altPhone')} value={<span className="font-mono">{a.altPhone}</span>} />}
                {s.email && <Item label={t('form.email')} value={s.email} />}
                {a.nationalId && <Item label={t('form.nationalId')} value={a.nationalId} />}
                {a.employeeNumber && <Item label={t('form.employeeNumber')} value={a.employeeNumber} />}
                {(a.emergencyContactName || a.emergencyContactPhone) && <Item label={t('form.emergency')} value={<>{a.emergencyContactName}<span className="block font-mono text-muted-foreground">{a.emergencyContactPhone}</span></>} />}
              </dl>
            </Section>
            <Section title={t('profile.deployment')}>
              <dl className="space-y-3 text-sm">
                <Item label={t('profile.organization')} value={<>{a.organization?.name ?? '—'}{a.employmentType && <span className="text-muted-foreground"> · {te(`employmentType.${a.employmentType}`)}</span>}</>} />
                <Item label={t('profile.supervisor')} value={a.supervisor ? <Link href={`/field-team/${a.supervisor.id}`} className="hover:underline">{a.supervisor.fullName}</Link> : '—'} />
                <Item label={t('profile.home')} value={s.homeWereda ? `${localizedName(s.homeWereda.name, locale)} · ${localizedName(s.homeWereda.zoneName, locale)}` : '—'} />
                <Item label={t('form.sectors')} value={<span className="flex flex-wrap gap-x-3 gap-y-1">{s.sectors.map((x) => <SectorLabel key={x} sector={x} />)}</span>} />
                <Item label={t('profile.skills')} value={a.skills.length ? a.skills.join(' · ') : '—'} />
                <Item label={t('profile.languages')} value={a.languages.map((l) => te(`language.${l}`)).join(', ') || '—'} />
                <Item label={t('form.education')} value={<>{a.educationLevel ? te(`education.${a.educationLevel}`) : '—'}{a.yearsExperience != null && <span className="text-muted-foreground"> · {a.yearsExperience} y</span>}</>} />
              </dl>
            </Section>
            <Section title={t('profile.onboarding')}>
              <ul className="space-y-2.5 text-sm">
                <Check label={t('form.training')} date={a.trainingCompletedOn} />
                <Check label={t('form.conduct')} date={a.codeOfConductSignedOn} />
                <Check label={t('form.background')} date={a.backgroundCheckOn} />
              </ul>
              <dl className="mt-4 space-y-3 border-t pt-4 text-sm">
                <Item label={t('profile.engagement')} value={`${fmtDate(a.contractStart, locale, 'short')} → ${fmtDate(s.contractEnd, locale, 'short')}`} />
                <Item label={t('profile.device')} value={a.device ? <span className="inline-flex items-center gap-1.5"><Smartphone className="h-3.5 w-3.5" />{a.device.label ?? a.device.deviceUid}<span className="text-muted-foreground">· {relTime(a.device.lastSyncAt)}</span></span> : <span className="text-muted-foreground">{t('profile.noDevice')}</span>} />
                {a.registeredByName && <Item label="" value={<span className="text-muted-foreground">{t('profile.registered', { date: fmtDate(a.createdAt, locale), name: a.registeredByName })}</span>} />}
              </dl>
            </Section>
          </div>
          <div className="mt-6 grid gap-6 laptop:grid-cols-3">
            <Section title={t('profile.coverage')} hint={t('form.coverageHint', { count: a.coverage.length })} className="laptop:col-span-2">
              <CoverageByZone a={a} />
            </Section>
            {a.team.length > 0 ? (
              <Section title={t('profile.team')}>
                <ul className="divide-y">{a.team.map((m) => <li key={m.id} className="flex items-center justify-between gap-2 py-2.5"><Link href={`/field-team/${m.id}`} className="font-medium hover:underline">{m.fullName}</Link><span className="flex items-center gap-2 text-sm text-muted-foreground">{te(`agentType.${m.agentType}`)}<AgentStatusBadge value={m.status} /></span></li>)}</ul>
              </Section>
            ) : a.notes ? <Section title={t('form.notes')}><p className="whitespace-pre-line text-sm">{a.notes}</p></Section> : null}
          </div>
        </TabsContent>

        <TabsContent value="assignments">
          <Section title={t('profile.assignments')} actions={manage && s.status === 'ACTIVE' && <Button size="sm" onClick={() => setDialog('assign')}><ClipboardPlus />{t('assignShort')}</Button>}>
            {a.assignments.length ? <AssignmentList rows={a.assignments} show="project" canManage={manage} /> : <p className="text-sm text-muted-foreground">{t('empty.agentAssignments')}</p>}
          </Section>
        </TabsContent>

        <TabsContent value="performance">
          <div className="grid gap-6 laptop:grid-cols-5">
            <Section title={t('profile.monthly')} className="laptop:col-span-2">
              <Monthly a={a} />
              <dl className="mt-5 grid grid-cols-2 gap-3">
                <Stat label={t('profile.inspectionsTotal')} value={p.inspectionsTotal} />
                <Stat label={t('profile.distance')} value={p.avgDistanceFromSiteM === null ? '—' : `${Math.round(p.avgDistanceFromSiteM)} m`} hint={t('profile.distanceHint')} />
                <Stat label={t('profile.accuracy')} value={p.avgGpsAccuracyM === null ? '—' : `±${Math.round(p.avgGpsAccuracyM)} m`} />
                <Stat label={t('profile.acceptance')} value={p.acceptanceRate90d === null ? '—' : `${Math.round(p.acceptanceRate90d)}%`} hint={t('profile.acceptanceHint')} />
              </dl>
            </Section>
            <Section title={t('profile.recent')} className="laptop:col-span-3">
              {a.recentInspections.length ? (
                <ul className="divide-y">{a.recentInspections.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0"><div className="truncate font-medium">{r.projectId ? <Link href={`/projects/${r.projectId}`} className="hover:underline">{r.subjectName}</Link> : r.subjectName}</div>
                      <div className="text-sm text-muted-foreground">{fmtDate(r.visitedOn, locale, 'short')} · {te(`inspectionType.${r.inspectionType}`)}{r.distanceFromSiteM !== null && <> · {Math.round(r.distanceFromSiteM)} m</>}</div></div>
                    <ToneBadge tone={verificationTone[r.verificationStatus]} label={te(`verification.${r.verificationStatus}`)} />
                  </li>))}</ul>
              ) : <p className="text-sm text-muted-foreground">{t('profile.noInspections')}</p>}
            </Section>
          </div>
        </TabsContent>

        <TabsContent value="history">
          <Section title={t('profile.history')}>
            <ol className="space-y-4">{a.events.map((e) => (
              <li key={e.id} className="flex gap-3">
                <span aria-hidden className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3"><span className="font-medium">{t(`event.${e.kind}` as 'event.REGISTERED')}{e.data?.to ? <span className="font-normal text-muted-foreground"> · {te(`agentStatus.${e.data.to as 'ACTIVE'}`)}</span> : null}</span><span className="text-sm text-muted-foreground tabular">{fmtDateTime(e.occurredAt, locale)}</span></div>
                  {e.note && <p className="text-sm text-muted-foreground">{e.note}</p>}
                  {e.actorName && <p className="text-xs text-muted-foreground">{e.actorName}</p>}
                </div>
              </li>))}</ol>
          </Section>
        </TabsContent>

        <TabsContent value="messages">{tab === 'messages' && <RecordDiscussion type="FIELD_AGENT" id={s.id} hint={tm('contextHint.FIELD_AGENT')} />}</TabsContent>
      </Tabs>

      {dialog === 'status' && <StatusDialog agent={a} open onOpenChange={(o) => !o && setDialog(null)} />}
      {dialog === 'access' && <AccessDialog agent={a} open onOpenChange={(o) => !o && setDialog(null)} />}
      {dialog === 'assign' && <AssignDialog open onOpenChange={(o) => !o && setDialog(null)} agentId={s.id} agentName={s.fullName} />}
    </>
  );
}

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return <div>{label && <dt className="text-muted-foreground">{label}</dt>}<dd className="mt-0.5">{value}</dd></div>;
}

function Check({ label, date }: { label: string; date: string | null }) {
  const locale = useLocale();
  return <li className="flex items-center justify-between gap-3"><span className="flex items-center gap-2">{date ? <CheckCircle2 className="h-5 w-5" style={{ color: toneVar.good }} /> : <Circle className="h-5 w-5 text-muted-foreground" />}{label}</span><span className="text-muted-foreground tabular">{date ? fmtDate(date, locale, 'short') : '—'}</span></li>;
}

function CoverageByZone({ a }: { a: AgentDetail }) {
  const locale = useLocale();
  const zones = new Map<string, string[]>();
  for (const w of a.coverage) { const z = localizedName(w.zoneName, locale); zones.set(z, [...(zones.get(z) ?? []), localizedName(w.name, locale)]); }
  return <dl className="grid gap-4 tablet:grid-cols-2">{[...zones.entries()].map(([z, ws]) => <div key={z}><dt className="text-sm font-semibold">{z}</dt><dd className="mt-1 flex flex-wrap gap-1.5">{ws.map((w) => <span key={w} className="rounded-md border bg-muted/30 px-2 py-0.5 text-sm">{w}</span>)}</dd></div>)}</dl>;
}

function Monthly({ a }: { a: AgentDetail }) {
  const locale = useLocale();
  const max = Math.max(1, ...a.performance.monthly.map((m) => m.count));
  return (
    <div className="flex h-36 items-end gap-2" role="img" aria-label={a.performance.monthly.map((m) => `${m.month}: ${m.count}`).join(', ')}>
      {a.performance.monthly.map((m) => (
        <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
          <span className="text-xs font-medium tabular">{m.count}</span>
          <div className="w-full rounded-t" style={{ height: `${(m.count / max) * 100}px`, minHeight: 2, background: 'var(--seq-450)' }} />
          <span className="text-xs text-muted-foreground">{new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : locale, { month: 'short' }).format(new Date(`${m.month}-01`))}</span>
        </div>
      ))}
    </div>
  );
}
