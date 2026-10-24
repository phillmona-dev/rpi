'use client';
import { useLocale, useTranslations } from 'next-intl';
import type { ContractorPerformance, FundingPriority, FundingRecommendation, ProjectFundingPriority, RiskEntry, UnitComparison } from '@/lib/api/types';
import { DataTable, type Column } from '@/components/common/data-table';
import { AlertSeverityBadge, HealthBadge, SectorDot, SectorLabel, SeverityBadge, ToneBadge } from '@/components/common/badges';
import { RiskChip } from '@/components/projects/risk-score';
import { useRouter } from '@/i18n/navigation';
import { fmtDate, money, num, pct, ratio, signedPp } from '@/lib/format';
import { toneVar } from '@/lib/domain';

function Bar({ v, max = 100, color }: { v: number | null; max?: number; color?: string }) {
  if (v === null || v === undefined) return <span className="text-muted-foreground">—</span>;
  return <div className="flex items-center gap-2"><span className="h-1.5 w-16 rounded-full bg-muted"><span className="block h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, (v / max) * 100))}%`, background: color ?? 'var(--seq-450)' }} /></span><span className="tabular text-xs">{pct(v)}</span></div>;
}
const rankTone = (r: number, n: number): 'good' | 'warning' | 'serious' => (r <= Math.ceil(n / 3) ? 'good' : r > n - Math.ceil(n / 3) ? 'serious' : 'warning');

export function UnitComparisonTable({ rows, unitLabel, onRow }: { rows: UnitComparison[]; unitLabel: string; onRow?: (u: UnitComparison) => void }) {
  const t = useTranslations('intelligence.columns');
  const cols: Column<UnitComparison>[] = [
    { key: 'rank', header: t('rank'), align: 'center', cell: (u) => <ToneBadge tone={rankTone(u.rank, rows.length)} label={String(u.rank)} /> },
    { key: 'label', header: unitLabel, cell: (u) => <span className="font-medium">{u.label}</span> },
    { key: 'active', header: t('active'), align: 'right', cell: (u) => u.projectsActive },
    { key: 'delayed', header: t('delayed'), align: 'right', cell: (u) => <span style={{ color: u.projectsDelayed ? toneVar.serious : undefined }}>{u.projectsDelayed}</span> },
    { key: 'variance', header: t('variance'), align: 'right', cell: (u) => <span style={{ color: (u.avgVariancePp ?? 0) <= -5 ? toneVar.serious : undefined }}>{signedPp(u.avgVariancePp, 1)}</span> },
    { key: 'cpi', header: t('cpi'), align: 'right', cell: (u) => <span style={{ color: (u.avgCpi ?? 1) < 0.9 ? toneVar.serious : undefined }}>{ratio(u.avgCpi)}</span> },
    { key: 'reporting', header: t('reporting'), cell: (u) => <Bar v={u.reportingCoveragePct} color={(u.reportingCoveragePct ?? 100) < 60 ? toneVar.serious : undefined} /> },
    { key: 'verified', header: t('verified'), cell: (u) => <Bar v={u.verifiedCoveragePct} color={(u.verifiedCoveragePct ?? 100) < 35 ? toneVar.serious : 'var(--status-good)'} /> },
    { key: 'disbursed', header: t('disbursed'), cell: (u) => <Bar v={u.disbursementPct} color="var(--seq-650)" /> },
    { key: 'risk', header: t('risk'), align: 'right', cell: (u) => u.avgRiskScore === null ? '—' : <span className="font-medium tabular">{num(u.avgRiskScore, 'en', 0)}</span> },
    { key: 'critical', header: t('critical'), align: 'right', cell: (u) => <span style={{ color: u.criticalAlerts ? toneVar.critical : undefined }}>{u.criticalAlerts}</span> },
  ];
  return <DataTable columns={cols} rows={rows} rowKey={(u) => u.key} onRowClick={onRow} dense />;
}

export function ContractorTable({ rows }: { rows: ContractorPerformance[] }) {
  const t = useTranslations('intelligence.columns');
  const locale = useLocale();
  const router = useRouter();
  const cols: Column<ContractorPerformance>[] = [
    { key: 'rank', header: t('rank'), align: 'center', cell: (c) => <ToneBadge tone={rankTone(c.rank, rows.length)} label={String(c.rank)} /> },
    { key: 'contractor', header: t('contractor'), cell: (c) => <span className="font-medium">{c.contractor}</span> },
    { key: 'projects', header: t('projects'), align: 'right', cell: (c) => <span>{c.projects}<span className="block text-2xs text-muted-foreground">{c.active} {t('active').toLowerCase()} · {c.completed} {t('completed').toLowerCase()}</span></span> },
    { key: 'delayed', header: t('delayed'), align: 'right', cell: (c) => <span className="font-medium" style={{ color: c.delayed ? toneVar.serious : undefined }}>{c.delayed}</span> },
    { key: 'variance', header: t('variance'), align: 'right', cell: (c) => <span style={{ color: (c.avgVariancePp ?? 0) <= -5 ? toneVar.serious : undefined }}>{signedPp(c.avgVariancePp, 1)}</span> },
    { key: 'cpi', header: t('cpi'), align: 'right', cell: (c) => <span style={{ color: (c.avgCpi ?? 1) < 0.9 ? toneVar.serious : undefined }}>{ratio(c.avgCpi)}</span> },
    { key: 'onTime', header: t('onTime'), cell: (c) => <Bar v={c.onTimeRatePct} color="var(--status-good)" /> },
    { key: 'budget', header: t('budget'), align: 'right', cell: (c) => money(c.budgetEtb, locale) },
  ];
  return <DataTable columns={cols} rows={rows} rowKey={(c) => c.contractor} onRowClick={(c) => router.push(`/projects?contractor=${encodeURIComponent(c.contractor)}` as '/')} dense />;
}

export function PriorityTable({ rows }: { rows: FundingPriority[] }) {
  const t = useTranslations('intelligence.priorityColumns');
  const te = useTranslations('enums');
  const tc = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const cols: Column<FundingPriority>[] = [
    { key: 'score', header: t('score'), align: 'right', cell: (f) => <span className="text-base font-semibold tabular" style={{ color: f.priorityScore >= 70 ? toneVar.critical : f.priorityScore >= 40 ? toneVar.serious : undefined }}>{Math.round(f.priorityScore)}</span> },
    { key: 'facility', header: t('facility'), cell: (f) => <div className="min-w-[220px]"><div className="flex items-center gap-1.5 font-medium"><SectorDot sector={f.sector} /><span className="truncate max-w-[320px]">{f.name}</span></div><div className="text-2xs text-muted-foreground">{f.code} · {te(`facilityType.${f.facilityType}` as 'facilityType.FACTORY')}</div></div> },
    { key: 'wereda', header: t('wereda'), cell: (f) => f.weredaName },
    { key: 'severity', header: t('severity'), cell: (f) => <span className="flex items-center gap-1.5"><SeverityBadge value={f.severity} />{f.impactScore !== null && <span className="text-2xs tabular text-muted-foreground">{f.impactScore}/100</span>}</span> },
    { key: 'beneficiaries', header: t('beneficiaries'), align: 'right', cell: (f) => num(f.beneficiaries, locale) },
    { key: 'replacement', header: t('replacement'), align: 'right', cell: (f) => money(f.replacementEstimateEtb, locale) },
    { key: 'basis', header: tc('basis'), cell: (f) => <span className="text-2xs text-muted-foreground">{f.explanation?.features?.map((x) => `${x.name}: ${x.value}`).join(' · ')}</span> },
  ];
  return <DataTable columns={cols} rows={rows} rowKey={(f) => f.facilityId} onRowClick={(f) => router.push(`/facilities/${f.facilityId}`)} dense />;
}

export function RiskRegisterTable({ rows }: { rows: RiskEntry[] }) {
  const t = useTranslations('intelligence');
  const tp = useTranslations('projects.columns');
  const locale = useLocale();
  const router = useRouter();
  const cols: Column<RiskEntry>[] = [
    { key: 'name', header: tp('name'), cell: (r) => <div className="min-w-[220px]"><div className="truncate max-w-[320px] font-medium">{r.name}</div><div className="text-2xs text-muted-foreground">{r.code} · {r.weredaName}</div></div> },
    { key: 'sector', header: t('sector'), cell: (r) => <SectorLabel sector={r.sector} className="whitespace-nowrap text-xs" /> },
    { key: 'risk', header: tp('risk'), align: 'right', cell: (r) => <RiskChip score={r.riskScore} /> },
    { key: 'type', header: t('riskType'), cell: (r) => <span className="whitespace-nowrap text-xs font-medium">{t(`riskTypes.${r.riskType}`)}</span> },
    { key: 'severity', header: t('severity'), cell: (r) => <AlertSeverityBadge value={r.severity} /> },
    { key: 'action', header: t('recommendedAction'), cell: (r) => <p className="min-w-[260px] max-w-[420px] text-xs text-muted-foreground">{r.recommendedAction}</p> },
    { key: 'health', header: tp('health'), cell: (r) => <HealthBadge value={r.health} /> },
    { key: 'budget', header: tp('budget'), align: 'right', cell: (r) => money(r.budgetEtb, locale) },
  ];
  return <DataTable columns={cols} rows={rows} rowKey={(r) => r.projectId} onRowClick={(r) => router.push(`/projects/${r.projectId}`)} dense />;
}

const recTone: Record<FundingRecommendation, 'good' | 'warning' | 'serious'> = { RELEASE: 'good', CONDITIONAL: 'warning', HOLD: 'serious' };

export function ProjectFundingTable({ rows }: { rows: ProjectFundingPriority[] }) {
  const t = useTranslations('intelligence');
  const locale = useLocale();
  const router = useRouter();
  const col = (k: string) => t(`projectFundingColumns.${k}` as 'projectFundingColumns.score');
  const cols: Column<ProjectFundingPriority>[] = [
    { key: 'score', header: col('score'), align: 'right', cell: (f) => <span className="text-base font-semibold tabular" style={{ color: f.recommendation === 'HOLD' ? 'hsl(var(--muted-foreground))' : f.priorityScore >= 70 ? toneVar.good : undefined }}>{Math.round(f.priorityScore)}</span> },
    { key: 'project', header: col('project'), cell: (f) => <div className="min-w-[220px]"><div className="flex items-center gap-1.5 font-medium"><SectorDot sector={f.sector} /><span className="truncate max-w-[300px]">{f.name}</span></div><div className="text-2xs text-muted-foreground">{f.code} · {f.weredaName}</div></div> },
    { key: 'health', header: col('health'), cell: (f) => <HealthBadge value={f.health} /> },
    { key: 'progress', header: col('progress'), align: 'right', cell: (f) => pct(f.physicalPct) },
    { key: 'pending', header: col('pending'), align: 'right', cell: (f) => money(f.pendingEtb, locale) },
    { key: 'due', header: col('due'), cell: (f) => <span className="whitespace-nowrap text-xs">{fmtDate(f.nextDueDate, locale)}{f.lagDays > 0 && <span className="block text-2xs font-medium" style={{ color: toneVar.serious }}>{t('daysLate', { count: f.lagDays })}</span>}</span> },
    { key: 'recommendation', header: col('recommendation'), cell: (f) => <ToneBadge tone={recTone[f.recommendation]} label={t(`recommendation.${f.recommendation}`)} /> },
    { key: 'rationale', header: col('rationale'), cell: (f) => <p className="min-w-[240px] max-w-[380px] text-xs text-muted-foreground">{f.rationale}</p> },
  ];
  return <DataTable columns={cols} rows={rows} rowKey={(f) => f.projectId} onRowClick={(f) => router.push(`/projects/${f.projectId}`)} dense />;
}
