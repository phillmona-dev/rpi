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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const kindIcon: Record<ActionCard['kind'], LucideIcon> = { DECISION: Gavel, FUNDING: Wallet, VERIFICATION: ShieldAlert, ESCALATION: Siren, REALLOCATION: Scale, REVIEW: Landmark };
const entityHref = (a: ActionCard) => a.entityType === 'PROJECT' ? `/projects/${a.entityId}` : a.entityType === 'FACILITY' ? `/facilities/${a.entityId}` : a.entityType === 'WEREDA' ? `/weredas/${a.entityId}` : null;
const age = (h: number) => (h < 48 ? `${h} h` : `${Math.floor(h / 24)} d`);
const stop = (e: React.SyntheticEvent) => e.stopPropagation();

/** "What requires my decision?" — ranked cards with the evidence and a concrete suggested action. */
export function ActionCards({ actions, isLoading, error, refetch, limit, columns = 2 }: { actions?: ActionCard[]; isLoading: boolean; error?: unknown; refetch?: () => void; limit?: number; columns?: 1 | 2 | 3 }) {
  const t = useTranslations('intelligence');
  const td = useTranslations('dashboard');
  const te = useTranslations('enums.entityType');
  const [open, setOpen] = React.useState<number | null>(null);
  const [detail, setDetail] = React.useState<ActionCard | null>(null);
  const rows = (actions ?? []).slice(0, limit ?? actions?.length ?? 0);
  return (
    <>
      <DataState isLoading={isLoading} error={error} onRetry={refetch} isEmpty={!rows.length} emptyTitle={td('noActions')} skeleton={<div className={cn('grid gap-3', columns === 3 ? 'desktop:grid-cols-3' : columns === 2 ? 'tablet:grid-cols-2' : '')}>{Array.from({ length: limit ?? 4 }).map((_, i) => <Skeleton key={i} className="h-40" />)}</div>}>
        <ol className={cn('grid gap-3', columns === 3 ? 'desktop:grid-cols-3' : columns === 2 ? 'tablet:grid-cols-2' : '')}>
          {rows.map((a) => {
            const Icon = kindIcon[a.kind];
            const color = toneVar[alertTone[a.severity]];
            const href = entityHref(a);
            return (
              <li key={a.id} role="button" tabIndex={0} aria-label={`${t('viewDetail')}: ${a.title}`} onClick={() => setDetail(a)} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setDetail(a); } }}
                className="flex cursor-pointer flex-col rounded-lg border bg-card p-4 shadow-card transition-colors hover:border-ring/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ borderTop: `3px solid ${color}` }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-2xs font-semibold text-foreground tabular">{a.priority}</span><span className="inline-flex items-center gap-1 font-medium"><Icon className="h-3.5 w-3.5" />{t(`kind.${a.kind}`)}</span></div>
                  <AlertSeverityBadge value={a.severity} />
                </div>
                <h3 className="mt-2 text-sm font-semibold leading-snug">{a.title}</h3>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">{a.sector && <SectorDot sector={a.sector} />}{a.entityName && <span className="truncate max-w-[260px]">{a.entityName}</span>}{a.weredaName && <span>· {a.weredaName}</span>}{a.ageHours > 0 && <span>· {age(a.ageHours)}</span>}</div>
                <p className="mt-2 text-xs text-muted-foreground line-clamp-3">{a.rationale}</p>
                {a.evidence.length > 0 && <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-2xs">{a.evidence.map((e) => <div key={e.label} className="min-w-0"><dt className="truncate text-muted-foreground">{e.label}</dt><dd className="truncate font-medium tabular">{e.value}</dd></div>)}</dl>}
                <div className="mt-3 rounded-md bg-muted/40 p-2 text-xs"><span className="font-medium">{t('suggested')}: </span>{a.suggestedAction}</div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-2xs uppercase tracking-wide text-muted-foreground">{a.basis === 'RULE' ? 'Rule-based' : 'Model'}</span>
                  <div className="flex gap-1.5" onClick={stop} onKeyDown={stop}>
                    {a.alertId && <Button size="xs" onClick={() => setOpen(a.alertId)}>{t('openAlert')}</Button>}
                    {href && <Button asChild size="xs" variant="outline"><Link href={href as '/'}>{te(a.entityType as 'PROJECT')}<ArrowUpRight /></Link></Button>}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </DataState>
      <ActionDetail action={detail} onClose={() => setDetail(null)} onOpenAlert={(id) => { setDetail(null); setOpen(id); }} />
      <AlertDrawer id={open} onClose={() => setOpen(null)} />
    </>
  );
}

/** Full detail of one action card: complete rationale, all evidence, the suggested action and links to its source. */
function ActionDetail({ action: a, onClose, onOpenAlert }: { action: ActionCard | null; onClose: () => void; onOpenAlert: (id: number) => void }) {
  const t = useTranslations('intelligence');
  const te = useTranslations('enums.entityType');
  const tc = useTranslations('common');
  const Icon = a ? kindIcon[a.kind] : Gavel;
  const href = a && entityHref(a);
  return (
    <Dialog open={a !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl" style={a ? { borderTop: `3px solid ${toneVar[alertTone[a.severity]]}` } : undefined}>
        {a && <>
          <DialogHeader>
            <div className="flex items-center justify-between gap-2 pr-6 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-2"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-2xs font-semibold text-foreground tabular">{a.priority}</span><span className="inline-flex items-center gap-1 font-medium"><Icon className="h-3.5 w-3.5" />{t(`kind.${a.kind}`)}</span></span>
              <AlertSeverityBadge value={a.severity} />
            </div>
            <DialogTitle className="leading-snug">{a.title}</DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-x-2 text-xs">
              {a.sector && <SectorDot sector={a.sector} />}{a.entityName && <span>{a.entityName}{a.entityCode && ` (${a.entityCode})`}</span>}{a.weredaName && <span>· {a.weredaName}</span>}{a.ageHours > 0 && <span>· {t('age')} {age(a.ageHours)}</span>}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <section><h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('rationale')}</h4><p>{a.rationale}</p></section>
            {a.evidence.length > 0 && <section><h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('evidence')}</h4>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border p-3 text-xs">{a.evidence.map((e) => <div key={e.label} className="min-w-0"><dt className="text-muted-foreground">{e.label}</dt><dd className="font-medium tabular">{e.value}</dd></div>)}</dl></section>}
            <section className="rounded-md bg-muted/40 p-3"><h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('suggested')}</h4><p>{a.suggestedAction}</p></section>
            <p className="text-2xs uppercase tracking-wide text-muted-foreground">{tc('basis')}: {a.basis === 'RULE' ? 'Rule-based' : 'Model'}</p>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            {a.alertId && <Button size="sm" onClick={() => onOpenAlert(a.alertId!)}>{t('openAlert')}</Button>}
            {href && <Button asChild size="sm" variant="outline"><Link href={href as '/'} onClick={onClose}>{te(a.entityType as 'PROJECT')}<ArrowUpRight /></Link></Button>}
          </DialogFooter>
        </>}
      </DialogContent>
    </Dialog>
  );
}
