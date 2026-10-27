import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** Large headline figure with a label and one line of context. Used for the top row of operational pages. */
export function KpiTile({ icon: Icon, label, value, hint, accent, href, loading }: {
  icon: LucideIcon; label: React.ReactNode; value: React.ReactNode; hint?: React.ReactNode; accent?: string; href?: string; loading?: boolean;
}) {
  if (loading) return <Skeleton className="h-[128px]" />;
  const body = (
    <div className={cn('flex h-full flex-col rounded-lg border bg-card p-5 shadow-card transition-colors', href && 'hover:border-primary/40')}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <Icon className="h-5 w-5 text-muted-foreground" aria-hidden />
      </div>
      <div className="mt-3 text-3xl font-semibold tabular leading-none" style={accent ? { color: accent } : undefined}>{value}</div>
      {hint && <div className="mt-2 text-sm text-muted-foreground">{hint}</div>}
    </div>
  );
  return href ? <Link href={href as '/'} className="block h-full rounded-lg focus-visible:ring-2 focus-visible:ring-ring">{body}</Link> : body;
}

export function KpiRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2 laptop:grid-cols-4">{children}</div>;
}
