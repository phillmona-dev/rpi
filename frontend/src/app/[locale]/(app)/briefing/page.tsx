'use client';
import { useLocale, useTranslations } from 'next-intl';
import { Printer } from 'lucide-react';
import { useBrief } from '@/lib/api/hooks';
import { useBreadcrumbs } from '@/components/layout/breadcrumbs';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { DataState } from '@/components/common/data-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertSeverityBadge, HealthBadge, SectorDot } from '@/components/common/badges';
import { useUser } from '@/providers/session';
import { fmtDate, fmtDateTime, money, num, pct, signedPp } from '@/lib/format';
import { Link } from '@/i18n/navigation';
import { toneVar } from '@/lib/domain';

export default function BriefingPage() {
  const t = useTranslations('brief');
  const td = useTranslations('dashboard.kpi');
  const te = useTranslations('enums');
  const ta = useTranslations('alerts');
  const locale = useLocale();
  const user = useUser();
  useBreadcrumbs([{ label: t('title') }]);
  const { data, isLoading, error, refetch } = useBrief(user.sectorScope);
  return (
    <div className="print-page mx-auto max-w-[960px]">
      <PageHeader className="no-print" title={t('title')} subtitle={t('subtitle')} actions={<Button onClick={() => window.print()}><Printer />{t('print')}</Button>} />
      <DataState isLoading={isLoading} error={error} onRetry={refetch} skeleton={<div className="space-y-3 mt-4"><Skeleton className="h-20" /><Skeleton className="h-40" /><Skeleton className="h-64" /></div>}>
        {data && (() => { const k = data.kpis; const variance = (k.avgPhysicalProgressPct ?? 0) - (k.avgPlannedProgressPct ?? 0); return (
          <article className="mt-4 space-y-6 rounded-lg border bg-card p-6 shadow-card print:border-0 print:shadow-none print:p-0">
            <header className="border-b pb-4">
              <div className="flex items-start justify-between gap-4">
                <div><h1 className="text-2xl font-semibold">{t('title')}</h1><p className="text-sm text-muted-foreground">{data.scope ? te(`sector.${data.scope}`) : 'Tigray Region'} · {t('preparedFor')}: {data.preparedFor}</p></div>
                <div className="text-right text-xs text-muted-foreground"><div>{t('generated')}</div><div className="font-medium text-foreground">{fmtDateTime(data.generatedAt, locale)}</div></div>
              </div>
            </header>
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t('headline')}</h2>
              <div className="mt-2 grid grid-cols-2 gap-3 tablet:grid-cols-4">
                {[[td('activeProjects'), `${k.projectsActive} / ${k.projectsTotal}`, td('completed', { count: k.projectsCompleted })],
                  [td('physicalProgress'), pct(k.avgPhysicalProgressPct), `${signedPp(variance)} vs plan`],
                  [td('disbursed'), money(k.disbursedEtb, locale), td('ofAllocated', { value: money(k.budgetEtb, locale) })],
                  [td('expended'), money(k.expendedEtb, locale), ''],
                  [td('facilities'), `${k.facilitiesRestored} / ${k.facilitiesSevere}`, td('ofDamaged', { value: k.facilitiesSevere })],
                  [td('decisions'), String(data.alertCounts.decisionRequired), td('critical', { count: data.alertCounts.critical })],
                  [td('attention'), String(k.projectsDelayed + k.projectsStalled + k.projectsAtRisk), `${td('delayed', { count: k.projectsDelayed })} · ${td('stalled', { count: k.projectsStalled })} · ${td('atRisk', { count: k.projectsAtRisk })}`],
                  [td('fieldData'), String(k.assessmentsLast7Days), td('assessments7d', { count: k.assessmentsLast7Days })],
                ].map(([l, v, h], i) => <div key={i} className="rounded-md border p-3"><div className="text-2xs uppercase tracking-wide text-muted-foreground">{l}</div><div className="text-xl font-semibold tabular">{v || '—'}</div><div className="text-xs text-muted-foreground">{h}</div></div>)}
              </div>
            </section>
            <section className="grid gap-6 tablet:grid-cols-2">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t('changes')}</h2>
                <Table><TableHeader><TableRow><TableHead></TableHead><TableHead className="text-right">{t('last24h')}</TableHead><TableHead className="text-right">{t('last7d')}</TableHead></TableRow></TableHeader>
                  <TableBody>{data.changes.map((c) => <TableRow key={c.label}><TableCell>{c.label}</TableCell><TableCell className="text-right tabular font-medium">{c.last24h}</TableCell><TableCell className="text-right tabular">{c.last7d}</TableCell></TableRow>)}</TableBody></Table>
              </div>
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t('sectors')}</h2>
                <Table><TableHeader><TableRow><TableHead>Sector</TableHead><TableHead className="text-right">{td('activeProjects')}</TableHead><TableHead className="text-right">{td('physicalProgress')}</TableHead><TableHead className="text-right">{td('decisions')}</TableHead></TableRow></TableHeader>
                  <TableBody>{data.sectors.map((s) => <TableRow key={s.sector}><TableCell><span className="inline-flex items-center gap-1.5"><SectorDot sector={s.sector} />{te(`sector.${s.sector}`)}</span></TableCell><TableCell className="text-right tabular">{s.projectsActive}/{s.projectsTotal}</TableCell><TableCell className="text-right tabular">{pct(s.avgPhysicalProgressPct)} <span className="text-xs text-muted-foreground">({signedPp((s.avgPhysicalProgressPct ?? 0) - (s.avgPlannedProgressPct ?? 0))})</span></TableCell><TableCell className="text-right tabular" style={{ color: s.criticalAlerts ? toneVar.critical : undefined }}>{s.openAlerts}</TableCell></TableRow>)}</TableBody></Table>
              </div>
            </section>
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t('critical')}</h2>
              {data.newCriticalAlerts.length === 0 ? <p className="text-sm text-muted-foreground">{t('none')}</p> : (
                <ul className="mt-2 divide-y">{data.newCriticalAlerts.map((a) => <li key={a.id} className="flex flex-wrap items-start gap-2 py-2 text-sm"><AlertSeverityBadge value={a.severity} /><div className="min-w-0 flex-1"><Link href={`/alerts?id=${a.id}`} className="font-medium hover:underline">{a.title}</Link><div className="text-xs text-muted-foreground">{a.entityName} · {a.weredaName} · {te(`rule.${a.rule}`)}{a.decisionRequired && ` · ${ta('decisionBadge')}`}</div></div></li>)}</ul>
              )}
            </section>
            <section className="grid gap-6 tablet:grid-cols-2">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t('newlyDelayed')}</h2>
                {data.newlyDelayed.length === 0 ? <p className="text-sm text-muted-foreground">{t('none')}</p> : <ul className="mt-2 divide-y">{data.newlyDelayed.map((p) => <li key={p.id} className="py-2 text-sm"><div className="flex items-center justify-between gap-2"><Link href={`/projects/${p.id}`} className="truncate font-medium hover:underline">{p.name}</Link><HealthBadge value={p.health} /></div><div className="text-xs text-muted-foreground">{p.code} · {p.weredaName} · {pct(p.physicalPct)} vs {pct(p.plannedPct)} ({signedPp(p.variancePp)}) · {fmtDate(p.plannedEnd, locale, 'short')}</div></li>)}</ul>}
              </div>
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t('completed')}</h2>
                {data.completedRecently.length === 0 ? <p className="text-sm text-muted-foreground">{t('none')}</p> : <ul className="mt-2 divide-y">{data.completedRecently.map((p) => <li key={p.id} className="py-2 text-sm"><Link href={`/projects/${p.id}`} className="font-medium hover:underline">{p.name}</Link><div className="text-xs text-muted-foreground">{p.code} · {p.weredaName}</div></li>)}</ul>}
              </div>
            </section>
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t('decisions')}</h2>
              {data.decisionsTaken.length === 0 ? <p className="text-sm text-muted-foreground">{t('none')}</p> : <ul className="mt-2 divide-y">{data.decisionsTaken.map((d, i) => <li key={i} className="py-2 text-sm"><div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground"><span className="font-medium text-foreground">{d.actor}</span><span>{d.action}</span><span>· {fmtDateTime(d.at, locale)}</span></div><div className="font-medium">{d.title}</div>{d.note && <p className="text-sm text-muted-foreground">{d.note}</p>}</li>)}</ul>}
            </section>
            <footer className="border-t pt-3 text-2xs text-muted-foreground">{t('footer')} · {num(k.beneficiariesTargeted, locale)} beneficiaries targeted.</footer>
          </article>
        ); })()}
      </DataState>
    </div>
  );
}
