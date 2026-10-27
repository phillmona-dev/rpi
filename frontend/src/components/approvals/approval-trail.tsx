'use client';
import { useLocale, useTranslations } from 'next-intl';
import type { ApprovalAction, ApprovalEventDto } from '@/lib/api/types';
import { fmtDateTime } from '@/lib/format';
import { toneVar } from '@/lib/domain';

const tone: Record<ApprovalAction, string> = { SUBMITTED: toneVar.info, RESUBMITTED: toneVar.info, APPROVED: toneVar.good, RETURNED: toneVar.serious, REJECTED: toneVar.critical };

/** Chronological approval trail: who submitted, who decided, what they wrote. */
export function ApprovalTrail({ events }: { events: ApprovalEventDto[] }) {
  const t = useTranslations('enums.approvalAction');
  const ta = useTranslations('approvals.status');
  const locale = useLocale();
  if (!events.length) return <p className="text-sm text-muted-foreground">—</p>;
  return (
    <ol className="space-y-0">
      {events.map((e, i) => (
        <li key={e.id} className="relative flex gap-3 pb-5 last:pb-0">
          {i < events.length - 1 && <span aria-hidden className="absolute left-[7px] top-5 h-[calc(100%-12px)] w-px bg-border" />}
          <span aria-hidden className="mt-1 h-4 w-4 shrink-0 rounded-full border-2 border-card" style={{ background: tone[e.action] }} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="text-sm font-semibold">{t(e.action)}{e.reference && <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">{e.reference}</span>}</span>
              <span className="text-xs text-muted-foreground tabular">{fmtDateTime(e.occurredAt, locale)}</span>
            </div>
            {e.actorName && <div className="text-sm text-muted-foreground">{e.actorName}</div>}
            {e.note && <p className="mt-1.5 whitespace-pre-line rounded-md bg-muted/40 px-3 py-2 text-sm">{e.note}</p>}
            {e.conditions && <p className="mt-1.5 text-sm"><span className="font-medium">{ta('conditions')}: </span>{e.conditions}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
