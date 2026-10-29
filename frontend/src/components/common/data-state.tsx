'use client';
import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api/client';
import { cn } from '@/lib/utils';

/** Every data panel renders through this so loading / empty / error states are uniform and accessible. */
export function DataState({ isLoading, error, isEmpty, onRetry, skeleton, emptyTitle, emptyHint, children, className, rows = 4 }: {
  isLoading: boolean; error?: unknown; isEmpty?: boolean; onRetry?: () => void; skeleton?: React.ReactNode; emptyTitle?: string; emptyHint?: string; children: React.ReactNode; className?: string; rows?: number;
}) {
  const t = useTranslations('common');
  if (isLoading) return <div className={cn('space-y-2', className)} aria-busy="true" aria-live="polite">{skeleton ?? Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>;
  if (error) {
    const e = error as Partial<ApiError>;
    // Plain words for the common cases; the server's own text only for problems with what was sent (4xx).
    const denied = e.status === 401 || e.status === 403;
    const title = denied ? t('forbidden') : e.status === 404 ? t('notFoundPlain') : t('error');
    const detail = denied ? t('forbiddenHint') : e.status && e.status >= 400 && e.status < 500 && e.status !== 404 ? e.detail : t('errorHint');
    return (
      <div role="alert" className={cn('flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-destructive/40 bg-destructive/5 p-6 text-center', className)}>
        <AlertTriangle className="h-5 w-5 text-destructive" />
        <p className="text-sm font-medium">{title}</p>
        {detail && <p className="max-w-md text-sm text-muted-foreground">{detail}</p>}
        {e.correlationId && !denied && <p className="text-2xs text-muted-foreground font-mono">{t('reference', { id: e.correlationId })}</p>}
        {onRetry && !denied && <Button size="sm" variant="outline" onClick={onRetry}><RefreshCw />{t('retry')}</Button>}
      </div>
    );
  }
  if (isEmpty) {
    return (
      <div className={cn('flex flex-col items-center justify-center gap-1.5 rounded-md border border-dashed p-8 text-center', className)}>
        <Inbox className="h-5 w-5 text-muted-foreground" />
        <p className="text-sm font-medium">{emptyTitle ?? t('noData')}</p>
        {emptyHint && <p className="max-w-sm text-xs text-muted-foreground">{emptyHint}</p>}
      </div>
    );
  }
  return <>{children}</>;
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      <Skeleton className="h-8 w-full" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
          {Array.from({ length: cols }).map((__, j) => <Skeleton key={j} className="h-7" />)}
        </div>
      ))}
    </div>
  );
}
export function ChartSkeleton({ height = 260 }: { height?: number }) { return <Skeleton className="w-full" style={{ height }} aria-hidden />; }
