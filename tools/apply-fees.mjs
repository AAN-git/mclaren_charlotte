// Builds the proposed pages from the captured current ones:
//   docs/current-srp.html -> docs/srp.html   (fee-inclusive price + disclosure on every card)
//   docs/current-vdp.html -> docs/vdp.html   (fee-inclusive price + disclosure popover, new wordmark)
//   V2, the dealer's "price stacking" format (Price / fees / Total Price / Optional):
//   docs/current-srp.html -> docs/srp-v2.html (Total Price on every card + stack in a popover)
//   docs/current-vdp.html -> docs/vdp-v2.html (stack always visible under the title)
//   V3: srp-v3.html / vdp-v3.html, a copy of V2 to take the next round of changes
// Safe to re-run.
//
// usage: node tools/apply-fees.mjs

import fs from 'node:fs/promises';
import * as cheerio from 'cheerio';

// Figures from Jacqueline Chen's request, 23 Sep 2026. Exotic Care ($xxx in the request)
// and the disclaimer wording are simulated for the mockup and flagged on the start page.
const DISCLAIMER = 'Price includes the dealer documentation fee ($2,805) and electronic filing fee ($245). Excludes taxes, tags, title and registration. Optional products are not included and are available at additional cost.';
const FEES = [
  { label: 'Doc fee', amount: 2805 },
  { label: 'Electronic filing fee', amount: 245 },
];
const OPTIONAL = [
  { label: 'Exotic Care', amount: 1995 }, // SAMPLE figure for the mockup — dealer to confirm
  { label: 'Nano windshield', amount: 500 },
];
const FEE_TOTAL = FEES.reduce((s, f) => s + f.amount, 0);

const usd = (n) => '$' + n.toLocaleString('en-US');
const parse = (s) => { const m = s.match(/\$\s*([\d,]+)/); return m ? +m[1].replace(/,/g, '') : null; };

const load = async (f) => cheerio.load(await fs.readFile(`docs/${f}`, 'utf8'), { decodeEntities: false });

// Cache-buster for the mockup's own CSS/JS, so a rebuild is never hidden behind a stale copy.
const V = Date.now().toString(36);

const PAGES = {
  current: { srp: 'current-srp.html', vdp: 'current-vdp.html' },
  v1: { srp: 'srp.html', vdp: 'vdp.html' },
  v2: { srp: 'srp-v2.html', vdp: 'vdp-v2.html' },
  v3: { srp: 'srp-v3.html', vdp: 'vdp-v3.html' },
};

function chrome($, page, mode) {
  const proposed = mode !== 'current';
  // Inventory entry points lead to the matching SRP, so the pages can be reached like on the live site.
  const { srp, vdp } = PAGES[mode];
  $('a').filter((_, el) => /^(all|new) inventory$/i.test($(el).text().trim())).attr('href', srp);
  $('.back_block a').attr('href', srp);
  // One VDP stands in for every vehicle: any click on any card opens it.
  $('.car-col a').not('.compare').attr('href', vdp);
  $('.car-col .item').attr('onclick', `location.href='${vdp}'`).css('cursor', 'pointer');
  $('.mk-switch, link[href*="assets/mockup/"], script[src*="assets/mockup/"]').remove();
  $('head').append(`<link rel="stylesheet" href="assets/mockup/snapshot.css?v=${V}">\n<link rel="stylesheet" href="assets/mockup/brand-type.css?v=${V}">\n<link rel="stylesheet" href="assets/mockup/fees.css?v=${V}">\n`);
  // no Current/Proposed switch: the links go to the dealer as plain pages
  if (mode === 'v3') $('head').append(`<link rel="stylesheet" href="assets/mockup/v3.css?v=${V}">\n`);
  if (proposed) {
    $('body').append(`<script src="assets/mockup/fees.js?v=${V}"></script>\n`);
    $('.logoBox .logo img[src*="logo_update"]').attr('src', 'assets/mockup/logo-new.svg').addClass('mk-logo-new');
  }
}

let uid = 0;
// The disclosure mirrors the dealership's request line for line: a disclaimer,
// the two fees inside the price, then the optional products outside it.
function popover() {
  const id = `fx-pop-${++uid}`;
  const row = (l, v) => `<li class="fx-row"><span>${l}</span><span class="fx-row__value">${v}</span></li>`;
  return {
    trigger: `<button type="button" class="fx-trigger" aria-expanded="false" aria-controls="${id}">Dealer fees included<svg class="fx-i" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 7v4.5M8 4.6v.1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>`,
    pop: `
<aside class="fx-pop" id="${id}" role="dialog" aria-labelledby="${id}-t">
  <header class="fx-pop__bar">
    <p class="fx-pop__title" id="${id}-t">Disclaimer</p>
    <button type="button" class="fx-close" aria-label="Close"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>
  </header>
  <div class="fx-pop__body">
    <p class="fx-lead">Dealer fees included in price.</p>
    <ul class="fx-rows">
      ${FEES.map((f) => row(f.label, usd(f.amount))).join('\n      ')}
    </ul>
    <p class="fx-sub">Optional, not included</p>
    <ul class="fx-rows">
      ${OPTIONAL.map((o) => row(o.label, o.amount == null ? '<span class="fx-tbd">Price TBD</span>' : usd(o.amount))).join('\n      ')}
    </ul>
    <p class="fx-legal">${DISCLAIMER}</p>
  </div>
</aside>`,
  };
}

// V2: the dealer's price-stacking format, line for line (Jacqueline Chen, 5 Oct 2026):
// Price / Documentation fee / Electronic filing fee / Total Price, then Optional.
const V2_FEES = [
  { label: 'Documentation fee', amount: 2805 },
  { label: 'Electronic filing fee', amount: 245 },
];
const V2_OPTIONAL = [
  { label: 'Exotic Care', amount: 1995 }, // SAMPLE figure — dealer to confirm
  { label: 'Nano Windshield', amount: 500 },
];
function stack(base, { plus = false, legal = true, cls = '' } = {}) {
  const row = (l, v, c = '') => `<li class="st-row ${c}"><span>${l}</span><span class="st-val">${v}</span></li>`;
  return `
<div class="st ${cls}">
  <ul class="st-rows">
    ${row('Price', usd(base), 'st-row--price')}
    ${V2_FEES.map((f) => row(f.label, (plus ? '+' : '') + usd(f.amount))).join('\n    ')}
    ${row('Total Price', usd(base + FEE_TOTAL), 'st-row--total')}
  </ul>
  <p class="st-sub">Optional</p>
  <ul class="st-rows st-rows--opt">
    ${V2_OPTIONAL.map((o) => row(o.label, usd(o.amount))).join('\n    ')}
  </ul>
  ${legal ? `<p class="st-legal">${DISCLAIMER}</p>` : ''}
</div>`;
}
// V3 VDP: the same figures as one horizontal line under the title
// (Price + fees = Total Price), optional products and small print beneath,
// so the stack reads across the page instead of pushing the gallery down.
function strip(base) {
  const item = (l, v, c = '') => `<div class="sx-item ${c}"><dt>${l}</dt><dd>${v}</dd></div>`;
  return `
<div class="sx">
  <dl class="sx-eq">
    ${item('Price', usd(base))}
    <span class="sx-op" aria-hidden="true">+</span>
    ${V2_FEES.map((f) => item(f.label, usd(f.amount))).join('\n    <span class="sx-op" aria-hidden="true">+</span>\n    ')}
    <span class="sx-op" aria-hidden="true">=</span>
    ${item('Total Price', usd(base + FEE_TOTAL), 'sx-total')}
  </dl>
  <p class="sx-opt"><span class="sx-opt__label">Optional</span> ${V2_OPTIONAL.map((o) => `${o.label} <span class="sx-num">${usd(o.amount)}</span>`).join(' <span class="sx-dot" aria-hidden="true">·</span> ')}</p>
  <p class="sx-legal">${DISCLAIMER}</p>
</div>`;
}

// V3 VDP: a Midnight band above the gallery (Alex's reference, 6 Oct 2026):
// name and year/miles left, the price stack right, optional products and a
// one-line note beneath.
const V3_NOTE = DISCLAIMER; // the dealer did not ask to drop the disclaimer: V3 keeps the full text
function band(base, title, year, miles) {
  const row = (l, v, c = '') => `<div class="v3-row ${c}"><dt>${l}</dt><dd>${v}</dd></div>`;
  return `
<div class="v3-band">
  <div class="v3-id">
    <h1 class="v3-title">${title}</h1>
    <p class="v3-sub">${year} <span aria-hidden="true">·</span> ${miles} miles</p>
  </div>
  <dl class="v3-stack">
    ${row('Vehicle price', usd(base))}
    ${V2_FEES.map((f) => row(f.label, '+' + usd(f.amount))).join('\n    ')}
    ${row('Total price', usd(base + FEE_TOTAL), 'v3-total')}
  </dl>
  <div class="v3-foot">
    <p class="v3-opt"><strong>Optional products:</strong> ${V2_OPTIONAL.map((o) => `<span class="v3-optitem">${o.label} ${usd(o.amount)}</span>`).join(' <span class="v3-dot" aria-hidden="true">·</span> ')}</p>
    <p class="v3-note">${V3_NOTE}</p>
  </div>
</div>`;
}

// Make on the first line, model on the second (V3 card and VDP titles).
const MAKES = ['Rolls-Royce', 'McLaren', 'Koenigsegg', 'Czinger', 'Mercedes-Benz'];
function splitName(name) {
  const n = name.trim().replace(/\s+/g, ' ');
  const make = MAKES.find((m) => n.toLowerCase().startsWith(m.toLowerCase() + ' ')) || n.split(' ')[0];
  return { make: n.slice(0, make.length), model: n.slice(make.length).trim() };
}

function stackPopover(base) {
  const id = `fx-pop-${++uid}`;
  return {
    trigger: `<button type="button" class="fx-trigger" aria-expanded="false" aria-controls="${id}">Price breakdown<svg class="fx-i" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 7v4.5M8 4.6v.1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>`,
    pop: `
<aside class="fx-pop fx-pop--stack" id="${id}" role="dialog" aria-labelledby="${id}-t">
  <header class="fx-pop__bar">
    <p class="fx-pop__title" id="${id}-t">Price breakdown</p>
    <button type="button" class="fx-close" aria-label="Close"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>
  </header>
  <div class="fx-pop__body">${stack(base)}</div>
</aside>`,
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
  $('.logoBox .logo.sisters').remove(); // partner-brand logos out of the header: McLaren stands alone
  // home: a plain outline house in the nav's own colour instead of the orange disc
  $('header .menuBox li.homeIc > a .imgIconBox').replaceWith('<svg class="mk-home" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 9.2 10 3.5l7 5.7M5 7.8V16.5h3.8v-4.6h2.4v4.6H15V7.8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>');
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
  chrome($, page, 'current');
  await fs.writeFile(`docs/current-${page}.html`, $.html());
}

// ---- SRP ----------------------------------------------------------------------
{
  const $ = await load('current-srp.html');
  let n = 0;
  $('.miniInf .price').each((_, el) => {
    const base = parse($(el).text());
    if (base == null) return; // no price on the card: nothing to include fees in
    $(el).text(`Price: ${usd(base + FEE_TOTAL)}`);
    const p = popover();
    $(el).parent().addClass('fx fx-srp').append(`<p class="fx-srp-row">${p.trigger}</p>${p.pop}`);
    n++;
  });
  chrome($, 'srp', 'v1');
  await fs.writeFile('docs/srp.html', $.html());
  console.log('srp: repriced', n, 'cards');
}

// ---- VDP ----------------------------------------------------------------------
{
  const $ = await load('current-vdp.html');
  const box = $('.actionsHead .priceBox');
  const base = parse(box.text());
  const total = usd(base + FEE_TOTAL);

  const head = popover();
  box.addClass('fx').html(`<h2>Price: ${total}</h2>${head.trigger}${head.pop}`);

  // one disclosure per page, next to the headline price; the Details table just carries the figure
  $('.tableBox td').filter((_, el) => $(el).text().trim() === 'Price:').next().text(total);

  $('title').text($('title').text().replace(usd(base), total));
  $('meta[property="product:original_price:amount"]').attr('content', String(base + FEE_TOTAL));
  chrome($, 'vdp', 'v1');
  await fs.writeFile('docs/vdp.html', $.html());
  console.log('vdp:', usd(base), '->', total);
}

// ---- SRP / VDP stack pages (V2, and V3 which starts as a copy of V2) ----------
// V3 pages carry both body classes, so they inherit V2's styles and V3-only
// changes can be scoped to .mk-v3.
async function buildStackPages(mode) {
  const cls = mode === 'v2' ? 'mk-v2' : `mk-v2 mk-${mode}`;
  {
    const $ = await load('current-srp.html');
    let n = 0;
    $('.miniInf .price').each((_, el) => {
      const base = parse($(el).text());
      if (base == null) return;
      if (mode === 'v3') {
        // V3: no hover, no click: the stack sits open in the card (dealer's reference, 6 Oct 2026)
        const mini = $(el).parent();
        $(el).remove();
        mini.after(stack(base, { plus: true, legal: true, cls: 'st-card' }));
      } else {
        $(el).text(`Total Price: ${usd(base + FEE_TOTAL)}`);
        const p = stackPopover(base);
        $(el).parent().addClass('fx fx-srp').append(`<p class="fx-srp-row">${p.trigger}</p>${p.pop}`);
      }
      n++;
    });
    if (mode === 'v3') {
      $('.car-col .titleBox h2').each((_, el) => {
        const { make, model } = splitName($(el).text());
        $(el).html(`<span class="t-make">${make}</span><span class="t-model">${model}</span>`);
      });
      // Save: the theme's blue PNG plus becomes an orange outline plus, matching Compare / Send to phone
      $('.car-col .pin > div:not(.active) img').replaceWith('<svg class="mk-plus" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v12M2 8h12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>');
    }
    $('body').addClass(cls);
    chrome($, 'srp', mode);
    await fs.writeFile(`docs/${PAGES[mode].srp}`, $.html());
    console.log(`srp-${mode}:`, n, 'cards');
  }
  {
    const $ = await load('current-vdp.html');
    const head = $('.actionsHead');
    const box = head.find('.priceBox');
    const base = parse(box.text());
    // title, then Year / Mileage, then the stack as its own block
    box.remove();
    if (mode === 'v3') {
      const name = head.find('h1').text().trim().replace(/^McLaren\s+/i, '');
      const year = head.find('.year').text().replace(/\D+/g, '');
      const miles = head.find('.milleage').text().replace(/[^\d,]/g, '');
      head.addClass('v3-head').html(band(base, `<span class="v3-make">McLAREN</span><span class="v3-model">${name.toUpperCase()}</span>`, year, miles));
    } else {
      head.append(`<div class="st-box">${stack(base)}</div>`);
    }
    const cell = $('.tableBox td').filter((_, el) => $(el).text().trim() === 'Price:');
    cell.next().text(usd(base));
    cell.parent().after(`<tr><td>Total Price:</td><td>${usd(base + FEE_TOTAL)}</td></tr>`);
    $('body').addClass(cls);
    chrome($, 'vdp', mode);
    await fs.writeFile(`docs/${PAGES[mode].vdp}`, $.html());
    console.log(`vdp-${mode}:`, usd(base), '+ fees =', usd(base + FEE_TOTAL));
  }
}

await buildStackPages('v2');
await buildStackPages('v3');
