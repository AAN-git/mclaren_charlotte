// Deletes every file in docs/assets that no page or stylesheet references.
// usage: node tools/prune-assets.mjs
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('docs');
const used = new Set();
const refRe = /(?:src|href)="([^"#?]+)|url\(\s*["']?([^"')#?]+)/g;

async function walk(file) {
  const abs = path.resolve(file);
  if (used.has(abs)) return;
  used.add(abs);
  if (!/\.(html|css)$/.test(abs)) return;
  const text = await fs.readFile(abs, 'utf8').catch(() => '');
  for (const m of text.matchAll(refRe)) {
    const ref = m[1] || m[2];
    if (/^(https?:|data:|mailto:|tel:|#)/.test(ref)) continue;
    await walk(path.join(path.dirname(abs), ref));
  }
}

for (const f of await fs.readdir(ROOT)) if (f.endsWith('.html')) await walk(path.join(ROOT, f));

let removed = 0;
for (const f of await fs.readdir(path.join(ROOT, 'assets'), { recursive: true })) {
  const abs = path.join(ROOT, 'assets', f);
  if ((await fs.stat(abs)).isFile() && !used.has(abs) && !abs.includes('/mockup/')) {
    await fs.rm(abs);
    removed++;
  }
}
console.log('removed', removed, 'unreferenced files');
