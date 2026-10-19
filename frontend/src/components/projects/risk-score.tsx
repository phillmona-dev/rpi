'use client';
import { useTranslations } from 'next-intl';
import type { RiskBand, RiskComponents } from '@/lib/api/types';
import { ToneBadge } from '@/components/common/badges';
import { riskBand, riskBandTone, toneVar } from '@/lib/domain';
import { relTime } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Explainable composite risk: the score plus each weighted component, so the executive sees why, not just how much. */
export function RiskScoreCard({ score, band, components, computedAt, lastVerifiedAt, compact }: { score: number | null; band?: RiskBand | null; components?: RiskComponents | null; computedAt?: string | null; lastVerifiedAt?: string | null; compact?: boolean }) {
  const t = useTranslations('intelligence');
  const tr = useTranslations('projects.risk');
  const b = band ?? riskBand(score);
  if (score === null || score === undefined || !b) return <p className="text-sm text-muted-foreground">{tr('noScore')}</p>;
  const color = toneVar[riskBandTone[b]];
  return (
    <div className={cn('space-y-3', compact && 'space-y-2')}>
      <div className="flex items-end justify-between gap-3">
        <div><div className="text-3xl font-semibold tabular leading-none" style={{ color }}>{score}<span className="text-base text-muted-foreground font-normal">/100</span></div>
          <div className="mt-1.5 flex items-center gap-2"><ToneBadge tone={riskBandTone[b]} label={t(`band.${b}`)} />{computedAt && <span className="text-2xs text-muted-foreground">{relTime(computedAt)}</span>}</div></div>
        <div className="text-right text-2xs text-muted-foreground">{lastVerifiedAt ? tr('verifiedAgo', { time: relTime(lastVerifiedAt) }) : tr('neverVerified')}</div>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={`${t('riskRegister')} ${score}/100`}><div className="h-full rounded-full" style={{ width: `${score}%`, background: color }} /></div>
      {components?.components && (
        <ul className="space-y-1.5">
          {components.components.map((c) => (
            <li key={c.key} className="grid grid-cols-[110px_1fr_auto] items-center gap-2 text-xs">
              <span className="truncate font-medium">{t(`component.${c.key}` as 'component.schedule')}<span className="ml-1 text-2xs text-muted-foreground">×{c.weight}</span></span>
              <span className="h-1.5 w-full rounded-full bg-muted" title={c.note}><span className="block h-full rounded-full" style={{ width: `${Math.max(2, c.score)}%`, background: c.score >= 75 ? toneVar.critical : c.score >= 50 ? toneVar.serious : c.score >= 25 ? toneVar.warning : toneVar.good }} /></span>
              <span className="tabular text-right text-muted-foreground" title={c.note}>{c.value}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function RiskChip({ score }: { score: number | null | undefined }) {
  const t = useTranslations('intelligence');
  const b = riskBand(score);
  if (!b || score === null || score === undefined) return <span className="text-muted-foreground">—</span>;
  return <ToneBadge tone={riskBandTone[b]} label={`${score} · ${t(`band.${b}`)}`} />;
}
