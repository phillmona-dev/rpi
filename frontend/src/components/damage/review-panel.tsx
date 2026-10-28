'use client';
import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Ban, CheckCircle2, ShieldAlert, Undo2 } from 'lucide-react';
import type { AssessmentDetail, ReviewDecision } from '@/lib/api/types';
import { useReviewAssessment } from '@/lib/api/damage';
import { ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Label, Textarea } from '@/components/ui/input';
import { Callout } from '@/components/projects/registration/ui';
import { toneVar } from '@/lib/domain';
import { cn } from '@/lib/utils';

const OPTIONS: { key: ReviewDecision; icon: typeof CheckCircle2; tone: string }[] = [
  { key: 'VERIFY', icon: CheckCircle2, tone: toneVar.good },
  { key: 'RETURN', icon: Undo2, tone: toneVar.serious },
  { key: 'REJECT', icon: Ban, tone: toneVar.critical },
];

/** Verification of a submitted assessment by someone other than its author: one choice, the reason it needs, and a confirm. */
export function ReviewPanel({ assessment }: { assessment: AssessmentDetail }) {
  const t = useTranslations('damage.review');
  const tc = useTranslations('common');
  const review = useReviewAssessment(assessment.summary.id);
  const [choice, setChoice] = React.useState<ReviewDecision | null>(null);
  const [note, setNote] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [fieldError, setFieldError] = React.useState<string | null>(null);

  if (assessment.summary.status !== 'SUBMITTED') return null;
  if (!assessment.permissions.canReview) return (
    <section className="rounded-lg border bg-card p-5 shadow-card">
      <div className="flex items-start gap-3"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" /><div><h2 className="text-lg font-semibold">{t('cannot')}</h2><p className="mt-1 text-sm text-muted-foreground">{assessment.permissions.cannotReviewReason}</p></div></div>
    </section>
  );

  const needsNote = choice === 'RETURN' || choice === 'REJECT';
  const submit = async () => {
    if (!choice) return;
    setError(null); setFieldError(null);
    if (needsNote && note.trim().length < 10) { setFieldError(t('noteHint')); return; }
    try { await review.mutateAsync({ decision: choice, note: note.trim() || undefined }); setChoice(null); setNote(''); }
    catch (e) {
      if (e instanceof ApiError) { const f = e.errors?.find((x) => x.field === 'note'); if (f) setFieldError(f.message); else setError(e.detail || e.title); }
      else setError(tc('error'));
    }
  };

  return (
    <section aria-labelledby="review-title" className="rounded-lg border-2 border-primary/40 bg-card shadow-card">
      <header className="border-b px-5 py-4"><h2 id="review-title" className="text-lg font-semibold">{t('title')}</h2><p className="mt-1 text-sm text-muted-foreground">{t('hint')}</p></header>
      <div className="space-y-5 p-5">
        <div role="radiogroup" aria-label={t('title')} className="grid gap-2">
          {OPTIONS.map((o) => {
            const active = choice === o.key;
            return (
              <button key={o.key} type="button" role="radio" aria-checked={active} onClick={() => { setChoice(o.key); setFieldError(null); setError(null); }}
                className={cn('flex items-start gap-3 rounded-md border-2 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring', active ? 'bg-muted/40' : 'border-border')}
                style={active ? { borderColor: o.tone } : undefined}>
                <o.icon className="mt-0.5 h-5 w-5 shrink-0" style={{ color: o.tone }} aria-hidden />
                <span><span className="block text-base font-medium">{t(`options.${o.key}`)}</span><span className="block text-sm text-muted-foreground">{t(`effects.${o.key}`)}</span></span>
              </button>
            );
          })}
        </div>
        {choice && (
          <div className="space-y-1.5">
            <Label htmlFor="review-note">{needsNote ? t('note') : t('noteOptional')}{needsNote && <span className="ml-0.5 text-destructive" aria-hidden>*</span>}</Label>
            <Textarea id="review-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={needsNote ? t('notePlaceholder') : undefined} maxLength={4000}
              className={cn('min-h-[100px]', fieldError && 'border-destructive')} aria-invalid={Boolean(fieldError)} aria-describedby="review-note-hint" />
            <p id="review-note-hint" className={cn('text-xs', fieldError ? 'text-destructive' : 'text-muted-foreground')}>{fieldError ?? (needsNote ? t('noteHint') : t('verifyHint'))}</p>
          </div>
        )}
        {error && <Callout tone="error">{error}</Callout>}
        {choice && <Button className="w-full" size="lg" variant={choice === 'REJECT' ? 'destructive' : 'default'} onClick={submit} disabled={review.isPending}>{t(`confirm.${choice}`)}</Button>}
      </div>
    </section>
  );
}
