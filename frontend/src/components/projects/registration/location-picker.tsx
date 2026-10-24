'use client';
import * as React from 'react';
import maplibregl, { type Map as MlMap, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { WeredaMetrics } from '@/lib/api/types';
import { readPalette } from '@/components/map/map-tokens';
import { BOUNDS } from './model';

const FALLBACK_STYLE: StyleSpecification = { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#e9eef4' } }] };

/**
 * Click-to-place site picker. Wereda centres are drawn for orientation (the selected one emphasised);
 * the marker is draggable. Clicking the map reports the point and the nearest wereda, so the caller can
 * fill an empty wereda from the click.
 */
export function LocationPicker({ weredas, weredaId, lat, lng, onPick, height = 340 }: {
  weredas: WeredaMetrics[]; weredaId: number | null; lat: number | null; lng: number | null;
  onPick: (p: { lat: number; lng: number; nearestWeredaId: number | null }) => void; height?: number;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<MlMap | null>(null);
  const markerRef = React.useRef<maplibregl.Marker | null>(null);
  const [ready, setReady] = React.useState(false);
  const onPickRef = React.useRef(onPick);
  onPickRef.current = onPick;
  const weredasRef = React.useRef(weredas);
  weredasRef.current = weredas;

  const nearest = (la: number, ln: number) => {
    let best: number | null = null, d = Infinity;
    for (const w of weredasRef.current) { const dd = (w.centroid.lat - la) ** 2 + (w.centroid.lng - ln) ** 2; if (dd < d) { d = dd; best = w.id; } }
    return best;
  };

  React.useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = new maplibregl.Map({ container: ref.current, style: process.env.NEXT_PUBLIC_MAP_STYLE_URL || FALLBACK_STYLE, bounds: [[BOUNDS.lngMin, BOUNDS.latMin], [BOUNDS.lngMax, BOUNDS.latMax]], fitBoundsOptions: { padding: 16 }, attributionControl: false });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    let fellBack = false;
    map.on('error', (e) => { if (!fellBack && String((e as { error?: Error }).error?.message ?? '').match(/style|fetch|Failed/i)) { fellBack = true; map.setStyle(FALLBACK_STYLE); } });
    map.on('load', () => setReady(true));
    map.on('click', (e) => {
      const p = { lat: Math.round(e.lngLat.lat * 1e5) / 1e5, lng: Math.round(e.lngLat.lng * 1e5) / 1e5 };
      onPickRef.current({ ...p, nearestWeredaId: nearest(p.lat, p.lng) });
    });
    map.getCanvas().style.cursor = 'crosshair';
    mapRef.current = map;
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(ref.current);
    return () => { ro.disconnect(); map.remove(); mapRef.current = null; markerRef.current = null; };
  }, []);

  // Wereda centres
  React.useEffect(() => {
    const map = mapRef.current; if (!map || !ready) return;
    const pal = readPalette();
    const data: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: weredas.map((w) => ({ type: 'Feature', id: w.id, geometry: { type: 'Point', coordinates: [w.centroid.lng, w.centroid.lat] }, properties: { name: w.name.en, sel: w.id === weredaId ? 1 : 0 } })) };
    const src = map.getSource('weredas') as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(data);
    else {
      map.addSource('weredas', { type: 'geojson', data });
      map.addLayer({ id: 'weredas', type: 'circle', source: 'weredas', paint: { 'circle-radius': ['case', ['==', ['get', 'sel'], 1], 7, 3.5], 'circle-color': ['case', ['==', ['get', 'sel'], 1], pal.seq450, pal.neutral], 'circle-opacity': ['case', ['==', ['get', 'sel'], 1], 0.9, 0.55], 'circle-stroke-color': pal.stroke, 'circle-stroke-width': 1 } });
      map.addLayer({ id: 'wereda-labels', type: 'symbol', source: 'weredas', filter: ['==', ['get', 'sel'], 1], layout: { 'text-field': ['get', 'name'], 'text-size': 11, 'text-offset': [0, 1.2], 'text-anchor': 'top' }, paint: { 'text-color': pal.text, 'text-halo-color': pal.halo, 'text-halo-width': 1.2 } });
    }
    const w = weredas.find((x) => x.id === weredaId);
    if (w && (lat === null || lng === null)) map.easeTo({ center: [w.centroid.lng, w.centroid.lat], zoom: Math.max(map.getZoom(), 8.5), duration: 500 });
  }, [weredas, weredaId, ready, lat, lng]);

  // Site marker
  React.useEffect(() => {
    const map = mapRef.current; if (!map) return;
    if (lat === null || lng === null || !Number.isFinite(lat) || !Number.isFinite(lng)) { markerRef.current?.remove(); markerRef.current = null; return; }
    if (!markerRef.current) {
      const m = new maplibregl.Marker({ draggable: true, color: readPalette().critical }).setLngLat([lng, lat]).addTo(map);
      m.on('dragend', () => { const p = m.getLngLat(); const la = Math.round(p.lat * 1e5) / 1e5, ln = Math.round(p.lng * 1e5) / 1e5; onPickRef.current({ lat: la, lng: ln, nearestWeredaId: nearest(la, ln) }); });
      markerRef.current = m;
    } else markerRef.current.setLngLat([lng, lat]);
  }, [lat, lng]);

  return <div ref={ref} className="w-full overflow-hidden rounded-md border" style={{ height }} role="application" aria-label="Project site map: click to place the site, drag the marker to adjust" />;
}
