'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { ArrowUpRight, CheckCircle2, CircleAlert } from 'lucide-react';
import { useApprovalDossier } from '@/lib/api/hooks';
import { useBreadcrumbs } from '@/components/layout/breadcrumbs';
import { PageHeader, Section, Stat } from '@/components/common/page-header';
import { DataState } from '@/components/common/data-state';
import { ApprovalBadge, SectorLabel, SeverityBadge } from '@/components/common/badges';
import { ReadinessList } from '@/components/approvals/readiness-meter';
import { DecisionPanel } from '@/components/approvals/decision-panel';
import { ResubmitPanel } from '@/components/approvals/resubmit-panel';
import { ApprovalTrail } from '@/components/approvals/approval-trail';
import { RecordDiscussion } from '@/components/messaging/record-discussion';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from '@/i18n/navigation';
import { useUser } from '@/providers/session';
import { canSeeApprovals, toneVar } from '@/lib/domain';
import type { ApprovalDossier } from '@/lib/api/types';
import { fmtDate, localizedName, money, num, pct } from '@/lib/format';

export default function ApprovalDossierPage() {
  const { id } = useParams<{ id: string }>();
  const pid = Number(id);
  const t = useTranslations('approvals');
  const user = useUser();
  const { data, isLoading, error, refetch } = useApprovalDossier(pid);
  useBreadcrumbs([{ label: t('title'), href: '/approvals' }, { label: data?.detail.project.code ?? t('dossier.title') }]);
  if (!canSeeApprovals(user.roles)) return <DataState isLoading={false} isEmpty emptyTitle={t('noAccess')} emptyHint={t('noAccessHint')}>{null}</DataState>;
  return (
    <DataState isLoading={isLoading} error={error} onRetry={refetch} skeleton={<div className="space-y-4"><Skeleton className="h-20" /><Skeleton className="h-32" /><Skeleton className="h-96" /></div>}>
      {data && <Dossier d={data} />}
    </DataState>
  );
}

function Dossier({ d }: { d: ApprovalDossier }) {
  const t = useTranslations('approvals');
  const tp = useTranslations('projects');
  const tl = useTranslations('projects.lifecycle.stages');
  const tr = useTranslations('projects.lifecycle.orgRole');
  const te = useTranslations('enums');
  const locale = useLocale();
  const p = d.detail.project;
  const det = d.detail;
  const a = det.approval;
  const ctx = d.context;
  const tranches = det.finance.disbursements;
  const scheduled = tranches.reduce((s, x) => s + x.amountEtb, 0);
  const gaps = d.readiness.checks.filter((c) => !c.passed && c.severity === 'WARN' && c.code !== 'NO_DUPLICATES');

  return (
    <>
      <PageHeader
        title={p.name}
        subtitle={<span className="flex flex-wrap items-center gap-x-3 gap-y-1"><span className="font-mono text-sm">{p.code}</span><SectorLabel sector={p.sector} /><span>{localizedName(p.wereda.name, locale)} · {localizedName(p.wereda.zoneName, locale)}</span></span>}
        meta={<><ApprovalBadge value={a.status} />{a.submittedByName && <span className="text-sm text-muted-foreground">{t('status.submittedBy', { name: a.submittedByName })} · {fmtDate(a.submittedAt, locale)}</span>}{a.decisionReference && a.status !== 'PENDING' && <span className="font-mono text-sm text-muted-foreground">{t('status.reference', { reference: a.decisionReference })}</span>}</>}
        actions={<Button asChild variant="outline"><Link href={`/projects/${p.id}`}>{t('dossier.openProject')}<ArrowUpRight /></Link></Button>}
      />

      <div className="grid gap-6 desktop:grid-cols-12">
        <div className="space-y-6 desktop:col-span-8">
          <p className="rounded-lg border bg-card px-5 py-4 text-base leading-relaxed shadow-card">
            {t('dossier.ask', { budget: money(p.totalBudgetEtb, locale), wereda: localizedName(p.wereda.name, locale), start: fmtDate(p.plannedStart, locale), end: fmtDate(p.plannedEnd, locale),
              people: p.beneficiaries ? num(p.beneficiaries, locale) : '—', funding: te(`funding.${p.fundingSource}`) })}
          </p>

          <Section title={t('dossier.beforeDeciding')} hint={t('dossier.beforeDecidingHint')}>
            {gaps.length === 0 && d.similar.length === 0 ? (
              <p className="flex items-center gap-2 text-base"><CheckCircle2 className="h-5 w-5" style={{ color: toneVar.good }} aria-hidden />{t('dossier.allGood')}</p>
            ) : (
              <ul className="space-y-3">
                {gaps.map((c) => (
                  <li key={c.code} className="flex items-start gap-3"><CircleAlert className="mt-0.5 h-5 w-5 shrink-0" style={{ color: toneVar.warning }} aria-hidden />
                    <span><span className="block font-medium">{t(`missing.${c.code}` as 'missing.RISKS')}</span>{c.detail && <span className="block text-sm text-muted-foreground">{c.detail}</span>}</span></li>
                ))}
                {d.similar.map((x) => (
                  <li key={x.id} className="flex items-start gap-3"><CircleAlert className="mt-0.5 h-5 w-5 shrink-0" style={{ color: toneVar.serious }} aria-hidden />
                    <span><span className="block font-medium">{t('dossier.similarOne')}</span><Link href={`/projects/${x.id}`} className="text-sm text-primary hover:underline">{x.name} · {x.weredaName} · {te(`status.${x.status}`)}</Link></span></li>
                ))}
              </ul>
            )}
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-medium text-primary">{t('dossier.allChecks', { passed: d.readiness.passed, total: d.readiness.total })}</summary>
              <div className="mt-2"><ReadinessList r={d.readiness} /></div>
            </details>
          </Section>

          <Section title={t('dossier.scope')}>
            <p className="whitespace-pre-line text-base leading-relaxed">{det.description || t('dossier.noneRecorded')}</p>
            <div className="mt-5 grid grid-cols-2 gap-3 tablet:grid-cols-3">
              <Stat label={t('dossier.budget')} value={money(p.totalBudgetEtb, locale)} hint={te(`funding.${p.fundingSource}`)} />
              <Stat label={t('dossier.schedule')} value={`${fmtDate(p.plannedStart, locale, 'short')} → ${fmtDate(p.plannedEnd, locale, 'short')}`} />
              <Stat label={t('dossier.beneficiaries')} value={num(p.beneficiaries, locale)} />
              <Stat label={t('dossier.stage')} value={tl(p.lifecycleStage)} />
              <Stat label={t('dossier.tranches')} value={money(scheduled, locale)} hint={t('dossier.ofBudget', { pct: pct(p.totalBudgetEtb ? (scheduled / p.totalBudgetEtb) * 100 : 0) })} />
              <Stat label={tp('overview.contractor')} value={<span className="text-base">{p.contractorName ?? '—'}</span>} />
            </div>
          </Section>

          <h2 className="pt-2 text-lg font-semibold">{t('dossier.fullDetails')}</h2>
          <div className="grid gap-6 laptop:grid-cols-2">
            <Section title={t('dossier.organizations')}>
              {det.governance.organizations.length ? (
                <ul className="divide-y">{det.governance.organizations.map((o) => <li key={`${o.id}-${o.role}`} className="flex items-start justify-between gap-3 py-2.5"><div className="min-w-0"><div className="font-medium">{o.name}</div><div className="text-sm text-muted-foreground">{te(`orgType.${o.orgType}`)}</div></div><span className="shrink-0 text-sm text-muted-foreground">{tr(o.role)}</span></li>)}</ul>
              ) : <p className="text-sm text-muted-foreground">{t('dossier.noneRecorded')}</p>}
            </Section>
            <Section title={t('dossier.milestones')}>
              {det.milestones.length ? (
                <ol className="divide-y">{det.milestones.map((m) => <li key={m.id} className="flex items-baseline justify-between gap-3 py-2.5"><span className="min-w-0"><span className="mr-2 text-sm text-muted-foreground tabular">{m.sequence}.</span>{m.name}</span><span className="shrink-0 text-sm text-muted-foreground tabular">{fmtDate(m.plannedDate, locale, 'short')} · {pct(m.weightPct)}</span></li>)}</ol>
              ) : <p className="text-sm text-muted-foreground">{t('dossier.noneRecorded')}</p>}
            </Section>
          </div>

          <div className="grid gap-6 laptop:grid-cols-2">
            <Section title={t('dossier.budgetLines')}>
              {det.finance.budgetLines.length ? (
                <ul className="divide-y">{det.finance.budgetLines.map((b) => <li key={b.category} className="flex justify-between gap-3 py-2.5"><span>{te(`budgetCategory.${b.category}`)}</span><span className="font-medium tabular">{money(b.allocatedEtb, locale)}</span></li>)}</ul>
              ) : <p className="text-sm text-muted-foreground">{t('dossier.noneRecorded')}</p>}
            </Section>
            <Section title={t('dossier.tranches')}>
              {tranches.length ? (
                <ul className="divide-y">{tranches.map((x) => <li key={x.id} className="flex justify-between gap-3 py-2.5"><span>#{x.trancheNo} · {fmtDate(x.plannedDate, locale, 'short')}</span><span className="font-medium tabular">{money(x.amountEtb, locale)}</span></li>)}</ul>
              ) : <p className="text-sm text-muted-foreground">{t('dossier.noneRecorded')}</p>}
            </Section>
          </div>

          <div className="grid gap-6 laptop:grid-cols-2">
            <Section title={t('dossier.risks')}>
              {det.risks.length ? (
                <ul className="divide-y">{det.risks.map((r) => <li key={r.id} className="py-2.5"><div className="font-medium">{r.title}</div><div className="text-sm text-muted-foreground">{r.category} · {te(`level.${r.likelihood}`)} / {te(`level.${r.impact}`)}{r.mitigation ? ` · ${r.mitigation}` : ''}</div></li>)}</ul>
              ) : <p className="text-sm text-muted-foreground">{t('dossier.noneRecorded')}</p>}
            </Section>
            <Section title={t('dossier.facilities')}>
              {det.facilities.length ? (
                <ul className="divide-y">{det.facilities.map((f) => <li key={f.id} className="flex items-center justify-between gap-3 py-2.5"><Link href={`/facilities/${f.id}`} className="min-w-0 truncate font-medium hover:underline">{f.name}</Link><SeverityBadge value={f.latestSeverity} /></li>)}</ul>
              ) : <p className="text-sm text-muted-foreground">{t('dossier.noneRecorded')}</p>}
            </Section>
          </div>
        </div>

        <aside className="space-y-6 desktop:col-span-4">
          {a.status === 'PENDING' && <DecisionPanel dossier={d} />}
          {a.status === 'RETURNED' && d.canResubmit && <ResubmitPanel dossier={d} />}
          {a.conditions && <Section title={t('status.conditions')}><p className="text-sm">{a.conditions}</p></Section>}

          <Section title={t('dossier.context')}>
            <dl className="space-y-3 text-sm">
              <div><dt className="text-muted-foreground">{t('dossier.ctx.sectorPortfolio', { sector: te(`sector.${p.sector}`) })}</dt><dd className="font-medium">{t('dossier.ctx.sectorPortfolioValue', { count: ctx.sectorApprovedProjects, budget: money(ctx.sectorApprovedBudgetEtb, locale).replace('ETB ', '') })}</dd></div>
              <div><dt className="text-muted-foreground">{t('dossier.ctx.share')}</dt><dd className="font-medium">{ctx.shareOfSectorBudgetPct === null ? '—' : t('dossier.ctx.shareValue', { pct: pct(ctx.shareOfSectorBudgetPct, 1) })}</dd></div>
              <div><dt className="text-muted-foreground">{t('dossier.ctx.wereda')}</dt><dd className="font-medium">{t('dossier.ctx.weredaValue', { active: ctx.weredaActiveProjects, severe: ctx.weredaSevereFacilities })}</dd></div>
              <div><dt className="text-muted-foreground">{t('dossier.ctx.contractor')}</dt><dd className="font-medium">{ctx.contractorName ? t('dossier.ctx.contractorValue', { count: ctx.sameContractorActiveProjects, name: ctx.contractorName }) : t('dossier.ctx.noContractor')}</dd></div>
            </dl>
          </Section>

          <Section title={t('dossier.history')}><ApprovalTrail events={a.events} /></Section>
          <RecordDiscussion type="APPROVAL" id={p.id} threadClassName="h-[360px]" />
        </aside>
      </div>
    </>
  );
}
