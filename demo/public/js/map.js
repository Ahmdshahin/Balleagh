// MapLibre setup shared by ops / unit / governor / citizen pages.
/* global maplibregl */
import { STATUS_COLOR, PRIORITY_COLOR, BAND_COLOR } from './common.js';

export const FAYOUM_CENTER = [30.80, 29.33];

export function createMap(container, { zoom = 9.6, center = FAYOUM_CENTER, interactive = true } = {}) {
  const map = new maplibregl.Map({
    container, center, zoom, interactive, attributionControl: { compact: true },
    style: {
      version: 8,
      sources: {
        osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19, attribution: '© OpenStreetMap contributors' },
        sat: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 19, attribution: 'Imagery © Esri (demo only)' },
      },
      layers: [
        { id: 'osm', type: 'raster', source: 'osm' },
        { id: 'sat', type: 'raster', source: 'sat', layout: { visibility: 'none' } },
      ],
    },
  });
  if (interactive) map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
  return map;
}

export function setBase(map, base) {
  map.setLayoutProperty('osm', 'visibility', base === 'osm' ? 'visible' : 'none');
  map.setLayoutProperty('sat', 'visibility', base === 'sat' ? 'visible' : 'none');
}

const match = (prop, colors, fallback = '#64748B') => ['match', ['get', prop], ...Object.entries(colors).flat(), fallback];

// Local-unit polygons coloured by performance band
export function addUnits(map, unitsFC, { fill = true } = {}) {
  map.addSource('units', { type: 'geojson', data: unitsFC, promoteId: 'id' });
  map.addLayer({ id: 'units-fill', type: 'fill', source: 'units', layout: { visibility: fill ? 'visible' : 'none' },
    paint: { 'fill-color': match('band', BAND_COLOR, '#94A3B8'), 'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.5, ['==', ['get', 'band'], 'poor'], 0.38, 0.28] } });
  map.addLayer({ id: 'units-line', type: 'line', source: 'units',
    paint: { 'line-color': ['case', ['==', ['get', 'band'], 'poor'], '#B91C1C', '#135F2B'], 'line-width': ['case', ['==', ['get', 'band'], 'poor'], 2.2, 1], 'line-opacity': 0.7 } });
}

// Report points + heatmap
export function addReports(map, fc) {
  map.addSource('reports', { type: 'geojson', data: fc });
  map.addLayer({ id: 'heat', type: 'heatmap', source: 'reports', layout: { visibility: 'none' },
    paint: {
      'heatmap-weight': ['match', ['get', 'priority'], 'CRITICAL', 1, 'URGENT', 0.8, 'NORMAL', 0.5, 0.3],
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 8, 1, 14, 3],
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 8, 14, 14, 40],
      'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(254,243,199,0)', 0.2, '#FEF3C7', 0.45, '#F4A21D', 0.7, '#EA580C', 1, '#B91C1C'],
      'heatmap-opacity': 0.85,
    } });
  map.addLayer({ id: 'pts-halo', type: 'circle', source: 'reports', filter: ['==', ['get', 'priority'], 'CRITICAL'],
    paint: { 'circle-radius': 13, 'circle-color': '#DC2626', 'circle-opacity': 0.18 } });
  map.addLayer({ id: 'pts', type: 'circle', source: 'reports',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, ['+', 3, ['min', ['get', 'dup'], 4]], 14, ['+', 7, ['min', ['get', 'dup'], 6]]],
      'circle-color': match('status', STATUS_COLOR),
      'circle-stroke-color': '#fff', 'circle-stroke-width': 1.2,
    } });
}

export function colorPointsBy(map, mode) {
  map.setPaintProperty('pts', 'circle-color', mode === 'priority' ? match('priority', PRIORITY_COLOR) : match('status', STATUS_COLOR));
}

export function reportsToFC(list) {
  return { type: 'FeatureCollection', features: list.map(r => ({ type: 'Feature', geometry: { type: 'Point', coordinates: r.location }, properties: { id: r.id, status: r.status, priority: r.priority, category: r.category, dup: r.duplicateCount || 0 } })) };
}

export function hoverUnits(map, onEnter) {
  let hovered = null;
  const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8 });
  map.on('mousemove', 'units-fill', e => {
    const f = e.features[0];
    if (hovered !== null) map.setFeatureState({ source: 'units', id: hovered }, { hover: false });
    hovered = f.id; map.setFeatureState({ source: 'units', id: hovered }, { hover: true });
    popup.setLngLat(e.lngLat).setHTML(onEnter(f.properties)).addTo(map);
  });
  map.on('mouseleave', 'units-fill', () => { if (hovered !== null) map.setFeatureState({ source: 'units', id: hovered }, { hover: false }); hovered = null; popup.remove(); });
}

// Resolve once the style is usable (doesn't wait for tiles/first render — works in background tabs too)
export function mapReady(map) {
  return new Promise(r => { if (map.isStyleLoaded()) r(); else { map.once('style.load', r); map.once('load', r); } });
}
