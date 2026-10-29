'use client';
import * as React from 'react';
import { useTranslations } from 'next-intl';
import type { Signal } from '@/lib/api/types';
import { Link } from '@/i18n/navigation';
import { alertTone, toneVar } from '@/lib/domain';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

/** The indicators most people need first; the rest stay one click away. */
const MAIN = ['DECISION_BACKLOG', 'SCHEDULE_SLIP', 'UNADDRESSED_DAMAGE', 'DISBURSEMENT_LAG', 'REPORTING_COVERAGE', 'VERIFICATION_COVERAGE'];

/** Early-warning indicators: each tile says what it measures in one sentence, so no hovering or guessing is needed. */
export function SignalStrip({ signals, isLoading }: { signals?: Signal[]; isLoading: boolean; compact?: boolean }) {
  const t = useTranslations('intelligence.signal');
  const ti = useTranslations('intelligence');
  const [all, setAll] = React.useState(false);
  if (isLoading || !signals) return <div className="grid gap-3 tablet:grid-cols-2 desktop:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[112px]" />)}</div>;
  const main = MAIN.map((c) => signals.find((s) => s.code === c)).filter(Boolean) as Signal[];
  const rest = signals.filter((s) => !MAIN.includes(s.code));
  const shown = all ? [...main, ...rest] : main;
  return (
    <div className="space-y-3">
      <ul className="grid gap-3 tablet:grid-cols-2 desktop:grid-cols-3" aria-label={ti('signals')}>
        {shown.map((s) => {
          const color = toneVar[alertTone[s.severity]];
          const body = (
            <div className="flex h-full flex-col rounded-md border bg-card px-4 py-3 shadow-card transition-colors hover:border-primary/40" style={{ borderLeft: `4px solid ${color}` }}>
              <div className="text-sm font-medium text-muted-foreground">{t(s.code as 'REPORTING_COVERAGE')}</div>
              <div className="mt-1 text-2xl font-semibold tabular leading-none" style={{ color: s.severity === 'LOW' ? undefined : color }}>{s.display}</div>
              <p className="mt-2 text-sm text-muted-foreground">{s.explanation}</p>
            </div>
          );
          return <li key={s.code} className="min-w-0">{s.href ? <Link href={s.href as '/'} className="block h-full rounded-md focus-visible:ring-2 focus-visible:ring-ring">{body}</Link> : body}</li>;
        })}
      </ul>
      {rest.length > 0 && <Button variant="ghost" size="sm" onClick={() => setAll((a) => !a)}>{all ? ti('fewerSignals') : ti('moreSignals', { count: rest.length })}</Button>}
    </div>
  );
}
