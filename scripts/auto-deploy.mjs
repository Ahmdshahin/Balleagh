// Auto-deploy: watches the project and, once edits stop for QUIET_MS, commits and pushes.
// Hostinger then rebuilds the site from GitHub automatically.
// Run:  npm run auto-deploy      (stop with Ctrl+C)
import { watch } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QUIET_MS = Number(process.env.QUIET_MS) || 20_000;
const IGNORE = /(^|[\\/])(\.git|node_modules|data|uploads)([\\/]|$)|\.log$|~$|\.tmp$|\.swp$/;

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const stamp = () => new Date().toLocaleTimeString('en-GB');

let timer = null, busy = false, pending = new Set();

function publish() {
  if (busy) { timer = setTimeout(publish, 2000); return; }
  busy = true;
  try {
    git('add', '-A');
    if (!git('status', '--porcelain')) { pending.clear(); return; }
    const files = [...pending].slice(0, 5).join('، ');
    const msg = `تحديث تلقائي ${new Date().toISOString().slice(0, 16).replace('T', ' ')}${files ? ' — ' + files : ''}`;
    git('commit', '-m', msg);
    console.log(`[${stamp()}] حُفظ: ${msg}`);
    git('push');
    console.log(`[${stamp()}] ✓ اترفع — Hostinger هيحدّث الموقع خلال دقيقة أو اتنين`);
    pending.clear();
  } catch (e) {
    console.error(`[${stamp()}] ✗ فشل: ${(e.stderr || e.message).toString().split('\n')[0]}`);
  } finally { busy = false; }
}

watch(ROOT, { recursive: true }, (_event, file) => {
  if (!file || IGNORE.test(file)) return;
  pending.add(file.replace(/\\/g, '/'));
  clearTimeout(timer);
  timer = setTimeout(publish, QUIET_MS);
});

console.log(`بلّغ — النشر التلقائي شغال على ${ROOT}`);
console.log(`أي تعديل هيترفع بعد ${QUIET_MS / 1000} ثانية من آخر حفظ. للإيقاف: Ctrl+C`);
