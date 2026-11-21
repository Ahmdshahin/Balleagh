// Fayoum geography from the official GDB (imported by scripts/import-gdb.mjs into demo/geo/).
//   border.geojson    governorate boundary
//   centers.geojson   أقسام ومراكز (Sec_Code)
//   villages.geojson  شياخات وقرى (Ssec_Code_1) — 2399 = desert hinterland, no local unit
//   units-mapping.csv village → local unit (edit to group several villages under one unit)
// Local-unit polygons = union of their villages, until the official unit boundaries arrive.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as turf from '@turf/turf';
import { cleanName } from './names.js';

const GEO_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'geo');
const DESERT = '2399';
const readJson = f => JSON.parse(fs.readFileSync(path.join(GEO_DIR, f), 'utf8'));

function readMapping() {
  const txt = fs.readFileSync(path.join(GEO_DIR, 'units-mapping.csv'), 'utf8').replace(/^﻿/, '');
  const [head, ...lines] = txt.trim().split(/\r?\n/);
  const cols = head.split(',');
  const split = l => (l.match(/("([^"]|"")*"|[^,]*)(,|$)/g) || []).slice(0, cols.length).map(s => s.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"'));
  return Object.fromEntries(lines.filter(Boolean).map(l => { const r = Object.fromEntries(cols.map((c, i) => [c, split(l)[i]])); return [r.village_code, r]; }));
}

// Fast point-in-polygon with a bbox pre-check
function indexed(features) {
  return features.map(f => ({ f, bb: turf.bbox(f) }));
}
function hit(list, pt) {
  const [x, y] = pt.geometry.coordinates;
  for (const { f, bb } of list) if (x >= bb[0] && x <= bb[2] && y >= bb[1] && y <= bb[3] && turf.booleanPointInPolygon(pt, f)) return f;
  return null;
}

let cache = null;

export function buildGeo() {
  if (cache) return cache.public;
  const border = readJson('border.geojson').features[0];
  const centersRaw = readJson('centers.geojson').features;
  const villagesRaw = readJson('villages.geojson').features;
  const mapping = readMapping();

  const centerName = {};
  const centers = centersRaw.filter(f => f.properties.Sec_Code !== DESERT).map(f => {
    const id = f.properties.Sec_Code, name = cleanName(f.properties.Sec_Name_Ar);
    centerName[id] = name;
    return { type: 'Feature', geometry: f.geometry, properties: { id, name, nameEn: (f.properties.Sec_Name_En || '').replace(/\s+/g, ' ').trim(), population: f.properties['جمله_السكان'] || null } };
  });

  const desertParts = villagesRaw.filter(f => f.properties.Sec_Code === DESERT);
  const desert = desertParts.length > 1 ? turf.union(turf.featureCollection(desertParts)) : desertParts[0];
  const noUnitAreas = turf.featureCollection(desert ? [{ type: 'Feature', geometry: desert.geometry, properties: { name: 'الظهير الصحراوي (يتبع المحافظة)' } }] : []);

  const villages = [];
  for (const f of villagesRaw) {
    const p = f.properties, code = p.Ssec_Code_1;
    if (p.Sec_Code === DESERT) continue;
    const m = mapping[code];
    if (!m) { console.warn(`[geo] village ${code} missing from units-mapping.csv — skipped`); continue; }
    const pt = turf.pointOnFeature(f).geometry.coordinates;
    villages.push({
      type: 'Feature', geometry: f.geometry,
      properties: {
        id: code, name: m.village_name || cleanName(p['شياخه_قريه']), rawName: (p['شياخه_قريه'] || '').trim(),
        centerId: p.Sec_Code, unitId: m.unit_id, kind: m.type || (p['حضر_ريف'] === 'حضر' ? 'مدينة' : 'قرية'),
        population: p['جمله_السكان'] || null, households: p['عدد_الاسر'] || null, lng: +pt[0].toFixed(6), lat: +pt[1].toFixed(6),
      },
    });
  }

  const byUnit = {};
  for (const v of villages) (byUnit[v.properties.unitId] ||= []).push(v);
  const units = Object.entries(byUnit).map(([id, vs]) => {
    const geom = vs.length === 1 ? vs[0] : turf.union(turf.featureCollection(vs));
    const m = mapping[vs[0].properties.id];
    const centerId = vs[0].properties.centerId;
    return {
      type: 'Feature', geometry: geom.geometry,
      properties: { id, name: m.unit_name, centerId, centerName: centerName[centerId] || m.center_name, villages: vs.map(v => v.properties.name), population: vs.reduce((s, v) => s + (v.properties.population || 0), 0) },
    };
  }).sort((a, b) => a.properties.id.localeCompare(b.properties.id));

  const pub = {
    outline: { type: 'Feature', geometry: border.geometry, properties: {} },
    noUnitAreas,
    villages: turf.featureCollection(villages),
    units: turf.featureCollection(units),
    centers: turf.featureCollection(centers),
    bbox: turf.bbox(border),
    source: 'Fayoum.gdb (CAPMAS) — local-unit boundaries = union of villages until official boundaries arrive',
  };
  cache = { public: pub, idxVillages: indexed(villages), idxNoUnit: indexed(noUnitAreas.features), unitById: Object.fromEntries(units.map(u => [u.properties.id, u])) };
  return pub;
}

// Point → { inside, village, unit, center, noUnitArea }
export function locate(lng, lat) {
  buildGeo();
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return { inside: false };
  const p = turf.point([lng, lat]);
  if (!turf.booleanPointInPolygon(p, cache.public.outline)) return { inside: false };
  const area = hit(cache.idxNoUnit, p);
  if (area) return { inside: true, noUnitArea: area.properties.name };
  const v = hit(cache.idxVillages, p);
  if (!v) return { inside: true, noUnitArea: 'خارج نطاق الوحدات المحلية' };
  const u = cache.unitById[v.properties.unitId];
  return {
    inside: true,
    village: { id: v.properties.id, name: v.properties.name },
    unit: { id: u.properties.id, name: u.properties.name },
    center: { id: u.properties.centerId, name: u.properties.centerName },
  };
}

export function randomPointIn(feature, rand = Math.random) {
  const [minX, minY, maxX, maxY] = turf.bbox(feature);
  for (let i = 0; i < 300; i++) {
    const p = [minX + rand() * (maxX - minX), minY + rand() * (maxY - minY)];
    if (turf.booleanPointInPolygon(turf.point(p), feature)) return p;
  }
  return turf.pointOnFeature(feature).geometry.coordinates;
}

export function distanceM(a, b) {
  // equirectangular approximation — accurate to <0.5% at Fayoum's scale and much faster than turf.distance
  const R = 6371000, k = Math.PI / 180;
  const x = (b[0] - a[0]) * k * Math.cos((a[1] + b[1]) / 2 * k), y = (b[1] - a[1]) * k;
  return Math.sqrt(x * x + y * y) * R;
}
