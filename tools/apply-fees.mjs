// Builds the proposed pages from the captured current ones:
//   docs/current-srp.html -> docs/srp.html   (fee-inclusive price + note on every card)
//   docs/current-vdp.html -> docs/vdp.html   (fee-inclusive price + breakdown popover)
// and puts the Current/Proposed switch on all four. Safe to re-run.
//
// usage: node tools/apply-fees.mjs

import fs from 'node:fs/promises';
import * as cheerio from 'cheerio';

// Figures from Jacqueline Chen's request, 23 Sep 2026. Exotic Care has no figure yet.
const FEES = [
  { label: 'Doc fee', amount: 2805 },
  { label: 'Electronic filing fee', amount: 245 },
];
const OPTIONAL = [
  { label: 'Exotic Care', amount: null },
  { label: 'Nano windshield', amount: 500 },
];
const FEE_TOTAL = FEES.reduce((s, f) => s + f.amount, 0);

const usd = (n) => '$' + n.toLocaleString('en-US');
const parse = (s) => { const m = s.match(/\$\s*([\d,]+)/); return m ? +m[1].replace(/,/g, '') : null; };

const load = async (f) => cheerio.load(await fs.readFile(`docs/${f}`, 'utf8'), { decodeEntities: false });

function chrome($, page, proposed) {
  // Inventory entry points lead to the matching SRP, so the pages can be reached like on the live site.
  const srp = proposed ? 'srp.html' : 'current-srp.html';
  $('a').filter((_, el) => /^(all|new) inventory$/i.test($(el).text().trim())).attr('href', srp);
  $('.back_block a').attr('href', srp);
  $('.car-col a.button[title="View Vehicle Details"]').first().attr('href', proposed ? 'vdp.html' : 'current-vdp.html');
  $('.mk-switch, link[href*="assets/mockup/"], script[src*="assets/mockup/"]').remove();
  $('head').append('<link rel="stylesheet" href="assets/mockup/snapshot.css">\n<link rel="stylesheet" href="assets/mockup/fees.css">\n');
  $('body').append(`
<nav class="mk-switch" aria-label="Mockup view">
  <span class="mk-switch__tag">Mockup</span>
  <a href="current-${page}.html"${proposed ? '' : ' aria-current="page"'}>Current</a>
  <a href="${page}.html"${proposed ? ' aria-current="page"' : ''}>Proposed</a>
</nav>
<script src="assets/mockup/switch.js"></script>\n`);
  if (proposed) $('body').append('<script src="assets/mockup/fees.js"></script>\n');
}

let uid = 0;
function popover(base) {
  const id = `fx-pop-${++uid}`;
  const row = (l, v, cls = '') => `<li class="fx-row ${cls}"><span class="fx-row__label">${l}</span><span class="fx-row__value">${v}</span></li>`;
  return {
    trigger: `<button type="button" class="fx-trigger" aria-expanded="false" aria-controls="${id}"><span class="fx-trigger__label">Incl. dealer fees</span><i class="fa fa-info-circle" aria-hidden="true"></i></button>`,
    pop: `
<div class="fx-pop" id="${id}" role="dialog" aria-label="Price breakdown">
  <button type="button" class="fx-close" aria-label="Close price breakdown">&times;</button>
  <p class="fx-pop__head">Price breakdown</p>
  <div class="fx-group">
    <p class="fx-group__title">Included in price</p>
    <ul class="fx-rows">
      ${row('Vehicle price', usd(base))}
      ${FEES.map((f) => row(f.label, usd(f.amount))).join('\n      ')}
      ${row('Price', usd(base + FEE_TOTAL), 'fx-row--total')}
    </ul>
  </div>
  <div class="fx-group">
    <p class="fx-group__title">Optional &mdash; not included</p>
    <ul class="fx-rows">
      ${OPTIONAL.map((o) => row(o.label, o.amount == null ? '<span class="fx-tbd">Price TBD</span>' : usd(o.amount))).join('\n      ')}
    </ul>
  </div>
  <p class="fx-note fx-note--placeholder">Disclaimer text &mdash; to be supplied by the dealership.</p>
</div>`,
  };
}

// A mockup to sit and think over, not the full inventory: 20 cards (five even
// rows of four) and five photos (the slider's first + two rows of the grid).
const SRP_CARDS = 20;
const VDP_GRID = [1, 2, 3, 4]; // grid index 0 repeats the slider photo

function trim($, page) {
  $('.photos, .photos .photo').removeAttr('style'); // drop shuffle.js's frozen absolute layout
  $('.car-col .frame, .car-col .vehicle').removeAttr('style'); // heights frozen at the 1440px capture width
  $('#compare_display_new').remove(); // compare drawer: inert without scripts, only gets in the way
  if ($('body').attr('data-trimmed')) return;
  $('body').attr('data-trimmed', '1');
  if (page === 'srp') $('.car-col').slice(SRP_CARDS).remove();
  if (page === 'vdp') {
    $('.ddtSlider .slick-slide').filter((_, el) => $(el).attr('data-slick-index') !== '0').remove();
    $('.photos .photo').filter((i) => !VDP_GRID.includes(i)).remove();
  }
}

// ---- current pages: trim + switch ---------------------------------------------
for (const page of ['srp', 'vdp']) {
  const $ = await load(`current-${page}.html`);
  trim($, page);
  chrome($, page, false);
  await fs.writeFile(`docs/current-${page}.html`, $.html());
}

// ---- SRP ----------------------------------------------------------------------
{
  const $ = await load('current-srp.html');
  let n = 0;
  $('.miniInf .price').each((_, el) => {
    const base = parse($(el).text());
    if (base == null) return; // no price on the card: nothing to include fees in
    $(el).html(`Price: ${usd(base + FEE_TOTAL)}<span class="fx-srp-note">Incl. dealer fees</span>`);
    n++;
  });
  chrome($, 'srp', true);
  await fs.writeFile('docs/srp.html', $.html());
  console.log('srp: repriced', n, 'cards');
}

// ---- VDP ----------------------------------------------------------------------
{
  const $ = await load('current-vdp.html');
  const box = $('.actionsHead .priceBox');
  const base = parse(box.text());
  const total = usd(base + FEE_TOTAL);

  const head = popover(base);
  box.addClass('fx').html(`<h2>Price: ${total}</h2>${head.trigger}${head.pop}`);

  const cell = $('.tableBox td').filter((_, el) => $(el).text().trim() === 'Price:').next();
  const tbl = popover(base);
  cell.html(`<div class="fx fx-cell">${total}${tbl.trigger}${tbl.pop}</div>`);

  $('title').text($('title').text().replace(usd(base), total));
  $('meta[property="product:original_price:amount"]').attr('content', String(base + FEE_TOTAL));
  chrome($, 'vdp', true);
  await fs.writeFile('docs/vdp.html', $.html());
  console.log('vdp:', usd(base), '->', total);
}
