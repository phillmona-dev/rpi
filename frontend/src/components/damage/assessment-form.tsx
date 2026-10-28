'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { AlertTriangle, Camera, Crosshair, Loader2, Save, Trash2 } from 'lucide-react';
import type { AccessStatus, AssessmentDetail, CreateAssessmentRequest, CurrentUse, DamageCause, DamageSeverity, FacilityRef, Intervention, NeedPriority } from '@/lib/api/types';
import { api } from '@/lib/api/client';
import { useCreateAssessment, useReviseAssessment } from '@/lib/api/damage';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Callout, Field, MoneyInput, StepCard, errClass } from '@/components/projects/registration/ui';
import { SectorDot } from '@/components/common/badges';
import { ACCESS, COMPONENTS, CURRENT_USES, DAMAGE_CAUSES, INTERVENTIONS, NEED_PRIORITIES, apiMessage, severityForScore } from './shared';
import { mediaSrc, needPriorityTone, severityTone, toneVar } from '@/lib/domain';
import { localizedName, money } from '@/lib/format';
import { cn } from '@/lib/utils';

const SEVERITIES: DamageSeverity[] = ['NONE', 'MINOR', 'MODERATE', 'SEVERE', 'DESTROYED'];

interface Row { condition: DamageSeverity | ''; cost: string; note: string }
interface Photo { url: string; caption: string }
interface State {
  assessedOn: string; assessorName: string; accessStatus: AccessStatus; currentUse: CurrentUse | ''; uxo: boolean;
  score: string; severity: DamageSeverity | ''; capacity: string; inventory: string; causes: DamageCause[];
  rows: Record<string, Row>; repair: string; replacement: string; equipment: string;
  intervention: Intervention | ''; priority: NeedPriority | ''; beneficiaries: string; notes: string; lat: string; lng: string; photos: Photo[];
}
type Errors = Partial<Record<string, string>>;

const today = () => new Date().toISOString().slice(0, 10);
const str = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n));
const toNum = (s: string) => { const t = s.replace(/[, ]/g, ''); if (!t) return null; const n = Number(t); return Number.isFinite(n) ? n : null; };

function initial(defaults: { assessorName: string; beneficiaries: number | null; lat: number | null; lng: number | null }, d?: AssessmentDetail): State {
  if (!d) return {
    assessedOn: today(), assessorName: defaults.assessorName, accessStatus: 'ACCESSIBLE', currentUse: '', uxo: false, score: '', severity: '', capacity: '', inventory: '', causes: [],
    rows: {}, repair: '', replacement: '', equipment: '', intervention: '', priority: '', beneficiaries: str(defaults.beneficiaries), notes: '',
    lat: str(defaults.lat), lng: str(defaults.lng), photos: [],
  };
  const s = d.summary;
  return {
    assessedOn: s.assessedOn, assessorName: s.assessorName, accessStatus: d.accessStatus ?? 'ACCESSIBLE', currentUse: d.currentUse ?? '', uxo: d.uxoSuspected,
    score: String(s.structuralImpactScore), severity: s.severity, capacity: str(s.functionalCapacityPct), inventory: str(s.inventoryLossPct), causes: d.damageCauses,
    rows: Object.fromEntries(d.components.map((c) => [c.component, { condition: c.condition, cost: str(c.repairCostEtb), note: c.note ?? '' }])),
    repair: str(s.estimatedRepairCostEtb), replacement: str(s.estimatedReplacementCostEtb), equipment: str(d.equipmentLossEtb),
    intervention: s.recommendedIntervention ?? '', priority: s.interventionPriority ?? '', beneficiaries: str(s.beneficiariesAffected), notes: d.notes ?? '',
    lat: str(d.location?.lat ?? defaults.lat), lng: str(d.location?.lng ?? defaults.lng), photos: d.photos.map((p) => ({ url: p.url, caption: p.caption ?? '' })),
  };
}

/**
 * Records (or revises) a damage assessment for one facility. Mirrors the field checklist: visit and safety, overall damage,
 * each building element, costs and the recommended response. The server stays the authority on validation.
 */
export function AssessmentForm({ facility, taskId, beneficiaries, location, existing, defaultAssessor, onDone }: {
  facility: FacilityRef; taskId: number | null; beneficiaries: number | null; location: { lat: number; lng: number } | null;
  existing?: AssessmentDetail; defaultAssessor: string; onDone: (assessmentId: number) => void;
}) {
  const t = useTranslations('damage.form');
  const te = useTranslations('enums');
  const tc = useTranslations('common');
  const locale = useLocale();
  const [s, setS] = React.useState<State>(() => initial({ assessorName: defaultAssessor, beneficiaries, lat: location?.lat ?? null, lng: location?.lng ?? null }, existing));
  const [errors, setErrors] = React.useState<Errors>({});
  const [error, setError] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [locating, setLocating] = React.useState(false);
  const create = useCreateAssessment();
  const revise = useReviseAssessment(existing?.summary.id ?? -1);
  const set = (patch: Partial<State>) => setS((p) => ({ ...p, ...patch }));
  const setRow = (code: string, patch: Partial<Row>) => setS((p) => ({ ...p, rows: { ...p.rows, [code]: { ...{ condition: '', cost: '', note: '' }, ...p.rows[code], ...patch } } }));
  const catalogue = COMPONENTS[facility.sector];
  const componentTotal = Object.values(s.rows).reduce((a, r) => a + (r.condition ? toNum(r.cost) ?? 0 : 0), 0);
  const score = toNum(s.score);
  const suggested = score === null ? null : severityForScore(Math.max(0, Math.min(100, score)));

  const validate = (): Errors => {
    const e: Errors = {};
    if (!s.assessedOn) e.assessedOn = t('v.required'); else if (s.assessedOn > today()) e.assessedOn = t('v.future');
    if (!s.assessorName.trim()) e.assessorName = t('v.required');
    if (score === null || score < 0 || score > 100) e.score = t('v.score');
    if (!s.severity) e.severity = t('v.required');
    for (const [k, v] of [['capacity', s.capacity], ['inventory', s.inventory]] as const) { const n = toNum(v); if (v && (n === null || n < 0 || n > 100)) e[k] = t('v.pct'); }
    if (!s.intervention) e.intervention = t('v.required');
    if (s.intervention && s.intervention !== 'NO_ACTION' && !s.priority) e.priority = t('v.required');
    if ((s.lat === '') !== (s.lng === '')) e.lat = t('v.coords');
    return e;
  };

  const request = (): CreateAssessmentRequest => ({
    facilityId: facility.id, taskId, assessedOn: s.assessedOn, assessorName: s.assessorName.trim(), severity: s.severity as DamageSeverity, structuralImpactScore: Math.round(score ?? 0),
    functionalCapacityPct: toNum(s.capacity), inventoryLossPct: toNum(s.inventory), estimatedRepairCostEtb: toNum(s.repair), estimatedReplacementCostEtb: toNum(s.replacement),
    equipmentLossEtb: toNum(s.equipment), notes: s.notes.trim() || null, location: s.lat && s.lng ? { lat: Number(s.lat), lng: Number(s.lng) } : null,
    accessStatus: s.accessStatus, currentUse: s.currentUse || null, uxoSuspected: s.uxo, damageCauses: s.causes,
    recommendedIntervention: s.intervention || null, interventionPriority: s.priority || null, beneficiariesAffected: toNum(s.beneficiaries),
    components: Object.entries(s.rows).filter(([, r]) => r.condition).map(([component, r]) => ({ component, condition: r.condition as DamageSeverity, repairCostEtb: toNum(r.cost), note: r.note.trim() || null })),
    photos: s.photos.map((p) => ({ url: p.url, caption: p.caption.trim() || null })),
  });

  const submit = async () => {
    const e = validate();
    setErrors(e); setError(null);
    if (Object.keys(e).length) { setError(t('fixErrors', { count: Object.keys(e).length })); return; }
    try {
      if (existing) { const r = await revise.mutateAsync(request()); onDone(r.summary.id); }
      else { const r = await create.mutateAsync(request()); onDone(r.id); }
    } catch (err) { setError(apiMessage(err, tc('error'))); }
  };

  const locate = () => {
    if (!navigator.geolocation) { setError(t('gpsUnavailable')); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { set({ lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6) }); setLocating(false); },
      () => { setError(t('gpsDenied')); setLocating(false); }, { enableHighAccuracy: true, timeout: 15_000 });
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true); setError(null);
    try {
      const added: Photo[] = [];
      for (const f of Array.from(files).slice(0, 12)) {
        const ticket = await api<{ token: string; uploadUrl: string; publicUrl: string }>('media/upload-url', { method: 'POST', body: JSON.stringify({ kind: 'PHOTO', mediaType: f.type || 'image/jpeg', sizeBytes: f.size }) });
        const res = await fetch(`/api/proxy/media/upload/${ticket.token}`, { method: 'PUT', body: f, headers: { 'Content-Type': f.type || 'image/jpeg' }, credentials: 'same-origin' });
        if (!res.ok) throw new Error(String(res.status));
        const r = (await res.json()) as { url: string };
        added.push({ url: r.url, caption: f.name.replace(/\.[^.]+$/, '') });
      }
      setS((p) => ({ ...p, photos: [...p.photos, ...added] }));
    } catch (e) { setError(apiMessage(e, t('uploadFailed'))); } finally { setUploading(false); }
  };

  const busy = create.isPending || revise.isPending;
  const choice = <V extends string>(value: V | '', options: readonly V[], onPick: (v: V) => void, label: (v: V) => string, tone?: (v: V) => string, id?: string) => (
    <div role="radiogroup" id={id} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value === o;
        return <button key={o} type="button" role="radio" aria-checked={on} onClick={() => onPick(o)}
          className={cn('rounded-md border-2 px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/40', on ? 'bg-muted/50' : 'border-border')}
          style={on ? { borderColor: tone ? tone(o) : 'hsl(var(--primary))' } : undefined}>{label(o)}</button>;
      })}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-5 py-4 shadow-card">
        <SectorDot sector={facility.sector} /><span className="text-lg font-semibold">{facility.name}</span>
        <span className="text-muted-foreground">· {te(`facilityType.${facility.facilityType}` as 'facilityType.FACTORY')} · {localizedName(facility.wereda.name, locale)}, {localizedName(facility.wereda.zoneName, locale)}</span>
        {existing && <span className="ml-auto text-sm text-muted-foreground">{t('revision', { n: existing.revision + 1 })}</span>}
      </div>
      {existing?.reviewNote && existing.summary.status === 'RETURNED' && <Callout tone="warning"><span className="font-semibold">{t('returnedBecause')}</span> {existing.reviewNote}</Callout>}

      <StepCard title={t('visit.title')} description={t('visit.hint')}>
        <div className="grid gap-4 tablet:grid-cols-2">
          <Field id="assessedOn" label={t('visit.date')} required error={errors.assessedOn}>{(a) => <Input type="date" max={today()} value={s.assessedOn} onChange={(e) => set({ assessedOn: e.target.value })} className={errClass(errors.assessedOn)} {...a} />}</Field>
          <Field id="assessorName" label={t('visit.assessor')} required error={errors.assessorName} hint={t('visit.assessorHint')}>{(a) => <Input value={s.assessorName} maxLength={160} onChange={(e) => set({ assessorName: e.target.value })} className={errClass(errors.assessorName)} {...a} />}</Field>
        </div>
        <Field id="access" label={t('visit.access')}>{() => choice(s.accessStatus, ACCESS, (v) => set({ accessStatus: v }), (v) => te(`access.${v}`))}</Field>
        <div className="grid gap-4 tablet:grid-cols-2">
          <Field id="currentUse" label={t('visit.use')} hint={t('visit.useHint')}>{(a) => (
            <Select value={s.currentUse || 'NONE'} onValueChange={(v) => set({ currentUse: v === 'NONE' ? '' : (v as CurrentUse) })}>
              <SelectTrigger {...a}><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="NONE">—</SelectItem>{CURRENT_USES.map((u) => <SelectItem key={u} value={u}>{te(`currentUse.${u}`)}</SelectItem>)}</SelectContent>
            </Select>)}</Field>
          <label className="flex items-center gap-3 self-end rounded-md border px-3 py-2.5"><Switch checked={s.uxo} onCheckedChange={(v) => set({ uxo: v })} /><span className="font-medium">{t('visit.uxo')}</span></label>
        </div>
        {s.uxo && <Callout tone="warning"><AlertTriangle className="mr-1 inline h-4 w-4" />{t('visit.uxoWarning')}</Callout>}
      </StepCard>

      <StepCard title={t('damage.title')} description={t('damage.hint')}>
        <div className="grid gap-4 tablet:grid-cols-3">
          <Field id="score" label={t('damage.score')} required error={errors.score} hint={suggested ? t('damage.suggests', { severity: te(`severity.${suggested}`) }) : t('damage.scoreHint')}>
            {(a) => <Input inputMode="numeric" value={s.score} onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 3); const n = toNum(v); set({ score: v, severity: s.severity || (n === null ? '' : severityForScore(Math.min(100, n))) }); }} className={cn('tabular', errClass(errors.score))} {...a} />}
          </Field>
          <Field id="capacity" label={t('damage.capacity')} error={errors.capacity} hint={t('damage.capacityHint')}>{(a) => <Input inputMode="numeric" value={s.capacity} onChange={(e) => set({ capacity: e.target.value.replace(/[^0-9]/g, '').slice(0, 3) })} className={cn('tabular', errClass(errors.capacity))} {...a} />}</Field>
          <Field id="inventory" label={t('damage.inventory')} error={errors.inventory}>{(a) => <Input inputMode="numeric" value={s.inventory} onChange={(e) => set({ inventory: e.target.value.replace(/[^0-9]/g, '').slice(0, 3) })} className={cn('tabular', errClass(errors.inventory))} {...a} />}</Field>
        </div>
        <Field id="severity" label={t('damage.severity')} required error={errors.severity}>{() => choice(s.severity, SEVERITIES, (v) => set({ severity: v }), (v) => te(`severity.${v}`), (v) => toneVar[severityTone[v]])}</Field>
        <Field id="causes" label={t('damage.causes')} hint={t('damage.causesHint')}>{() => (
          <div className="flex flex-wrap gap-2">
            {DAMAGE_CAUSES.map((c) => { const on = s.causes.includes(c); return (
              <button key={c} type="button" aria-pressed={on} onClick={() => set({ causes: on ? s.causes.filter((x) => x !== c) : [...s.causes, c] })}
                className={cn('rounded-full border px-3 py-1.5 text-sm', on ? 'border-primary bg-primary/10 font-medium text-primary' : 'hover:bg-muted/40')}>{te(`damageCause.${c}`)}</button>); })}
          </div>)}</Field>
      </StepCard>

      <StepCard title={t('components.title')} description={t('components.hint')}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b text-left text-muted-foreground"><th className="py-2 pr-3 font-medium">{t('components.element')}</th><th className="py-2 pr-3 font-medium">{t('components.condition')}</th><th className="py-2 pr-3 text-right font-medium">{t('components.cost')}</th><th className="py-2 font-medium">{t('components.note')}</th></tr></thead>
            <tbody>
              {catalogue.map((code) => {
                const r = s.rows[code] ?? { condition: '', cost: '', note: '' };
                return (
                  <tr key={code} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-medium">{te(`component.${code}` as 'component.ROOF')}</td>
                    <td className="py-2 pr-3">
                      <Select value={r.condition || 'SKIP'} onValueChange={(v) => setRow(code, { condition: v === 'SKIP' ? '' : (v as DamageSeverity) })}>
                        <SelectTrigger className="w-[170px]" aria-label={`${te(`component.${code}` as 'component.ROOF')} — ${t('components.condition')}`}><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="SKIP">{t('components.notSurveyed')}</SelectItem>{SEVERITIES.map((v) => <SelectItem key={v} value={v}>{te(`severity.${v}`)}</SelectItem>)}</SelectContent>
                      </Select>
                    </td>
                    <td className="w-48 py-2 pr-3"><MoneyInput value={r.cost} onValueChange={(v) => setRow(code, { cost: v })} disabled={!r.condition} aria-label={`${te(`component.${code}` as 'component.ROOF')} — ${t('components.cost')}`} /></td>
                    <td className="py-2"><Input value={r.note} maxLength={500} onChange={(e) => setRow(code, { note: e.target.value })} disabled={!r.condition} aria-label={`${te(`component.${code}` as 'component.ROOF')} — ${t('components.note')}`} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-muted-foreground">{t('components.total', { amount: money(componentTotal, locale, { compact: false }) })}</p>
      </StepCard>

      <StepCard title={t('needs.title')} description={t('needs.hint')}>
        <div className="grid gap-4 tablet:grid-cols-3">
          <Field id="repair" label={t('needs.repair')} hint={componentTotal > 0 ? t('needs.repairHint', { amount: money(componentTotal, locale) }) : undefined}>{(a) => <MoneyInput value={s.repair} onValueChange={(v) => set({ repair: v })} placeholder={componentTotal > 0 ? String(componentTotal) : undefined} {...a} />}</Field>
          <Field id="replacement" label={t('needs.replacement')}>{(a) => <MoneyInput value={s.replacement} onValueChange={(v) => set({ replacement: v })} {...a} />}</Field>
          <Field id="equipment" label={t('needs.equipment')}>{(a) => <MoneyInput value={s.equipment} onValueChange={(v) => set({ equipment: v })} {...a} />}</Field>
        </div>
        <Field id="intervention" label={t('needs.intervention')} required error={errors.intervention}>{() => choice(s.intervention, INTERVENTIONS, (v) => set({ intervention: v, priority: v === 'NO_ACTION' ? '' : s.priority }), (v) => te(`intervention.${v}`))}</Field>
        {s.intervention && s.intervention !== 'NO_ACTION' && (
          <Field id="priority" label={t('needs.priority')} required error={errors.priority} hint={t('needs.priorityHint')}>{() => choice(s.priority, NEED_PRIORITIES, (v) => set({ priority: v }), (v) => te(`needPriority.${v}`), (v) => toneVar[needPriorityTone[v]])}</Field>
        )}
        <Field id="beneficiaries" label={t('needs.beneficiaries')} hint={t('needs.beneficiariesHint')} className="tablet:w-1/3">{(a) => <Input inputMode="numeric" value={s.beneficiaries} onChange={(e) => set({ beneficiaries: e.target.value.replace(/[^0-9]/g, '') })} className="tabular" {...a} />}</Field>
      </StepCard>

      <StepCard title={t('evidence.title')} description={t('evidence.hint')}>
        <Field id="notes" label={t('evidence.notes')}>{(a) => <Textarea value={s.notes} onChange={(e) => set({ notes: e.target.value })} maxLength={4000} className="min-h-[120px]" {...a} />}</Field>
        <div className="grid items-end gap-4 tablet:grid-cols-[1fr_1fr_auto]">
          <Field id="lat" label={t('evidence.lat')} error={errors.lat}>{(a) => <Input inputMode="decimal" value={s.lat} onChange={(e) => set({ lat: e.target.value.replace(/[^0-9.\-]/g, '') })} className={cn('tabular', errClass(errors.lat))} {...a} />}</Field>
          <Field id="lng" label={t('evidence.lng')}>{(a) => <Input inputMode="decimal" value={s.lng} onChange={(e) => set({ lng: e.target.value.replace(/[^0-9.\-]/g, '') })} className="tabular" {...a} />}</Field>
          <Button type="button" variant="outline" onClick={locate} disabled={locating}>{locating ? <Loader2 className="animate-spin" /> : <Crosshair />}{t('evidence.gps')}</Button>
        </div>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className={cn('inline-flex cursor-pointer items-center gap-2 rounded-md border px-4 py-2 font-medium hover:bg-muted/40', uploading && 'pointer-events-none opacity-60')}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}{t('evidence.addPhotos')}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple capture="environment" className="sr-only" onChange={(e) => { void upload(e.target.files); e.target.value = ''; }} />
            </label>
            <span className="text-sm text-muted-foreground">{t('evidence.photosHint')}</span>
          </div>
          {s.photos.length > 0 && (
            <ul className="grid grid-cols-2 gap-3 tablet:grid-cols-4">
              {s.photos.map((p, i) => (
                <li key={p.url} className="overflow-hidden rounded-md border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={mediaSrc(p.url)} alt={p.caption || t('evidence.photo', { n: i + 1 })} className="h-28 w-full object-cover" />
                  <div className="flex items-center gap-1 p-1.5">
                    <Input value={p.caption} maxLength={255} onChange={(e) => setS((x) => ({ ...x, photos: x.photos.map((q, j) => (j === i ? { ...q, caption: e.target.value } : q)) }))} className="h-8 text-xs" aria-label={t('evidence.caption')} />
                    <Button type="button" size="icon" variant="ghost" onClick={() => setS((x) => ({ ...x, photos: x.photos.filter((_, j) => j !== i) }))} aria-label={t('evidence.remove')}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </StepCard>

      {error && <Callout tone="error">{error}</Callout>}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <p className="mr-auto text-sm text-muted-foreground">{t('submitHint')}</p>
        <Button size="lg" onClick={submit} disabled={busy || uploading}>{busy ? <Loader2 className="animate-spin" /> : <Save />}{existing ? t('resubmit') : t('submit')}</Button>
      </div>
    </div>
  );
}
