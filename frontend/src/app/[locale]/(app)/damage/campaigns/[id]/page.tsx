'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { Ban, CheckCircle2, Flag, Pencil, Play, Stamp, Undo2 } from 'lucide-react';
import { PageHeader, Section } from '@/components/common/page-header';
import { DataState } from '@/components/common/data-state';
import { useBreadcrumbs } from '@/components/layout/breadcrumbs';
import { CampaignStatusBadge, SectorLabel } from '@/components/common/badges';
import { CampaignProgressBar, Fact, ReasonDialog, apiMessage } from '@/components/damage/shared';
import { SitesPanel } from '@/components/damage/sites-panel';
import { TeamPanel } from '@/components/damage/team-panel';
import { ResultsPanel } from '@/components/damage/results-panel';
import { Callout } from '@/components/projects/registration/ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Label, Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useCampaign, useCampaignAction, useCampaignActivity } from '@/lib/api/damage';
import type { CampaignDetail, CampaignStatus } from '@/lib/api/types';
import { Link } from '@/i18n/navigation';
import { useQueryParams } from '@/lib/use-query-params';
import { fmtDate, fmtDateTime, localizedName, money } from '@/lib/format';
import { toneVar } from '@/lib/domain';
import { cn } from '@/lib/utils';

const VIEWS = ['overview', 'sites', 'team', 'results', 'activity'] as const;
const STAGES: CampaignStatus[] = ['PLANNING', 'ACTIVE', 'REVIEW', 'COMPLETED'];

export default function CampaignPage() {
  const t = useTranslations('damage');
  const tc = useTranslations('common');
  const locale = useLocale();
  const id = Number(useParams<{ id: string }>().id);
  const { get, set } = useQueryParams();
  const view = (VIEWS as readonly string[]).includes(get('view') ?? '') ? (get('view') as (typeof VIEWS)[number]) : 'overview';
  const { data: c, isLoading, error, refetch } = useCampaign(id);
  const action = useCampaignAction(id);
  const [cancelling, setCancelling] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  useBreadcrumbs([{ label: t('title'), href: '/damage?view=campaigns' }, { label: c?.summary.code ?? '…' }]);
  const run = async (a: 'start' | 'close-fieldwork') => { setActionError(null); try { await action.mutateAsync({ action: a }); } catch (e) { setActionError(apiMessage(e, tc('error'))); } };

  return (
    <DataState isLoading={isLoading} error={error} onRetry={refetch} skeleton={<div className="space-y-4"><Skeleton className="h-16" /><Skeleton className="h-24" /><Skeleton className="h-96" /></div>}>
      {c && (() => { const s = c.summary; const p = c.permissions; return (
        <>
          <PageHeader title={s.name}
            subtitle={<span className="flex flex-wrap items-center gap-x-3 gap-y-1"><span className="font-mono">{s.code}</span>{s.sector ? <SectorLabel sector={s.sector} /> : <span>{t('campaign.multiSector')}</span>}
              <span>{fmtDate(s.plannedStart, locale)} – {fmtDate(s.plannedEnd, locale)}</span>{s.coordinatorName && <span>{t('campaign.coordinatedBy', { name: s.coordinatorName })}</span>}</span>}
            meta={<CampaignStatusBadge value={s.status} />}
            actions={<>
              {p.canManage && (s.status === 'PLANNING' || s.status === 'ACTIVE') && <Button asChild variant="outline"><Link href={`/damage/campaigns/${id}/edit`}><Pencil />{t('campaign.edit')}</Link></Button>}
              {p.canCancel && <Button variant="ghost" onClick={() => setCancelling(true)}><Ban />{t('campaign.cancel')}</Button>}
              {s.status === 'PLANNING' && p.canManage && <Button onClick={() => run('start')} disabled={!p.canStart || action.isPending} title={p.cannotStartReason ?? undefined}><Play />{t('campaign.start')}</Button>}
              {s.status === 'ACTIVE' && p.canManage && <Button onClick={() => run('close-fieldwork')} disabled={!p.canCloseFieldwork || action.isPending} title={p.cannotCloseReason ?? undefined}><Flag />{t('campaign.closeFieldwork')}</Button>}
            </>} />
          <Stepper campaign={c} />
          {actionError && <Callout tone="error">{actionError}</Callout>}
          {p.canManage && s.status === 'PLANNING' && p.cannotStartReason && <Callout tone="info"><span className="font-semibold">{t('campaign.toStart')}</span> {p.cannotStartReason}</Callout>}
          {p.canManage && s.status === 'ACTIVE' && p.cannotCloseReason && <Callout tone="info"><span className="font-semibold">{t('campaign.toClose')}</span> {p.cannotCloseReason}</Callout>}
          {s.status === 'REVIEW' && <EndorsePanel campaign={c} />}
          {s.status === 'CANCELLED' && c.cancelReason && <Callout tone="warning"><span className="font-semibold">{t('campaign.cancelled')}</span> {c.cancelReason}</Callout>}

          <Tabs value={view} onValueChange={(v) => set({ view: v === 'overview' ? null : v, status: null, weredaId: null, assessor: null })}>
            <TabsList aria-label={s.name}>{VIEWS.map((v) => <TabsTrigger key={v} value={v}>{t(`campaign.views.${v}`)}{v === 'sites' && <span className="ml-1.5 text-muted-foreground tabular">{s.progress.total}</span>}{v === 'team' && <span className="ml-1.5 text-muted-foreground tabular">{s.memberCount}</span>}</TabsTrigger>)}</TabsList>
            <TabsContent value="overview">
              <div className="grid gap-6 laptop:grid-cols-5">
                <div className="space-y-6 laptop:col-span-3">
                  <Section title={t('campaign.progress')}>
                    <CampaignProgressBar progress={s.progress} legend />
                    <p className="mt-3 text-sm text-muted-foreground">{t('live.progress', { pct: Math.round(s.progress.completionPct), verified: s.progress.verified, total: s.progress.total })}
                      {s.progress.overdue > 0 && <span style={{ color: toneVar.critical }}> · {t('campaign.overdueSites', { count: s.progress.overdue })}</span>}</p>
                  </Section>
                  <Section title={t('campaign.purpose')}>
                    <dl className="space-y-4">
                      <Fact label={t('campaignForm.objective')}><span className="whitespace-pre-line font-normal">{c.objective ?? '—'}</span></Fact>
                      <Fact label={t('campaignForm.methodology')}><span className="whitespace-pre-line font-normal">{c.methodology ?? '—'}</span></Fact>
                    </dl>
                  </Section>
                </div>
                <div className="space-y-6 laptop:col-span-2">
                  <Section title={t('campaign.facts')}>
                    <dl className="grid grid-cols-2 gap-4">
                      <Fact label={t('campaignForm.coordinator')}>{s.coordinatorName ?? '—'}</Fact>
                      <Fact label={t('campaign.createdBy')}>{c.createdByName ?? '—'}<span className="block text-sm font-normal text-muted-foreground">{fmtDate(c.createdAt, locale, 'short')}</span></Fact>
                      <Fact label={t('campaign.started')}>{c.startedAt ? fmtDate(c.startedAt, locale) : '—'}</Fact>
                      <Fact label={t('campaign.fieldworkClosed')}>{c.fieldworkClosedAt ? fmtDate(c.fieldworkClosedAt, locale) : '—'}</Fact>
                      <Fact label={t('campaign.columns.estimate')}>{money(s.verifiedEstimateEtb, locale)}</Fact>
                      <Fact label={t('campaign.endorsement')}>{s.endorsementReference ? <>{s.endorsementReference}<span className="block text-sm font-normal text-muted-foreground">{c.endorsedByName} · {fmtDate(s.endorsedAt, locale, 'short')}</span></> : '—'}</Fact>
                    </dl>
                    {c.endorsementNote && <p className="mt-4 rounded-md bg-muted/40 p-3 text-sm">{c.endorsementNote}</p>}
                  </Section>
                  <Section title={t('campaign.scope', { count: c.weredas.length })}>
                    <ul className="flex flex-wrap gap-1.5">{c.weredas.map((w) => <li key={w.id}><Link href={`/weredas/${w.id}`} className="inline-block rounded-full border px-2.5 py-1 text-sm hover:bg-muted/40">{localizedName(w.name, locale)} <span className="text-muted-foreground">· {localizedName(w.zoneName, locale)}</span></Link></li>)}</ul>
                  </Section>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="sites"><SitesPanel campaign={c} /></TabsContent>
            <TabsContent value="team"><TeamPanel campaign={c} /></TabsContent>
            <TabsContent value="results"><ResultsPanel campaign={c} /></TabsContent>
            <TabsContent value="activity"><Activity id={id} /></TabsContent>
          </Tabs>
          {cancelling && <ReasonDialog open onOpenChange={setCancelling} title={t('campaign.cancelTitle')} description={t('campaign.cancelHint')} label={t('campaign.cancelReason')}
            confirm={t('campaign.cancel')} destructive onConfirm={(reason) => action.mutateAsync({ action: 'cancel', reason })} />}
        </>
      ); })()}
    </DataState>
  );
}

function Stepper({ campaign: c }: { campaign: CampaignDetail }) {
  const te = useTranslations('enums.campaignStatus');
  const t = useTranslations('damage.campaign');
  const locale = useLocale();
  const s = c.summary.status;
  if (s === 'CANCELLED') return null;
  const at = STAGES.indexOf(s);
  const dates = [c.createdAt, c.startedAt, c.fieldworkClosedAt, c.summary.endorsedAt];
  return (
    <ol className="grid grid-cols-2 gap-2 tablet:grid-cols-4" aria-label={t('lifecycle')}>
      {STAGES.map((st, i) => {
        const done = i < at || s === 'COMPLETED';
        const current = i === at && s !== 'COMPLETED';
        return (
          <li key={st} className={cn('flex items-center gap-3 rounded-md border px-3 py-2.5', current && 'border-2 border-primary bg-card', done && 'bg-muted/30')} aria-current={current ? 'step' : undefined}>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold" style={{ background: done ? toneVar.good : current ? 'hsl(var(--primary))' : 'hsl(var(--muted))', color: done || current ? 'white' : undefined }}>
              {done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}</span>
            <span className="min-w-0"><span className="block font-medium">{te(st)}</span><span className="block text-xs text-muted-foreground">{dates[i] ? fmtDate(dates[i], locale, 'short') : t(`stageHint.${st}`)}</span></span>
          </li>
        );
      })}
    </ol>
  );
}

/** Sector head or Chief Executive: endorse the findings, or send the campaign back to fieldwork with comments. */
function EndorsePanel({ campaign }: { campaign: CampaignDetail }) {
  const t = useTranslations('damage.endorse');
  const tc = useTranslations('common');
  const action = useCampaignAction(campaign.summary.id);
  const [choice, setChoice] = React.useState<'APPROVE' | 'RETURN' | null>(null);
  const [note, setNote] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  if (!campaign.permissions.canEndorse) return <Callout tone="info"><span className="font-semibold">{t('waiting')}</span> {campaign.permissions.cannotEndorseReason}</Callout>;
  const submit = async () => {
    if (!choice) return;
    setError(null);
    if (choice === 'RETURN' && note.trim().length < 10) { setError(t('noteHint')); return; }
    try { await action.mutateAsync({ action: 'endorse', decision: choice, note: note.trim() || undefined }); } catch (e) { setError(apiMessage(e, tc('error'))); }
  };
  return (
    <section className="rounded-lg border-2 border-primary/40 bg-card shadow-card" aria-labelledby="endorse-title">
      <header className="border-b px-5 py-4"><h2 id="endorse-title" className="text-lg font-semibold">{t('title')}</h2><p className="mt-1 text-sm text-muted-foreground">{t('hint')}</p></header>
      <div className="grid gap-4 p-5 laptop:grid-cols-2">
        <div role="radiogroup" aria-label={t('title')} className="grid gap-2">
          {([['APPROVE', Stamp, toneVar.good], ['RETURN', Undo2, toneVar.serious]] as const).map(([k, Icon, tone]) => (
            <button key={k} type="button" role="radio" aria-checked={choice === k} onClick={() => { setChoice(k); setError(null); }}
              className={cn('flex items-start gap-3 rounded-md border-2 px-4 py-3 text-left hover:bg-muted/50', choice === k ? 'bg-muted/40' : 'border-border')} style={choice === k ? { borderColor: tone } : undefined}>
              <Icon className="mt-0.5 h-5 w-5 shrink-0" style={{ color: tone }} /><span><span className="block font-medium">{t(`options.${k}`)}</span><span className="block text-sm text-muted-foreground">{t(`effects.${k}`)}</span></span>
            </button>
          ))}
        </div>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label htmlFor="endorse-note">{choice === 'RETURN' ? t('noteRequired') : t('note')}</Label>
            <Textarea id="endorse-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={4000} className="min-h-[110px]" /></div>
          {error && <Callout tone="error">{error}</Callout>}
          {choice && <Button className="w-full" size="lg" onClick={submit} disabled={action.isPending}>{t(`confirm.${choice}`)}</Button>}
        </div>
      </div>
    </section>
  );
}

function Activity({ id }: { id: number }) {
  const t = useTranslations('damage');
  const locale = useLocale();
  const { data, isLoading, error, refetch } = useCampaignActivity(id);
  return (
    <Section title={t('campaign.views.activity')}>
      <DataState isLoading={isLoading} error={error} onRetry={refetch} isEmpty={!data?.length} emptyTitle={t('detail.noHistory')}>
        <ol className="space-y-3">
          {(data ?? []).map((a) => (
            <li key={a.id} className="flex gap-3 border-b pb-3 last:border-0">
              <span className="w-32 shrink-0 text-sm text-muted-foreground tabular">{fmtDateTime(a.occurredAt, locale)}</span>
              <div className="min-w-0">
                <div><span className="font-medium">{t(`events.${a.kind}` as 'events.SUBMITTED')}</span>{a.facilityName && <> · {a.assessmentId ? <Link href={`/damage/assessments/${a.assessmentId}`} className="text-primary hover:underline">{a.facilityName}</Link> : a.facilityName}</>}
                  {a.data && typeof a.data.agent === 'string' && <> · {a.data.agent}</>}{a.data && typeof a.data.count === 'number' && <> · {a.data.count}</>}</div>
                <div className="text-sm text-muted-foreground">{a.actorName}</div>
                {a.note && <p className="mt-1 text-sm">{a.note}</p>}
              </div>
            </li>
          ))}
        </ol>
      </DataState>
    </Section>
  );
}
