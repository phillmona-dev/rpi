'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowUpRight, Layers, Maximize2, SlidersHorizontal, X } from 'lucide-react';
import { useBreadcrumbs } from '@/components/layout/breadcrumbs';
import { PageHeader } from '@/components/common/page-header';
import { CommandMap, MapLegend, type FacilityColorMode, type MapLayers, type MapSelection, type ProjectColorMode } from '@/components/map/command-map';
import { useBoundaries, useEvidenceGeo, useFacilitiesGeo, useProjectsGeo, useWeredaMetrics, useZones } from '@/lib/api/hooks';
import { useQueryParams } from '@/lib/use-query-params';
import { useUser } from '@/providers/session';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { HealthBadge, OperationalBadge, SectorLabel, SeverityBadge, StatusBadge, ToneBadge } from '@/components/common/badges';
import { RiskChip } from '@/components/projects/risk-score';
import { Link } from '@/i18n/navigation';
import { SECTORS, type Sector } from '@/lib/api/types';
import { localizedName, money, pct, relTime, signedPp } from '@/lib/format';
import { verificationTone } from '@/lib/domain';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

const HEALTHS = ['ON_TRACK', 'AT_RISK', 'DELAYED', 'STALLED', 'COMPLETED', 'NOT_STARTED'];
const STATUSES = ['PLANNED', 'PROCUREMENT', 'ACTIVE', 'SUSPENDED', 'COMPLETED'];
const SEVERITIES = ['DESTROYED', 'SEVERE', 'MODERATE', 'MINOR', 'NONE'];

/** Geospatial Command: one map, layered, filtered and colour-coded for executives; selection opens an entity card with a path to detail. */
export default function MapPage() {
  const t = useTranslations('map');
  const tc = useTranslations('common');
  const ts = useTranslations('scope');
  const te = useTranslations('enums');
  const locale = useLocale();
  const user = useUser();
  const { get, getAll, set } = useQueryParams();
  useBreadcrumbs([{ label: t('title') }]);

  const sector = (user.sectorScope ?? get('sector')) as Sector | null;
  const zoneId = get('zoneId') ? Number(get('zoneId')) : null;
  const health = getAll('health'), status = getAll('status'), severity = getAll('severity');
  const unaddressed = get('unaddressed') === 'true';
  const minRisk = get('minRisk') ? Number(get('minRisk')) : null;
  const [layers, setLayers] = React.useState<MapLayers>({ boundaries: true, weredas: false, projects: true, facilities: true, evidence: false });
  const [projectColor, setProjectColor] = React.useState<ProjectColorMode>((get('color') as ProjectColorMode) || 'health');
  const [facilityColor, setFacilityColor] = React.useState<FacilityColorMode>('severity');
  const [selected, setSelected] = React.useState<MapSelection | null>(null);
  const [panel, setPanel] = React.useState(true);
  const [fit, setFit] = React.useState<'tigray' | 'data'>('tigray');

  const { data: zones } = useZones();
  const projQ = { sector, zoneId, health, status, minRiskScore: minRisk };
  const { data: projects, isLoading: pl, error: pe } = useProjectsGeo(projQ, layers.projects);
  const { data: facilities, isLoading: fl } = useFacilitiesGeo({ sector, zoneId, severity, unaddressed: unaddressed ? true : undefined }, layers.facilities);
  const evidenceTarget = selected?.kind === 'PROJECT' ? { projectId: selected.id } : selected?.kind === 'FACILITY' ? { facilityId: selected.id } : {};
  const { data: evidence } = useEvidenceGeo(evidenceTarget, layers.evidence && Boolean(selected && selected.kind !== 'EVIDENCE'));
  const { data: boundaries } = useBoundaries('wereda', zoneId);
  const { data: weredas } = useWeredaMetrics({ sector, zoneId });
  const hasBoundaries = (boundaries?.features.length ?? 0) > 0;

  const multi = (k: string, label: string, options: string[], ns: string) => {
    const cur = getAll(k);
    return (
      <div className="space-y-1">
        <div className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="flex flex-wrap gap-1">{options.map((o) => { const on = cur.includes(o); return <button key={o} type="button" aria-pressed={on} onClick={() => set({ [k]: on ? cur.filter((x) => x !== o) : [...cur, o] })} className={cn('rounded-md border px-2 py-0.5 text-2xs transition-colors', on ? 'border-primary bg-primary/10 text-foreground' : 'text-muted-foreground hover:text-foreground')}>{te(`${ns}.${o}` as 'health.ON_TRACK')}</button>; })}</div>
      </div>
    );
  };
  const hasFilters = ['sector', 'zoneId', 'health', 'status', 'severity', 'unaddressed', 'minRisk'].some((k) => get(k));
  const focus = selected && selected.kind !== 'EVIDENCE' ? null : null;

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} actions={<>
        <Button variant="outline" size="sm" onClick={() => setFit((f) => (f === 'data' ? 'tigray' : 'data'))}><Maximize2 />{tc('fitAll')}</Button>
        <Button variant={panel ? 'secondary' : 'outline'} size="sm" onClick={() => setPanel((p) => !p)} aria-pressed={panel}><SlidersHorizontal />{t('filters')}</Button>
      </>} />
      <div className="grid gap-4 desktop:grid-cols-12">
        {panel && (
          <aside className="desktop:col-span-3 space-y-4 rounded-lg border bg-card p-4 shadow-card text-sm" aria-label={t('filters')}>
            <section className="space-y-2">
              <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Layers className="h-3.5 w-3.5" />{tc('layers')}</h2>
              {(Object.keys(layers) as (keyof MapLayers)[]).map((k) => (
                <label key={k} className="flex items-center justify-between gap-2 text-sm"><span>{t(`layers.${k}`)}</span><Switch checked={layers[k]} onCheckedChange={(v) => setLayers((l) => ({ ...l, [k]: v }))} aria-label={t(`layers.${k}`)} /></label>
              ))}
              {layers.evidence && !selected && <p className="text-2xs text-muted-foreground">{tc('nothingSelected')}</p>}
            </section>
            <section className="space-y-2">
              <label className="block text-2xs font-medium uppercase tracking-wide text-muted-foreground" htmlFor="pcolor">{t('colorBy')}</label>
              <Select value={projectColor} onValueChange={(v) => { setProjectColor(v as ProjectColorMode); set({ color: v }); }}><SelectTrigger id="pcolor" className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{(['health', 'risk', 'progress', 'sector'] as ProjectColorMode[]).map((m) => <SelectItem key={m} value={m}>{t(`color.${m}`)}</SelectItem>)}</SelectContent></Select>
              <label className="block text-2xs font-medium uppercase tracking-wide text-muted-foreground" htmlFor="fcolor">{t('facilityColorBy')}</label>
              <Select value={facilityColor} onValueChange={(v) => setFacilityColor(v as FacilityColorMode)}><SelectTrigger id="fcolor" className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{(['severity', 'operational', 'sector'] as FacilityColorMode[]).map((m) => <SelectItem key={m} value={m}>{t(`facilityColor.${m}`)}</SelectItem>)}</SelectContent></Select>
            </section>
            <section className="space-y-3">
              <div className="flex items-center justify-between"><h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('filters')}</h2>{hasFilters && <Button variant="ghost" size="xs" onClick={() => set({ sector: null, zoneId: null, health: null, status: null, severity: null, unaddressed: null, minRisk: null })}><X />{tc('clearFilters')}</Button>}</div>
              {!user.sectorScope && <Select value={sector ?? 'ALL'} onValueChange={(v) => set({ sector: v === 'ALL' ? null : v })}><SelectTrigger className="h-8 text-xs" aria-label={ts('sector')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">{ts('allSectors')}</SelectItem>{SECTORS.map((s) => <SelectItem key={s} value={s}>{te(`sector.${s}`)}</SelectItem>)}</SelectContent></Select>}
              <Select value={zoneId ? String(zoneId) : 'ALL'} onValueChange={(v) => set({ zoneId: v === 'ALL' ? null : v })}><SelectTrigger className="h-8 text-xs" aria-label={ts('zone')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">{ts('allZones')}</SelectItem>{zones?.map((z) => <SelectItem key={z.id} value={String(z.id)}>{localizedName(z.name, locale)}</SelectItem>)}</SelectContent></Select>
              {multi('health', te('health.ON_TRACK') && 'Health', HEALTHS, 'health')}
              {multi('status', te('status.ACTIVE') && 'Status', STATUSES, 'status')}
              <div className="space-y-1"><label htmlFor="minRisk" className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">{t('minRisk')}: <span className="tabular text-foreground">{minRisk ?? 0}</span></label><input id="minRisk" type="range" min={0} max={90} step={5} value={minRisk ?? 0} onChange={(e) => set({ minRisk: Number(e.target.value) ? e.target.value : null })} className="w-full accent-[var(--seq-450)]" /></div>
              {multi('severity', te('severity.SEVERE') && 'Damage severity', SEVERITIES, 'severity')}
              <label className="flex items-center justify-between gap-2 text-sm"><span>{t('unaddressedOnly')}</span><Switch checked={unaddressed} onCheckedChange={(v) => set({ unaddressed: v ? 'true' : null })} /></label>
            </section>
            <section><h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tc('legend')}</h2><MapLegend layers={layers} projectColor={projectColor} facilityColor={facilityColor} hasBoundaries={hasBoundaries} /></section>
          </aside>
        )}
        <div className={cn('space-y-3', panel ? 'desktop:col-span-9' : 'desktop:col-span-12')}>
          <div className="relative">
            <CommandMap projects={layers.projects ? projects : undefined} facilities={layers.facilities ? facilities : undefined} evidence={layers.evidence ? evidence : undefined} boundaries={boundaries} weredas={weredas} layers={layers} projectColor={projectColor} facilityColor={facilityColor} height="calc(100vh - 230px)" selected={selected} onSelect={setSelected} fitTo={fit} focus={focus} />
            <div className="pointer-events-none absolute left-3 top-3 rounded-md border bg-card/90 px-2 py-1 text-2xs text-muted-foreground backdrop-blur">{pl || fl ? tc('loading') : t('visible', { projects: projects?.features.length ?? 0, facilities: facilities?.features.length ?? 0 })}{pe ? ` · ${tc('error')}` : ''}</div>
            {selected && <SelectionCard sel={selected} onClose={() => setSelected(null)} />}
          </div>
        </div>
      </div>
    </>
  );
}

function SelectionCard({ sel, onClose }: { sel: MapSelection; onClose: () => void }) {
  const t = useTranslations('map');
  const tc = useTranslations('common');
  const te = useTranslations('enums');
  const tp = useTranslations('projects.columns');
  const locale = useLocale();
  return (
    <div className="absolute bottom-3 right-3 w-[min(360px,calc(100%-24px))] rounded-lg border bg-card/95 p-4 text-sm shadow-lg backdrop-blur" role="dialog" aria-label={t('selected')}>
      <button type="button" onClick={onClose} className="absolute right-2 top-2 rounded p-1 text-muted-foreground hover:text-foreground" aria-label={tc('close')}><X className="h-4 w-4" /></button>
      {sel.kind === 'PROJECT' && (() => { const p = sel.props; return (
        <>
          <div className="pr-6"><div className="flex items-center gap-2 text-2xs text-muted-foreground"><SectorLabel sector={p.sector} /> · {p.code}</div><h3 className="mt-0.5 font-semibold leading-snug">{p.name}</h3><div className="text-xs text-muted-foreground">{p.wereda} · {p.zone}{p.contractor ? ` · ${p.contractor}` : ''}</div></div>
          <div className="mt-2 flex flex-wrap gap-1.5"><StatusBadge value={p.status} /><HealthBadge value={p.health} /><RiskChip score={p.riskScore} /></div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div><div className="text-muted-foreground">{tp('progress')}</div><div className="font-medium tabular">{pct(Number(p.physicalPct))} <span className="text-muted-foreground">/ {pct(Number(p.plannedPct))}</span></div><Progress value={Number(p.physicalPct)} planned={Number(p.plannedPct)} className="mt-1" label={p.name} /></div>
            <div><div className="text-muted-foreground">{tp('variance')}</div><div className="font-medium tabular">{signedPp(Number(p.variancePp))}</div></div>
            <div><div className="text-muted-foreground">{tp('budget')}</div><div className="font-medium tabular">{money(Number(p.budgetEtb), locale)}</div></div>
            <div><div className="text-muted-foreground">{tp('lastReport')}</div><div className="font-medium">{p.lastReportAt ? relTime(p.lastReportAt) : tc('never')}</div></div>
          </div>
          <Button asChild size="sm" className="mt-3 w-full"><Link href={`/projects/${sel.id}`}>{t('openDetail')}<ArrowUpRight /></Link></Button>
        </>
      ); })()}
      {sel.kind === 'FACILITY' && (() => { const f = sel.props; return (
        <>
          <div className="pr-6"><div className="flex items-center gap-2 text-2xs text-muted-foreground"><SectorLabel sector={f.sector} /> · {te(`facilityType.${f.facilityType}` as 'facilityType.FACTORY')}</div><h3 className="mt-0.5 font-semibold leading-snug">{f.name}</h3><div className="text-xs text-muted-foreground">{f.wereda} · {f.zone}</div></div>
          <div className="mt-2 flex flex-wrap gap-1.5"><SeverityBadge value={f.severity} /><OperationalBadge value={f.operationalStatus} />{f.unaddressed && <ToneBadge tone="serious" label={te('rule.SEVERE_DAMAGE_UNADDRESSED')} />}</div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div><div className="text-muted-foreground">Impact</div><div className="font-medium tabular">{f.impactScore ?? '—'}/100</div></div>
            <div><div className="text-muted-foreground">{tc('beneficiaries')}</div><div className="font-medium tabular">{f.beneficiaries?.toLocaleString() ?? '—'}</div></div>
            <div><div className="text-muted-foreground">Replacement</div><div className="font-medium tabular">{money(f.replacementEstimateEtb, locale)}</div></div>
            <div><div className="text-muted-foreground">{tc('evidence')}</div><div className="font-medium tabular">{f.media} · {f.projects} proj.</div></div>
          </div>
          <Button asChild size="sm" className="mt-3 w-full"><Link href={`/facilities/${sel.id}`}>{t('openDetail')}<ArrowUpRight /></Link></Button>
        </>
      ); })()}
      {sel.kind === 'EVIDENCE' && (() => { const e = sel.props; return (
        <>
          <div className="pr-6"><div className="text-2xs text-muted-foreground">{e.kind === 'INSPECTION' ? te(`inspectionType.${e.type}` as 'inspectionType.SITE_VISIT') : e.type}</div><h3 className="mt-0.5 font-semibold leading-snug">{e.subject}</h3><div className="text-xs text-muted-foreground">{e.who} · {String(e.at ?? '').slice(0, 10)}</div></div>
          <div className="mt-2"><ToneBadge tone={verificationTone[e.verificationStatus]} label={te(`verification.${e.verificationStatus}`)} /></div>
          <Button asChild size="sm" className="mt-3 w-full"><Link href={(e.kind === 'INSPECTION' ? `/evidence?inspection=${e.ref}` : e.projectId ? `/projects/${e.projectId}` : `/facilities/${e.facilityId}`) as '/'}>{t('openDetail')}<ArrowUpRight /></Link></Button>
        </>
      ); })()}
    </div>
  );
}
