'use client';
import { useTranslations } from 'next-intl';
import { AlertOctagon, AlertTriangle, CheckCircle2, CircleDashed, Clock, PauseCircle, type LucideIcon } from 'lucide-react';
import type { AlertSeverity, AlertStatus, DamageSeverity, OperationalStatus, ProjectHealth, ProjectStatus, Sector } from '@/lib/api/types';
import { alertTone, healthTone, operationalTone, sectorVar, severityTone, statusTone, toneVar, type Tone } from '@/lib/domain';
import { cn } from '@/lib/utils';

const toneIcon: Record<Tone, LucideIcon> = { good: CheckCircle2, warning: AlertTriangle, serious: Clock, critical: AlertOctagon, neutral: CircleDashed, info: PauseCircle };

/** Status chip: colour + icon + text, never colour alone (WCAG 1.4.1). */
export function ToneBadge({ tone, label, className, compact }: { tone: Tone; label: string; className?: string; compact?: boolean }) {
  const Icon = toneIcon[tone];
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap', className)}
      style={{ borderColor: `color-mix(in srgb, ${toneVar[tone]} 45%, transparent)`, background: `color-mix(in srgb, ${toneVar[tone]} 12%, transparent)` }}>
      <Icon className="h-3 w-3 shrink-0" style={{ color: toneVar[tone] }} aria-hidden />
      {!compact && <span>{label}</span>}
      {compact && <span className="sr-only">{label}</span>}
    </span>
  );
}

export function HealthBadge({ value, compact }: { value: ProjectHealth; compact?: boolean }) { const t = useTranslations('enums.health'); return <ToneBadge tone={healthTone[value]} label={t(value)} compact={compact} />; }
export function StatusBadge({ value }: { value: ProjectStatus }) { const t = useTranslations('enums.status'); return <ToneBadge tone={statusTone[value]} label={t(value)} />; }
export function SeverityBadge({ value }: { value: DamageSeverity | null }) { const t = useTranslations('enums.severity'); return value ? <ToneBadge tone={severityTone[value]} label={t(value)} /> : <span className="text-muted-foreground">—</span>; }
export function AlertSeverityBadge({ value }: { value: AlertSeverity }) { const t = useTranslations('enums.alertSeverity'); return <ToneBadge tone={alertTone[value]} label={t(value)} />; }
export function OperationalBadge({ value }: { value: OperationalStatus }) { const t = useTranslations('enums.operational'); return <ToneBadge tone={operationalTone[value]} label={t(value)} />; }
export function AlertStatusBadge({ value }: { value: AlertStatus }) {
  const t = useTranslations('enums.alertStatus');
  const tone: Tone = value === 'OPEN' ? 'serious' : value === 'ACKNOWLEDGED' ? 'warning' : value === 'ASSIGNED' ? 'info' : value === 'RESOLVED' ? 'good' : 'neutral';
  return <ToneBadge tone={tone} label={t(value)} />;
}

export function SectorDot({ sector, className }: { sector: Sector; className?: string }) {
  return <span aria-hidden className={cn('inline-block h-2.5 w-2.5 rounded-sm shrink-0', className)} style={{ background: sectorVar[sector] }} />;
}
export function SectorLabel({ sector, className }: { sector: Sector; className?: string }) {
  const t = useTranslations('enums.sector');
  return <span className={cn('inline-flex items-center gap-1.5', className)}><SectorDot sector={sector} />{t(sector)}</span>;
}
