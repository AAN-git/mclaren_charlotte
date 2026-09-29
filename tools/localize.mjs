// Turns a captured, script-free DOM snapshot of charlottemclaren.com into a
// self-contained static page: every stylesheet, font and image is downloaded
// into docs/assets/ and every reference rewritten to a relative path, so the
// result works offline and from any GitHub Pages subpath.
//
// usage: node tools/localize.mjs <in.dom.html> <out.html>

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import * as cheerio from 'cheerio';

const ORIGIN = 'https://www.charlottemclaren.com/';
const SITE = path.resolve('docs');
const ASSETS = path.join(SITE, 'assets');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130 Safari/537.36';

const [, , inFile, outFile] = process.argv;
const cache = new Map(); // absolute url -> promise of local path (relative to SITE)

const extOf = (u, type = '') => {
  const p = new URL(u).pathname;
  const e = path.extname(p).toLowerCase();
  if (e && e.length <= 6 && e !== '.php') return e;
  if (type.includes('css')) return '.css';
  if (type.includes('png')) return '.png';
  if (type.includes('svg')) return '.svg';
  if (type.includes('webp')) return '.webp';
  if (type.includes('woff2')) return '.woff2';
  if (type.includes('woff')) return '.woff';
  return '.jpg';
};

const localName = (u, ext) => {
  const base = path.basename(new URL(u).pathname, path.extname(new URL(u).pathname))
    .replace(/[^a-z0-9_-]+/gi, '-').slice(0, 40) || 'file';
  const h = crypto.createHash('md5').update(u).digest('hex').slice(0, 8);
  return `${base}-${h}${ext}`;
};

async function fetchAsset(abs, dir) {
  if (cache.has(abs)) return cache.get(abs);
  const job = (async () => {
    const res = await fetch(abs, { headers: { 'User-Agent': UA, Referer: ORIGIN } });
    if (!res.ok) throw new Error(`${res.status} ${abs}`);
    const type = res.headers.get('content-type') || '';
    const ext = extOf(abs, type);
    const rel = path.join('assets', ext === '.css' ? 'css' : dir, localName(abs, ext));
    let buf = Buffer.from(await res.arrayBuffer());
    if (ext === '.css') buf = Buffer.from(await rewriteCss(buf.toString('utf8'), abs, rel));
    await fs.mkdir(path.dirname(path.join(SITE, rel)), { recursive: true });
    await fs.writeFile(path.join(SITE, rel), buf);
    return rel;
  })().catch((e) => { console.warn('  skip', e.message); return null; });
  cache.set(abs, job);
  return job;
}

// Rewrites url(...) and @import inside CSS so they point at local copies,
// relative to the CSS file's own location.
async function rewriteCss(css, baseUrl, selfRel) {
  const refs = new Set();
  css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (_, q, u) => refs.add(u.trim()));
  css.replace(/@import\s+(['"])([^'"]+)\1/g, (_, q, u) => refs.add(u.trim()));
  const map = new Map();
  await Promise.all([...refs].map(async (u) => {
    if (/^(data:|#|about:)/.test(u)) return;
    let abs;
    try { abs = new URL(u, baseUrl).href; } catch { return; }
    const isFont = /\.(woff2?|ttf|otf|eot)(\?|#|$)/i.test(abs);
    const local = await fetchAsset(abs.split('#')[0], isFont ? 'fonts' : 'img');
    if (local) {
      const hash = abs.includes('#') ? '#' + abs.split('#')[1] : '';
      map.set(u, path.relative(path.dirname(selfRel), local) + hash);
    }
  }));
  return css
    .replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, u) => (map.has(u.trim()) ? `url("${map.get(u.trim())}")` : m))
    .replace(/@import\s+(['"])([^'"]+)\1/g, (m, q, u) => (map.has(u.trim()) ? `@import "${map.get(u.trim())}"` : m));
}

const abs = (u) => { try { return new URL(u, ORIGIN).href; } catch { return null; } };

const html = await fs.readFile(inFile, 'utf8');
const $ = cheerio.load(html, { decodeEntities: false });

// --- strip what a static mockup must not carry --------------------------------
$('script, noscript, iframe').remove();
$('meta[http-equiv="origin-trial"]').remove();
$('link').filter((_, el) => !/stylesheet/i.test($(el).attr('rel') || '')).remove();
$('link[href*="drivecentric"]').remove();
$('#woof_html_buffer, .a11y-speak-region, #a11y-speak-intro-text').remove();
$('body > div').filter((_, el) => /z-index:\s*2000000000/.test($(el).attr('style') || '')).remove();
$('meta[name="robots"]').remove();
$('head').prepend('\n<meta name="robots" content="noindex, nofollow">\n');

// --- stylesheets --------------------------------------------------------------
await Promise.all($('link[rel="stylesheet"]').toArray().map(async (el) => {
  const u = abs($(el).attr('href'));
  const local = u && (await fetchAsset(u, 'css'));
  if (local) $(el).attr('href', local); else $(el).remove();
}));
await Promise.all($('style').toArray().map(async (el) => {
  $(el).html(await rewriteCss($(el).html(), ORIGIN, 'x.html'));
}));

// --- images -------------------------------------------------------------------
const imgAttrs = ['src', 'data-src', 'data-lazy', 'data-lazy-src', 'data-original', 'poster'];
await Promise.all($('img, source, video').toArray().flatMap((el) => [
  ...imgAttrs.map(async (a) => {
    const v = $(el).attr(a);
    if (!v || v.startsWith('data:')) return;
    const u = abs(v);
    const local = u && (await fetchAsset(u, 'img'));
    if (local) $(el).attr(a, local);
  }),
  (async () => { $(el).removeAttr('srcset').removeAttr('data-srcset').removeAttr('sizes'); })(),
]));
await Promise.all($('[style*="url("]').toArray().map(async (el) => {
  $(el).attr('style', await rewriteCss($(el).attr('style'), ORIGIN, 'x.html'));
}));

// --- links and forms go nowhere: this is a picture of the site, not the site ---
$('a[href]').each((_, el) => {
  const h = $(el).attr('href');
  if (!h.startsWith('#')) $(el).attr('href', '#');
});
$('form').attr('action', '#').attr('onsubmit', 'return false');

await fs.writeFile(outFile, $.html());
console.log('wrote', outFile, '·', cache.size, 'assets');
