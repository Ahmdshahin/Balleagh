// Import the official Fayoum File Geodatabase into the demo.
//   npm run import-gdb -- "D:\Data\Fayoum.gdb"
// Needs GDAL's ogr2ogr (bundled with QGIS). Set OGR2OGR to its path if it isn't found automatically.
//
// Writes demo/geo/{border,centers,villages}.geojson (WGS84, lightly simplified for the web) and creates
// demo/geo/units-mapping.csv (village → local unit) if it doesn't exist yet. Edit that CSV to group several
// villages under one local unit; the server picks it up on the next start.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'geo');
const gdb = process.argv[2];
if (!gdb || !fs.existsSync(gdb)) { console.error('Usage: npm run import-gdb -- "path\\to\\Fayoum.gdb"'); process.exit(1); }

function findOgr() {
  if (process.env.OGR2OGR) return { exe: process.env.OGR2OGR, root: path.resolve(path.dirname(process.env.OGR2OGR), '..') };
  const pf = 'C:\\Program Files';
  const qgis = fs.existsSync(pf) ? fs.readdirSync(pf).filter(d => /^QGIS /.test(d)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true })) : [];
  for (const d of qgis) { const exe = path.join(pf, d, 'bin', 'ogr2ogr.exe'); if (fs.existsSync(exe)) return { exe, root: path.join(pf, d) }; }
  return { exe: 'ogr2ogr', root: null };
}
const { exe, root } = findOgr();
const env = { ...process.env };
if (root) { env.PROJ_DATA = env.PROJ_LIB = path.join(root, 'share', 'proj'); env.GDAL_DATA = path.join(root, 'share', 'gdal'); env.PATH = path.join(root, 'bin') + path.delimiter + env.PATH; }

fs.mkdirSync(OUT, { recursive: true });
const layers = [
  ['border', 'Fayoum_border', 15, 'Gov_Code,Gov_Name_En,محافظه,جمله_السكان'],
  ['centers', 'Qism_Markaz', 15, 'Sec_Code,Sec_Name_Ar,Sec_Name_En,جمله_السكان'],
  ['villages', 'Shyakha_Qurya', 10, 'Sec_Code,Ssec_Code_1,Ssec_Name,Urban_Rural,قسم_مركز,شياخه_قريه,حضر_ريف,جمله_السكان,عدد_الاسر'],
];
for (const [name, layer, tol, fields] of layers) {
  const file = path.join(OUT, `${name}.geojson`);
  fs.rmSync(file, { force: true });
  execFileSync(exe, ['-f', 'GeoJSON', file, gdb, layer, '-t_srs', 'EPSG:4326', '-simplify', String(tol), '-select', fields,
    '-lco', 'COORDINATE_PRECISION=6', '-lco', 'RFC7946=YES'], { env, stdio: ['ignore', 'ignore', 'pipe'] });
  const n = JSON.parse(fs.readFileSync(file, 'utf8')).features.length;
  console.log(`✓ ${name}.geojson — ${n} features`);
}

// ---- default village → unit mapping (never overwrite edits) ----
const mapFile = path.join(OUT, 'units-mapping.csv');
if (fs.existsSync(mapFile)) { console.log('• units-mapping.csv already exists — kept as is'); process.exit(0); }
const { cleanName } = await import('../lib/names.js');
const v = JSON.parse(fs.readFileSync(path.join(OUT, 'villages.geojson'), 'utf8')).features.map(f => f.properties);
const seen = new Set();
const rows = [['village_code', 'village_name', 'center_code', 'center_name', 'type', 'unit_id', 'unit_name']];
for (const p of v) {
  const code = p.Ssec_Code_1, sec = p.Sec_Code;
  if (sec === '2399' || seen.has(code)) continue; // desert hinterland → governorate directly
  seen.add(code);
  const vname = cleanName(p['شياخه_قريه']), cname = cleanName(p['قسم_مركز']);
  const urban = p['حضر_ريف'] === 'حضر';
  let unitId, unitName, type;
  if (sec === '2301' || sec === '2310') { unitId = `u${sec}`; unitName = `حي ${cname.replace(/^قسم /, '')}`; type = 'شياخة'; }
  else if (sec === '2308') { unitId = `u${code}`; unitName = 'جهاز مدينة الفيوم الجديدة'; type = 'مدينة'; }
  else if (urban) { unitId = `u${code}`; unitName = `مجلس ${vname}`; type = 'مدينة'; }
  else { unitId = `u${code}`; unitName = `الوحدة المحلية ب${vname}`; type = 'قرية'; }
  rows.push([code, vname, sec, cname, type, unitId, unitName]);
}
fs.writeFileSync(mapFile, '\uFEFF' + rows.map(r => r.map(x => /[",]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x).join(',')).join('\r\n') + '\r\n');
console.log(`✓ units-mapping.csv — ${rows.length - 1} villages (each village = its own unit by default; edit to group)`);
