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
  if (isLoading || !signals) return <div className={cn('grid gap-2', compact ? 'grid-cols-2 tablet:grid-cols-3 desktop:grid-cols-5' : 'grid-cols-2 tablet:grid-cols-3 desktop:grid-cols-5')}>{Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-[76px]" />)}</div>;
  return (
    <ul className={cn('grid gap-2', compact ? 'grid-cols-2 tablet:grid-cols-3 desktop:grid-cols-5' : 'grid-cols-2 tablet:grid-cols-3 desktop:grid-cols-5')} aria-label="Early-warning indicators">
      {signals.map((s) => {
        const color = toneVar[alertTone[s.severity]];
        const body = (
          <div className="flex h-full flex-col justify-between rounded-md border bg-card px-3.5 py-3 shadow-card transition-colors hover:border-primary/40" style={{ borderLeft: `3px solid ${color}` }}>
            <div className="truncate text-xs font-medium text-muted-foreground">{t(s.code as 'REPORTING_COVERAGE')}</div>
            <div className="mt-1 flex items-baseline justify-between gap-1"><span className="text-2xl font-semibold tabular leading-none" style={{ color: s.severity === 'LOW' ? undefined : color }}>{s.display}</span><span aria-hidden className="h-2 w-2 rounded-full" style={{ background: color }} /></div>
          </div>
        );
        return (
          <li key={s.code} className="min-w-0">
            <Tooltip><TooltipTrigger asChild>{s.href ? <Link href={s.href as '/'} className="block h-full rounded-md focus-visible:ring-2 focus-visible:ring-ring">{body}</Link> : body}</TooltipTrigger><TooltipContent className="max-w-xs text-sm">{s.explanation}</TooltipContent></Tooltip>
          </li>
        );
      })}
    </ul>
  );
}
