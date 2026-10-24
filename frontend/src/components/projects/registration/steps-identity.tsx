'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check, Crosshair, Eraser, Link2, MapPin, Search, Users } from 'lucide-react';
import { Input, Textarea } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SectorDot, SeverityBadge, OperationalBadge } from '@/components/common/badges';
import { Link } from '@/i18n/navigation';
import { useCodeSuggestion, useFacilities, useSimilarProjects, useWeredaMetrics, useZones } from '@/lib/api/hooks';
import { SECTORS, type Sector } from '@/lib/api/types';
import { localizedName, money, num } from '@/lib/format';
import { cn } from '@/lib/utils';
import { REGISTRABLE_STAGES, stageRank, toNum, type Errors, type FormState } from './model';
import { Callout, Field, StepCard, SubHeading, errClass } from './ui';
import { LocationPicker } from './location-picker';

export interface StepProps { s: FormState; set: (patch: Partial<FormState>) => void; errors: Errors }

/* ─── 1 · Basics ──────────────────────────────────────────────────────────── */
export function BasicsStep({ s, set, errors }: StepProps) {
  const t = useTranslations('register');
  const te = useTranslations('enums');
  const tl = useTranslations('projects.lifecycle.stages');
  const { data: suggestion } = useCodeSuggestion(s.sector || null);
  const debouncedName = useDebounced(s.name, 500);
  const { data: similar } = useSimilarProjects(debouncedName, s.weredaId);

  return (
    <StepCard title={t('steps.basics.title')} description={t('steps.basics.description')}>
      <Field id="sector" label={t('f.sector')} required error={errors.sector}>
        {(a) => (
          <div role="radiogroup" aria-labelledby="sector" className="grid grid-cols-2 gap-2 laptop:grid-cols-4" {...{ 'aria-describedby': a['aria-describedby'] }}>
            {SECTORS.map((sec) => {
              const on = s.sector === sec;
              return (
                <button key={sec} type="button" role="radio" aria-checked={on} id={sec === SECTORS[0] ? a.id : undefined} onClick={() => set({ sector: sec, facilityIds: s.sector === sec ? s.facilityIds : [] })}
                  className={cn('flex items-center gap-2 rounded-md border px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', on && 'border-ring bg-accent/60 font-medium', errors.sector && 'border-destructive')}>
                  <SectorDot sector={sec} className="h-3 w-3" />{te(`sector.${sec}`)}{on && <Check className="ml-auto h-4 w-4" />}
                </button>
              );
            })}
          </div>
        )}
      </Field>

      <div className="grid gap-4 laptop:grid-cols-3">
        <Field id="name" label={t('f.name')} required error={errors.name} hint={t('h.name')} className="laptop:col-span-2"
          aside={<span className="text-2xs tabular text-muted-foreground">{s.name.length}/220</span>}>
          {(a) => <Input {...a} value={s.name} maxLength={220} placeholder={t('ph.name')} onChange={(e) => set({ name: e.target.value })} className={errClass(errors.name)} autoFocus />}
        </Field>
        <Field id="code" label={t('f.code')} error={errors.code} hint={s.codeAuto ? t('h.codeAuto') : t('h.codeManual')}
          aside={<label className="flex items-center gap-1.5 text-2xs text-muted-foreground"><Switch checked={s.codeAuto} onCheckedChange={(v) => set({ codeAuto: v, code: v ? '' : (suggestion?.code ?? '') })} aria-label={t('f.codeAuto')} />{t('f.codeAuto')}</label>}>
          {(a) => <Input {...a} value={s.codeAuto ? (suggestion?.code ?? (s.sector ? '…' : t('ph.codeNeedsSector'))) : s.code} disabled={s.codeAuto} className={cn('font-mono uppercase', errClass(errors.code))}
            onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '') })} maxLength={32} />}
        </Field>
      </div>
      {similar && similar.length > 0 && (
        <Callout tone="warning">
          <p className="font-medium">{t('similar.title')}</p>
          <ul className="mt-1 space-y-0.5">{similar.map((p) => <li key={p.id}><Link href={`/projects/${p.id}`} target="_blank" className="underline-offset-2 hover:underline"><span className="font-mono">{p.code}</span> · {p.name}</Link> <span className="text-muted-foreground">({p.weredaName} · {te(`status.${p.status}`)})</span></li>)}</ul>
          <p className="mt-1 text-muted-foreground">{t('similar.hint')}</p>
        </Callout>
      )}

      <Field id="initialStage" label={t('f.stage')} required hint={t('h.stage')}>
        {(a) => (
          <div role="radiogroup" aria-describedby={a['aria-describedby']} className="grid gap-2 tablet:grid-cols-5">
            {REGISTRABLE_STAGES.map((st, i) => {
              const on = s.initialStage === st;
              return (
                <button key={st} type="button" role="radio" aria-checked={on} id={i === 0 ? a.id : undefined} onClick={() => set({ initialStage: st })}
                  className={cn('relative rounded-md border p-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', on && 'border-ring bg-accent/60')}>
                  <div className="flex items-center gap-2"><span className={cn('flex h-5 w-5 items-center justify-center rounded-full border text-2xs font-semibold tabular', on && 'border-ring bg-primary text-primary-foreground')}>{i + 1}</span><span className="text-sm font-medium">{tl(st)}</span></div>
                  <p className="mt-1.5 text-2xs leading-snug text-muted-foreground">{t(`stageHelp.${st}`)}</p>
                </button>
              );
            })}
          </div>
        )}
      </Field>
      {stageRank(s.initialStage) > 0 && <Callout>{t('stageRequires', { stage: tl(s.initialStage) })}</Callout>}

      <div className="grid gap-4 laptop:grid-cols-3">
        <Field id="description" label={t('f.description')} hint={t('h.description')} className="laptop:col-span-2" aside={<span className="text-2xs tabular text-muted-foreground">{s.description.length}/5000</span>}>
          {(a) => <Textarea {...a} rows={5} maxLength={5000} value={s.description} placeholder={t('ph.description')} onChange={(e) => set({ description: e.target.value })} />}
        </Field>
        <Field id="beneficiaries" label={t('f.beneficiaries')} error={errors.beneficiaries} hint={t('h.beneficiaries')}>
          {(a) => <div className="relative"><Users className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><Input {...a} inputMode="numeric" className={cn('pl-8 tabular', errClass(errors.beneficiaries))} value={s.beneficiaries} placeholder="0" onChange={(e) => set({ beneficiaries: e.target.value.replace(/[^0-9]/g, '') })} /></div>}
        </Field>
      </div>
    </StepCard>
  );
}

/* ─── 2 · Location & scope ────────────────────────────────────────────────── */
export function LocationStep({ s, set, errors }: StepProps) {
  const t = useTranslations('register');
  const te = useTranslations('enums');
  const ts = useTranslations('scope');
  const locale = useLocale();
  const { data: zones } = useZones();
  const { data: weredas } = useWeredaMetrics();
  const [wholeZone, setWholeZone] = React.useState(false);
  const [q, setQ] = React.useState('');
  const zoneWeredas = React.useMemo(() => (weredas ?? []).filter((w) => !s.zoneId || w.zoneId === s.zoneId).sort((a, b) => localizedName(a.name, locale).localeCompare(localizedName(b.name, locale))), [weredas, s.zoneId, locale]);
  const wereda = weredas?.find((w) => w.id === s.weredaId);
  const facQuery = { sector: s.sector || undefined, weredaId: wholeZone ? undefined : s.weredaId ?? undefined, zoneId: wholeZone ? s.zoneId ?? undefined : undefined, q: q || undefined, size: 100, sort: 'name,asc' };
  const { data: facilities, isLoading: fl } = useFacilities(facQuery);
  const canListFacilities = Boolean(s.sector && (s.weredaId || (wholeZone && s.zoneId)));
  const selectedBenef = (facilities?.content ?? []).filter((f) => s.facilityIds.includes(f.id)).reduce((a, f) => a + (f.beneficiaries ?? 0), 0);
  const lat = toNum(s.latitude), lng = toNum(s.longitude);

  const pickWereda = (id: number) => { const w = weredas?.find((x) => x.id === id); set({ weredaId: id, zoneId: w?.zoneId ?? s.zoneId, facilityIds: [] }); };
  const toggle = (id: number) => set({ facilityIds: s.facilityIds.includes(id) ? s.facilityIds.filter((x) => x !== id) : [...s.facilityIds, id] });

  return (
    <StepCard title={t('steps.location.title')} description={t('steps.location.description')}>
      <div className="grid gap-5 desktop:grid-cols-5">
        <div className="space-y-4 desktop:col-span-2">
          <Field id="zoneId" label={ts('zone')} hint={t('h.zone')}>
            {(a) => (
              <Select value={s.zoneId ? String(s.zoneId) : ''} onValueChange={(v) => set({ zoneId: Number(v), weredaId: null, facilityIds: [] })}>
                <SelectTrigger {...a}><SelectValue placeholder={t('ph.zone')} /></SelectTrigger>
                <SelectContent>{zones?.map((z) => <SelectItem key={z.id} value={String(z.id)}>{localizedName(z.name, locale)}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </Field>
          <Field id="weredaId" label={t('f.wereda')} required error={errors.weredaId} hint={t('h.wereda')}>
            {(a) => (
              <Select value={s.weredaId ? String(s.weredaId) : ''} onValueChange={(v) => pickWereda(Number(v))}>
                <SelectTrigger {...a} className={errClass(errors.weredaId)}><SelectValue placeholder={t('ph.wereda')} /></SelectTrigger>
                <SelectContent className="max-h-72">{zoneWeredas.map((w) => <SelectItem key={w.id} value={String(w.id)}>{localizedName(w.name, locale)}{!s.zoneId && <span className="text-muted-foreground"> · {localizedName(w.zoneName, locale)}</span>}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </Field>
          {wereda && (
            <dl className="grid grid-cols-3 gap-2 rounded-md border bg-muted/30 p-3 text-xs">
              <div><dt className="text-muted-foreground">{t('loc.population')}</dt><dd className="font-medium tabular">{num(wereda.population, locale)}</dd></div>
              <div><dt className="text-muted-foreground">{t('loc.projects')}</dt><dd className="font-medium tabular">{wereda.projectsTotal}</dd></div>
              <div><dt className="text-muted-foreground">{t('loc.severe')}</dt><dd className="font-medium tabular">{wereda.facilitiesSevere}</dd></div>
            </dl>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field id="latitude" label={t('f.latitude')} error={errors.latitude}>
              {(a) => <Input {...a} inputMode="decimal" className={cn('tabular', errClass(errors.latitude))} value={s.latitude} placeholder="13.4967" onChange={(e) => set({ latitude: e.target.value.replace(/[^0-9.-]/g, '') })} />}
            </Field>
            <Field id="longitude" label={t('f.longitude')} error={errors.longitude}>
              {(a) => <Input {...a} inputMode="decimal" className={cn('tabular', errClass(errors.longitude))} value={s.longitude} placeholder="39.4753" onChange={(e) => set({ longitude: e.target.value.replace(/[^0-9.-]/g, '') })} />}
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="xs" variant="outline" disabled={!wereda} onClick={() => wereda && set({ latitude: String(wereda.centroid.lat), longitude: String(wereda.centroid.lng) })}><Crosshair />{t('loc.useCentre')}</Button>
            <Button type="button" size="xs" variant="ghost" disabled={!s.latitude && !s.longitude} onClick={() => set({ latitude: '', longitude: '' })}><Eraser />{t('loc.clear')}</Button>
          </div>
          <p className="text-2xs text-muted-foreground">{t('h.coordinates')}</p>
        </div>
        <div className="desktop:col-span-3">
          {weredas ? <LocationPicker weredas={weredas} weredaId={s.weredaId} lat={lat} lng={lng} height={380}
            onPick={(p) => set({ latitude: String(p.lat), longitude: String(p.lng), ...(!s.weredaId && p.nearestWeredaId ? { weredaId: p.nearestWeredaId, zoneId: weredas.find((w) => w.id === p.nearestWeredaId)?.zoneId ?? null } : {}) })} />
            : <Skeleton className="h-[380px] w-full" />}
          <p className="mt-1.5 flex items-center gap-1 text-2xs text-muted-foreground"><MapPin className="h-3 w-3" />{t('loc.mapHint')}</p>
        </div>
      </div>

      <div className="space-y-3 border-t pt-5">
        <SubHeading hint={t('h.facilities')} actions={<>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground"><Switch checked={wholeZone} onCheckedChange={setWholeZone} disabled={!s.zoneId} />{t('fac.wholeZone')}</label>
        </>}>{t('fac.title')}{s.facilityIds.length > 0 && <span className="ml-2 rounded-full bg-primary px-1.5 text-2xs font-semibold text-primary-foreground tabular">{s.facilityIds.length}</span>}</SubHeading>
        {!canListFacilities ? <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">{t('fac.needScope')}</p> : (
          <>
            <div className="relative max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><Input className="h-8 pl-8 text-xs" placeholder={t('fac.search')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
            {fl ? <Skeleton className="h-32 w-full" /> : !facilities?.content.length ? <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">{t('fac.none')}</p> : (
              <ul className="grid max-h-[340px] gap-2 overflow-y-auto pr-1 tablet:grid-cols-2" role="group" aria-label={t('fac.title')}>
                {facilities.content.map((f) => {
                  const on = s.facilityIds.includes(f.id);
                  return (
                    <li key={f.id}>
                      <button type="button" aria-pressed={on} onClick={() => toggle(f.id)} className={cn('flex w-full items-start gap-3 rounded-md border p-2.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', on && 'border-ring bg-accent/60')}>
                        <span className={cn('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border', on && 'border-primary bg-primary text-primary-foreground')}>{on && <Check className="h-3 w-3" />}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{f.name}</span>
                          <span className="block text-2xs text-muted-foreground">{f.code} · {te(`facilityType.${f.facilityType}` as 'facilityType.FACTORY')} · {localizedName(f.wereda.name, locale)}</span>
                          <span className="mt-1 flex flex-wrap items-center gap-1.5"><SeverityBadge value={f.latestSeverity} /><OperationalBadge value={f.operationalStatus} />
                            {f.linkedProjects > 0 && <span className="inline-flex items-center gap-1 text-2xs text-muted-foreground"><Link2 className="h-3 w-3" />{t('fac.linked', { count: f.linkedProjects })}</span>}</span>
                          <span className="mt-1 block text-2xs text-muted-foreground tabular">{t('fac.reach', { people: num(f.beneficiaries, locale), cost: money(f.replacementEstimateEtb, locale) })}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {s.facilityIds.length > 0 && selectedBenef > 0 && (toNum(s.beneficiaries) ?? 0) !== selectedBenef && (
              <Callout>{t('fac.useBenef', { count: num(selectedBenef, locale) })} <button type="button" className="font-medium underline underline-offset-2" onClick={() => set({ beneficiaries: String(selectedBenef) })}>{t('fac.apply')}</button></Callout>
            )}
          </>
        )}
        <GroupErrorLine error={errors.facilityIds} />
      </div>
    </StepCard>
  );
}

function GroupErrorLine({ error }: { error?: string }) { return error ? <p className="text-xs text-destructive" data-field="facilityIds">{error}</p> : null; }

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => { const h = setTimeout(() => setV(value), ms); return () => clearTimeout(h); }, [value, ms]);
  return v;
}

export const sectorOf = (s: FormState) => (s.sector || null) as Sector | null;
