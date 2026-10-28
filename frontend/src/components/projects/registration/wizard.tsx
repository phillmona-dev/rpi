'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, ArrowLeft, ArrowRight, Check, CheckCircle2, ClipboardCheck, Clock, FileCheck2, FolderPlus, History, Loader2, Save, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HealthBadge, SectorDot } from '@/components/common/badges';
import { RiskChip } from '@/components/projects/risk-score';
import { Link, useRouter } from '@/i18n/navigation';
import { useUser } from '@/providers/session';
import { useCreateProject, useValidateProject, useWeredaMetrics, useCodeSuggestion } from '@/lib/api/hooks';
import { useAssessment } from '@/lib/api/damage';
import { ApiError } from '@/lib/api/client';
import type { ProjectSummary, RegistrationValidation } from '@/lib/api/types';
import { fmtDateTime, localizedName, money } from '@/lib/format';
import { cn } from '@/lib/utils';
import { toneVar } from '@/lib/domain';
import { STEPS, emptyForm, isDirty, monthsBetween, stepOf, sum, toNum, toRequest, validateAll, validateStep, type Errors, type FormState, type StepKey } from './model';
import { BasicsStep, LocationStep } from './steps-identity';
import { BudgetStep, ScheduleStep } from './steps-plan';
import { PartiesStep, RisksStep } from './steps-governance';
import { ReviewStep } from './review';
import { Meter } from './ui';

const DRAFT_VERSION = 1;
interface Draft { v: number; savedAt: string; step: number; state: FormState }
const readDraft = (key: string): Draft | null => { try { const raw = localStorage.getItem(key); const d = raw ? (JSON.parse(raw) as Draft) : null; return d && d.v === DRAFT_VERSION ? d : null; } catch { return null; } };
const writeDraft = (key: string, d: Draft | null) => { try { if (d) localStorage.setItem(key, JSON.stringify(d)); else localStorage.removeItem(key); } catch { /* storage unavailable: drafts are a convenience only */ } };

/** Moves focus to the first invalid control so keyboard and screen-reader users land on the problem. */
function focusField(field?: string) {
  requestAnimationFrame(() => {
    const el = (field && (document.getElementById(field) ?? document.querySelector<HTMLElement>(`[data-field="${CSS.escape(field)}"]`))) || document.querySelector<HTMLElement>('[aria-invalid="true"], [role="alert"]');
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const focusable = el.matches('input,textarea,button,[tabindex]') ? el : el.querySelector<HTMLElement>('input,textarea,button,[role="combobox"]');
    focusable?.focus({ preventScroll: true });
  });
}

export function RegistrationWizard() {
  const t = useTranslations('register');
  const user = useUser();
  const router = useRouter();
  const draftKey = `rpis.projectDraft.${user.id}`;
  const [s, setState] = React.useState<FormState>(emptyForm);
  const [step, setStep] = React.useState(0);
  const [attempted, setAttempted] = React.useState<Set<StepKey>>(new Set());
  const [serverErrors, setServerErrors] = React.useState<Errors>({});
  const [result, setResult] = React.useState<RegistrationValidation | null>(null);
  const [checkError, setCheckError] = React.useState<string | null>(null);
  const [pendingDraft, setPendingDraft] = React.useState<Draft | null>(null);
  const [savedAt, setSavedAt] = React.useState<string | null>(null);
  const [created, setCreated] = React.useState<ProjectSummary | null>(null);
  const validate = useValidateProject();
  const create = useCreateProject();
  const msg = React.useCallback((k: string, v?: Record<string, string | number>) => t(k as 'v.required', v as never), [t]);
  const key = STEPS[step];
  const te = useTranslations('enums');
  const basisId = Number(useSearchParams().get('assessment') ?? NaN);
  const basis = useAssessment(basisId);
  const [basisApplied, setBasisApplied] = React.useState(false);

  // Registering from a verified need: carry the assessment's facility, location, people and estimate across.
  React.useEffect(() => {
    const d = basis.data;
    if (!d || basisApplied) return;
    const a = d.summary;
    const est = a.recommendedIntervention === 'RECONSTRUCTION' || a.recommendedIntervention === 'RELOCATION' ? a.estimatedReplacementCostEtb ?? a.estimatedRepairCostEtb : a.estimatedRepairCostEtb ?? a.estimatedReplacementCostEtb;
    const action = a.recommendedIntervention ? te(`intervention.${a.recommendedIntervention}`) : te('intervention.REHABILITATION');
    setState({
      ...emptyForm(),
      name: t('fromAssessment.name', { action, facility: a.facility.name }), sector: a.facility.sector, zoneId: a.facility.wereda.zoneId, weredaId: a.facility.wereda.id,
      latitude: d.location ? String(d.location.lat) : '', longitude: d.location ? String(d.location.lng) : '', facilityIds: [a.facility.id],
      beneficiaries: a.beneficiariesAffected ? String(a.beneficiariesAffected) : '', totalBudgetEtb: est ? String(Math.round(est)) : '',
      description: t('fromAssessment.description', { facility: a.facility.name, severity: te(`severity.${a.severity}`), date: a.assessedOn, action,
        priority: a.interventionPriority ? te(`needPriority.${a.interventionPriority}`) : '—', source: d.campaign ? `${d.campaign.code} · ${d.campaign.name}` : t('fromAssessment.adHoc'), notes: d.notes ?? '' }).trim(),
      registrationNote: t('fromAssessment.note', { id: a.id }), assessmentIds: [a.id],
    });
    setBasisApplied(true);
  }, [basis.data, basisApplied, t, te]);

  // Draft: offer to restore once, then autosave while editing (not when starting from an assessment)
  React.useEffect(() => { if (Number.isFinite(basisId)) return; const d = readDraft(draftKey); if (d && isDirty(d.state)) setPendingDraft(d); }, [draftKey, basisId]);
  React.useEffect(() => {
    if (created || pendingDraft || !isDirty(s)) return;
    const h = setTimeout(() => { const at = new Date().toISOString(); writeDraft(draftKey, { v: DRAFT_VERSION, savedAt: at, step, state: s }); setSavedAt(at); }, 700);
    return () => clearTimeout(h);
  }, [s, step, draftKey, created, pendingDraft]);
  // Unsaved-work guard
  React.useEffect(() => {
    const dirty = isDirty(s) && !created;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    if (dirty) window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [s, created]);

  const set = React.useCallback((patch: Partial<FormState>) => { setState((prev) => ({ ...prev, ...patch })); setServerErrors({}); }, []);
  const clientErrors = React.useMemo(() => {
    const out: Errors = {};
    attempted.forEach((st) => Object.assign(out, validateStep(st, s, msg)));
    return out;
  }, [attempted, s, msg]);
  const errors = { ...clientErrors, ...serverErrors };
  const stepErrorCount = (st: StepKey) => Object.keys(errors).filter((f) => stepOf(f) === st).length;

  const runCheck = React.useCallback(async () => {
    const local = validateAll(s, msg);
    setAttempted(new Set(STEPS));
    setCheckError(null);
    if (Object.keys(local).length) {
      setResult({ valid: false, suggestedCode: null, errors: Object.entries(local).map(([field, message]) => ({ field, message })), warnings: [] });
      return;
    }
    try {
      const r = await validate.mutateAsync(toRequest(s));
      setResult(r);
      setServerErrors(Object.fromEntries(r.errors.map((e) => [e.field, e.message])));
    } catch (e) {
      if (e instanceof ApiError && e.errors?.length) { setResult({ valid: false, suggestedCode: null, errors: e.errors, warnings: [] }); setServerErrors(Object.fromEntries(e.errors.map((x) => [x.field, x.message]))); }
      else setCheckError(e instanceof ApiError ? e.detail || e.title : t('review.checkFailed'));
    }
  }, [s, msg, validate, t]);

  // Every arrival on the review step re-runs the server check against the latest data
  React.useEffect(() => {
    if (key === 'review') void runCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run on arrival only, not on every edit
  }, [key]);

  const goTo = (target: StepKey, field?: string) => { setStep(STEPS.indexOf(target)); window.scrollTo({ top: 0, behavior: 'smooth' }); if (field) { setAttempted((a) => new Set(a).add(target)); focusField(field); } };
  const next = () => {
    const e = validateStep(key, s, msg);
    if (Object.keys(e).length) { setAttempted((a) => new Set(a).add(key)); focusField(Object.keys(e)[0]); return; }
    setStep((x) => Math.min(x + 1, STEPS.length - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const back = () => { setStep((x) => Math.max(0, x - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  const submit = async () => {
    const local = validateAll(s, msg);
    if (Object.keys(local).length) { setAttempted(new Set(STEPS)); const f = Object.keys(local)[0]; goTo(stepOf(f), f); return; }
    try {
      const p = await create.mutateAsync(toRequest(s));
      writeDraft(draftKey, null);
      setCreated(p);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      if (e instanceof ApiError && e.errors?.length) {
        setServerErrors(Object.fromEntries(e.errors.map((x) => [x.field, x.message])));
        setResult({ valid: false, suggestedCode: null, errors: e.errors, warnings: result?.warnings ?? [] });
      } else setCheckError(e instanceof ApiError ? e.detail || e.title : t('review.submitFailed'));
    }
  };

  if (created) return <Success p={created} onAnother={() => { setState(emptyForm()); setStep(0); setAttempted(new Set()); setResult(null); setCreated(null); }} />;

  const blockers = result?.errors.length ?? 0;
  const basisShown = s.assessmentIds.length > 0 && basis.data && s.assessmentIds.includes(basis.data.summary.id);
  return (
    <div className="space-y-4">
      {basisShown && basis.data && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-primary/40 bg-card px-4 py-3 shadow-card" role="status">
          <p className="flex items-center gap-2 text-sm"><ClipboardCheck className="h-4 w-4 shrink-0 text-primary" />
            <span>{t('fromAssessment.banner', { facility: basis.data.summary.facility.name })} <Link href={`/damage/assessments/${basis.data.summary.id}`} className="font-medium text-primary hover:underline">{t('fromAssessment.view')}</Link></span></p>
          <Button size="sm" variant="ghost" onClick={() => set({ assessmentIds: [] })}><X />{t('fromAssessment.unlink')}</Button>
        </div>
      )}
      {pendingDraft && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 shadow-card" role="status">
          <p className="flex items-center gap-2 text-sm"><History className="h-4 w-4 text-muted-foreground" />{t('draft.found', { name: pendingDraft.state.name || t('draft.untitled'), time: fmtDateTime(pendingDraft.savedAt) })}</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => { setState(pendingDraft.state); setStep(pendingDraft.step); setPendingDraft(null); }}>{t('draft.restore')}</Button>
            <Button size="sm" variant="ghost" onClick={() => { writeDraft(draftKey, null); setPendingDraft(null); }}><Trash2 />{t('draft.discard')}</Button>
          </div>
        </div>
      )}

      <div className="grid gap-5 desktop:grid-cols-[220px_minmax(0,1fr)] wide:grid-cols-[220px_minmax(0,1fr)_300px]">
        {/* Stepper */}
        <nav aria-label={t('stepsLabel')} className="desktop:sticky desktop:top-20 desktop:self-start">
          <ol className="flex gap-1 overflow-x-auto pb-1 desktop:flex-col desktop:overflow-visible">
            {STEPS.map((st, i) => {
              const n = stepErrorCount(st);
              const done = i < step && n === 0;
              const current = i === step;
              return (
                <li key={st} className="shrink-0">
                  <button type="button" onClick={() => goTo(st)} aria-current={current ? 'step' : undefined}
                    className={cn('flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', current && 'bg-accent font-medium')}>
                    <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-2xs font-semibold tabular', current && 'border-primary bg-primary text-primary-foreground', done && 'border-transparent text-white')}
                      style={n ? { borderColor: toneVar.critical, color: toneVar.critical } : done ? { background: toneVar.good } : undefined}>
                      {n ? <AlertCircle className="h-3.5 w-3.5" /> : done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                    </span>
                    <span className="min-w-0"><span className="block whitespace-nowrap">{t(`steps.${st}.short`)}</span>{n > 0 && <span className="block text-2xs" style={{ color: toneVar.critical }}>{t('issues', { count: n })}</span>}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="mt-3 hidden items-center gap-1.5 px-2.5 text-2xs text-muted-foreground desktop:flex">{savedAt ? <><Save className="h-3 w-3" />{t('draft.saved', { time: fmtDateTime(savedAt) })}</> : <><Clock className="h-3 w-3" />{t('draft.autosave')}</>}</p>
        </nav>

        {/* Step body */}
        <div className="min-w-0 space-y-4">
          {key === 'basics' && <BasicsStep s={s} set={set} errors={errors} />}
          {key === 'location' && <LocationStep s={s} set={set} errors={errors} />}
          {key === 'schedule' && <ScheduleStep s={s} set={set} errors={errors} />}
          {key === 'budget' && <BudgetStep s={s} set={set} errors={errors} />}
          {key === 'parties' && <PartiesStep s={s} set={set} errors={errors} />}
          {key === 'risks' && <RisksStep s={s} set={set} errors={errors} />}
          {key === 'review' && <ReviewStep s={s} set={set} result={result} checking={validate.isPending} checkError={checkError} onRecheck={runCheck} goTo={goTo} />}

          <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-3 border-t bg-background/95 px-1 py-3 backdrop-blur">
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={back} disabled={step === 0}><ArrowLeft />{t('back')}</Button>
              <Button type="button" variant="ghost" onClick={() => router.push('/projects')}>{t('cancel')}</Button>
            </div>
            <span className="hidden text-xs text-muted-foreground tablet:block">{t('stepOf', { step: step + 1, total: STEPS.length })}</span>
            {key !== 'review'
              ? <Button type="button" onClick={next}>{t('next')}<ArrowRight /></Button>
              : <Button type="button" onClick={submit} disabled={create.isPending || validate.isPending || blockers > 0}>{create.isPending ? <Loader2 className="animate-spin" /> : <FolderPlus />}{t('submit')}</Button>}
          </div>
        </div>

        {/* Live summary */}
        <aside className="hidden wide:block wide:sticky wide:top-20 wide:self-start"><Summary s={s} /></aside>
      </div>
    </div>
  );
}

function Summary({ s }: { s: FormState }) {
  const t = useTranslations('register');
  const te = useTranslations('enums');
  const tl = useTranslations('projects.lifecycle.stages');
  const locale = useLocale();
  const { data: weredas } = useWeredaMetrics();
  const { data: code } = useCodeSuggestion(s.sector || null);
  const w = weredas?.find((x) => x.id === s.weredaId);
  const total = toNum(s.totalBudgetEtb) ?? 0;
  const items: [string, boolean][] = [
    [t('sum.identity'), Boolean(s.name.trim().length >= 5 && s.sector)], [t('sum.location'), Boolean(s.weredaId)], [t('sum.schedule'), Boolean(s.plannedStart && s.plannedEnd)],
    [t('sum.milestones'), Math.abs(sum(s.milestones.map((m) => toNum(m.weightPct))) - 100) <= 0.05], [t('sum.budget'), Boolean(total && s.fundingSource)],
    [t('sum.agency'), s.organizations.some((o) => o.role === 'IMPLEMENTING_AGENCY' && (o.organizationId || o.newName.trim()))], [t('sum.risks'), s.risks.length > 0],
  ];
  const done = items.filter(([, ok]) => ok).length;
  return (
    <div className="space-y-4 rounded-lg border bg-card p-4 shadow-card">
      <div>
        <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">{t('sum.title')}</p>
        <p className="mt-1 line-clamp-2 text-sm font-semibold">{s.name || <span className="text-muted-foreground">{t('draft.untitled')}</span>}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span className="font-mono">{s.codeAuto ? code?.code ?? '—' : s.code || '—'}</span>
          {s.sector && <span className="inline-flex items-center gap-1"><SectorDot sector={s.sector} />{te(`sector.${s.sector}`)}</span>}
          <span>· {tl(s.initialStage)}</span>
        </p>
        {w && <p className="mt-0.5 text-xs text-muted-foreground">{localizedName(w.name, locale)}, {localizedName(w.zoneName, locale)}</p>}
      </div>
      <dl className="grid grid-cols-2 gap-2 text-xs">
        <div><dt className="text-muted-foreground">{t('sum.budgetValue')}</dt><dd className="font-semibold tabular">{total ? money(total, locale) : '—'}</dd></div>
        <div><dt className="text-muted-foreground">{t('review.duration')}</dt><dd className="font-semibold tabular">{s.plannedStart && s.plannedEnd && s.plannedEnd > s.plannedStart ? t('review.months', { months: monthsBetween(s.plannedStart, s.plannedEnd) }) : '—'}</dd></div>
      </dl>
      {total > 0 && s.budgetLines.length > 0 && <Meter value={sum(s.budgetLines.map((l) => toNum(l.allocatedEtb)))} target={total} label={t('bl.allocated')} />}
      {total > 0 && s.tranches.length > 0 && <Meter value={sum(s.tranches.map((r) => toNum(r.amountEtb)))} target={total} label={t('tr.scheduled')} />}
      {s.milestones.length > 0 && <Meter value={sum(s.milestones.map((m) => toNum(m.weightPct)))} target={100} label={t('ms.weightTotal')} />}
      <div>
        <p className="mb-1.5 flex items-center justify-between text-xs font-medium"><span>{t('sum.completeness')}</span><span className="tabular text-muted-foreground">{done}/{items.length}</span></p>
        <ul className="space-y-1 text-xs">{items.map(([label, ok]) => <li key={label} className="flex items-center gap-2">{ok ? <CheckCircle2 className="h-3.5 w-3.5" style={{ color: toneVar.good }} /> : <span className="h-3.5 w-3.5 rounded-full border" />}<span className={ok ? '' : 'text-muted-foreground'}>{label}</span></li>)}</ul>
      </div>
    </div>
  );
}

function Success({ p, onAnother }: { p: ProjectSummary; onAnother: () => void }) {
  const t = useTranslations('register');
  const tl = useTranslations('projects.lifecycle.stages');
  const locale = useLocale();
  return (
    <div className="mx-auto max-w-2xl rounded-lg border bg-card p-8 text-center shadow-card" role="status" aria-live="polite">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full" style={{ background: `color-mix(in srgb, ${toneVar.warning} 15%, transparent)` }}><FileCheck2 className="h-6 w-6" style={{ color: toneVar.warning }} /></div>
      <h2 className="mt-4 text-lg font-semibold">{t('success.title')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('success.body', { code: p.code, name: p.name })}</p>
      <dl className="mx-auto mt-5 grid max-w-md grid-cols-3 gap-3 text-left text-xs">
        <div className="rounded-md border p-2"><dt className="text-muted-foreground">{t('success.stage')}</dt><dd className="mt-0.5 font-medium">{tl(p.lifecycleStage)}</dd></div>
        <div className="rounded-md border p-2"><dt className="text-muted-foreground">{t('success.health')}</dt><dd className="mt-0.5"><HealthBadge value={p.health} /></dd></div>
        <div className="rounded-md border p-2"><dt className="text-muted-foreground">{t('success.risk')}</dt><dd className="mt-0.5"><RiskChip score={p.riskScore} /></dd></div>
      </dl>
      <p className="mt-4 text-xs text-muted-foreground">{t('success.budget', { budget: money(p.totalBudgetEtb, locale) })}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button asChild><Link href={`/approvals/${p.id}`}>{t('success.queue')}<ArrowRight /></Link></Button>
        <Button asChild variant="outline"><Link href={`/projects/${p.id}`}>{t('success.open')}</Link></Button>
        <Button variant="outline" onClick={onAnother}><FolderPlus />{t('success.another')}</Button>
        <Button asChild variant="ghost"><Link href="/projects">{t('success.list')}</Link></Button>
      </div>
    </div>
  );
}
