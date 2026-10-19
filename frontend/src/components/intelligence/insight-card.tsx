'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowUpRight, Bot, Ruler } from 'lucide-react';
import type { InsightDto, InsightStatus } from '@/lib/api/types';
import { AlertSeverityBadge, SectorDot, ToneBadge } from '@/components/common/badges';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Link } from '@/i18n/navigation';
import { useReviewInsight } from '@/lib/api/hooks';
import { useUser } from '@/providers/session';
import { canReviewInsights } from '@/lib/domain';
import { fmtDateTime, relTime } from '@/lib/format';
import { ApiError } from '@/lib/api/client';

/** One advisory insight: what it says, the data behind it, who produced it, and the human review trail. */
export function InsightCard({ i, showSubject }: { i: InsightDto; showSubject?: boolean }) {
  const t = useTranslations('intelligence');
  const tc = useTranslations('common');
  const te = useTranslations('enums.entityType');
  const locale = useLocale();
  const user = useUser();
  const review = useReviewInsight();
  const [mode, setMode] = React.useState<InsightStatus | null>(null);
  const [note, setNote] = React.useState('');
  const [msg, setMsg] = React.useState<string | null>(null);
  const href = i.entityType === 'PROJECT' ? `/projects/${i.entityId}` : i.entityType === 'FACILITY' ? `/facilities/${i.entityId}` : `/weredas/${i.entityId}`;
  const submit = async () => {
    if (!mode) return; setMsg(null);
    if (mode === 'DISMISSED' && !note.trim()) { setMsg(t('dismissNote')); return; }
    try { await review.mutateAsync({ id: i.id, status: mode, note: note.trim() || undefined }); setMode(null); setNote(''); }
    catch (e) { setMsg(e instanceof ApiError ? e.detail || e.title : tc('error')); }
  };
  const features = i.explanation?.features ?? [];
  const items = i.explanation?.items ?? [];
  return (
    <article className="rounded-lg border bg-card p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs"><span className="font-medium">{t(`insightKind.${i.kind}`)}</span>{i.severity && <AlertSeverityBadge value={i.severity} />}{i.status !== 'ACTIVE' && <ToneBadge tone={i.status === 'ACTIONED' ? 'good' : 'neutral'} label={t(`insightStatus.${i.status}`)} />}</div>
        <span className="inline-flex items-center gap-1 text-2xs text-muted-foreground" title={`${tc('provider')}: ${i.provider}`}>{i.basis === 'MODEL' ? <Bot className="h-3 w-3" /> : <Ruler className="h-3 w-3" />}{i.basis === 'MODEL' ? 'AI model' : 'Rule-based'} · {i.provider.toLowerCase().replace(/_/g, ' ')}{i.confidence !== null && <> · {tc('confidence').toLowerCase()} {Math.round(i.confidence * 100)}%</>}</span>
      </div>
      <h3 className="mt-2 text-sm font-semibold leading-snug">{i.title}</h3>
      {showSubject && i.entityName && <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">{i.sector && <SectorDot sector={i.sector} />}<Link href={href as '/'} className="hover:underline">{i.entityName}</Link>{i.weredaName && <span>· {i.weredaName}</span>}</div>}
      {i.summary && <p className="mt-1.5 text-xs text-muted-foreground">{i.summary}</p>}
      {features.length > 0 && (
        <details className="mt-2 text-xs"><summary className="cursor-pointer text-muted-foreground hover:text-foreground">{t('features')}</summary>
          <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 tablet:grid-cols-3">{features.map((f) => <div key={f.name} className="min-w-0"><dt className="truncate text-muted-foreground">{f.name}{f.weight ? <span className="ml-1 text-2xs">×{Math.round(f.weight * 100) / 100}</span> : null}</dt><dd className="truncate font-medium tabular">{f.value}</dd></div>)}</dl></details>
      )}
      {items.length > 0 && <ul className="mt-2 space-y-1 text-xs">{items.map((a) => <li key={a.code} className="rounded-md border px-2 py-1.5"><div className="flex items-center gap-2"><span className="font-medium">{a.title}</span><span className="text-2xs text-muted-foreground">{a.severity}</span></div><div className="text-muted-foreground">{a.detail}</div></li>)}</ul>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-2xs text-muted-foreground">
        <span>{relTime(i.computedAt)}{i.reviewedByName && i.reviewedAt ? ` · ${t('reviewed', { name: i.reviewedByName, time: fmtDateTime(i.reviewedAt, locale) })}` : ''}{i.reviewNote ? ` · ${i.reviewNote}` : ''}</span>
        <div className="flex gap-1.5">
          {canReviewInsights(user.roles) && i.status === 'ACTIVE' && <><Button size="xs" variant="outline" onClick={() => setMode(mode === 'ACTIONED' ? null : 'ACTIONED')}>{tc('actioned')}</Button><Button size="xs" variant="ghost" onClick={() => setMode(mode === 'DISMISSED' ? null : 'DISMISSED')}>{tc('dismiss')}</Button></>}
          {!showSubject ? null : <Button asChild size="xs" variant="ghost"><Link href={href as '/'}>{te(i.entityType)}<ArrowUpRight /></Link></Button>}
        </div>
      </div>
      {mode && (
        <div className="mt-2 space-y-2">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={mode === 'DISMISSED' ? t('dismissNote') : tc('note')} maxLength={2000} className="min-h-[60px]" />
          <div className="flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground" role="status">{msg}</span><Button size="xs" onClick={submit} disabled={review.isPending}>{t('review')}</Button></div>
        </div>
      )}
    </article>
  );
}
