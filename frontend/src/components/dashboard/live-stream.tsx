'use client';
import { useLocale, useTranslations } from 'next-intl';
import { Bell, ClipboardList, HardHat } from 'lucide-react';
import type { StreamItem } from '@/lib/api/types';
import { Link } from '@/i18n/navigation';
import { DataState } from '@/components/common/data-state';
import { SectorDot } from '@/components/common/badges';
import { relTime, fmtDateTime } from '@/lib/format';
import { toneVar } from '@/lib/domain';

const icons = { ASSESSMENT: ClipboardList, PROGRESS: HardHat, ALERT: Bell } as const;

export function LiveStream({ items, isLoading, error, refetch, compact }: { items?: StreamItem[]; isLoading: boolean; error?: unknown; refetch: () => void; compact?: boolean }) {
  const t = useTranslations('dashboard');
  const tk = useTranslations('enums.streamKind');
  const locale = useLocale();
  const href = (s: StreamItem) => (s.entityType === 'PROJECT' ? `/projects/${s.entityId}` : s.entityType === 'FACILITY' ? `/facilities/${s.entityId}` : `/weredas/${s.entityId}`);
  const sevColor = (s: StreamItem) => s.kind === 'ALERT' ? (s.severity === 'CRITICAL' ? toneVar.critical : s.severity === 'HIGH' ? toneVar.serious : toneVar.warning)
    : s.kind === 'ASSESSMENT' ? (s.severity === 'DESTROYED' ? toneVar.critical : s.severity === 'SEVERE' ? toneVar.serious : s.severity === 'MODERATE' ? toneVar.warning : toneVar.neutral)
    : (s.severity === 'DELAYED' || s.severity === 'STALLED' ? toneVar.serious : s.severity === 'AT_RISK' ? toneVar.warning : toneVar.good);
  return (
    <DataState isLoading={isLoading} error={error} onRetry={refetch} isEmpty={!items?.length} emptyTitle={t('streamEmpty')} rows={6}>
      <ol className={compact ? 'max-h-[420px] overflow-y-auto pr-1 scrollbar-thin' : ''} aria-live="polite" aria-relevant="additions">
        {items?.map((s) => { const Icon = icons[s.kind]; return (
          <li key={s.id} className="relative flex gap-3 border-l pl-4 pb-4 last:pb-0" style={{ borderColor: 'hsl(var(--border))' }}>
            <span aria-hidden className="absolute -left-[7px] top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-card" style={{ background: sevColor(s) }} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-2xs text-muted-foreground"><Icon className="h-3 w-3" />{tk(s.kind)}{s.sector && <SectorDot sector={s.sector} />}{s.weredaName && <span>· {s.weredaName}</span>}<span className="ml-auto tabular" title={fmtDateTime(s.occurredAt, locale)}>{relTime(s.occurredAt)}</span></div>
              <Link href={href(s)} className="mt-0.5 block truncate text-sm font-medium hover:underline">{s.title}</Link>
              {s.detail && <p className="line-clamp-2 text-xs text-muted-foreground">{s.detail}</p>}
            </div>
          </li>
        ); })}
      </ol>
    </DataState>
  );
}
