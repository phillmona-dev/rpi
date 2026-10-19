'use client';
import { useTranslations } from 'next-intl';
import { Radio, Clock } from 'lucide-react';
import { daysSince, relTime } from '@/lib/format';
import { STALE_CRITICAL_DAYS, STALE_WARN_DAYS, toneVar } from '@/lib/domain';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/** Data-freshness chip: executives must see how old the field data is before acting on it. */
export function FreshnessChip({ at, label }: { at: string | null | undefined; label?: string }) {
  const t = useTranslations('common');
  const d = daysSince(at);
  const tone = d === null ? 'neutral' : d >= STALE_CRITICAL_DAYS ? 'critical' : d >= STALE_WARN_DAYS ? 'warning' : 'good';
  const text = d === null ? t('never') : d >= STALE_WARN_DAYS ? t('staleDetail', { days: d }) : t('fresh', { time: relTime(at) });
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-2xs font-medium text-muted-foreground" style={{ borderColor: `color-mix(in srgb, ${toneVar[tone]} 50%, transparent)` }}>
          {tone === 'good' ? <Radio className="h-3 w-3" style={{ color: toneVar[tone] }} aria-hidden /> : <Clock className="h-3 w-3" style={{ color: toneVar[tone] }} aria-hidden />}
          {label ? `${label}: ` : ''}{text}
        </span>
      </TooltipTrigger>
      <TooltipContent>{at ? new Date(at).toLocaleString() : t('never')}</TooltipContent>
    </Tooltip>
  );
}
