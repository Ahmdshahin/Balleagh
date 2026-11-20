// Demo geography for Fayoum Governorate.
// Village points are APPROXIMATE and only for the demo. They will be replaced by the
// official GDB (centers + villages) and the official local-unit boundaries.
// Local-unit polygons are built the way the real system will build them before official
// boundaries arrive: Voronoi cell per village, then union of the villages each unit serves.
import { Delaunay } from 'd3-delaunay';
import * as turf from '@turf/turf';

export const CENTERS = [
  { id: 'F', ar: 'مركز الفيوم' },
  { id: 'S', ar: 'مركز سنورس' },
  { id: 'T', ar: 'مركز طامية' },
  { id: 'I', ar: 'مركز إطسا' },
  { id: 'A', ar: 'مركز أبشواي' },
  { id: 'Y', ar: 'مركز يوسف الصديق' },
];

// [village, center, unitId, unitName, lng, lat, kind]
const VILLAGES = [
  ['دمو', 'F', 'u01', 'الوحدة المحلية بدمو', 30.880, 29.340, 'قرية'],
  ['سنرو', 'F', 'u02', 'الوحدة المحلية بسنرو', 30.930, 29.330, 'قرية'],
  ['العزب', 'F', 'u03', 'الوحدة المحلية بالعزب', 30.860, 29.255, 'قرية'],
  ['الحادقة', 'F', 'u04', 'الوحدة المحلية بالحادقة', 30.800, 29.338, 'قرية'],
  ['حي شرق الفيوم', 'F', 'u05', 'حي شرق الفيوم', 30.852, 29.310, 'حي'],
  ['حي غرب الفيوم', 'F', 'u06', 'حي غرب الفيوم', 30.826, 29.303, 'حي'],
  ['سنهور', 'S', 'u07', 'الوحدة المحلية بسنهور', 30.950, 29.420, 'قرية'],
  ['جرفس', 'S', 'u07', 'الوحدة المحلية بسنهور', 30.905, 29.447, 'قرية'],
  ['بيهمو', 'S', 'u08', 'الوحدة المحلية ببيهمو', 30.858, 29.372, 'قرية'],
  ['فيديمين', 'S', 'u09', 'الوحدة المحلية بفيديمين', 30.952, 29.462, 'قرية'],
  ['مدينة سنورس', 'S', 'u10', 'مجلس مدينة سنورس', 30.880, 29.410, 'مدينة'],
  ['سرسنا', 'T', 'u11', 'الوحدة المحلية بسرسنا', 31.012, 29.488, 'قرية'],
  ['المظاطلي', 'T', 'u11', 'الوحدة المحلية بسرسنا', 30.995, 29.515, 'قرية'],
  ['فانوس', 'T', 'u12', 'الوحدة المحلية بفانوس', 31.005, 29.425, 'قرية'],
  ['قصر رشوان', 'T', 'u13', 'الوحدة المحلية بقصر رشوان', 30.925, 29.502, 'قرية'],
  ['مدينة طامية', 'T', 'u14', 'مجلس مدينة طامية', 30.960, 29.478, 'مدينة'],
  ['تطون', 'I', 'u15', 'الوحدة المحلية بتطون', 30.790, 29.188, 'قرية'],
  ['قلهانة', 'I', 'u16', 'الوحدة المحلية بقلهانة', 30.860, 29.200, 'قرية'],
  ['الغرق', 'I', 'u17', 'الوحدة المحلية بالغرق', 30.715, 29.148, 'قرية'],
  ['منية الحيط', 'I', 'u18', 'الوحدة المحلية بمنية الحيط', 30.905, 29.168, 'قرية'],
  ['مدينة إطسا', 'I', 'u19', 'مجلس مدينة إطسا', 30.792, 29.236, 'مدينة'],
  ['طبهار', 'A', 'u20', 'الوحدة المحلية بطبهار', 30.660, 29.330, 'قرية'],
  ['أبوكساه', 'A', 'u21', 'الوحدة المحلية بأبوكساه', 30.720, 29.412, 'قرية'],
  ['زاوية الكرادسة', 'A', 'u22', 'الوحدة المحلية بزاوية الكرادسة', 30.765, 29.372, 'قرية'],
  ['مدينة أبشواي', 'A', 'u23', 'مجلس مدينة أبشواي', 30.690, 29.370, 'مدينة'],
  ['قوته', 'Y', 'u24', 'الوحدة المحلية بقوته', 30.582, 29.332, 'قرية'],
  ['الشواشنة', 'Y', 'u24', 'الوحدة المحلية بقوته', 30.622, 29.288, 'قرية'],
  ['مدينة يوسف الصديق', 'Y', 'u25', 'مجلس مدينة يوسف الصديق', 30.545, 29.292, 'مدينة'],
];

// Rough governorate outline (agricultural depression) — demo only.
const OUTLINE = [[30.38, 29.14], [30.55, 29.10], [30.72, 29.07], [30.92, 29.09], [31.05, 29.17],
  [31.08, 29.40], [31.06, 29.54], [30.90, 29.57], [30.78, 29.52], [30.60, 29.52], [30.44, 29.49],
  [30.42, 29.36], [30.38, 29.14]];
// Areas not under any local unit → go to the governorate (ops queue).
const NO_UNIT_AREAS = [
  { name: 'بحيرة قارون', coords: [[30.48, 29.42], [30.56, 29.40], [30.66, 29.395], [30.76, 29.42], [30.80, 29.46], [30.72, 29.49], [30.58, 29.49], [30.48, 29.46], [30.48, 29.42]] },
  { name: 'محمية وادي الريان', coords: [[30.40, 29.16], [30.52, 29.12], [30.56, 29.20], [30.52, 29.26], [30.42, 29.25], [30.40, 29.16]] },
];

let cache = null;

export function buildGeo() {
  if (cache) return cache;
  const outline = turf.polygon([OUTLINE]);
  const holes = NO_UNIT_AREAS.map(a => turf.polygon([a.coords], { name: a.name }));
  let land = outline;
  for (const h of holes) land = turf.difference(turf.featureCollection([land, h])) || land;

  const pts = VILLAGES.map(v => [v[4], v[5]]);
  const vor = Delaunay.from(pts).voronoi([30.30, 29.00, 31.20, 29.65]);

  const villages = VILLAGES.map((v, i) => {
    const cell = turf.polygon([vor.cellPolygon(i)]);
    const clipped = turf.intersect(turf.featureCollection([cell, land]));
    return {
      type: 'Feature',
      geometry: clipped.geometry,
      properties: { id: `v${String(i + 1).padStart(2, '0')}`, name: v[0], centerId: v[1], unitId: v[2], kind: v[6], lng: v[4], lat: v[5] },
    };
  });

  const unitIds = [...new Set(VILLAGES.map(v => v[2]))];
  const units = unitIds.map(uid => {
    const vs = villages.filter(f => f.properties.unitId === uid);
    const geom = vs.length === 1 ? vs[0] : turf.union(turf.featureCollection(vs));
    const src = VILLAGES.find(v => v[2] === uid);
    return {
      type: 'Feature',
      geometry: geom.geometry,
      properties: { id: uid, name: src[3], centerId: src[1], centerName: CENTERS.find(c => c.id === src[1]).ar, villages: vs.map(f => f.properties.name) },
    };
  });

  const centers = CENTERS.map(c => {
    const us = units.filter(u => u.properties.centerId === c.id);
    const geom = turf.union(turf.featureCollection(us));
    return { type: 'Feature', geometry: geom.geometry, properties: { id: c.id, name: c.ar } };
  });

  cache = {
    outline: { type: 'Feature', geometry: outline.geometry, properties: {} },
    noUnitAreas: turf.featureCollection(holes),
    villages: turf.featureCollection(villages),
    units: turf.featureCollection(units),
    centers: turf.featureCollection(centers),
    bbox: turf.bbox(outline),
  };
  return cache;
}

// Point → { inside, village, unit, center, noUnitArea }
export function locate(lng, lat) {
  const g = buildGeo();
  const p = turf.point([lng, lat]);
  if (!turf.booleanPointInPolygon(p, g.outline)) return { inside: false };
  const area = g.noUnitAreas.features.find(f => turf.booleanPointInPolygon(p, f));
  if (area) return { inside: true, noUnitArea: area.properties.name };
  const v = g.villages.features.find(f => turf.booleanPointInPolygon(p, f));
  if (!v) return { inside: true, noUnitArea: 'خارج نطاق الوحدات' };
  const u = g.units.features.find(f => f.properties.id === v.properties.unitId);
  return {
    inside: true,
    village: { id: v.properties.id, name: v.properties.name },
    unit: { id: u.properties.id, name: u.properties.name },
    center: { id: u.properties.centerId, name: u.properties.centerName },
  };
}

export function randomPointIn(feature, rand = Math.random) {
  const [minX, minY, maxX, maxY] = turf.bbox(feature);
  for (let i = 0; i < 200; i++) {
    const p = [minX + rand() * (maxX - minX), minY + rand() * (maxY - minY)];
    if (turf.booleanPointInPolygon(turf.point(p), feature)) return p;
  }
  return turf.centroid(feature).geometry.coordinates;
}

export function distanceM(a, b) {
  return turf.distance(turf.point(a), turf.point(b), { units: 'meters' });
}
