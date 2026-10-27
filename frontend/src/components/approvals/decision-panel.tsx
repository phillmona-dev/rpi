'use client';
import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Ban, CheckCircle2, ShieldAlert, Undo2 } from 'lucide-react';
import type { ApprovalDecision, ApprovalDossier } from '@/lib/api/types';
import { useApprovalDecision } from '@/lib/api/hooks';
import { ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Input, Label, Textarea } from '@/components/ui/input';
import { Callout } from '@/components/projects/registration/ui';
import { toneVar } from '@/lib/domain';
import { cn } from '@/lib/utils';

const OPTIONS: { key: ApprovalDecision; icon: typeof CheckCircle2; tone: string; label: 'approve' | 'return' | 'reject' }[] = [
  { key: 'APPROVE', icon: CheckCircle2, tone: toneVar.good, label: 'approve' },
  { key: 'RETURN', icon: Undo2, tone: toneVar.serious, label: 'return' },
  { key: 'REJECT', icon: Ban, tone: toneVar.critical, label: 'reject' },
];

/** The executive's decision form: one choice, the text that choice requires, and an explicit confirm button. */
export function DecisionPanel({ dossier }: { dossier: ApprovalDossier }) {
  const t = useTranslations('approvals.decision');
  const tl = useTranslations('projects.lifecycle.stages');
  const tc = useTranslations('common');
  const p = dossier.detail.project;
  const decide = useApprovalDecision(p.id);
  const [choice, setChoice] = React.useState<ApprovalDecision | null>(null);
  const [note, setNote] = React.useState('');
  const [conditions, setConditions] = React.useState('');
  const [reference, setReference] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [fieldError, setFieldError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);

  if (!dossier.canDecide) return (
    <section className="rounded-lg border bg-card p-5 shadow-card">
      <div className="flex items-start gap-3"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" /><div><h2 className="text-lg font-semibold">{t('cannot')}</h2><p className="mt-1 text-sm text-muted-foreground">{dossier.cannotDecideReason}</p></div></div>
    </section>
  );

  const needsNote = choice === 'RETURN' || choice === 'REJECT';
  const submit = async () => {
    if (!choice) return;
    setError(null); setFieldError(null);
    if (needsNote && note.trim().length < 10) { setFieldError(t('noteHint')); return; }
    try {
      const r = await decide.mutateAsync({ decision: choice, note: note.trim() || undefined, conditions: choice === 'APPROVE' ? conditions.trim() || undefined : undefined, externalReference: choice === 'APPROVE' ? reference.trim() || undefined : undefined });
      setDone(t('done', { reference: r.decisionReference ?? '' }));
    } catch (e) {
      if (e instanceof ApiError) { const f = e.errors?.find((x) => x.field === 'note'); if (f) setFieldError(f.message); else setError(e.detail || e.title); }
      else setError(tc('error'));
    }
  };

  if (done) return <section className="rounded-lg border bg-card p-5 shadow-card"><Callout>{done}</Callout></section>;

  return (
    <section aria-labelledby="decision-title" className="rounded-lg border-2 border-primary/40 bg-card shadow-card">
      <header className="border-b px-5 py-4"><h2 id="decision-title" className="text-lg font-semibold">{t('title')}</h2><p className="mt-1 text-sm text-muted-foreground">{t('hint')}</p></header>
      <div className="space-y-5 p-5">
        <div role="radiogroup" aria-label={t('title')} className="grid gap-2">
          {OPTIONS.map((o) => {
            const active = choice === o.key;
            return (
              <button key={o.key} type="button" role="radio" aria-checked={active} onClick={() => { setChoice(o.key); setFieldError(null); setError(null); }}
                className={cn('flex items-center gap-3 rounded-md border-2 px-4 py-3 text-left text-base font-medium transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring', active ? 'bg-muted/40' : 'border-border')}
                style={active ? { borderColor: o.tone } : undefined}>
                <o.icon className="h-5 w-5 shrink-0" style={{ color: o.tone }} aria-hidden />{t(o.label)}
              </button>
            );
          })}
        </div>

        {choice === 'APPROVE' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t('approveEffect', { stage: tl(p.lifecycleStage) })}</p>
            <div className="space-y-1.5"><Label htmlFor="cond">{t('conditions')}</Label><Textarea id="cond" value={conditions} onChange={(e) => setConditions(e.target.value)} maxLength={4000} className="min-h-[80px]" /><p className="text-xs text-muted-foreground">{t('conditionsHint')}</p></div>
            <div className="space-y-1.5"><Label htmlFor="xref">{t('externalReference')}</Label><Input id="xref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} /><p className="text-xs text-muted-foreground">{t('externalReferenceHint')}</p></div>
            <div className="space-y-1.5"><Label htmlFor="anote">{t('approveNote')}</Label><Textarea id="anote" value={note} onChange={(e) => setNote(e.target.value)} maxLength={4000} className="min-h-[70px]" /></div>
          </div>
        )}
        {needsNote && (
          <div className="space-y-3">
            {choice === 'REJECT' && <Callout tone="warning">{t('rejectWarning')}</Callout>}
            <div className="space-y-1.5">
              <Label htmlFor="dnote">{t('note')}<span className="ml-0.5 text-destructive" aria-hidden>*</span></Label>
              <Textarea id="dnote" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('notePlaceholder')} maxLength={4000} className={cn('min-h-[110px]', fieldError && 'border-destructive')} aria-invalid={Boolean(fieldError)} aria-describedby="dnote-hint" />
              <p id="dnote-hint" className={cn('text-xs', fieldError ? 'text-destructive' : 'text-muted-foreground')}>{fieldError ?? t('noteHint')}</p>
            </div>
          </div>
        )}
        {error && <Callout tone="error">{error}</Callout>}
        {choice && (
          <Button className="w-full" size="lg" variant={choice === 'REJECT' ? 'destructive' : 'default'} onClick={submit} disabled={decide.isPending}>
            {choice === 'APPROVE' ? t('confirmApprove') : choice === 'RETURN' ? t('confirmReturn') : t('confirmReject')}
          </Button>
        )}
      </div>
    </section>
  );
}
