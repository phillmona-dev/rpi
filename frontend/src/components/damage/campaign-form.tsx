'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2, Save, Search } from 'lucide-react';
import type { CampaignDetail, CampaignRequest, Sector, WeredaRef } from '@/lib/api/types';
import { SECTORS } from '@/lib/api/types';
import { useAssignableUsers, useWeredas } from '@/lib/api/hooks';
import { useCreateCampaign, useUpdateCampaign } from '@/lib/api/damage';
import { ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Callout, Field, StepCard, errClass } from '@/components/projects/registration/ui';
import { SectorDot } from '@/components/common/badges';
import { localizedName } from '@/lib/format';
import { useUser } from '@/providers/session';
import { cn } from '@/lib/utils';

const today = () => new Date().toISOString().slice(0, 10);

/** Plans or edits a campaign: what it is for, when it runs, who coordinates it, and which weredas it covers. */
export function CampaignForm({ existing, onDone }: { existing?: CampaignDetail; onDone: (id: number) => void }) {
  const t = useTranslations('damage.campaignForm');
  const te = useTranslations('enums');
  const tc = useTranslations('common');
  const locale = useLocale();
  const user = useUser();
  const { data: weredas } = useWeredas();
  const { data: people } = useAssignableUsers();
  const create = useCreateCampaign();
  const update = useUpdateCampaign(existing?.summary.id ?? -1);
  const [name, setName] = React.useState(existing?.summary.name ?? '');
  const [sector, setSector] = React.useState<Sector | 'MULTI'>(existing ? existing.summary.sector ?? 'MULTI' : user.sectorScope ?? 'MULTI');
  const [start, setStart] = React.useState(existing?.summary.plannedStart ?? today());
  const [end, setEnd] = React.useState(existing?.summary.plannedEnd ?? '');
  const [coordinator, setCoordinator] = React.useState<number | null>(existing?.coordinatorUserId ?? user.id);
  const [objective, setObjective] = React.useState(existing?.objective ?? '');
  const [methodology, setMethodology] = React.useState(existing?.methodology ?? '');
  const [scope, setScope] = React.useState<number[]>(existing?.weredas.map((w) => w.id) ?? []);
  const [q, setQ] = React.useState('');
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);

  const coordinators = (people ?? []).filter((p) => p.roles.some((r) => ['ANALYST', 'ADMIN', 'SECTOR_HEAD'].includes(r)));
  const zones = React.useMemo(() => {
    const m = new Map<number, { zoneId: number; zoneName: WeredaRef['zoneName']; weredas: WeredaRef[] }>();
    (weredas ?? []).forEach((w) => { const z = m.get(w.zoneId) ?? { zoneId: w.zoneId, zoneName: w.zoneName, weredas: [] }; z.weredas.push(w); m.set(w.zoneId, z); });
    return Array.from(m.values()).sort((a, b) => a.zoneName.en.localeCompare(b.zoneName.en));
  }, [weredas]);
  const match = (w: WeredaRef) => !q.trim() || localizedName(w.name, locale).toLowerCase().includes(q.trim().toLowerCase()) || w.name.en.toLowerCase().includes(q.trim().toLowerCase());
  const toggle = (id: number) => setScope((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleZone = (ids: number[]) => setScope((s) => (ids.every((i) => s.includes(i)) ? s.filter((x) => !ids.includes(x)) : Array.from(new Set([...s, ...ids]))));

  const submit = async () => {
    const e: Record<string, string> = {};
    if (name.trim().length < 5) e.name = t('v.name');
    if (!start) e.plannedStart = t('v.required');
    if (!end) e.plannedEnd = t('v.required'); else if (start && end < start) e.plannedEnd = t('v.endAfterStart');
    if (!existing && end && end < today()) e.plannedEnd = t('v.endPast');
    if (!scope.length) e.weredaIds = t('v.scope');
    setErrors(e); setError(null);
    if (Object.keys(e).length) return;
    const body: CampaignRequest = { name: name.trim(), sector: sector === 'MULTI' ? null : sector, plannedStart: start, plannedEnd: end, coordinatorUserId: coordinator,
      objective: objective.trim() || null, methodology: methodology.trim() || null, weredaIds: scope };
    try {
      const r = existing ? await update.mutateAsync(body) : await create.mutateAsync(body);
      onDone(r.summary.id);
    } catch (err) {
      if (err instanceof ApiError && err.errors?.length) { setErrors(Object.fromEntries(err.errors.map((x) => [x.field, x.message]))); setError(err.detail || err.title); }
      else setError(err instanceof ApiError ? err.detail || err.title : tc('error'));
    }
  };
  const busy = create.isPending || update.isPending;

  return (
    <div className="space-y-6">
      <StepCard title={t('basics')} description={t('basicsHint')}>
        <Field id="name" label={t('name')} required error={errors.name} hint={t('nameHint')}>{(a) => <Input value={name} maxLength={200} onChange={(e) => setName(e.target.value)} className={errClass(errors.name)} {...a} />}</Field>
        <Field id="sector" label={t('sector')} error={errors.sector} hint={t('sectorHint')}>{() => (
          <div role="radiogroup" className="flex flex-wrap gap-2">
            {(['MULTI', ...SECTORS] as const).filter((x) => !user.sectorScope || x === user.sectorScope).map((x) => {
              const on = sector === x;
              return <button key={x} type="button" role="radio" aria-checked={on} onClick={() => setSector(x)}
                className={cn('flex items-center gap-2 rounded-md border-2 px-3 py-2 text-sm font-medium', on ? 'border-primary bg-muted/50' : 'border-border hover:bg-muted/40')}>
                {x !== 'MULTI' && <SectorDot sector={x} />}{x === 'MULTI' ? t('multi') : te(`sector.${x}`)}</button>;
            })}
          </div>)}</Field>
        <div className="grid gap-4 tablet:grid-cols-3">
          <Field id="plannedStart" label={t('start')} required error={errors.plannedStart}>{(a) => <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={errClass(errors.plannedStart)} {...a} />}</Field>
          <Field id="plannedEnd" label={t('end')} required error={errors.plannedEnd}>{(a) => <Input type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} className={errClass(errors.plannedEnd)} {...a} />}</Field>
          <Field id="coordinatorUserId" label={t('coordinator')} error={errors.coordinatorUserId} hint={t('coordinatorHint')}>{(a) => (
            <Select value={coordinator ? String(coordinator) : ''} onValueChange={(v) => setCoordinator(Number(v))}>
              <SelectTrigger {...a}><SelectValue placeholder={t('coordinatorPick')} /></SelectTrigger>
              <SelectContent>{coordinators.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.fullName}{p.title ? ` — ${p.title}` : ''}</SelectItem>)}</SelectContent>
            </Select>)}</Field>
        </div>
        <Field id="objective" label={t('objective')} hint={t('objectiveHint')}>{(a) => <Textarea value={objective} onChange={(e) => setObjective(e.target.value)} maxLength={4000} className="min-h-[90px]" {...a} />}</Field>
        <Field id="methodology" label={t('methodology')} hint={t('methodologyHint')}>{(a) => <Textarea value={methodology} onChange={(e) => setMethodology(e.target.value)} maxLength={4000} className="min-h-[90px]" {...a} />}</Field>
      </StepCard>

      <StepCard title={t('scope')} description={t('scopeHint')} actions={<span className="rounded-full bg-primary px-2.5 py-0.5 text-sm font-semibold text-primary-foreground tabular">{t('selected', { count: scope.length })}</span>}>
        <div className="relative tablet:w-80"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchWereda')} className="pl-9" aria-label={t('searchWereda')} /></div>
        {errors.weredaIds && <p className="text-sm text-destructive" data-field="weredaIds">{errors.weredaIds}</p>}
        <div className="grid gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
          {zones.map((z) => {
            const shown = z.weredas.filter(match);
            if (!shown.length) return null;
            const ids = z.weredas.map((w) => w.id);
            const all = ids.every((i) => scope.includes(i));
            return (
              <fieldset key={z.zoneId} className="rounded-md border p-3">
                <legend className="flex w-full items-center justify-between gap-2 px-1"><span className="font-semibold">{localizedName(z.zoneName, locale)}</span>
                  <button type="button" onClick={() => toggleZone(ids)} className="text-sm font-medium text-primary hover:underline">{all ? t('clearZone') : t('wholeZone')}</button></legend>
                <ul className="mt-1 grid grid-cols-1 gap-1">
                  {shown.map((w) => (
                    <li key={w.id}><label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/40">
                      <input type="checkbox" className="h-4 w-4" checked={scope.includes(w.id)} onChange={() => toggle(w.id)} />{localizedName(w.name, locale)}</label></li>
                  ))}
                </ul>
              </fieldset>
            );
          })}
        </div>
      </StepCard>

      {error && <Callout tone="error">{error}</Callout>}
      <div className="flex justify-end"><Button size="lg" onClick={submit} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Save />}{existing ? t('save') : t('create')}</Button></div>
    </div>
  );
}
