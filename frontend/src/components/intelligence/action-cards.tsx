'use client';
import * as React from 'react';
import { useTranslations } from 'next-intl';
import { ArrowUpRight, Gavel, Landmark, Scale, ShieldAlert, Siren, Wallet, type LucideIcon } from 'lucide-react';
import type { ActionCard } from '@/lib/api/types';
import { AlertSeverityBadge, SectorDot } from '@/components/common/badges';
import { DataState } from '@/components/common/data-state';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { AlertDrawer } from '@/components/alerts/alert-drawer';
import { alertTone, toneVar } from '@/lib/domain';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const kindIcon: Record<ActionCard['kind'], LucideIcon> = { DECISION: Gavel, FUNDING: Wallet, VERIFICATION: ShieldAlert, ESCALATION: Siren, REALLOCATION: Scale, REVIEW: Landmark };

/** "What requires my decision?" — ranked cards with the evidence and a concrete suggested action. */
export function ActionCards({ actions, isLoading, error, refetch, limit, columns = 2 }: { actions?: ActionCard[]; isLoading: boolean; error?: unknown; refetch?: () => void; limit?: number; columns?: 1 | 2 | 3 }) {
  const t = useTranslations('intelligence');
  const td = useTranslations('dashboard');
  const te = useTranslations('enums.entityType');
  const [open, setOpen] = React.useState<number | null>(null);
  const rows = (actions ?? []).slice(0, limit ?? actions?.length ?? 0);
  return (
    <>
      <DataState isLoading={isLoading} error={error} onRetry={refetch} isEmpty={!rows.length} emptyTitle={td('noActions')} skeleton={<div className={cn('grid gap-3', columns === 3 ? 'desktop:grid-cols-3' : columns === 2 ? 'tablet:grid-cols-2' : '')}>{Array.from({ length: limit ?? 4 }).map((_, i) => <Skeleton key={i} className="h-40" />)}</div>}>
        <ol className={cn('grid gap-3', columns === 3 ? 'desktop:grid-cols-3' : columns === 2 ? 'tablet:grid-cols-2' : '')}>
          {rows.map((a) => {
            const Icon = kindIcon[a.kind];
            const color = toneVar[alertTone[a.severity]];
            const href = a.entityType === 'PROJECT' ? `/projects/${a.entityId}` : a.entityType === 'FACILITY' ? `/facilities/${a.entityId}` : a.entityType === 'WEREDA' ? `/weredas/${a.entityId}` : null;
            return (
              <li key={a.id} className="flex flex-col rounded-lg border bg-card p-4 shadow-card" style={{ borderTop: `3px solid ${color}` }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-2xs font-semibold text-foreground tabular">{a.priority}</span><span className="inline-flex items-center gap-1 font-medium"><Icon className="h-3.5 w-3.5" />{t(`kind.${a.kind}`)}</span></div>
                  <AlertSeverityBadge value={a.severity} />
                </div>
                <h3 className="mt-2 text-sm font-semibold leading-snug">{a.title}</h3>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">{a.sector && <SectorDot sector={a.sector} />}{a.entityName && <span className="truncate max-w-[260px]">{a.entityName}</span>}{a.weredaName && <span>· {a.weredaName}</span>}{a.ageHours > 0 && <span>· {a.ageHours < 48 ? `${a.ageHours} h` : `${Math.floor(a.ageHours / 24)} d`}</span>}</div>
                <p className="mt-2 text-xs text-muted-foreground line-clamp-3">{a.rationale}</p>
                {a.evidence.length > 0 && <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-2xs">{a.evidence.map((e) => <div key={e.label} className="min-w-0"><dt className="truncate text-muted-foreground">{e.label}</dt><dd className="truncate font-medium tabular">{e.value}</dd></div>)}</dl>}
                <div className="mt-3 rounded-md bg-muted/40 p-2 text-xs"><span className="font-medium">{t('suggested')}: </span>{a.suggestedAction}</div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-2xs uppercase tracking-wide text-muted-foreground">{a.basis === 'RULE' ? 'Rule-based' : 'Model'}</span>
                  <div className="flex gap-1.5">
                    {a.alertId && <Button size="xs" onClick={() => setOpen(a.alertId)}>{t('openAlert')}</Button>}
                    {href && <Button asChild size="xs" variant="outline"><Link href={href as '/'}>{te(a.entityType as 'PROJECT')}<ArrowUpRight /></Link></Button>}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </DataState>
      <AlertDrawer id={open} onClose={() => setOpen(null)} />
    </>
  );
}
