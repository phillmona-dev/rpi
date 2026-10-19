'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ExternalLink, FileText, Image as ImageIcon, Video, FileCheck2, FileSearch, Receipt, File } from 'lucide-react';
import type { ProjectDetail } from '@/lib/api/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ToneBadge } from '@/components/common/badges';
import { Stat } from '@/components/common/page-header';
import { ChartCard } from '@/components/charts/chart-card';
import { ProgressCurve } from '@/components/charts/progress-curve';
import { bytes, fmtDate, fmtDateTime, money, moneyFull, pct, ratio } from '@/lib/format';
import { toneVar, type Tone } from '@/lib/domain';
import { useAudit } from '@/lib/api/hooks';
import { DataState } from '@/components/common/data-state';
import { useUser } from '@/providers/session';
import { canSeeAudit } from '@/lib/domain';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

const msTone: Record<string, Tone> = { PENDING: 'neutral', IN_PROGRESS: 'info', ACHIEVED: 'good', OVERDUE: 'serious' };
const disbTone: Record<string, Tone> = { PLANNED: 'neutral', REQUESTED: 'warning', APPROVED: 'info', RELEASED: 'good' };
const lvlTone: Record<string, Tone> = { LOW: 'good', MEDIUM: 'warning', HIGH: 'serious' };
const docIcon: Record<string, React.ComponentType<{ className?: string }>> = { CONTRACT: FileText, DESIGN: FileSearch, PROGRESS_PHOTO: ImageIcon, SITE_VIDEO: Video, COMPLIANCE_CERTIFICATE: FileCheck2, INSPECTION_REPORT: FileSearch, INVOICE: Receipt, OTHER: File };

export function MilestoneTimeline({ d }: { d: ProjectDetail }) {
  const t = useTranslations('projects.milestones');
  const te = useTranslations('enums.milestone');
  const locale = useLocale();
  const today = Date.now();
  const start = new Date(d.project.plannedStart).getTime();
  const end = Math.max(new Date(d.project.revisedEnd ?? d.project.plannedEnd).getTime(), ...d.milestones.map((m) => new Date(m.actualDate ?? m.plannedDate).getTime()), today);
  const x = (iso: string | number) => `${Math.max(0, Math.min(100, ((typeof iso === 'number' ? iso : new Date(iso).getTime()) - start) / (end - start) * 100))}%`;
  return (
    <div className="space-y-4">
      <div className="relative h-10 rounded-md bg-muted/50" aria-hidden>
        <div className="absolute inset-y-0 left-0 rounded-l-md bg-primary/10" style={{ width: x(today) }} />
        <div className="absolute inset-y-0 w-px bg-foreground/60" style={{ left: x(today) }} title="Today" />
        {d.milestones.map((m) => (
          <div key={m.id} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: x(m.plannedDate) }}>
            <div className={cn('h-3.5 w-3.5 rotate-45 border-2 border-card')} style={{ background: toneVar[msTone[m.status]] }} />
          </div>
        ))}
        {d.milestones.filter((m) => m.actualDate).map((m) => (
          <div key={`a${m.id}`} className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-card" style={{ left: x(m.actualDate!), background: toneVar.good }} />
        ))}
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>#</TableHead><TableHead>{t('title')}</TableHead><TableHead className="text-right">{t('weight')}</TableHead><TableHead className="text-right">{t('planned')}</TableHead><TableHead className="text-right">{t('actual')}</TableHead><TableHead>{t('slip')}</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
        <TableBody>
          {d.milestones.map((m) => (
            <TableRow key={m.id}>
              <TableCell className="tabular text-muted-foreground">{m.sequence}</TableCell>
              <TableCell className="font-medium">{m.name}</TableCell>
              <TableCell className="text-right tabular">{pct(m.weightPct)}</TableCell>
              <TableCell className="text-right tabular">{fmtDate(m.plannedDate, locale, 'short')}</TableCell>
              <TableCell className="text-right tabular">{fmtDate(m.actualDate, locale, 'short')}</TableCell>
              <TableCell className="text-xs" style={{ color: (m.slipDays ?? 0) > 0 ? toneVar.serious : undefined }}>{m.slipDays === null ? '—' : m.actualDate ? (m.slipDays <= 0 ? (m.slipDays === 0 ? t('onTime') : t('early', { days: -m.slipDays })) : t('late', { days: m.slipDays })) : t('overdue', { days: m.slipDays })}</TableCell>
              <TableCell><ToneBadge tone={msTone[m.status]} label={te(m.status as 'PENDING')} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function ProgressLogTab({ d }: { d: ProjectDetail }) {
  const t = useTranslations('projects.progress');
  const ts = useTranslations('enums.source');
  const locale = useLocale();
  const curve = d.progress.map((p) => ({ date: p.date, planned: p.plannedPct, actual: p.physicalPct }));
  return (
    <div className="space-y-4">
      <ChartCard title={t('title')} table={{ columns: [t('date'), t('plannedPct'), t('physical')], rows: curve.map((c) => [fmtDate(c.date, locale, 'short'), c.planned, c.actual]) }}>
        {curve.length ? <ProgressCurve data={curve} height={240} /> : <p className="text-sm text-muted-foreground">{t('empty')}</p>}
      </ChartCard>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader><TableRow><TableHead>{t('date')}</TableHead><TableHead className="text-right">{t('physical')}</TableHead><TableHead className="text-right">{t('plannedPct')}</TableHead><TableHead className="text-right">{t('workforce')}</TableHead><TableHead>{t('reportedBy')}</TableHead><TableHead>{t('source')}</TableHead><TableHead>{t('notes')}</TableHead></TableRow></TableHeader>
          <TableBody>{[...d.progress].reverse().slice(0, 60).map((p) => (
            <TableRow key={p.date}><TableCell className="tabular">{fmtDate(p.date, locale, 'short')}</TableCell><TableCell className="text-right tabular font-medium">{pct(p.physicalPct, 1)}</TableCell><TableCell className="text-right tabular text-muted-foreground">{pct(p.plannedPct, 1)}</TableCell><TableCell className="text-right tabular">{p.workforce ?? '—'}</TableCell><TableCell>{p.reportedBy ?? '—'}</TableCell><TableCell className="text-xs text-muted-foreground">{ts(p.source)}</TableCell><TableCell className="text-xs text-muted-foreground max-w-[280px] truncate">{p.notes ?? ''}</TableCell></TableRow>
          ))}</TableBody>
        </Table>
      </div>
    </div>
  );
}

export function FinanceTab({ d }: { d: ProjectDetail }) {
  const t = useTranslations('projects.finance');
  const tb = useTranslations('enums.budgetCategory');
  const td = useTranslations('enums.disbursement');
  const tf = useTranslations('enums.funding');
  const locale = useLocale();
  const f = d.finance;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 tablet:grid-cols-3 desktop:grid-cols-6">
        <Stat label={t('budget')} value={money(f.budgetEtb, locale)} hint={moneyFull(f.budgetEtb, locale)} />
        <Stat label={t('released')} value={money(f.disbursedEtb, locale)} hint={pct(f.disbursementPct)} />
        <Stat label={t('spent')} value={money(f.expendedEtb, locale)} hint={pct(f.expenditurePct)} />
        <Stat label={t('earned')} value={money(f.earnedValueEtb, locale)} hint={`${pct(d.project.physicalProgressPct)} × ${t('budget').toLowerCase()}`} />
        <Stat label={t('costVariance')} value={<span style={{ color: f.costVarianceEtb < 0 ? toneVar.serious : toneVar.good }}>{money(f.costVarianceEtb, locale)}</span>} hint={`CPI ${ratio(d.project.cpi)}`} />
        <Stat label={t('forecastCost')} value={money(f.forecastCostEtb, locale)} hint={f.forecastCostEtb ? `${f.forecastCostEtb > f.budgetEtb ? '+' : ''}${pct(((f.forecastCostEtb - f.budgetEtb) / f.budgetEtb) * 100)}` : undefined} />
      </div>
      <div className="grid gap-4 desktop:grid-cols-2">
        <div className="rounded-lg border bg-card">
          <h4 className="px-4 pt-3 text-sm font-semibold">{t('tranches')}</h4>
          <Table>
            <TableHeader><TableRow><TableHead>{t('tranche')}</TableHead><TableHead className="text-right">{t('amount')}</TableHead><TableHead className="text-right">{t('plannedDate')}</TableHead><TableHead className="text-right">{t('releasedDate')}</TableHead><TableHead>{t('lag')}</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>{f.disbursements.map((x) => (
              <TableRow key={x.id}><TableCell>#{x.trancheNo} <span className="text-2xs text-muted-foreground">{tf(x.fundingSource)}</span></TableCell><TableCell className="text-right tabular">{money(x.amountEtb, locale)}</TableCell><TableCell className="text-right tabular">{fmtDate(x.plannedDate, locale, 'short')}</TableCell><TableCell className="text-right tabular">{fmtDate(x.releasedDate, locale, 'short')}</TableCell><TableCell className="text-xs" style={{ color: (x.lagDays ?? 0) > 30 ? toneVar.serious : undefined }}>{x.lagDays === null ? '—' : `${x.lagDays} d`}</TableCell><TableCell><ToneBadge tone={disbTone[x.status]} label={td(x.status)} /></TableCell></TableRow>
            ))}</TableBody>
          </Table>
        </div>
        <div className="space-y-4">
          <div className="rounded-lg border bg-card">
            <h4 className="px-4 pt-3 text-sm font-semibold">{t('lines')}</h4>
            <Table><TableHeader><TableRow><TableHead>{t('category')}</TableHead><TableHead className="text-right">{t('allocated')}</TableHead><TableHead className="text-right">%</TableHead></TableRow></TableHeader>
              <TableBody>{f.budgetLines.map((l) => <TableRow key={l.category}><TableCell>{tb(l.category as 'WORKS')}</TableCell><TableCell className="text-right tabular">{money(l.allocatedEtb, locale)}</TableCell><TableCell className="text-right tabular text-muted-foreground">{pct(f.allocatedLinesEtb ? (l.allocatedEtb / f.allocatedLinesEtb) * 100 : 0)}</TableCell></TableRow>)}</TableBody></Table>
          </div>
          <div className="rounded-lg border bg-card">
            <h4 className="px-4 pt-3 text-sm font-semibold">{t('expenditures')}</h4>
            <div className="max-h-64 overflow-auto"><Table><TableHeader><TableRow><TableHead>{t('period')}</TableHead><TableHead className="text-right">{t('amount')}</TableHead><TableHead>{t('certifiedBy')}</TableHead></TableRow></TableHeader>
              <TableBody>{[...f.expenditures].reverse().map((e) => <TableRow key={e.id}><TableCell className="tabular text-xs">{fmtDate(e.periodStart, locale, 'short')} – {fmtDate(e.periodEnd, locale, 'short')}</TableCell><TableCell className="text-right tabular">{money(e.amountEtb, locale)}</TableCell><TableCell className="text-xs text-muted-foreground">{e.certifiedBy ?? '—'} · {fmtDate(e.certifiedOn, locale, 'short')}</TableCell></TableRow>)}</TableBody></Table></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function RisksTab({ d }: { d: ProjectDetail }) {
  const t = useTranslations('projects.risks');
  const tl = useTranslations('enums.level');
  const trs = useTranslations('enums.riskStatus');
  const tis = useTranslations('enums.issueStatus');
  const locale = useLocale();
  return (
    <div className="grid gap-4 desktop:grid-cols-2">
      <div className="rounded-lg border bg-card">
        <h4 className="px-4 pt-3 text-sm font-semibold">{t('title')}</h4>
        {d.risks.length === 0 ? <p className="px-4 pb-4 pt-2 text-sm text-muted-foreground">{t('emptyRisks')}</p> : (
          <ul className="divide-y">{d.risks.map((r) => (
            <li key={r.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{r.title}</span><span className="text-2xs rounded border px-1 text-muted-foreground">{r.category}</span><ToneBadge tone={r.status === 'CLOSED' ? 'good' : r.status === 'MITIGATING' ? 'info' : 'warning'} label={trs(r.status as 'OPEN')} /></div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span>{t('likelihood')}: <ToneBadge tone={lvlTone[r.likelihood]} label={tl(r.likelihood)} /></span><span>{t('impact')}: <ToneBadge tone={lvlTone[r.impact]} label={tl(r.impact)} /></span><span>{t('owner')}: {r.owner ?? '—'}</span><span>{t('raised')}: {fmtDate(r.raisedOn, locale, 'short')}</span></div>
              {r.mitigation && <p className="mt-1.5 text-sm"><span className="text-muted-foreground">{t('mitigation')}: </span>{r.mitigation}</p>}
            </li>
          ))}</ul>
        )}
      </div>
      <div className="rounded-lg border bg-card">
        <h4 className="px-4 pt-3 text-sm font-semibold">{t('issues')}</h4>
        {d.issues.length === 0 ? <p className="px-4 pb-4 pt-2 text-sm text-muted-foreground">{t('emptyIssues')}</p> : (
          <ul className="divide-y">{d.issues.map((i) => (
            <li key={i.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2"><ToneBadge tone={lvlTone[i.severity]} label={tl(i.severity)} /><span className="font-medium">{i.title}</span><ToneBadge tone={i.status === 'RESOLVED' ? 'good' : i.status === 'IN_PROGRESS' ? 'info' : 'serious'} label={tis(i.status as 'OPEN')} /></div>
              {i.description && <p className="mt-1 text-sm text-muted-foreground">{i.description}</p>}
              <div className="mt-1 text-xs text-muted-foreground">{t('raised')} {fmtDate(i.raisedOn, locale, 'short')} · {t('owner')}: {i.owner ?? '—'}{i.resolvedOn && <> · {t('resolved')} {fmtDate(i.resolvedOn, locale, 'short')}</>}</div>
            </li>
          ))}</ul>
        )}
      </div>
    </div>
  );
}

export function DocumentsTab({ d }: { d: ProjectDetail }) {
  const t = useTranslations('projects.documents');
  const tt = useTranslations('enums.docType');
  const locale = useLocale();
  if (!d.documents.length) return <p className="text-sm text-muted-foreground">{t('empty')}</p>;
  return (
    <div className="space-y-2">
      <ul className="grid gap-2 tablet:grid-cols-2 desktop:grid-cols-3">
        {d.documents.map((doc) => { const Icon = docIcon[doc.docType] ?? File; return (
          <li key={doc.id} className="flex items-start gap-3 rounded-lg border bg-card p-3">
            <span className="rounded-md bg-muted p-2"><Icon className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{doc.title}</div>
              <div className="text-2xs text-muted-foreground">{tt(doc.docType as 'CONTRACT')} · {bytes(doc.sizeBytes)} · {fmtDate(doc.uploadedAt, locale, 'short')} · {doc.uploadedBy ?? '—'}</div>
            </div>
            <a href={doc.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" aria-label={`${t('title')}: ${doc.title}`}><ExternalLink className="h-4 w-4" /></a>
          </li>
        ); })}
      </ul>
      <p className="text-2xs text-muted-foreground">{t('demoNote')}</p>
    </div>
  );
}

export function AuditTab({ projectId }: { projectId: number }) {
  const t = useTranslations('projects.audit');
  const locale = useLocale();
  const user = useUser();
  const allowed = canSeeAudit(user.roles);
  const { data, isLoading, error, refetch } = useAudit({ entityType: 'PROJECT', entityId: String(projectId), size: 50 });
  if (!allowed) return <p className="text-sm text-muted-foreground">{t('hint')}</p>;
  return (
    <DataState isLoading={isLoading} error={error} onRetry={refetch} isEmpty={!data?.content.length} emptyHint={t('hint')}>
      <div className="rounded-lg border bg-card"><Table><TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Actor</TableHead><TableHead>Action</TableHead><TableHead>Outcome</TableHead><TableHead>Correlation</TableHead></TableRow></TableHeader>
        <TableBody>{data?.content.map((a) => <TableRow key={a.id}><TableCell className="tabular text-xs">{fmtDateTime(a.occurredAt, locale)}</TableCell><TableCell>{a.actor ?? 'system'}</TableCell><TableCell className="font-mono text-xs">{a.action}</TableCell><TableCell className="text-xs">{String(a.detail?.outcome ?? '')}</TableCell><TableCell className="font-mono text-2xs text-muted-foreground">{a.correlationId?.slice(0, 8)}</TableCell></TableRow>)}</TableBody></Table></div>
      <p className="mt-2 text-2xs text-muted-foreground"><Link href="/admin/audit" className="underline">{t('title')}</Link></p>
    </DataState>
  );
}
