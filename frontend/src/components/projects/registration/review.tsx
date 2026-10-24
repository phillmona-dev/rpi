'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { AlertCircle, AlertTriangle, CheckCircle2, Pencil, RefreshCw } from 'lucide-react';
import { Textarea } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SectorDot } from '@/components/common/badges';
import { useOrganizations, useWeredaMetrics } from '@/lib/api/hooks';
import type { RegistrationValidation } from '@/lib/api/types';
import { fmtDate, localizedName, money, num } from '@/lib/format';
import { toneVar } from '@/lib/domain';
import { monthsBetween, riskScore, stageRank, stepOf, sum, toNum, type FormState, type StepKey } from './model';
import { Field, StepCard } from './ui';

export function ReviewStep({ s, set, result, checking, checkError, onRecheck, goTo }: {
  s: FormState; set: (p: Partial<FormState>) => void; result: RegistrationValidation | null; checking: boolean; checkError: string | null; onRecheck: () => void; goTo: (step: StepKey, field?: string) => void;
}) {
  const t = useTranslations('register');
  const te = useTranslations('enums');
  const tl = useTranslations('projects.lifecycle');
  const locale = useLocale();
  const { data: weredas } = useWeredaMetrics();
  const { data: orgs } = useOrganizations();
  const w = weredas?.find((x) => x.id === s.weredaId);
  const total = toNum(s.totalBudgetEtb) ?? 0;
  const code = s.codeAuto ? result?.suggestedCode : s.code;

  return (
    <StepCard title={t('steps.review.title')} description={t('steps.review.description')} actions={<Button type="button" size="xs" variant="outline" onClick={onRecheck} disabled={checking}><RefreshCw className={checking ? 'animate-spin' : ''} />{t('review.recheck')}</Button>}>
      {/* Server check */}
      <section aria-live="polite" className="space-y-2">
        {checking && !result ? <Skeleton className="h-16 w-full" /> : checkError ? (
          <p className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"><AlertCircle className="h-4 w-4" />{checkError}</p>
        ) : result && (
          <>
            {result.errors.length === 0
              ? <p className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium" style={{ color: toneVar.good, background: `color-mix(in srgb, ${toneVar.good} 10%, transparent)` }}><CheckCircle2 className="h-4 w-4" />{t('review.ready')}</p>
              : <IssueList tone="error" title={t('review.errors', { count: result.errors.length })} issues={result.errors} goTo={goTo} />}
            {result.warnings.length > 0 && <IssueList tone="warning" title={t('review.warnings', { count: result.warnings.length })} issues={result.warnings} goTo={goTo} />}
          </>
        )}
      </section>

      {/* Summary */}
      <div className="grid gap-3 laptop:grid-cols-2">
        <Block title={t('steps.basics.title')} onEdit={() => goTo('basics')}>
          <Row k={t('f.name')} v={<span className="font-medium">{s.name || '—'}</span>} />
          <Row k={t('f.code')} v={<span className="font-mono">{code || '—'}</span>} />
          <Row k={t('f.sector')} v={s.sector ? <span className="inline-flex items-center gap-1.5"><SectorDot sector={s.sector} />{te(`sector.${s.sector}`)}</span> : '—'} />
          <Row k={t('f.stage')} v={tl(`stages.${s.initialStage}`)} />
          <Row k={t('f.beneficiaries')} v={num(toNum(s.beneficiaries), locale)} />
          {s.description && <p className="pt-1 text-xs text-muted-foreground line-clamp-3">{s.description}</p>}
        </Block>
        <Block title={t('steps.location.title')} onEdit={() => goTo('location')}>
          <Row k={t('f.wereda')} v={w ? `${localizedName(w.name, locale)} · ${localizedName(w.zoneName, locale)}` : '—'} />
          <Row k={t('review.site')} v={s.latitude && s.longitude ? <span className="tabular">{s.latitude}, {s.longitude}</span> : t('review.weredaCentre')} />
          <Row k={t('fac.title')} v={t('review.count', { count: s.facilityIds.length })} />
        </Block>
        <Block title={t('steps.schedule.title')} onEdit={() => goTo('schedule')}>
          <Row k={t('review.window')} v={s.plannedStart && s.plannedEnd ? `${fmtDate(s.plannedStart, locale)} → ${fmtDate(s.plannedEnd, locale)}` : '—'} />
          <Row k={t('review.duration')} v={s.plannedStart && s.plannedEnd ? t('review.months', { months: monthsBetween(s.plannedStart, s.plannedEnd) }) : '—'} />
          {stageRank(s.initialStage) >= 4 && <Row k={t('f.actualStart')} v={fmtDate(s.actualStart, locale)} />}
          <Row k={t('ms.title')} v={t('review.milestonesValue', { count: s.milestones.length, weight: Math.round(sum(s.milestones.map((m) => toNum(m.weightPct))) * 100) / 100 })} />
        </Block>
        <Block title={t('steps.budget.title')} onEdit={() => goTo('budget')}>
          <Row k={t('f.totalBudget')} v={<span className="font-medium">{money(total, locale)}</span>} />
          <Row k={t('f.fundingSource')} v={s.fundingSource ? te(`funding.${s.fundingSource}`) : '—'} />
          <Row k={t('bl.title')} v={t('review.linesValue', { count: s.budgetLines.length, amount: money(sum(s.budgetLines.map((l) => toNum(l.allocatedEtb))), locale) })} />
          <Row k={t('tr.title')} v={t('review.tranchesValue', { count: s.tranches.length, amount: money(sum(s.tranches.map((r) => toNum(r.amountEtb))), locale) })} />
        </Block>
        <Block title={t('steps.parties.title')} onEdit={() => goTo('parties')}>
          {s.organizations.map((o) => <Row key={o.key} k={tl(`orgRole.${o.role}`)} v={o.mode === 'existing' ? orgs?.find((x) => x.id === o.organizationId)?.name ?? '—' : <>{o.newName || '—'} <span className="text-2xs text-muted-foreground">({t('review.newOrg')})</span></>} />)}
          {stageRank(s.initialStage) >= 2 && <Row k={t('f.approvalReference')} v={s.approvalReference || '—'} />}
          {stageRank(s.initialStage) >= 4 && <Row k={t('f.contractValue')} v={money(toNum(s.contractValueEtb), locale)} />}
        </Block>
        <Block title={t('steps.risks.title')} onEdit={() => goTo('risks')}>
          {s.risks.length === 0 ? <p className="text-xs text-muted-foreground">{t('review.noRisks')}</p>
            : s.risks.slice(0, 6).map((r) => <Row key={r.key} k={<span className="line-clamp-1">{r.title || '—'}</span>} v={<span className="tabular">{te(`level.${r.likelihood}`)} × {te(`level.${r.impact}`)} = {riskScore(r)}</span>} />)}
        </Block>
      </div>

      <Field id="registrationNote" label={t('f.registrationNote')} hint={t('h.registrationNote')}>
        {(a) => <Textarea {...a} rows={3} maxLength={2000} value={s.registrationNote} onChange={(e) => set({ registrationNote: e.target.value })} placeholder={t('ph.registrationNote')} />}
      </Field>
    </StepCard>
  );
}

function IssueList({ tone, title, issues, goTo }: { tone: 'error' | 'warning'; title: string; issues: { field: string; message: string }[]; goTo: (step: StepKey, field?: string) => void }) {
  const t = useTranslations('register');
  const color = tone === 'error' ? toneVar.critical : toneVar.warning;
  const Icon = tone === 'error' ? AlertCircle : AlertTriangle;
  return (
    <div className="rounded-md border" style={{ borderColor: color }}>
      <p className="flex items-center gap-2 px-3 py-2 text-sm font-medium" style={{ color, background: `color-mix(in srgb, ${color} 10%, transparent)` }}><Icon className="h-4 w-4" />{title}</p>
      <ul className="divide-y text-xs">
        {issues.map((i, k) => (
          <li key={k} className="flex items-start justify-between gap-3 px-3 py-2">
            <span><span className="mr-1.5 rounded bg-muted px-1 py-0.5 text-2xs font-medium text-muted-foreground">{t(`steps.${stepOf(i.field)}.short`)}</span>{i.message}</span>
            <button type="button" className="shrink-0 font-medium underline-offset-2 hover:underline" onClick={() => goTo(stepOf(i.field), i.field)}>{t('review.fix')}</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Block({ title, onEdit, children }: { title: string; onEdit: () => void; children: React.ReactNode }) {
  const t = useTranslations('register');
  return (
    <div className="rounded-md border p-3">
      <div className="mb-1.5 flex items-center justify-between"><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3><Button type="button" size="xs" variant="ghost" onClick={onEdit}><Pencil />{t('review.edit')}</Button></div>
      <dl className="space-y-1">{children}</dl>
    </div>
  );
}
function Row({ k, v }: { k: React.ReactNode; v: React.ReactNode }) {
  return <div className="flex items-baseline justify-between gap-3 text-sm"><dt className="min-w-0 text-xs text-muted-foreground">{k}</dt><dd className="text-right">{v}</dd></div>;
}
