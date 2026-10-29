'use client';
import * as React from 'react';
import maplibregl, { type Map as MlMap, type StyleSpecification, type ExpressionSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useLocale, useTranslations } from 'next-intl';
import type { EvidenceFeatureProps, FacilityFeatureProps, GeoCollection, ProjectFeatureProps, WeredaMetrics } from '@/lib/api/types';
import { localizedName, money, pct } from '@/lib/format';
import { healthColor, operationalColor, progressColor, readPalette, riskColor, severityColor, verificationColor, type MapPalette } from './map-tokens';

export type ProjectColorMode = 'health' | 'risk' | 'progress' | 'sector';
export type FacilityColorMode = 'severity' | 'operational' | 'sector';
export interface MapLayers { boundaries: boolean; weredas: boolean; projects: boolean; facilities: boolean; evidence: boolean }
export type MapSelection = { kind: 'PROJECT'; id: number; props: ProjectFeatureProps } | { kind: 'FACILITY'; id: number; props: FacilityFeatureProps } | { kind: 'EVIDENCE'; id: string; props: EvidenceFeatureProps };

const TIGRAY_BOUNDS: [[number, number], [number, number]] = [[36.3, 12.2], [40.1, 14.9]];
const FALLBACK_STYLE: StyleSpecification = { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#e9eef4' } }] };
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/**
 * Geospatial command layer (Gati Shakti pattern): boundaries, wereda indicators, projects, facilities and field
 * evidence as toggleable layers with executive-friendly colour modes. Colours are read from the design tokens.
 * No synthetic boundaries are drawn; the boundary layer simply stays empty until official polygons are loaded.
 */
export function CommandMap({ projects, facilities, evidence, boundaries, weredas, layers, projectColor = 'health', facilityColor = 'severity', height = 560, selected, onSelect, focus, fitTo = 'tigray', interactive = true, className }: {
  projects?: GeoCollection<ProjectFeatureProps>; facilities?: GeoCollection<FacilityFeatureProps>; evidence?: GeoCollection<EvidenceFeatureProps>; boundaries?: GeoCollection; weredas?: WeredaMetrics[];
  layers: MapLayers; projectColor?: ProjectColorMode; facilityColor?: FacilityColorMode; height?: number | string; selected?: MapSelection | null; onSelect?: (s: MapSelection | null) => void;
  focus?: { lng: number; lat: number; zoom?: number } | null; fitTo?: 'tigray' | 'data'; interactive?: boolean; className?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<MlMap | null>(null);
  const [ready, setReady] = React.useState(false);
  const [unsupported, setUnsupported] = React.useState(false);
  const [palette, setPalette] = React.useState<MapPalette>(() => readPalette());
  const locale = useLocale();
  const t = useTranslations('map');
  const te = useTranslations('enums');
  const onSelectRef = React.useRef(onSelect); onSelectRef.current = onSelect;

  // Theme changes re-read the palette (dark/light toggle without remounting the map)
  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    const obs = new MutationObserver(() => setPalette(readPalette()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  const projectData = React.useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: (projects?.features ?? []).map((f) => {
      const p = f.properties;
      const color = projectColor === 'health' ? healthColor(palette, p.health) : projectColor === 'risk' ? riskColor(palette, p.riskScore) : projectColor === 'progress' ? progressColor(palette, Number(p.physicalPct)) : palette.sector[p.sector];
      return { type: 'Feature' as const, id: f.id, geometry: f.geometry as GeoJSON.Point, properties: { ...p, id: f.id, color, budgetM: Number(p.budgetEtb) / 1e6 } };
    }),
  }), [projects, projectColor, palette]);

  const facilityData = React.useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: (facilities?.features ?? []).map((f) => {
      const p = f.properties;
      const color = facilityColor === 'severity' ? severityColor(palette, p.severity) : facilityColor === 'operational' ? operationalColor(palette, p.operationalStatus) : palette.sector[p.sector];
      return { type: 'Feature' as const, id: f.id, geometry: f.geometry as GeoJSON.Point, properties: { ...p, id: f.id, color } };
    }),
  }), [facilities, facilityColor, palette]);

  const evidenceData = React.useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: (evidence?.features ?? []).map((f) => ({ type: 'Feature' as const, id: f.id, geometry: f.geometry as GeoJSON.Point, properties: { ...f.properties, id: f.id, color: verificationColor(palette, f.properties.verificationStatus) } })),
  }), [evidence, palette]);

  const weredaData = React.useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: (weredas ?? []).map((w) => ({ type: 'Feature' as const, id: w.id, geometry: { type: 'Point' as const, coordinates: [w.centroid.lng, w.centroid.lat] }, properties: { id: w.id, name: localizedName(w.name, locale), zone: localizedName(w.zoneName, locale), value: w.projectsDelayed + w.facilitiesSevere, projectsTotal: w.projectsTotal, facilitiesTotal: w.facilitiesTotal } })),
  }), [weredas, locale]);

  const boundaryData = React.useMemo<GeoJSON.FeatureCollection>(() => (boundaries ? (boundaries as unknown as GeoJSON.FeatureCollection) : EMPTY), [boundaries]);

  // Map lifecycle
  React.useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const style = process.env.NEXT_PUBLIC_MAP_STYLE_URL || FALLBACK_STYLE;
    let map: maplibregl.Map;
    // Computers without 3D graphics (WebGL) cannot draw the map; say so instead of breaking the page.
    try { map = new maplibregl.Map({ container: ref.current, style, bounds: TIGRAY_BOUNDS, fitBoundsOptions: { padding: 24 }, attributionControl: false, interactive, cooperativeGestures: false }); } catch { setUnsupported(true); return; }
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    if (interactive) { map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right'); map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left'); }
    let fellBack = false;
    map.on('error', (e) => { if (!fellBack && String((e as { error?: Error }).error?.message ?? '').match(/style|fetch|Failed/i)) { fellBack = true; map.setStyle(FALLBACK_STYLE); } });
    map.on('load', () => setReady(true));
    mapRef.current = map;
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(ref.current);
    return () => { ro.disconnect(); map.remove(); mapRef.current = null; };
  }, [interactive]);

  // Sources & layers
  React.useEffect(() => {
    const map = mapRef.current; if (!map || !ready) return;
    const ensure = (id: string, data: GeoJSON.FeatureCollection, cluster = false) => {
      const src = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
      if (src) src.setData(data); else map.addSource(id, { type: 'geojson', data, promoteId: 'id', ...(cluster ? { cluster: true, clusterRadius: 36, clusterMaxZoom: 8 } : {}) });
    };
    const draw = () => {
      if (!map.isStyleLoaded()) return;
      ensure('boundaries', boundaryData); ensure('weredas', weredaData); ensure('projects', projectData, true); ensure('facilities', facilityData); ensure('evidence', evidenceData);
      const firstSymbol = map.getStyle().layers?.find((l) => l.type === 'symbol')?.id;
      const add = (layer: maplibregl.LayerSpecification, before?: string) => { if (!map.getLayer(layer.id)) map.addLayer(layer, before); };
      add({ id: 'boundary-fill', type: 'fill', source: 'boundaries', paint: { 'fill-color': palette.seq450, 'fill-opacity': 0.06 } }, firstSymbol);
      add({ id: 'boundary-line', type: 'line', source: 'boundaries', paint: { 'line-color': palette.seq650, 'line-width': 1, 'line-opacity': 0.6 } }, firstSymbol);
      add({ id: 'boundary-label', type: 'symbol', source: 'boundaries', minzoom: 7, layout: { 'text-field': ['get', 'name'], 'text-size': 11, 'text-font': ['Noto Sans Regular'] }, paint: { 'text-color': palette.text, 'text-halo-color': palette.halo, 'text-halo-width': 1 } });
      add({ id: 'wereda-circles', type: 'circle', source: 'weredas', paint: { 'circle-radius': ['interpolate', ['linear'], ['get', 'value'], 0, 4, 8, 22], 'circle-color': palette.seq450, 'circle-opacity': 0.18, 'circle-stroke-color': palette.seq650, 'circle-stroke-width': 1 } });
      add({ id: 'wereda-labels', type: 'symbol', source: 'weredas', minzoom: 7.5, layout: { 'text-field': ['get', 'name'], 'text-size': 11, 'text-offset': [0, 1.4], 'text-anchor': 'top', 'text-font': ['Noto Sans Regular'] }, paint: { 'text-color': palette.text, 'text-halo-color': palette.halo, 'text-halo-width': 1 } });
      add({ id: 'facility-points', type: 'circle', source: 'facilities', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 3.5, 10, 7], 'circle-color': ['get', 'color'], 'circle-opacity': 0.9, 'circle-stroke-color': palette.stroke, 'circle-stroke-width': 1 } });
      add({ id: 'project-clusters', type: 'circle', source: 'projects', filter: ['has', 'point_count'], paint: { 'circle-radius': ['step', ['get', 'point_count'], 16, 5, 20, 15, 26], 'circle-color': palette.seq650, 'circle-opacity': 0.85, 'circle-stroke-color': palette.stroke, 'circle-stroke-width': 2 } });
      add({ id: 'project-cluster-count', type: 'symbol', source: 'projects', filter: ['has', 'point_count'], layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12, 'text-font': ['Noto Sans Regular'] }, paint: { 'text-color': '#ffffff' } });
      const radius: ExpressionSpecification = ['interpolate', ['linear'], ['get', 'budgetM'], 0, 6, 200, 10, 1600, 16];
      add({ id: 'project-points', type: 'circle', source: 'projects', filter: ['!', ['has', 'point_count']], paint: { 'circle-radius': radius, 'circle-color': ['get', 'color'], 'circle-opacity': 0.88, 'circle-stroke-color': palette.stroke, 'circle-stroke-width': 1.5 } });
      add({ id: 'project-labels', type: 'symbol', source: 'projects', minzoom: 9, filter: ['!', ['has', 'point_count']], layout: { 'text-field': ['get', 'code'], 'text-size': 10, 'text-offset': [0, 1.5], 'text-anchor': 'top', 'text-font': ['Noto Sans Regular'] }, paint: { 'text-color': palette.text, 'text-halo-color': palette.halo, 'text-halo-width': 1 } });
      add({ id: 'evidence-points', type: 'circle', source: 'evidence', paint: { 'circle-radius': ['case', ['==', ['get', 'kind'], 'INSPECTION'], 6, 3.5], 'circle-color': ['get', 'color'], 'circle-opacity': 0.95, 'circle-stroke-color': palette.stroke, 'circle-stroke-width': 1.5 } });
      add({ id: 'selected-ring', type: 'circle', source: 'projects', filter: ['==', ['get', 'id'], -1], paint: { 'circle-radius': 18, 'circle-color': 'transparent', 'circle-stroke-color': palette.fill, 'circle-stroke-width': 3 } });
      add({ id: 'selected-ring-f', type: 'circle', source: 'facilities', filter: ['==', ['get', 'id'], -1], paint: { 'circle-radius': 14, 'circle-color': 'transparent', 'circle-stroke-color': palette.fill, 'circle-stroke-width': 3 } });
      // repaint theme-dependent colours
      map.setPaintProperty('boundary-fill', 'fill-color', palette.seq450); map.setPaintProperty('boundary-line', 'line-color', palette.seq650);
      map.setPaintProperty('wereda-circles', 'circle-color', palette.seq450); map.setPaintProperty('wereda-circles', 'circle-stroke-color', palette.seq650);
      map.setPaintProperty('project-clusters', 'circle-color', palette.seq650); map.setPaintProperty('project-points', 'circle-stroke-color', palette.stroke); map.setPaintProperty('facility-points', 'circle-stroke-color', palette.stroke);
      map.setPaintProperty('selected-ring', 'circle-stroke-color', palette.fill); map.setPaintProperty('selected-ring-f', 'circle-stroke-color', palette.fill);
      for (const id of ['boundary-label', 'wereda-labels', 'project-labels']) { map.setPaintProperty(id, 'text-color', palette.text); map.setPaintProperty(id, 'text-halo-color', palette.halo); }
      // visibility
      const vis = (ids: string[], on: boolean) => ids.forEach((id) => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'));
      vis(['boundary-fill', 'boundary-line', 'boundary-label'], layers.boundaries); vis(['wereda-circles', 'wereda-labels'], layers.weredas);
      vis(['project-clusters', 'project-cluster-count', 'project-points', 'project-labels', 'selected-ring'], layers.projects); vis(['facility-points', 'selected-ring-f'], layers.facilities); vis(['evidence-points'], layers.evidence);
    };
    draw();
    map.on('styledata', draw);
    return () => { map.off('styledata', draw); };
  }, [ready, projectData, facilityData, evidenceData, weredaData, boundaryData, layers, palette]);

  // Interaction
  React.useEffect(() => {
    const map = mapRef.current; if (!map || !ready || !interactive) return;
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12, maxWidth: '280px' });
    const enter = () => { map.getCanvas().style.cursor = 'pointer'; };
    const leave = () => { map.getCanvas().style.cursor = ''; popup.remove(); };
    const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
    const hoverProject = (e: maplibregl.MapLayerMouseEvent) => {
      const p = e.features?.[0]?.properties as unknown as ProjectFeatureProps | undefined; if (!p) return; enter();
      popup.setLngLat(e.lngLat).setHTML(`<div style="font-weight:600">${esc(p.name)}</div><div style="opacity:.7;font-size:11px">${esc(p.code)} · ${esc(p.wereda)}</div><div style="margin-top:4px;font-size:12px">${te(`health.${p.health}` as 'health.ON_TRACK')} · ${pct(Number(p.physicalPct))} / ${pct(Number(p.plannedPct))} · ${money(Number(p.budgetEtb), locale)}${p.riskScore !== null && p.riskScore !== undefined ? ` · ${t('legend.risk')} ${p.riskScore}` : ''}</div>`).addTo(map);
    };
    const hoverFacility = (e: maplibregl.MapLayerMouseEvent) => {
      const p = e.features?.[0]?.properties as unknown as FacilityFeatureProps | undefined; if (!p) return; enter();
      popup.setLngLat(e.lngLat).setHTML(`<div style="font-weight:600">${esc(p.name)}</div><div style="opacity:.7;font-size:11px">${te(`facilityType.${p.facilityType}` as 'facilityType.FACTORY')} · ${esc(p.wereda)}</div><div style="margin-top:4px;font-size:12px">${p.severity ? te(`severity.${p.severity}` as 'severity.SEVERE') : '—'} · ${te(`operational.${p.operationalStatus}` as 'operational.FUNCTIONAL')}${Number(p.projects) === 0 && p.unaddressed ? ` · <b>${t('unaddressedOnly').split(' ')[0]}</b>` : ''}</div>`).addTo(map);
    };
    const hoverEvidence = (e: maplibregl.MapLayerMouseEvent) => {
      const p = e.features?.[0]?.properties as unknown as EvidenceFeatureProps | undefined; if (!p) return; enter();
      popup.setLngLat(e.lngLat).setHTML(`<div style="font-weight:600">${esc(p.subject ?? '')}</div><div style="opacity:.7;font-size:11px">${esc(p.type)} · ${esc(p.who ?? '')} · ${esc(String(p.at ?? '').slice(0, 10))}</div><div style="margin-top:4px;font-size:12px">${te(`verification.${p.verificationStatus}` as 'verification.VERIFIED')}</div>`).addTo(map);
    };
    const hoverWereda = (e: maplibregl.MapLayerMouseEvent) => { const p = e.features?.[0]?.properties as Record<string, unknown> | undefined; if (!p) return; enter(); popup.setLngLat(e.lngLat).setHTML(`<div style="font-weight:600">${esc(p.name)}</div><div style="opacity:.7;font-size:11px">${esc(p.zone)} · ${p.projectsTotal} projects · ${p.facilitiesTotal} facilities</div>`).addTo(map); };
    const clickProject = (e: maplibregl.MapLayerMouseEvent) => { const f = e.features?.[0]; if (!f) return; onSelectRef.current?.({ kind: 'PROJECT', id: Number(f.id), props: f.properties as unknown as ProjectFeatureProps }); };
    const clickFacility = (e: maplibregl.MapLayerMouseEvent) => { const f = e.features?.[0]; if (!f) return; onSelectRef.current?.({ kind: 'FACILITY', id: Number(f.id), props: f.properties as unknown as FacilityFeatureProps }); };
    const clickEvidence = (e: maplibregl.MapLayerMouseEvent) => { const f = e.features?.[0]; if (!f) return; onSelectRef.current?.({ kind: 'EVIDENCE', id: String(f.id), props: f.properties as unknown as EvidenceFeatureProps }); };
    const clickCluster = (e: maplibregl.MapLayerMouseEvent) => {
      const f = e.features?.[0]; if (!f) return;
      const src = map.getSource('projects') as maplibregl.GeoJSONSource;
      src.getClusterExpansionZoom(Number(f.properties?.cluster_id)).then((z) => map.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom: z + 0.5 })).catch(() => undefined);
    };
    const clickBlank = (e: maplibregl.MapMouseEvent) => { const hits = map.queryRenderedFeatures(e.point, { layers: ['project-points', 'facility-points', 'evidence-points', 'project-clusters'].filter((l) => map.getLayer(l)) }); if (!hits.length) onSelectRef.current?.(null); };
    const bind = (layer: string, hover: (e: maplibregl.MapLayerMouseEvent) => void, click?: (e: maplibregl.MapLayerMouseEvent) => void) => { map.on('mousemove', layer, hover); map.on('mouseleave', layer, leave); if (click) map.on('click', layer, click); };
    bind('project-points', hoverProject, clickProject); bind('facility-points', hoverFacility, clickFacility); bind('evidence-points', hoverEvidence, clickEvidence); bind('wereda-circles', hoverWereda); bind('project-clusters', () => enter(), clickCluster);
    map.on('click', clickBlank);
    return () => {
      popup.remove();
      map.off('mousemove', 'project-points', hoverProject); map.off('mousemove', 'facility-points', hoverFacility); map.off('mousemove', 'evidence-points', hoverEvidence); map.off('mousemove', 'wereda-circles', hoverWereda);
      for (const l of ['project-points', 'facility-points', 'evidence-points', 'wereda-circles', 'project-clusters']) map.off('mouseleave', l, leave);
      map.off('click', 'project-points', clickProject); map.off('click', 'facility-points', clickFacility); map.off('click', 'evidence-points', clickEvidence); map.off('click', 'project-clusters', clickCluster); map.off('click', clickBlank);
    };
  }, [ready, interactive, locale, t, te]);

  // Selection ring
  React.useEffect(() => {
    const map = mapRef.current; if (!map || !ready || !map.getLayer('selected-ring')) return;
    map.setFilter('selected-ring', ['==', ['get', 'id'], selected?.kind === 'PROJECT' ? selected.id : -1]);
    map.setFilter('selected-ring-f', ['==', ['get', 'id'], selected?.kind === 'FACILITY' ? selected.id : -1]);
  }, [selected, ready]);

  // Focus / fit
  React.useEffect(() => {
    const map = mapRef.current; if (!map || !ready) return;
    if (focus) { map.easeTo({ center: [focus.lng, focus.lat], zoom: focus.zoom ?? 12, duration: 600 }); return; }
    if (fitTo === 'data') {
      const pts = [...projectData.features, ...facilityData.features, ...evidenceData.features].map((f) => (f.geometry as GeoJSON.Point).coordinates as [number, number]);
      if (pts.length) { const b = pts.reduce((bb, c) => bb.extend(c), new maplibregl.LngLatBounds(pts[0], pts[0])); map.fitBounds(b, { padding: 48, maxZoom: 14, duration: 500 }); }
    }
  }, [focus, fitTo, ready, projectData, facilityData, evidenceData]);

  return (
    <div className={`relative overflow-hidden rounded-md border ${className ?? ''}`} style={{ height }}>
      {unsupported && <div className="absolute inset-0 z-10 flex items-center justify-center bg-muted p-6 text-center text-sm text-muted-foreground">{t('unsupported')}</div>}
      <div ref={ref} className="h-full w-full" role="application" aria-label={t('title')} />
    </div>
  );
}

/** Executive-friendly legend for the active colour modes. Always pairs colour with text. */
export function MapLegend({ layers, projectColor, facilityColor, hasBoundaries }: { layers: MapLayers; projectColor: ProjectColorMode; facilityColor: FacilityColorMode; hasBoundaries: boolean }) {
  const t = useTranslations('map');
  const te = useTranslations('enums');
  const p = readPalette();
  const Row = ({ color, label }: { color: string; label: string }) => <li className="flex items-center gap-2"><span aria-hidden className="h-2.5 w-2.5 rounded-full shrink-0 border border-card" style={{ background: color }} />{label}</li>;
  return (
    <div className="space-y-3 text-xs">
      {layers.projects && (
        <div>
          <div className="mb-1 font-semibold text-foreground">{projectColor === 'health' ? t('legend.health') : projectColor === 'risk' ? t('legend.risk') : projectColor === 'progress' ? te('facilityType.FACTORY') && 'Progress' : 'Sector'}</div>
          <ul className="space-y-1 text-muted-foreground">
            {projectColor === 'health' && (['ON_TRACK', 'AT_RISK', 'DELAYED', 'STALLED', 'COMPLETED', 'NOT_STARTED'] as const).map((h) => <Row key={h} color={healthColor(p, h)} label={te(`health.${h}`)} />)}
            {projectColor === 'risk' && <><Row color={p.good} label={t('riskLegend.low')} /><Row color={p.warning} label={t('riskLegend.moderate')} /><Row color={p.serious} label={t('riskLegend.high')} /><Row color={p.critical} label={t('riskLegend.critical')} /></>}
            {projectColor === 'progress' && <><Row color={p.seq250} label="0–34%" /><Row color={p.seq450} label="35–74%" /><Row color={p.seq650} label="≥ 75%" /></>}
            {projectColor === 'sector' && (['EDUCATION', 'HEALTH', 'MANUFACTURING', 'AGRICULTURE'] as const).map((s) => <Row key={s} color={p.sector[s]} label={te(`sector.${s}`)} />)}
          </ul>
          <div className="mt-1 text-2xs text-muted-foreground">{t('legend.size')}</div>
        </div>
      )}
      {layers.facilities && (
        <div>
          <div className="mb-1 font-semibold text-foreground">{facilityColor === 'severity' ? t('legend.severity') : facilityColor === 'operational' ? te('operational.FUNCTIONAL') && 'Operational status' : 'Sector'}</div>
          <ul className="space-y-1 text-muted-foreground">
            {facilityColor === 'severity' && (['DESTROYED', 'SEVERE', 'MODERATE', 'MINOR', 'NONE'] as const).map((s) => <Row key={s} color={severityColor(p, s)} label={te(`severity.${s}`)} />)}
            {facilityColor === 'operational' && (['NON_FUNCTIONAL', 'PARTIALLY_FUNCTIONAL', 'FUNCTIONAL'] as const).map((s) => <Row key={s} color={operationalColor(p, s)} label={te(`operational.${s}`)} />)}
            {facilityColor === 'sector' && (['EDUCATION', 'HEALTH', 'MANUFACTURING', 'AGRICULTURE'] as const).map((s) => <Row key={s} color={p.sector[s]} label={te(`sector.${s}`)} />)}
          </ul>
        </div>
      )}
      {layers.evidence && (
        <div>
          <div className="mb-1 font-semibold text-foreground">{t('legend.evidence')}</div>
          <ul className="space-y-1 text-muted-foreground">{(['VERIFIED', 'UNVERIFIED', 'DISPUTED', 'REJECTED'] as const).map((s) => <Row key={s} color={verificationColor(p, s)} label={te(`verification.${s}`)} />)}</ul>
        </div>
      )}
      {layers.boundaries && !hasBoundaries && <p className="text-2xs text-muted-foreground">{t('noBoundaries')}</p>}
    </div>
  );
}
