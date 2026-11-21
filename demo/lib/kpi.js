// KPI computation — formulas follow docs/KPIS.md.
import { db, unitName } from './store.js';
import { buildGeo, distanceM } from './geo.js';
import { OPEN_STATUSES } from './config.js';

const DAY = 86_400_000;
const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
const clamp = x => Math.max(0, Math.min(100, x));

function metrics(reports, now, all) {
  const s = db.settings;
  const counted = reports.filter(r => !(r.status === 'CLOSED' && r.rejection?.confirmed) && r.status !== 'NOT_COMPETENT');
  const acked = counted.filter(r => r.acknowledgedAt);
  const resolved = counted.filter(r => r.resolvedAt || r.status === 'CLOSED' && r.resolution);
  const ackTimes = acked.map(r => (r.acknowledgedAt - (r.routedAt || r.createdAt)) / 3_600_000);
  const ackRatios = acked.map(r => {
    const sla = s.sla[r.priority].ack * 60_000;
    return Math.min(1, sla / Math.max(1, r.acknowledgedAt - (r.routedAt || r.createdAt)));
  });
  const resTimes = resolved.map(r => ((r.resolvedAt || r.closedAt) - (r.routedAt || r.createdAt) - (r.slaPausedMs || 0)) / 3_600_000);
  const onTime = resolved.filter(r => (r.resolvedAt || r.closedAt) <= r.resolveDueAt).length;
  const due = counted.filter(r => r.resolveDueAt <= now || r.resolvedAt || r.status === 'CLOSED');
  const closedOk = counted.filter(r => r.status === 'CLOSED' || r.status === 'RESOLVED').length;
  const reopened = counted.filter(r => r.reopenCount > 0).length;
  const ratings = counted.filter(r => r.rating).map(r => r.rating.stars);
  const rejected = reports.filter(r => r.rejection).length;
  const reviews = reports.flatMap(r => r.reviews || []);
  const matched = reviews.filter(v => v.outcome === 'match').length;
  const overdue = counted.filter(r => OPEN_STATUSES.includes(r.status) && r.status !== 'PENDING_BUDGET' && now > r.resolveDueAt).length;
  // recurring: a new report of same category within 50 m of one closed in the previous 90 days (precomputed set)
  const closed = reports.filter(r => r.status === 'CLOSED' && r.closedAt);
  const recurring = closed.filter(c => all.has(c.id)).length;

  const k = {
    total: reports.length,
    open: counted.filter(r => OPEN_STATUSES.includes(r.status)).length,
    overdue,
    k1: avg(ackTimes), // hours
    k2: avg(resTimes), // hours
    k3: resolved.length ? onTime / resolved.length * 100 : null,
    k4: due.length ? closedOk / due.length * 100 : null,
    k5: resolved.length ? reopened / resolved.length * 100 : null,
    k6: avg(ratings),
    k7: reports.length ? rejected / reports.length * 100 : null,
    k8: reviews.length ? matched / reviews.length * 100 : null,
    k9: closed.length ? recurring / closed.length * 100 : null,
    ratingsCount: ratings.length,
  };
  // score
  const w = s.weights;
  const parts = {
    k3: k.k3, k4: k.k4,
    k6: k.k6 != null ? (k.k6 - 1) / 4 * 100 : null,
    k1: ackRatios.length ? avg(ackRatios) * 100 : null,
    k5: k.k5 != null ? 100 - k.k5 : null,
    k8: k.k8 ?? 100,
    k9: k.k9 != null ? 100 - k.k9 * 2 : 100,
  };
  let sum = 0, wsum = 0;
  for (const [key, val] of Object.entries(parts)) if (val != null) { sum += clamp(val) * w[key]; wsum += w[key]; }
  k.score = reports.length >= 10 && wsum ? Math.round(sum / wsum) : null;
  k.band = k.score == null ? 'insufficient' : k.score >= s.thresholds.good ? 'good' : k.score >= s.thresholds.fair ? 'fair' : 'poor';
  return k;
}

// Closed reports followed by a new same-category report within 50 m and 90 days.
// Indexed by category + time so it stays fast with thousands of reports.
let recurringCache = { key: '', set: new Set() };
function recurringSet(masters) {
  const key = `${masters.length}:${db.audit.length}`;
  if (recurringCache.key === key) return recurringCache.set;
  const byCat = {};
  for (const r of masters) (byCat[r.category] ||= []).push(r);
  for (const list of Object.values(byCat)) list.sort((a, b) => a.createdAt - b.createdAt);
  const set = new Set();
  for (const c of masters) {
    if (c.status !== 'CLOSED' || !c.closedAt) continue;
    const list = byCat[c.category];
    let lo = 0, hi = list.length; // first report created after closedAt
    while (lo < hi) { const mid = (lo + hi) >> 1; if (list[mid].createdAt <= c.closedAt) lo = mid + 1; else hi = mid; }
    for (let i = lo; i < list.length && list[i].createdAt < c.closedAt + 90 * DAY; i++) {
      if (list[i] !== c && distanceM(list[i].location, c.location) <= 50) { set.add(c.id); break; }
    }
  }
  recurringCache = { key, set };
  return set;
}

// Short-lived result cache: dashboards poll often and data changes are batched anyway.
const kpiCache = new Map();
export function computeKpis(opts = {}) {
  const key = JSON.stringify({ ...opts, filter: opts.filter ? String(opts.filterKey || opts.filter) : null, v: db.audit.length, t: Math.floor(Date.now() / 15000) });
  if (kpiCache.has(key)) return kpiCache.get(key);
  const out = computeKpisRaw(opts);
  if (kpiCache.size > 50) kpiCache.clear();
  kpiCache.set(key, out);
  return out;
}

function computeKpisRaw({ days = 30, from, to, now = Date.now(), filter } = {}) {
  const end = to ? Math.min(to, now) : now;
  from = from ?? end - days * DAY;
  days = Math.round((end - from) / DAY);
  const masters = db.reports.filter(r => !r.masterId);
  const rec = recurringSet(masters);
  const inWin = masters.filter(r => r.createdAt >= from && r.createdAt <= end && (!filter || filter(r)));
  const geo = buildGeo();

  const overall = metrics(inWin.filter(r => r.unitId), now, rec);
  overall.allTotal = db.reports.filter(r => r.createdAt >= from && r.createdAt <= end && (!filter || filter(r))).length;
  overall.duplicates = overall.allTotal - inWin.length;
  overall.opsQueue = inWin.filter(r => r.status === 'OPS_QUEUE').length;

  const units = geo.units.features.map(f => {
    const p = f.properties;
    const m = metrics(inWin.filter(r => r.unitId === p.id), now, rec);
    return { id: p.id, name: unitName(p.id, p.name), centerId: p.centerId, centerName: p.centerName, ...m };
  });
  const ranked = units.filter(u => u.score != null).sort((a, b) => b.score - a.score);
  ranked.forEach((u, i) => { u.rank = i + 1; });
  units.forEach(u => { u.rankOf = ranked.length; });

  const centers = geo.centers.features.map(f => {
    const m = metrics(inWin.filter(r => r.centerId === f.properties.id), now, rec);
    return { id: f.properties.id, name: f.properties.name, ...m };
  });

  const byCategory = db.categories.map(c => ({ code: c.code, ar: c.ar, count: inWin.filter(r => r.category === c.code).length }))
    .filter(c => c.count).sort((a, b) => b.count - a.count);

  const villageCounts = {};
  for (const r of inWin) if (r.villageName) villageCounts[r.villageName] = (villageCounts[r.villageName] || 0) + 1;
  const topVillages = Object.entries(villageCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10);

  // weekly trend (last 8 weeks)
  const trend = [];
  for (let w = 7; w >= 0; w--) {
    const a = end - (w + 1) * 7 * DAY, b = end - w * 7 * DAY;
    const wk = masters.filter(r => r.unitId && r.createdAt >= a && r.createdAt < b);
    const m = metrics(wk, now, rec);
    trend.push({ from: a, to: b, total: wk.length, k3: m.k3, k6: m.k6, score: m.score });
  }

  const alerts = [
    ...units.filter(u => u.band === 'poor').map(u => ({ type: 'unit_poor', unitId: u.id, text: `${u.name} — درجة الأداء ${u.score} (أقل من ${db.settings.thresholds.fair})` })),
    ...masters.filter(r => r.escalation >= 4 && OPEN_STATUSES.includes(r.status)).sort((a, b) => a.resolveDueAt - b.resolveDueAt).slice(0, 8)
      .map(r => ({ type: 'report_escalated', reportId: r.id, text: `بلاغ ${r.code} متأخر بشدة — ${r.unitName || 'غرفة العمليات'}` })),
  ];

  return { days, from, to: end, now, overall, units, centers, byCategory, topVillages, trend, alerts };
}
