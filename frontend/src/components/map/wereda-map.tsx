'use client';
import * as React from 'react';
import maplibregl, { type Map as MlMap, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import type { WeredaMetrics } from '@/lib/api/types';
import { localizedName, money, num, pct } from '@/lib/format';

export type MapMetric = 'projectsDelayed' | 'facilitiesSevere' | 'avgProgressPct' | 'openAlerts' | 'budgetEtb' | 'avgImpactScore';

const TIGRAY_BOUNDS: [[number, number], [number, number]] = [[36.3, 12.2], [40.1, 14.9]];
/** Offline-safe fallback when the vector style cannot be fetched (executive office without internet). */
const FALLBACK_STYLE: StyleSpecification = { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#e9eef4' } }] };

/**
 * Proportional-symbol map of wereda indicators. Uses official boundary polygons when the backend
 * supplies them; until then centroid circles (no synthetic boundaries are drawn).
 */
export function WeredaMap({ weredas, metric, height = 420, focusId, interactive = true }: { weredas: WeredaMetrics[]; metric: MapMetric; height?: number; focusId?: number; interactive?: boolean }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<MlMap | null>(null);
  const [ready, setReady] = React.useState(false);
  const locale = useLocale();
  const t = useTranslations('dashboard.metric');
  const tg = useTranslations('geo');
  const router = useRouter();
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

  const geojson = React.useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: weredas.map((w) => ({
      type: 'Feature' as const, id: w.id,
      geometry: { type: 'Point' as const, coordinates: [w.centroid.lng, w.centroid.lat] },
      properties: { id: w.id, name: localizedName(w.name, locale), zone: localizedName(w.zoneName, locale), value: Number(w[metric] ?? 0), projectsDelayed: w.projectsDelayed, facilitiesSevere: w.facilitiesSevere, avgProgressPct: w.avgProgressPct ?? 0, openAlerts: w.openAlerts, criticalAlerts: w.criticalAlerts, budgetEtb: w.budgetEtb, projectsTotal: w.projectsTotal, facilitiesTotal: w.facilitiesTotal, avgImpactScore: w.avgImpactScore ?? 0 },
    })),
  }), [weredas, metric, locale]);

  const max = React.useMemo(() => Math.max(1, ...geojson.features.map((f) => f.properties.value)), [geojson]);
  const inverse = metric === 'avgProgressPct'; // high progress is good → lighter colour

  React.useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const style = process.env.NEXT_PUBLIC_MAP_STYLE_URL || FALLBACK_STYLE;
    const map = new maplibregl.Map({ container: ref.current, style, bounds: TIGRAY_BOUNDS, fitBoundsOptions: { padding: 24 }, attributionControl: false, interactive, cooperativeGestures: interactive });
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    if (interactive) map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    let fellBack = false;
    map.on('error', (e) => {
      // Style/tile fetch failures (offline): continue with a neutral background so symbols still render.
      if (!fellBack && String((e as { error?: Error }).error?.message ?? '').match(/style|fetch|Failed/i)) { fellBack = true; map.setStyle(FALLBACK_STYLE); }
    });
    map.on('load', () => setReady(true));
    map.on('style.load', () => setReady((r) => (r ? r : r)));
    mapRef.current = map;
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(ref.current);
    return () => { ro.disconnect(); map.remove(); mapRef.current = null; };
  }, [interactive]);

  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const draw = () => {
      if (!map.isStyleLoaded()) return;
      const src = map.getSource('weredas') as maplibregl.GeoJSONSource | undefined;
      if (src) src.setData(geojson as GeoJSON.FeatureCollection);
      else map.addSource('weredas', { type: 'geojson', data: geojson as GeoJSON.FeatureCollection, promoteId: 'id' });
      const radius: maplibregl.ExpressionSpecification = ['interpolate', ['linear'], ['get', 'value'], 0, 5, max, 26];
      const strong = isDark ? '#9ec5f4' : '#104281';
      const weak = isDark ? '#184f95' : '#86b6ef';
      const color: maplibregl.ExpressionSpecification = inverse
        ? ['interpolate', ['linear'], ['get', 'value'], 0, strong, 100, weak]
        : ['interpolate', ['linear'], ['get', 'value'], 0, weak, max, strong];
      if (!map.getLayer('wereda-circles')) {
        map.addLayer({ id: 'wereda-circles', type: 'circle', source: 'weredas', paint: { 'circle-radius': radius, 'circle-color': color, 'circle-opacity': 0.75, 'circle-stroke-color': isDark ? '#0b1220' : '#ffffff', 'circle-stroke-width': 1.5 } });
        map.addLayer({ id: 'wereda-labels', type: 'symbol', source: 'weredas', minzoom: 7, layout: { 'text-field': ['get', 'name'], 'text-size': 11, 'text-offset': [0, 1.6], 'text-anchor': 'top', 'text-font': ['Noto Sans Regular'] }, paint: { 'text-color': isDark ? '#e5e7eb' : '#1f2937', 'text-halo-color': isDark ? '#0b1220' : '#ffffff', 'text-halo-width': 1 } });
        if (interactive) {
          const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
          map.on('mousemove', 'wereda-circles', (e) => {
            const f = e.features?.[0]; if (!f) return;
            map.getCanvas().style.cursor = 'pointer';
            const p = f.properties as Record<string, string | number>;
            popup.setLngLat(e.lngLat).setHTML(
              `<div style="font-weight:600">${p.name}</div><div style="opacity:.7;font-size:11px">${p.zone}</div>` +
              `<div style="margin-top:4px">${t(metric)}: <b>${metric === 'budgetEtb' ? money(Number(p.budgetEtb), locale) : metric === 'avgProgressPct' ? pct(Number(p.avgProgressPct)) : num(Number(p.value), locale, 1)}</b></div>` +
              `<div style="font-size:11px;opacity:.8">${p.projectsTotal} projects · ${p.facilitiesTotal} facilities · ${p.openAlerts} alerts</div>`).addTo(map);
          });
          map.on('mouseleave', 'wereda-circles', () => { map.getCanvas().style.cursor = ''; popup.remove(); });
          map.on('click', 'wereda-circles', (e) => { const id = e.features?.[0]?.properties?.id; if (id) router.push(`/weredas/${id}`); });
        }
      } else {
        map.setPaintProperty('wereda-circles', 'circle-radius', radius);
        map.setPaintProperty('wereda-circles', 'circle-color', color);
      }
    };
    draw();
    map.on('styledata', draw);
    return () => { map.off('styledata', draw); };
  }, [geojson, max, inverse, ready, isDark, interactive, metric, locale, router, t]);

  React.useEffect(() => {
    const map = mapRef.current; if (!map || !focusId) return;
    const w = weredas.find((x) => x.id === focusId);
    if (w) map.flyTo({ center: [w.centroid.lng, w.centroid.lat], zoom: 9, duration: 600 });
  }, [focusId, weredas, ready]);

  return (
    <div className="relative overflow-hidden rounded-md border" style={{ height }}>
      <div ref={ref} className="h-full w-full" role="application" aria-label={tg('title')} />
      <div className="pointer-events-none absolute bottom-2 left-2 rounded-md border bg-card/90 px-2 py-1 text-2xs text-muted-foreground backdrop-blur">
        <span className="font-medium text-foreground">{t(metric)}</span> · <span>{tg('noBoundary')}</span>
      </div>
    </div>
  );
}
