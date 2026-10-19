'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowRight, Clock } from 'lucide-react';
import type { AlertSummary } from '@/lib/api/types';
import { Section } from '@/components/common/page-header';
import { AlertSeverityBadge, SectorDot } from '@/components/common/badges';
import { DataState } from '@/components/common/data-state';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { AlertDrawer } from '@/components/alerts/alert-drawer';
import { Badge } from '@/components/ui/badge';

export function DecisionQueue({ alerts, isLoading, error, refetch }: { alerts?: AlertSummary[]; isLoading: boolean; error?: unknown; refetch: () => void }) {
  const t = useTranslations('dashboard');
  const ta = useTranslations('alerts');
  const tr = useTranslations('enums.rule');
  const [open, setOpen] = React.useState<number | null>(null);
  useLocale();
  return (
    <Section id="decision-queue" title={t('decisionQueue')} hint={t('decisionQueueHint')} actions={<Button asChild variant="ghost" size="sm"><Link href="/alerts">{ta('title')}<ArrowRight /></Link></Button>}>
      <DataState isLoading={isLoading} error={error} onRetry={refetch} isEmpty={!alerts?.length} emptyTitle={t('noDecisions')} rows={5}>
        <ul className="divide-y -mx-2">
          {alerts?.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => setOpen(a.id)} className="flex w-full items-start gap-3 rounded-md px-2 py-2.5 text-left hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring">
                <AlertSeverityBadge value={a.severity} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{a.title}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    {a.sector && <SectorDot sector={a.sector} />}
                    <span className="truncate max-w-[220px]">{a.entityName ?? a.entityCode}</span>
                    {a.weredaName && <span>· {a.weredaName}</span>}
                    <span>· {tr(a.rule)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="inline-flex items-center gap-1 text-2xs text-muted-foreground tabular"><Clock className="h-3 w-3" />{a.ageHours < 48 ? `${a.ageHours}h` : `${Math.floor(a.ageHours / 24)}d`}</span>
                  {a.decisionRequired && <Badge variant="outline" className="text-2xs">{ta('decisionBadge')}</Badge>}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </DataState>
      <AlertDrawer id={open} onClose={() => setOpen(null)} />
    </Section>
  );
}
