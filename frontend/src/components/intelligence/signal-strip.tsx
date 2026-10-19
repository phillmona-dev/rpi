'use client';
import { useTranslations } from 'next-intl';
import type { Signal } from '@/lib/api/types';
import { Link } from '@/i18n/navigation';
import { alertTone, toneVar } from '@/lib/domain';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/** Early-warning indicators: one row of small, dense tiles the executive scans before reading anything else. */
export function SignalStrip({ signals, isLoading, compact }: { signals?: Signal[]; isLoading: boolean; compact?: boolean }) {
  const t = useTranslations('intelligence.signal');
  if (isLoading || !signals) return <div className={cn('grid gap-2', compact ? 'grid-cols-2 tablet:grid-cols-5' : 'grid-cols-2 tablet:grid-cols-5 wide:grid-cols-10')}>{Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-[62px]" />)}</div>;
  return (
    <ul className={cn('grid gap-2', compact ? 'grid-cols-2 tablet:grid-cols-5' : 'grid-cols-2 tablet:grid-cols-5 wide:grid-cols-10')} aria-label="Early-warning indicators">
      {signals.map((s) => {
        const color = toneVar[alertTone[s.severity]];
        const body = (
          <div className="flex h-full flex-col justify-between rounded-md border bg-card px-2.5 py-2 shadow-card transition-colors hover:border-primary/40" style={{ borderLeft: `3px solid ${color}` }}>
            <div className="truncate text-2xs font-medium text-muted-foreground">{t(s.code as 'REPORTING_COVERAGE')}</div>
            <div className="mt-1 flex items-baseline justify-between gap-1"><span className="text-lg font-semibold tabular leading-none" style={{ color: s.severity === 'LOW' ? undefined : color }}>{s.display}</span><span aria-hidden className="h-2 w-2 rounded-full" style={{ background: color }} /></div>
          </div>
        );
        return (
          <li key={s.code} className="min-w-0">
            <Tooltip><TooltipTrigger asChild>{s.href ? <Link href={s.href as '/'} className="block h-full rounded-md focus-visible:ring-2 focus-visible:ring-ring">{body}</Link> : body}</TooltipTrigger><TooltipContent className="max-w-xs text-xs">{s.explanation}</TooltipContent></Tooltip>
          </li>
        );
      })}
    </ul>
  );
}
