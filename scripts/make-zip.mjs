// Build dist/balleagh-hostinger.zip for Hostinger "Upload your files":
// package.json + server.js at the zip root, only the files the app needs, no node_modules/data/uploads.
// Run: npm run zip
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist', 'balleagh-hostinger.zip');
const INCLUDE = ['package.json', 'package-lock.json', 'server.js', '.env.example', 'DEPLOY.md', 'README.md', 'brand', 'demo'];

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.rmSync(OUT, { force: true });
// tracked files only (respects .gitignore), working-tree versions
const files = execFileSync('git', ['ls-files', '--', ...INCLUDE], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean)
  .filter(f => fs.existsSync(path.join(ROOT, f)));
const py = `import zipfile,sys
root,out=sys.argv[1],sys.argv[2]
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
    for f in sys.stdin.read().splitlines():
        z.write(root+'/'+f, f)
`;
execFileSync('python', ['-I', '-c', py, ROOT, OUT], { input: files.join('\n') });
console.log(`✓ ${path.relative(ROOT, OUT)} — ${files.length} files, ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
