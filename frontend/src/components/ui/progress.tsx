import { cn } from '@/lib/utils';

/** Accessible progress bar with an optional planned marker (schedule baseline). */
export function Progress({ value, planned, tone, className, label }: { value: number; planned?: number | null; tone?: string; className?: string; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label} className={cn('relative h-2 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div className="h-full rounded-full transition-all" style={{ width: `${v}%`, background: tone ?? 'var(--seq-450)' }} />
      {planned !== null && planned !== undefined && (
        <div aria-hidden className="absolute top-[-2px] h-[calc(100%+4px)] w-0.5 bg-foreground/70" style={{ left: `calc(${Math.max(0, Math.min(100, planned))}% - 1px)` }} title={`Planned ${planned.toFixed(0)}%`} />
      )}
    </div>
  );
}
