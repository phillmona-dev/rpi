'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { AgentDetail, AgentRequest, AgentType, EmploymentType, Sector, WeredaRef } from '@/lib/api/types';
import { SECTORS } from '@/lib/api/types';
import { useFieldAgents, useOrganizations, useRegisterAgent, useUpdateAgent, useWeredas } from '@/lib/api/hooks';
import { ApiError } from '@/lib/api/client';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Callout, Field, GroupError, StepCard, SubHeading, errClass } from '@/components/projects/registration/ui';
import { AccessCard } from './access-card';
import { localizedName } from '@/lib/format';
import { cn } from '@/lib/utils';

const TYPES: AgentType[] = ['DATA_COLLECTOR', 'FIELD_ANALYST', 'FIELD_SUPERVISOR'];
const EMPLOYMENT: EmploymentType[] = ['STAFF', 'CONTRACT', 'SECONDED', 'VOLUNTEER'];
const EDUCATION = ['CERTIFICATE', 'DIPLOMA', 'BACHELOR', 'MASTER', 'DOCTORATE'];
const LANGUAGES = ['ti', 'am', 'en', 'om', 'ar'];
const STEPS = ['identity', 'deployment', 'onboarding'] as const;
const STEP_FIELDS: Record<(typeof STEPS)[number], string[]> = {
  identity: ['fullName', 'gender', 'nationalId', 'employeeNumber', 'phone', 'altPhone', 'email', 'emergencyContactName', 'emergencyContactPhone'],
  deployment: ['agentType', 'organizationId', 'employmentType', 'supervisorId', 'educationLevel', 'yearsExperience', 'sectors', 'skills', 'languages', 'homeWeredaId', 'coverageWeredaIds', 'maxActiveAssignments'],
  onboarding: ['contractStart', 'contractEnd', 'trainingCompletedOn', 'codeOfConductSignedOn', 'backgroundCheckOn', 'createAccount', 'username', 'notes'],
};

type Form = {
  fullName: string; gender: '' | 'FEMALE' | 'MALE'; phone: string; altPhone: string; email: string; nationalId: string; employeeNumber: string;
  agentType: AgentType; organizationId: string; employmentType: '' | EmploymentType; homeWeredaId: string; supervisorId: string; educationLevel: string; yearsExperience: string;
  sectors: Sector[]; skills: string[]; languages: string[]; maxActiveAssignments: string; contractStart: string; contractEnd: string; trainingCompletedOn: string;
  codeOfConductSignedOn: string; backgroundCheckOn: string; emergencyContactName: string; emergencyContactPhone: string; coverageWeredaIds: number[]; notes: string;
  createAccount: boolean; username: string;
};

const fromDetail = (d?: AgentDetail): Form => ({
  fullName: d?.summary.fullName ?? '', gender: d?.gender ?? '', phone: d?.summary.phone ?? '', altPhone: d?.altPhone ?? '', email: d?.summary.email ?? '',
  nationalId: d?.nationalId ?? '', employeeNumber: d?.employeeNumber ?? '', agentType: d?.summary.agentType ?? 'DATA_COLLECTOR', organizationId: d?.organization ? String(d.organization.id) : '',
  employmentType: d?.employmentType ?? '', homeWeredaId: d?.summary.homeWereda ? String(d.summary.homeWereda.id) : '', supervisorId: d?.supervisor ? String(d.supervisor.id) : '',
  educationLevel: d?.educationLevel ?? '', yearsExperience: d?.yearsExperience?.toString() ?? '', sectors: d?.summary.sectors ?? [], skills: d?.skills ?? [], languages: d?.languages ?? ['ti'],
  maxActiveAssignments: String(d?.summary.maxActiveAssignments ?? 4), contractStart: d?.contractStart ?? '', contractEnd: d?.summary.contractEnd ?? '',
  trainingCompletedOn: d?.trainingCompletedOn ?? '', codeOfConductSignedOn: d?.codeOfConductSignedOn ?? '', backgroundCheckOn: d?.backgroundCheckOn ?? '',
  emergencyContactName: d?.emergencyContactName ?? '', emergencyContactPhone: d?.emergencyContactPhone ?? '', coverageWeredaIds: d?.coverage.map((w) => w.id) ?? [], notes: d?.notes ?? '',
  createAccount: true, username: '',
});

const nn = (s: string) => (s.trim() ? s.trim() : null);

export function AgentForm({ existing }: { existing?: AgentDetail }) {
  const t = useTranslations('fieldTeam.form');
  const te = useTranslations('enums');
  const tc = useTranslations('common');
  const router = useRouter();
  const [f, setF] = React.useState<Form>(() => fromDetail(existing));
  const [step, setStep] = React.useState(0);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [created, setCreated] = React.useState<{ id: number; name: string; access: { username: string; temporaryPassword: string; created: boolean } | null } | null>(null);
  const register = useRegisterAgent();
  const update = useUpdateAgent(existing?.summary.id ?? 0);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setF((s) => ({ ...s, [k]: v })); setErrors((e) => { const { [k as string]: _, ...rest } = e; return rest; }); };

  const local = (s: number): Record<string, string> => {
    const e: Record<string, string> = {};
    if (s === 0) { if (f.fullName.trim().length < 3) e.fullName = t('required'); if (!f.phone.trim()) e.phone = t('required'); }
    if (s === 1) { if (!f.sectors.length) e.sectors = t('required'); if (!f.coverageWeredaIds.length) e.coverageWeredaIds = t('required'); }
    return e;
  };
  const next = () => { const e = local(step); setErrors(e); if (!Object.keys(e).length) setStep((s) => s + 1); };

  const payload = (): AgentRequest => ({
    fullName: f.fullName.trim(), gender: f.gender || null, phone: f.phone.trim(), altPhone: nn(f.altPhone), email: nn(f.email), nationalId: nn(f.nationalId), employeeNumber: nn(f.employeeNumber),
    agentType: f.agentType, organizationId: f.organizationId ? Number(f.organizationId) : null, employmentType: f.employmentType || null, homeWeredaId: f.homeWeredaId ? Number(f.homeWeredaId) : null,
    supervisorId: f.supervisorId ? Number(f.supervisorId) : null, educationLevel: f.educationLevel || null, yearsExperience: f.yearsExperience ? Number(f.yearsExperience) : null,
    sectors: f.sectors, skills: f.skills, languages: f.languages, maxActiveAssignments: Number(f.maxActiveAssignments) || 4, contractStart: f.contractStart || null, contractEnd: f.contractEnd || null,
    trainingCompletedOn: f.trainingCompletedOn || null, codeOfConductSignedOn: f.codeOfConductSignedOn || null, backgroundCheckOn: f.backgroundCheckOn || null,
    emergencyContactName: nn(f.emergencyContactName), emergencyContactPhone: nn(f.emergencyContactPhone), coverageWeredaIds: f.coverageWeredaIds, notes: nn(f.notes),
    createAccount: existing ? false : f.createAccount, username: existing ? null : nn(f.username),
  });

  const submit = async () => {
    const all = { ...local(0), ...local(1) };
    if (Object.keys(all).length) { setErrors(all); setStep(all.fullName || all.phone ? 0 : 1); return; }
    setFormError(null);
    try {
      if (existing) { await update.mutateAsync(payload()); router.push(`/field-team/${existing.summary.id}`); }
      else { const r = await register.mutateAsync(payload()); setCreated({ id: r.agent.summary.id, name: r.agent.summary.fullName, access: r.access }); }
    } catch (e) {
      if (e instanceof ApiError && e.errors?.length) {
        const map: Record<string, string> = {};
        e.errors.forEach((x) => { map[x.field] = x.message; });
        setErrors(map);
        const first = STEPS.findIndex((s) => STEP_FIELDS[s].some((k) => map[k]));
        if (first >= 0) setStep(first);
        setFormError(t('fixErrors', { count: e.errors.length }));
      } else setFormError(e instanceof ApiError ? e.detail || e.title : tc('error'));
    }
  };

  if (created) return <AccessCard agentId={created.id} name={created.name} access={created.access} />;

  const saving = register.isPending || update.isPending;
  return (
    <div className="space-y-6">
      <ol className="grid grid-cols-3 gap-2" aria-label={t('steps.identity')}>
        {STEPS.map((s, i) => (
          <li key={s}><button type="button" onClick={() => i <= step || !Object.keys(local(step)).length ? setStep(i) : undefined}
            className={cn('flex w-full items-center gap-3 rounded-lg border-2 px-4 py-3 text-left transition-colors', i === step ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40')} aria-current={i === step ? 'step' : undefined}>
            <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold', i < step ? 'bg-primary text-primary-foreground' : i === step ? 'border-2 border-primary' : 'border')}>{i < step ? <Check className="h-4 w-4" /> : i + 1}</span>
            <span className="hidden text-base font-medium tablet:block">{t(`steps.${s}`)}</span>
          </button></li>
        ))}
      </ol>
      {formError && <Callout tone="error">{formError}</Callout>}

      {step === 0 && (
        <StepCard title={t('steps.identity')}>
          <SubHeading>{t('identity')}</SubHeading>
          <div className="grid gap-4 tablet:grid-cols-2">
            <Field id="fullName" label={t('fullName')} hint={t('fullNameHint')} error={errors.fullName} required>{(a) => <Input {...a} value={f.fullName} onChange={(e) => set('fullName', e.target.value)} className={errClass(errors.fullName)} maxLength={160} />}</Field>
            <Field id="gender" label={t('gender')} error={errors.gender}>{(a) => (
              <Select value={f.gender || 'NONE'} onValueChange={(v) => set('gender', v === 'NONE' ? '' : v as 'FEMALE')}><SelectTrigger id={a.id} aria-describedby={a['aria-describedby']}><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="NONE">—</SelectItem><SelectItem value="FEMALE">{te('gender.FEMALE')}</SelectItem><SelectItem value="MALE">{te('gender.MALE')}</SelectItem></SelectContent></Select>)}</Field>
            <Field id="nationalId" label={t('nationalId')} hint={t('nationalIdHint')} error={errors.nationalId}>{(a) => <Input {...a} value={f.nationalId} onChange={(e) => set('nationalId', e.target.value)} className={errClass(errors.nationalId)} maxLength={40} />}</Field>
            <Field id="employeeNumber" label={t('employeeNumber')} error={errors.employeeNumber}>{(a) => <Input {...a} value={f.employeeNumber} onChange={(e) => set('employeeNumber', e.target.value)} maxLength={40} />}</Field>
          </div>
          <SubHeading>{t('contact')}</SubHeading>
          <div className="grid gap-4 tablet:grid-cols-3">
            <Field id="phone" label={t('phone')} hint={t('phoneHint')} error={errors.phone} required>{(a) => <Input {...a} type="tel" inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} className={errClass(errors.phone)} maxLength={20} />}</Field>
            <Field id="altPhone" label={t('altPhone')} error={errors.altPhone}>{(a) => <Input {...a} type="tel" inputMode="tel" value={f.altPhone} onChange={(e) => set('altPhone', e.target.value)} className={errClass(errors.altPhone)} maxLength={20} />}</Field>
            <Field id="email" label={t('email')} error={errors.email}>{(a) => <Input {...a} type="email" value={f.email} onChange={(e) => set('email', e.target.value)} className={errClass(errors.email)} maxLength={160} />}</Field>
          </div>
          <SubHeading>{t('emergency')}</SubHeading>
          <div className="grid gap-4 tablet:grid-cols-2">
            <Field id="emergencyContactName" label={t('emergencyName')} error={errors.emergencyContactName}>{(a) => <Input {...a} value={f.emergencyContactName} onChange={(e) => set('emergencyContactName', e.target.value)} maxLength={160} />}</Field>
            <Field id="emergencyContactPhone" label={t('emergencyPhone')} error={errors.emergencyContactPhone}>{(a) => <Input {...a} type="tel" value={f.emergencyContactPhone} onChange={(e) => set('emergencyContactPhone', e.target.value)} className={errClass(errors.emergencyContactPhone)} maxLength={20} />}</Field>
          </div>
        </StepCard>
      )}

      {step === 1 && <DeploymentStep f={f} set={set} errors={errors} selfId={existing?.summary.id} />}

      {step === 2 && (
        <StepCard title={t('steps.onboarding')}>
          <SubHeading>{t('contract')}</SubHeading>
          <div className="grid gap-4 tablet:grid-cols-2">
            <Field id="contractStart" label={t('contractStart')} error={errors.contractStart}>{(a) => <Input {...a} type="date" value={f.contractStart} onChange={(e) => set('contractStart', e.target.value)} />}</Field>
            <Field id="contractEnd" label={t('contractEnd')} error={errors.contractEnd}>{(a) => <Input {...a} type="date" value={f.contractEnd} min={f.contractStart || undefined} onChange={(e) => set('contractEnd', e.target.value)} className={errClass(errors.contractEnd)} />}</Field>
          </div>
          <SubHeading hint={t('onboardingHint')}>{t('onboarding')}</SubHeading>
          <div className="grid gap-4 tablet:grid-cols-3">
            <Field id="trainingCompletedOn" label={t('training')} error={errors.trainingCompletedOn}>{(a) => <Input {...a} type="date" max={new Date().toISOString().slice(0, 10)} value={f.trainingCompletedOn} onChange={(e) => set('trainingCompletedOn', e.target.value)} className={errClass(errors.trainingCompletedOn)} />}</Field>
            <Field id="codeOfConductSignedOn" label={t('conduct')} error={errors.codeOfConductSignedOn}>{(a) => <Input {...a} type="date" max={new Date().toISOString().slice(0, 10)} value={f.codeOfConductSignedOn} onChange={(e) => set('codeOfConductSignedOn', e.target.value)} className={errClass(errors.codeOfConductSignedOn)} />}</Field>
            <Field id="backgroundCheckOn" label={t('background')} error={errors.backgroundCheckOn}>{(a) => <Input {...a} type="date" max={new Date().toISOString().slice(0, 10)} value={f.backgroundCheckOn} onChange={(e) => set('backgroundCheckOn', e.target.value)} />}</Field>
          </div>
          {!existing && (<>
            <SubHeading>{t('access')}</SubHeading>
            <label className="flex items-start gap-3 rounded-md border p-4">
              <Switch checked={f.createAccount} onCheckedChange={(v) => set('createAccount', v)} aria-describedby="ca-hint" />
              <span><span className="block font-medium">{t('createAccount')}</span><span id="ca-hint" className="block text-sm text-muted-foreground">{t('createAccountHint')}</span></span>
            </label>
            {f.createAccount && <Field id="username" label={t('username')} hint={t('usernameHint')} error={errors.username} className="max-w-sm">{(a) => <Input {...a} value={f.username} onChange={(e) => set('username', e.target.value.toLowerCase())} className={errClass(errors.username)} maxLength={64} autoComplete="off" />}</Field>}
          </>)}
          <Field id="notes" label={t('notes')} error={errors.notes}>{(a) => <Textarea {...a} value={f.notes} onChange={(e) => set('notes', e.target.value)} className="min-h-[90px]" maxLength={4000} />}</Field>
        </StepCard>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" onClick={() => step === 0 ? router.push(existing ? `/field-team/${existing.summary.id}` : '/field-team') : setStep((s) => s - 1)}>
          {step === 0 ? t('cancel') : <><ChevronLeft />{t('back')}</>}
        </Button>
        {step < STEPS.length - 1
          ? <Button size="lg" onClick={next}>{t('next')}<ChevronRight /></Button>
          : <Button size="lg" onClick={submit} disabled={saving}>{saving ? t('saving') : existing ? t('saveEdit') : t('save')}</Button>}
      </div>
    </div>
  );
}

function DeploymentStep({ f, set, errors, selfId }: { f: Form; set: <K extends keyof Form>(k: K, v: Form[K]) => void; errors: Record<string, string>; selfId?: number }) {
  const t = useTranslations('fieldTeam.form');
  const te = useTranslations('enums');
  const { data: orgs } = useOrganizations();
  const { data: supervisors } = useFieldAgents({ type: 'FIELD_SUPERVISOR' });
  const [skill, setSkill] = React.useState('');
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const addSkill = () => { const s = skill.trim(); if (s && !f.skills.includes(s)) set('skills', [...f.skills, s]); setSkill(''); };
  const employers = orgs?.filter((o) => ['GOVERNMENT_BUREAU', 'CONSULTANT', 'NGO', 'FEDERAL_AGENCY', 'COMMUNITY'].includes(o.orgType)) ?? [];
  return (
    <StepCard title={t('steps.deployment')}>
      <SubHeading>{t('role')}</SubHeading>
      <div className="grid gap-3 tablet:grid-cols-3" role="radiogroup" aria-label={t('role')}>
        {TYPES.map((x) => (
          <button key={x} type="button" role="radio" aria-checked={f.agentType === x} onClick={() => set('agentType', x)}
            className={cn('rounded-lg border-2 p-4 text-left transition-colors hover:bg-muted/40', f.agentType === x ? 'border-primary bg-primary/5' : 'border-border')}>
            <div className="text-base font-semibold">{te(`agentType.${x}`)}</div><div className="mt-1 text-sm text-muted-foreground">{t(`roleHint.${x}`)}</div>
          </button>
        ))}
      </div>
      <GroupError id="agentType" error={errors.agentType} />
      <div className="grid gap-4 tablet:grid-cols-3">
        <Field id="organizationId" label={t('organization')} error={errors.organizationId}>{(a) => (
          <Select value={f.organizationId || 'NONE'} onValueChange={(v) => set('organizationId', v === 'NONE' ? '' : v)}><SelectTrigger id={a.id}><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="NONE">{t('organizationNone')}</SelectItem>{employers.map((o) => <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>)}</SelectContent></Select>)}</Field>
        <Field id="employmentType" label={t('employmentType')} error={errors.employmentType}>{(a) => (
          <Select value={f.employmentType || 'NONE'} onValueChange={(v) => set('employmentType', v === 'NONE' ? '' : v as EmploymentType)}><SelectTrigger id={a.id}><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="NONE">—</SelectItem>{EMPLOYMENT.map((x) => <SelectItem key={x} value={x}>{te(`employmentType.${x}`)}</SelectItem>)}</SelectContent></Select>)}</Field>
        <Field id="supervisorId" label={t('supervisor')} hint={t('supervisorHint')} error={errors.supervisorId}>{(a) => (
          <Select value={f.supervisorId || 'NONE'} onValueChange={(v) => set('supervisorId', v === 'NONE' ? '' : v)}><SelectTrigger id={a.id} className={errClass(errors.supervisorId)}><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="NONE">{t('supervisorNone')}</SelectItem>{supervisors?.filter((s) => s.id !== selfId && s.status !== 'DEACTIVATED').map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.fullName}</SelectItem>)}</SelectContent></Select>)}</Field>
        <Field id="educationLevel" label={t('education')} error={errors.educationLevel}>{(a) => (
          <Select value={f.educationLevel || 'NONE'} onValueChange={(v) => set('educationLevel', v === 'NONE' ? '' : v)}><SelectTrigger id={a.id}><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="NONE">—</SelectItem>{EDUCATION.map((x) => <SelectItem key={x} value={x}>{te(`education.${x}`)}</SelectItem>)}</SelectContent></Select>)}</Field>
        <Field id="yearsExperience" label={t('experience')} error={errors.yearsExperience}>{(a) => <Input {...a} inputMode="numeric" value={f.yearsExperience} onChange={(e) => set('yearsExperience', e.target.value.replace(/\D/g, '').slice(0, 2))} />}</Field>
        <Field id="maxActiveAssignments" label={t('capacity')} hint={t('capacityHint')} error={errors.maxActiveAssignments}>{(a) => <Input {...a} inputMode="numeric" value={f.maxActiveAssignments} onChange={(e) => set('maxActiveAssignments', e.target.value.replace(/\D/g, '').slice(0, 2))} />}</Field>
      </div>

      <div className="space-y-2" data-field="sectors">
        <SubHeading hint={t('sectorsHint')}>{t('sectors')}<span className="ml-0.5 text-destructive" aria-hidden>*</span></SubHeading>
        <div className="flex flex-wrap gap-2">{SECTORS.map((s) => <Chip key={s} on={f.sectors.includes(s)} onClick={() => set('sectors', toggle(f.sectors, s))}>{te(`sector.${s}`)}</Chip>)}</div>
        <GroupError id="sectors-error" error={errors.sectors} />
      </div>
      <div className="grid gap-6 laptop:grid-cols-2">
        <div className="space-y-2">
          <SubHeading hint={t('skillsHint')}>{t('skills')}</SubHeading>
          <Input value={skill} onChange={(e) => setSkill(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkill(); } }} onBlur={addSkill} placeholder={t('skillsPlaceholder')} maxLength={40} aria-label={t('skills')} />
          {f.skills.length > 0 && <div className="flex flex-wrap gap-2">{f.skills.map((s) => <span key={s} className="inline-flex items-center gap-1 rounded-full border bg-muted/40 py-1 pl-3 pr-1.5 text-sm">{s}<button type="button" onClick={() => set('skills', f.skills.filter((x) => x !== s))} aria-label={`${s} ×`} className="rounded-full p-0.5 hover:bg-muted"><X className="h-3.5 w-3.5" /></button></span>)}</div>}
        </div>
        <div className="space-y-2">
          <SubHeading>{t('languages')}</SubHeading>
          <div className="flex flex-wrap gap-2">{LANGUAGES.map((l) => <Chip key={l} on={f.languages.includes(l)} onClick={() => set('languages', toggle(f.languages, l))}>{te(`language.${l}`)}</Chip>)}</div>
        </div>
      </div>
      <CoveragePicker f={f} set={set} errors={errors} />
    </StepCard>
  );
}

function CoveragePicker({ f, set, errors }: { f: Form; set: <K extends keyof Form>(k: K, v: Form[K]) => void; errors: Record<string, string> }) {
  const t = useTranslations('fieldTeam.form');
  const locale = useLocale();
  const { data: weredas } = useWeredas();
  const [q, setQ] = React.useState('');
  const byZone = React.useMemo(() => {
    const m = new Map<number, { name: string; items: WeredaRef[] }>();
    for (const w of [...(weredas ?? [])].sort((a, b) => localizedName(a.name, locale).localeCompare(localizedName(b.name, locale)))) {
      if (!m.has(w.zoneId)) m.set(w.zoneId, { name: localizedName(w.zoneName, locale), items: [] });
      m.get(w.zoneId)!.items.push(w);
    }
    return [...m.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [weredas, locale]);
  const sel = new Set(f.coverageWeredaIds);
  const toggle = (id: number) => set('coverageWeredaIds', sel.has(id) ? f.coverageWeredaIds.filter((x) => x !== id) : [...f.coverageWeredaIds, id]);
  const needle = q.trim().toLowerCase();
  return (
    <div className="space-y-3" data-field="coverageWeredaIds">
      <SubHeading hint={t('coverageHint', { count: f.coverageWeredaIds.length })}>{t('area')}</SubHeading>
      <div className="grid gap-4 tablet:grid-cols-2">
        <Field id="homeWeredaId" label={t('homeWereda')} hint={t('homeWeredaHint')} error={errors.homeWeredaId}>{(a) => (
          <Select value={f.homeWeredaId || 'NONE'} onValueChange={(v) => { set('homeWeredaId', v === 'NONE' ? '' : v); if (v !== 'NONE' && !sel.has(Number(v))) set('coverageWeredaIds', [...f.coverageWeredaIds, Number(v)]); }}>
            <SelectTrigger id={a.id}><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72"><SelectItem value="NONE">—</SelectItem>{byZone.flatMap(([, z]) => z.items).map((w) => <SelectItem key={w.id} value={String(w.id)}>{localizedName(w.name, locale)} · {localizedName(w.zoneName, locale)}</SelectItem>)}</SelectContent>
          </Select>)}</Field>
        <Field id="coverageSearch" label={t('coverageSearch')}>{(a) => <Input {...a} value={q} onChange={(e) => setQ(e.target.value)} />}</Field>
      </div>
      <GroupError id="coverage-error" error={errors.coverageWeredaIds} />
      <div className="grid max-h-[420px] gap-4 overflow-y-auto rounded-md border p-4 tablet:grid-cols-2 desktop:grid-cols-3">
        {byZone.map(([zid, z]) => {
          const items = z.items.filter((w) => !needle || localizedName(w.name, locale).toLowerCase().includes(needle) || z.name.toLowerCase().includes(needle));
          if (!items.length) return null;
          const allOn = z.items.every((w) => sel.has(w.id));
          return (
            <div key={zid} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">{z.name}</span>
                <button type="button" className="text-xs text-primary hover:underline" onClick={() => set('coverageWeredaIds', allOn ? f.coverageWeredaIds.filter((id) => !z.items.some((w) => w.id === id)) : [...new Set([...f.coverageWeredaIds, ...z.items.map((w) => w.id)])])}>{allOn ? t('clearZone') : t('selectZone')}</button></div>
              <ul className="space-y-0.5">{items.map((w) => (
                <li key={w.id}><label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted/50"><input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={sel.has(w.id)} onChange={() => toggle(w.id)} />{localizedName(w.name, locale)}</label></li>
              ))}</ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-pressed={on} onClick={onClick} className={cn('inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors', on ? 'border-primary bg-primary/10 font-medium' : 'text-muted-foreground hover:bg-muted/50')}>{on && <Check className="h-3.5 w-3.5" />}{children}</button>;
}
