'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check, ChevronRight, Landmark } from 'lucide-react';
import type { Governance, LifecycleStage, OrganizationRole, ProjectDetail } from '@/lib/api/types';
import { LIFECYCLE_STAGES } from '@/lib/api/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, Label, Textarea } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToneBadge } from '@/components/common/badges';
import { useStageTransition } from '@/lib/api/hooks';
import { useUser } from '@/providers/session';
import { canTransitionStage, stageTone } from '@/lib/domain';
import { fmtDate, fmtDateTime, money } from '@/lib/format';
import { ApiError } from '@/lib/api/client';
import { cn } from '@/lib/utils';

/** DREAM-style passport stepper: where the project is in its governance lifecycle, with dates per stage. */
export function LifecycleStepper({ d, onChange }: { d: ProjectDetail; onChange?: () => void }) {
  const t = useTranslations('projects.lifecycle');
  const locale = useLocale();
  const g = d.governance;
  const user = useUser();
  const [open, setOpen] = React.useState(false);
  const cancelled = g.stage === 'CANCELLED';
  const idx = LIFECYCLE_STAGES.indexOf(g.stage);
  const dateFor = (s: LifecycleStage): string | null => {
    const ev = [...g.stageEvents].reverse().find((e) => e.toStage === s);
    if (ev) return ev.occurredAt;
    return s === 'APPROVAL' ? g.approvedOn : s === 'FUNDING' ? g.fundingSecuredOn : s === 'IMPLEMENTATION' ? g.contractSignedOn : s === 'COMPLETION' ? g.handoverOn : null;
  };
  return (
    <div className="rounded-lg border bg-card p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold"><Landmark className="h-4 w-4 text-muted-foreground" />{t('title')}<ToneBadge tone={stageTone[g.stage]} label={t(`stages.${g.stage}`)} /></div>
        {canTransitionStage(user.roles) && g.allowedTransitions.length > 0 && <Button size="sm" variant="outline" onClick={() => setOpen(true)}>{t('transition')}<ChevronRight /></Button>}
      </div>
      <ol className="mt-3 grid grid-cols-7 gap-1" aria-label={t('title')}>
        {LIFECYCLE_STAGES.map((s, i) => {
          const done = !cancelled && i < idx, current = s === g.stage, date = dateFor(s);
          return (
            <li key={s} className="min-w-0" aria-current={current ? 'step' : undefined}>
              <div className={cn('h-1.5 rounded-full', done ? 'bg-status-good' : current ? 'bg-primary' : 'bg-muted')} />
              <div className={cn('mt-1.5 flex items-center gap-1 text-2xs font-medium', current ? 'text-foreground' : done ? 'text-muted-foreground' : 'text-muted-foreground/70')}>
                {done && <Check className="h-3 w-3 shrink-0 text-status-good" aria-hidden />}<span className="truncate">{t(`stages.${s}`)}</span>
              </div>
              <div className="truncate text-2xs text-muted-foreground tabular">{date ? fmtDate(date, locale, 'short') : ' '}</div>
            </li>
          );
        })}
      </ol>
      {cancelled && <p className="mt-2 text-xs" style={{ color: 'var(--status-critical)' }}>{t('stages.CANCELLED')}</p>}
      <StageDialog open={open} onOpenChange={setOpen} projectId={d.project.id} governance={g} onDone={onChange} />
    </div>
  );
}

function StageDialog({ open, onOpenChange, projectId, governance, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; projectId: number; governance: Governance; onDone?: () => void }) {
  const t = useTranslations('projects.lifecycle');
  const tc = useTranslations('common');
  const m = useStageTransition(projectId);
  const [to, setTo] = React.useState<LifecycleStage>(governance.allowedTransitions[0] ?? 'PLANNING');
  const [note, setNote] = React.useState(''); const [ref, setRef] = React.useState(''); const [on, setOn] = React.useState(new Date().toISOString().slice(0, 10));
  const [msg, setMsg] = React.useState<string | null>(null);
  React.useEffect(() => { setTo(governance.allowedTransitions[0] ?? 'PLANNING'); setNote(''); setRef(''); setMsg(null); }, [governance.allowedTransitions, open]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null);
    try { await m.mutateAsync({ toStage: to, note: note || undefined, reference: ref || undefined, effectiveOn: on || undefined }); setMsg(t('done')); onDone?.(); setTimeout(() => onOpenChange(false), 800); }
    catch (err) { setMsg(err instanceof ApiError ? err.detail || err.title : tc('error')); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader><DialogTitle>{t('transition')}</DialogTitle><DialogDescription>{t('transitionHint')}</DialogDescription></DialogHeader>
          <div className="space-y-1"><Label htmlFor="toStage">{t('toStage')}</Label>
            <Select value={to} onValueChange={(v) => setTo(v as LifecycleStage)}><SelectTrigger id="toStage"><SelectValue /></SelectTrigger><SelectContent>{governance.allowedTransitions.map((s) => <SelectItem key={s} value={s}>{t(`stages.${s}`)}</SelectItem>)}</SelectContent></Select></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label htmlFor="ref">{t('reference')}</Label><Input id="ref" value={ref} onChange={(e) => setRef(e.target.value)} maxLength={120} /></div>
            <div className="space-y-1"><Label htmlFor="on">{t('effectiveOn')}</Label><Input id="on" type="date" value={on} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setOn(e.target.value)} /></div>
          </div>
          <div className="space-y-1"><Label htmlFor="snote">{t('note')}</Label><Textarea id="snote" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} /></div>
          {msg && <p role="status" className="text-sm">{msg}</p>}
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{tc('cancel')}</Button><Button type="submit" disabled={m.isPending}>{tc('confirm')}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const ROLE_ORDER: OrganizationRole[] = ['IMPLEMENTING_AGENCY', 'CONTRACTOR', 'SUPERVISING_CONSULTANT', 'FUNDER', 'OVERSIGHT', 'BENEFICIARY_INSTITUTION'];

export function GovernancePanel({ g }: { g: Governance }) {
  const t = useTranslations('projects.lifecycle');
  const te = useTranslations('enums.orgType');
  const locale = useLocale();
  const orgs = [...g.organizations].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
  const rows: [string, React.ReactNode][] = [
    [t('approvedOn'), g.approvedOn ? <>{fmtDate(g.approvedOn, locale)}{g.approvalReference && <span className="ml-1 font-mono text-2xs text-muted-foreground">{g.approvalReference}</span>}</> : '—'],
    [t('fundingSecuredOn'), fmtDate(g.fundingSecuredOn, locale)],
    [t('contractSignedOn'), fmtDate(g.contractSignedOn, locale)],
    [t('contractValue'), money(g.contractValueEtb, locale)],
    [t('procurementMethod'), g.procurementMethod ?? '—'],
    [t('handoverOn'), fmtDate(g.handoverOn, locale)],
    [t('defectsLiabilityEnd'), fmtDate(g.defectsLiabilityEnd, locale)],
  ];
  return (
    <div className="grid gap-4 tablet:grid-cols-2">
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('governance')}</h4>
        <dl className="mt-2 divide-y text-sm">{rows.map(([k, v]) => <div key={k} className="flex items-center justify-between gap-3 py-1.5"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="tabular text-right">{v}</dd></div>)}</dl>
      </div>
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('organizations')}</h4>
        {orgs.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{t('noOrganizations')}</p> : (
          <ul className="mt-2 divide-y text-sm">{orgs.map((o) => <li key={`${o.id}-${o.role}`} className="flex items-start justify-between gap-3 py-1.5"><div className="min-w-0"><div className="truncate font-medium">{o.name}</div><div className="text-2xs text-muted-foreground">{te(o.orgType)}{o.contact ? ` · ${o.contact}` : ''}</div></div><span className="shrink-0 rounded border px-1.5 py-0.5 text-2xs text-muted-foreground">{t(`orgRole.${o.role}`)}</span></li>)}</ul>
        )}
      </div>
      <div className="tablet:col-span-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('history')}</h4>
        <ol className="mt-2 space-y-1.5 text-sm">{[...g.stageEvents].reverse().map((e) => <li key={e.id} className="flex flex-wrap items-baseline gap-x-2"><span className="tabular text-xs text-muted-foreground">{fmtDateTime(e.occurredAt, locale)}</span><ToneBadge tone={stageTone[e.toStage]} label={t(`stages.${e.toStage}`)} /><span className="text-xs text-muted-foreground">{e.actorName ?? 'system'}</span>{e.reference && <span className="font-mono text-2xs text-muted-foreground">{e.reference}</span>}{e.note && <span className="text-xs">{e.note}</span>}</li>)}</ol>
      </div>
    </div>
  );
}
