'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Bell, CheckCircle2, ClipboardCheck, FileText, Flag, Gavel, HardHat, Wallet, type LucideIcon } from 'lucide-react';
import type { TimelineEvent } from '@/lib/api/types';
import { useProjectTimeline } from '@/lib/api/hooks';
import { DataState } from '@/components/common/data-state';
import { Button } from '@/components/ui/button';
import { fmtDateTime } from '@/lib/format';
import { toneVar, type Tone } from '@/lib/domain';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

const icons: Record<TimelineEvent['kind'], LucideIcon> = { STAGE: Flag, MILESTONE: CheckCircle2, PROGRESS: HardHat, DISBURSEMENT: Wallet, ALERT: Bell, DECISION: Gavel, INSPECTION: ClipboardCheck, DOCUMENT: FileText };
const KINDS: TimelineEvent['kind'][] = ['STAGE', 'MILESTONE', 'PROGRESS', 'DISBURSEMENT', 'ALERT', 'DECISION', 'INSPECTION', 'DOCUMENT'];

/** Chronological project passport. One stream, filterable by kind, every entry linking back to its record. */
export function ProjectTimeline({ projectId }: { projectId: number }) {
  const t = useTranslations('projects.timeline');
  const locale = useLocale();
  const { data, isLoading, error, refetch } = useProjectTimeline(projectId);
  const [active, setActive] = React.useState<Set<TimelineEvent['kind']>>(new Set(KINDS.filter((k) => k !== 'PROGRESS')));
  const toggle = (k: TimelineEvent['kind']) => setActive((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const rows = (data ?? []).filter((e) => active.has(e.kind));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('filter')}>
        <span className="mr-1 text-xs text-muted-foreground">{t('filter')}:</span>
        {KINDS.map((k) => { const Icon = icons[k]; return <Button key={k} size="xs" variant={active.has(k) ? 'secondary' : 'outline'} aria-pressed={active.has(k)} onClick={() => toggle(k)}><Icon />{t(`kind.${k}`)}</Button>; })}
      </div>
      <DataState isLoading={isLoading} error={error} onRetry={refetch} isEmpty={!rows.length} emptyTitle={t('empty')} rows={8}>
        <ol className="relative ml-2 border-l">
          {rows.map((e) => { const Icon = icons[e.kind]; const tone = (e.tone as Tone) ?? 'neutral'; const href = e.kind === 'ALERT' || e.kind === 'DECISION' ? `/alerts?id=${e.data.alertId}` : e.kind === 'INSPECTION' ? `/evidence?inspection=${e.data.inspectionId}` : e.kind === 'DOCUMENT' ? String(e.data.url ?? '') : null; return (
            <li key={e.id} className="relative pb-4 pl-6 last:pb-0">
              <span aria-hidden className="absolute -left-[9px] top-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-card" style={{ background: toneVar[tone] }}><Icon className="h-2.5 w-2.5 text-white" /></span>
              <div className="flex flex-wrap items-baseline gap-x-2 text-2xs text-muted-foreground"><span className="tabular">{fmtDateTime(e.occurredAt, locale)}</span><span className="uppercase tracking-wide">{t(`kind.${e.kind}`)}</span>{e.actor && <span>· {e.actor}</span>}</div>
              <div className={cn('text-sm font-medium', href && 'hover:underline')}>{href && !href.startsWith('http') && e.kind !== 'DOCUMENT' ? <Link href={href as '/'}>{e.title}</Link> : href && e.kind === 'DOCUMENT' ? <a href={href} target="_blank" rel="noreferrer">{e.title}</a> : e.title}</div>
              {e.detail && <p className="text-xs text-muted-foreground">{e.detail}</p>}
            </li>
          ); })}
        </ol>
      </DataState>
    </div>
  );
}
