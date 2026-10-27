'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { AlertTriangle, MapPin, Search, XCircle } from 'lucide-react';
import type { AssignmentPriority, AssignmentRequest, AssignmentRole, AssignmentCheck, Candidate, InspectionType, ProjectStatus } from '@/lib/api/types';
import { useCandidates, useCheckAssignment, useCreateAssignment, useProjects } from '@/lib/api/hooks';
import { ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, Label, Textarea } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { SectorDot } from '@/components/common/badges';
import { Callout } from '@/components/projects/registration/ui';
import { toneVar } from '@/lib/domain';
import { cn } from '@/lib/utils';

const ROLES: AssignmentRole[] = ['LEAD', 'DATA_COLLECTOR', 'FIELD_ANALYST', 'VERIFIER'];
const PRIORITIES: AssignmentPriority[] = ['NORMAL', 'HIGH', 'URGENT'];
const TYPES: InspectionType[] = ['SITE_VISIT', 'PROGRESS_VERIFICATION', 'QUALITY_INSPECTION', 'SAFETY_AUDIT', 'HANDOVER_INSPECTION', 'DAMAGE_VERIFICATION'];
const BAD_FLAGS = new Set(['OUT_OF_AREA', 'NO_SECTOR_MATCH', 'AT_CAPACITY', 'CONFLICT_OF_INTEREST', 'ALREADY_ASSIGNED', 'ROLE_MISMATCH', 'NO_ACCOUNT', 'CONTRACT_ENDING', 'HAS_OVERDUE']);
const today = () => new Date().toISOString().slice(0, 10);

export interface AssignTarget { id: number; code: string; name: string; status?: ProjectStatus }

/** Assign a member to a project. Opened from a project (member chosen from ranked candidates) or from a member (project chosen). */
export function AssignDialog({ open, onOpenChange, project, agentId, agentName }: {
  open: boolean; onOpenChange: (o: boolean) => void; project?: AssignTarget; agentId?: number; agentName?: string;
}) {
  const t = useTranslations('fieldTeam.assignDialog');
  const tr = useTranslations('enums.assignmentRole');
  const tpr = useTranslations('enums.priority');
  const ti = useTranslations('enums.inspectionType');
  const tc = useTranslations('common');
  const [target, setTarget] = React.useState<AssignTarget | null>(project ?? null);
  const [role, setRole] = React.useState<AssignmentRole>('LEAD');
  const [member, setMember] = React.useState<number | null>(agentId ?? null);
  const [startOn, setStartOn] = React.useState(today());
  const [endOn, setEndOn] = React.useState('');
  const [cadence, setCadence] = React.useState(project?.status && project.status !== 'ACTIVE' ? '30' : '14');
  const [priority, setPriority] = React.useState<AssignmentPriority>('NORMAL');
  const [types, setTypes] = React.useState<InspectionType[]>(['SITE_VISIT', 'PROGRESS_VERIFICATION']);
  const [instructions, setInstructions] = React.useState('');
  const [override, setOverride] = React.useState('');
  const [check, setCheck] = React.useState<AssignmentCheck | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);
  const checker = useCheckAssignment();
  const create = useCreateAssignment();
  const { data: candidates, isLoading: cl } = useCandidates(target?.id ?? null, role);

  React.useEffect(() => { if (open) { setTarget(project ?? null); setMember(agentId ?? null); setDone(null); setError(null); setCheck(null); setOverride(''); } }, [open, project, agentId]);

  const body = React.useMemo<AssignmentRequest | null>(() => target && member ? ({
    projectId: target.id, agentId: member, role, priority, startOn, endOn: endOn || null, visitFrequencyDays: Number(cadence) || 14,
    requiredInspectionTypes: types, instructions: instructions.trim() || null, overrideNote: override.trim() || null,
  }) : null, [target, member, role, priority, startOn, endOn, cadence, types, instructions, override]);

  // Re-check the rules whenever a field that affects them changes (not on every keystroke of the free text).
  const checkKey = body ? `${body.projectId}|${body.agentId}|${role}|${startOn}|${endOn}|${cadence}` : '';
  React.useEffect(() => {
    if (!body) { setCheck(null); return; }
    const h = setTimeout(() => { checker.mutateAsync(body).then(setCheck).catch(() => setCheck(null)); }, 250);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkKey]);

  const needsOverride = Boolean(check?.warnings.length);
  const canSubmit = Boolean(body && check?.valid && (!needsOverride || override.trim().length >= 10)) && !create.isPending;
  const chosen = candidates?.find((c) => c.agent.id === member);

  const submit = async () => {
    if (!body) return;
    setError(null);
    try { const r = await create.mutateAsync(body); setDone(t('done', { name: r.agent.fullName, role: tr(r.role) })); }
    catch (e) { setError(e instanceof ApiError ? (e.errors?.map((x) => x.message).join(' ') || e.detail || e.title) : tc('error')); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">{agentName ? t('titleFor', { name: agentName }) : t('title')}</DialogTitle>
          {target && <DialogDescription className="text-base">{target.code} · {target.name}</DialogDescription>}
        </DialogHeader>

        {done ? (
          <div className="space-y-4"><Callout>{done}</Callout><DialogFooter><Button onClick={() => onOpenChange(false)}>{tc('close')}</Button></DialogFooter></div>
        ) : (
          <div className="space-y-6">
            {!project && <ProjectPicker value={target} onChange={(p) => { setTarget(p); if (p.status && p.status !== 'ACTIVE') setCadence('30'); }} />}

            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold">{t('role')}</legend>
              <div className="grid gap-2 tablet:grid-cols-2">
                {ROLES.map((r) => (
                  <button key={r} type="button" onClick={() => setRole(r)} aria-pressed={role === r}
                    className={cn('rounded-md border-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/50', role === r ? 'border-primary bg-muted/40' : 'border-border')}>
                    <div className="font-medium">{tr(r)}</div><div className="text-xs text-muted-foreground">{t(`roleHint.${r}`)}</div>
                  </button>
                ))}
              </div>
            </fieldset>

            {target && (agentId ? (chosen && <CandidateCard c={chosen} selected onSelect={() => undefined} />) : (
              <CandidatePicker candidates={candidates} loading={cl} value={member} onChange={setMember} />
            ))}

            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold">{t('schedule')}</legend>
              <div className="grid gap-3 tablet:grid-cols-4">
                <div className="space-y-1.5"><Label htmlFor="as-start">{t('startOn')}</Label><Input id="as-start" type="date" value={startOn} onChange={(e) => setStartOn(e.target.value)} /></div>
                <div className="space-y-1.5"><Label htmlFor="as-end">{t('endOn')}</Label><Input id="as-end" type="date" value={endOn} min={startOn} onChange={(e) => setEndOn(e.target.value)} /></div>
                <div className="space-y-1.5"><Label htmlFor="as-cad">{t('cadence')}</Label><div className="flex items-center gap-2"><Input id="as-cad" inputMode="numeric" value={cadence} onChange={(e) => setCadence(e.target.value.replace(/\D/g, '').slice(0, 2))} className="w-20 text-right tabular" /><span className="text-sm text-muted-foreground">{t('cadenceUnit')}</span></div></div>
                <div className="space-y-1.5"><Label>{t('priority')}</Label><Select value={priority} onValueChange={(v) => setPriority(v as AssignmentPriority)}><SelectTrigger aria-label={t('priority')}><SelectValue /></SelectTrigger><SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{tpr(p)}</SelectItem>)}</SelectContent></Select></div>
              </div>
              <div className="space-y-1.5">
                <div className="text-sm font-medium">{t('inspectionTypes')}</div>
                <div className="flex flex-wrap gap-2">{TYPES.map((x) => {
                  const on = types.includes(x);
                  return <button key={x} type="button" aria-pressed={on} onClick={() => setTypes((s) => on ? s.filter((y) => y !== x) : [...s, x])}
                    className={cn('rounded-full border px-3 py-1 text-sm transition-colors', on ? 'border-primary bg-primary/10 font-medium' : 'text-muted-foreground hover:bg-muted/50')}>{ti(x)}</button>;
                })}</div>
              </div>
              <div className="space-y-1.5"><Label htmlFor="as-ins">{t('instructions')}</Label><Textarea id="as-ins" value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder={t('instructionsPlaceholder')} className="min-h-[80px]" maxLength={4000} /></div>
            </fieldset>

            {check && (check.errors.length > 0 || check.warnings.length > 0) && (
              <div className="space-y-3 rounded-md border p-4">
                {check.errors.map((e, i) => <p key={`e${i}`} className="flex items-start gap-2 text-sm text-destructive"><XCircle className="mt-0.5 h-4 w-4 shrink-0" />{e.message}</p>)}
                {check.warnings.length > 0 && <>
                  <div className="text-sm font-semibold">{t('warnings')}</div>
                  {check.warnings.map((w, i) => <p key={`w${i}`} className="flex items-start gap-2 text-sm"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: toneVar.warning }} />{w.message}</p>)}
                  {check.valid && <div className="space-y-1.5 pt-1"><Label htmlFor="as-ovr">{t('override')}<span className="ml-0.5 text-destructive" aria-hidden>*</span></Label><Textarea id="as-ovr" value={override} onChange={(e) => setOverride(e.target.value)} className="min-h-[70px]" maxLength={2000} /><p className="text-xs text-muted-foreground">{t('overrideHint')}</p></div>}
                </>}
              </div>
            )}
            {error && <Callout tone="error">{error}</Callout>}
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>{tc('cancel')}</Button>
              <Button onClick={submit} disabled={!canSubmit}>{t('submit')}</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ProjectPicker({ value, onChange }: { value: AssignTarget | null; onChange: (p: AssignTarget) => void }) {
  const t = useTranslations('fieldTeam.assignDialog');
  const [q, setQ] = React.useState('');
  const { data, isLoading } = useProjects({ approval: 'APPROVED', status: ['ACTIVE', 'SUSPENDED', 'PROCUREMENT', 'PLANNED'], q: q.trim() || undefined, size: 8, sort: 'riskScore,desc' });
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold">{t('project')}</legend>
      <p className="text-xs text-muted-foreground">{t('projectHint')}</p>
      <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('projectSearch')} className="pl-9" aria-label={t('projectSearch')} /></div>
      <ul className="max-h-56 divide-y overflow-y-auto rounded-md border">
        {isLoading ? <li className="p-3"><Skeleton className="h-10" /></li> : data?.content.map((p) => (
          <li key={p.id}><button type="button" onClick={() => onChange({ id: p.id, code: p.code, name: p.name, status: p.status })}
            className={cn('flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/50', value?.id === p.id && 'bg-primary/10')}>
            <SectorDot sector={p.sector} /><span className="min-w-0 flex-1"><span className="block truncate font-medium">{p.name}</span><span className="block truncate text-xs text-muted-foreground">{p.code} · {p.wereda.name.en}</span></span>
          </button></li>
        ))}
      </ul>
    </fieldset>
  );
}

function CandidatePicker({ candidates, loading, value, onChange }: { candidates?: Candidate[]; loading: boolean; value: number | null; onChange: (id: number) => void }) {
  const t = useTranslations('fieldTeam.assignDialog');
  const [all, setAll] = React.useState(false);
  if (loading) return <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>;
  if (!candidates?.length) return <Callout tone="warning">{t('noCandidates')}</Callout>;
  const shown = all ? candidates : candidates.slice(0, 5);
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold">{t('candidates')}</legend>
      <p className="text-xs text-muted-foreground">{t('candidatesHint')}</p>
      <div role="radiogroup" aria-label={t('member')} className="space-y-2">
        {shown.map((c) => <CandidateCard key={c.agent.id} c={c} selected={value === c.agent.id} onSelect={() => c.eligible && onChange(c.agent.id)} />)}
      </div>
      {candidates.length > 5 && <Button type="button" variant="ghost" size="sm" onClick={() => setAll((v) => !v)}>{all ? t('showFewer') : t('showAll', { count: candidates.length })}</Button>}
    </fieldset>
  );
}

function CandidateCard({ c, selected, onSelect }: { c: Candidate; selected: boolean; onSelect: () => void }) {
  const t = useTranslations('fieldTeam.assignDialog');
  const ta = useTranslations('enums.agentType');
  const tf = useTranslations('fieldTeam');
  const color = c.score >= 75 ? toneVar.good : c.score >= 50 ? toneVar.warning : toneVar.serious;
  return (
    <button type="button" role="radio" aria-checked={selected} aria-disabled={!c.eligible} onClick={onSelect}
      className={cn('w-full rounded-md border-2 p-3 text-left transition-colors', selected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40', !c.eligible && 'cursor-not-allowed opacity-60')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold">{c.agent.fullName} <span className="font-normal text-muted-foreground">· {ta(c.agent.agentType)}</span></div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
            <span>{tf('workload', { active: c.agent.activeAssignments, max: c.agent.maxActiveAssignments })}</span>
            {c.distanceKm !== null && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{t('km', { km: Math.round(c.distanceKm) })}</span>}
            {c.agent.acceptanceRate90d !== null && <span>{Math.round(c.agent.acceptanceRate90d)}% ✓</span>}
          </div>
        </div>
        <div className="w-36 shrink-0 text-right">
          <div className="text-sm font-semibold tabular" style={{ color }}>{t('score', { score: c.score })}</div>
          <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-muted">{c.parts.map((p) => <div key={p.code} title={`${t(`part.${p.code}`)} ${p.points}/${p.max}`} style={{ width: `${p.points}%`, background: color, opacity: 0.55 + p.points / p.max * 0.45 }} />)}</div>
        </div>
      </div>
      {c.flags.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{c.flags.map((f) => <span key={f} className="rounded-md border px-1.5 py-0.5 text-xs" style={BAD_FLAGS.has(f) ? { borderColor: f === 'CONFLICT_OF_INTEREST' || f === 'ALREADY_ASSIGNED' ? toneVar.critical : toneVar.warning } : undefined}>{t(`flag.${f}`)}</span>)}</div>}
    </button>
  );
}
