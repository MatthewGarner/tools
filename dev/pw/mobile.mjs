/* Mobile foundations gate: phone-width first-run behaviour for in-scope tools.
   Run from dev/pw with both servers up (:8087 tools, :8089 energy), or point
   BASE/EBASE at other servers — same env-knob convention as the sibling suites. */
import {chromium, devices} from 'playwright';

const T = process.env.BASE || 'http://localhost:8087';
const E = process.env.EBASE || 'http://localhost:8089';
const AUTOLOAD = [
  ['roadmap', T + '/roadmap/'], ['tree', T + '/tree/'], ['why', T + '/why/'],
  ['map', T + '/map/'], ['wardley', T + '/wardley/'], ['bets', T + '/bets/'], ['cycles', E + '/cycles/'], ['risk', E + '/risk/'],
];
const ALL = [...AUTOLOAD,
  ['rank', T + '/rank/'], ['flow', T + '/flow/'], ['gauge', T + '/gauge/'],
  ['timeline', T + '/timeline/'], ['fermi', T + '/fermi/'], ['frequency', E + '/frequency/'],
  ['intraday', E + '/intraday/'], ['alarm', T + '/alarm/'], ['duel', T + '/duel/'],
  ['premortem', T + '/premortem/'],
];

let pass = 0, fail = 0;
const ok = (c, m) => { if(c){ pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } };

const browser = await chromium.launch();
const ctx = await browser.newContext({...devices['iPhone 13']});

for(const [name, url] of ALL){
  const page = await ctx.newPage();
  await page.goto(url, {waitUntil: 'networkidle'}).catch(()=>{});
  await page.waitForTimeout(900);
  // clientWidth is the stable layout-viewport width; innerWidth expands to fit
  // overflowing content on mobile, which masks exactly the h-scroll we're testing for.
  const vw = await page.evaluate(() => document.documentElement.clientWidth);
  const docSW = await page.evaluate(() => document.documentElement.scrollWidth);
  ok(docSW <= vw + 1, `${name}: no page-level horizontal scroll (${docSW} <= ${vw})`);
  // A visible editable field under 16px makes iOS Safari zoom the page on focus. Guard it.
  const tiny = await page.evaluate(() => {
    for(const el of document.querySelectorAll('input[type=text],input[type=number],input:not([type]),textarea,.cm-content')){
      if(el.offsetParent === null) continue;
      if(parseFloat(getComputedStyle(el).fontSize) < 16) return (el.id || el.className.toString().slice(0, 20) || el.tagName);
    }
    return null;
  });
  ok(tiny === null, `${name}: no <16px editable field (iOS zoom-on-focus)${tiny ? ' — ' + tiny : ''}`);
  /* page-scaffold parity: the per-tool style.css must carry the house page
     (a tool once shipped with Times New Roman on a transparent body) */
  const parity = await page.evaluate(() => {
    const cs = getComputedStyle(document.body);
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    const probe = document.createElement('div');
    probe.style.color = bg;
    document.body.appendChild(probe);
    const bgResolved = getComputedStyle(probe).color;
    probe.remove();
    const h1 = document.querySelector('h1');
    return {
      font: cs.fontFamily.includes('-apple-system') || cs.fontFamily.includes('system-ui'),
      bg: cs.backgroundColor === bgResolved,
      h1: h1 ? getComputedStyle(h1).fontFamily.includes('Charter') : true,
    };
  });
  ok(parity.font, `${name}: body wears the system font stack`);
  ok(parity.bg, `${name}: body background is the token --bg`);
  ok(parity.h1, `${name}: h1 wears Charter`);
  await page.close();
}

for(const [name, url] of AUTOLOAD){
  const page = await ctx.newPage();
  await page.goto(url, {waitUntil: 'networkidle'}).catch(()=>{});
  await page.waitForTimeout(1000);
  const hash = await page.evaluate(() => location.hash);
  const hasOutput = await page.evaluate(() =>
    !!document.querySelector('.stage svg, .preview svg, #chartwrap svg, main svg'));
  ok(hasOutput, `${name}: renders a default example on phone first-run`);
  ok(hash === '', `${name}: URL not polluted by auto-load (hash="${hash}")`);
  await page.close();
}

// Narrow no-overflow gate: the four tools whose charts/tables were just
// re-laid-out must not let their INNER render container overflow sideways —
// that's the "no sideways pan" guarantee this effort delivers. Page-level
// scroll is already covered above; this checks the container itself, since
// a workspace shell can clip page overflow while the container inside it
// still overflows (e.g. an oversized SVG or a fixed-width table row).
const CONTAINERS = [
  ['cycles', E + '/cycles/', ['#preview']],
  ['risk', E + '/risk/', ['#preview']],
  ['merit-order', E + '/merit-order/', ['#chartwrap']],
  ['rank', T + '/rank/', ['.tblwrap']],
  ['intraday', E + '/intraday/', ['#stackwrap', '#pricewrap']],
  ['wardley', T + '/wardley/', ['#preview']],
  ['bets', T + '/bets/', ['#preview']],
  ['alarm', T + '/alarm/', ['#gate', '#distwrap']],   // canvas re-flows to width, SVG is responsive
  // (duel not listed: its readout is hidden until Start, so a load-time container
  // check is a trivial pass; the ALL loop covers the visible setup's page h-scroll,
  // and the two-up duel cards stack via a pure CSS grid under 640px — can't pan)
  // (premortem not listed: the register is (a) behind wizard nav — not present at
  // load — and (b) an INTENTIONAL scroll container (a dense 6-col data table, the
  // plan's exports-pinned-wide exception), so the generic no-overflow assertion is
  // the wrong check. The bespoke register-phase walk below verifies the real
  // invariant: that scroll is contained inside .registerwrap and never blows out
  // the page body.)
];

for(const [name, url, selectors] of CONTAINERS){
  const page = await ctx.newPage();
  await page.goto(url, {waitUntil: 'networkidle'}).catch(()=>{});
  await page.waitForTimeout(1000);
  for(const sel of selectors){
    const found = await page.evaluate((s) => !!document.querySelector(s), sel);
    if(!found){
      ok(false, `${name}: container ${sel} not found on page`);
      continue;
    }
    const {sw, cw} = await page.evaluate((s) => {
      const el = document.querySelector(s);
      return {sw: el.scrollWidth, cw: el.clientWidth};
    }, sel);
    ok(sw <= cw + 2, `${name}: ${sel} no horizontal overflow (${sw} <= ${cw})`);
  }
  await page.close();
}

// premortem register-phase walk: the register is behind the wizard, so drive a
// fresh doc to a populated REGISTER on a phone and prove the dense table's own
// horizontal scroll stays inside .registerwrap and never blows out the page body
// (the wizard phase panels must reflow, not scroll — covered incidentally here).
{
  // fresh context: premortem is localStorage-backed, so a shared ctx would land
  // on its saved-list home instead of a new FRAME.
  const pctx = await browser.newContext({...devices['iPhone 13']});
  const page = await pctx.newPage();
  await page.goto(T + '/premortem/', {waitUntil: 'networkidle'}).catch(()=>{});
  await page.waitForTimeout(500);
  await page.fill('[data-field="title"]', 'Habitat phone launch');
  await page.fill('[data-field="question"]', 'It flopped. Why?');
  await page.click('#next'); await page.waitForTimeout(120);
  await page.click('[data-act="skiptimer"]'); await page.waitForTimeout(120);
  for(const t of ['Sign-up too slow on 3G', 'Push permission denied', 'Costs overshoot']){
    await page.fill('[data-add="entry"]', t); await page.press('[data-add="entry"]', 'Enter'); await page.waitForTimeout(80);
  }
  await page.click('#next'); await page.waitForTimeout(100);   // CLUSTER
  await page.click('#next'); await page.waitForTimeout(100);   // SCORE
  await page.locator('.scrow').first().locator('[data-p="lo"]').fill('30');
  await page.locator('.scrow').first().locator('[data-p="hi"]').fill('60');
  await page.locator('.scrow').first().locator('[data-impact="lo"]').fill('100');
  await page.locator('.scrow').first().locator('[data-impact="hi"]').fill('400');
  await page.waitForTimeout(120);
  await page.click('#next'); await page.waitForTimeout(100);   // ACTIONS
  await page.click('#next'); await page.waitForTimeout(100);   // VOTE
  await page.click('#next'); await page.waitForTimeout(250);   // REGISTER
  const vw = await page.evaluate(() => document.documentElement.clientWidth);
  const docSW = await page.evaluate(() => document.documentElement.scrollWidth);
  ok(docSW <= vw + 1, `premortem: register phase — no page-level h-scroll (${docSW} <= ${vw})`);
  const reg = await page.evaluate(() => {
    const w = document.querySelector('.registerwrap');
    if(!w) return null;
    return {clipped: getComputedStyle(w).overflowX === 'auto' || getComputedStyle(w).overflowX === 'scroll',
            contained: w.clientWidth <= document.documentElement.clientWidth + 1};
  });
  ok(reg && reg.clipped, 'premortem: register table scroll is confined to .registerwrap (overflow-x)');
  ok(reg && reg.contained, 'premortem: .registerwrap fits within the viewport width');
  // Stage 2: the FAB board's three columns must STACK on a phone (narrow relayout,
  // not pan). Switch to the board face, add cards, assert single-column + no h-scroll.
  await page.click('[data-view="board"]'); await page.waitForTimeout(150);
  await page.fill('[data-add-kind="assumption"]', 'Users grant push permission');
  await page.press('[data-add-kind="assumption"]', 'Enter'); await page.waitForTimeout(120);
  await page.fill('[data-add-kind="fact"]', 'iOS is 70% of installs');
  await page.press('[data-add-kind="fact"]', 'Enter'); await page.waitForTimeout(120);
  const board = await page.evaluate(() => {
    const b = document.querySelector('.board');
    const cols = getComputedStyle(b).gridTemplateColumns.split(' ').filter(Boolean).length;
    return {oneCol: cols === 1, docSW: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth};
  });
  ok(board.oneCol, 'premortem: FAB board stacks to one column on a phone (narrow relayout)');
  ok(board.docSW <= board.vw + 1, `premortem: board face — no page-level h-scroll (${board.docSW} <= ${board.vw})`);
  await page.close();
  await pctx.close();
}

// WIDENED cardmenu gate: on phone width, every non-ghost card exposes a
// data-hit tap rect at least 44px on its long axis, and no two tap rects
// intersect — a thumb must be able to land on exactly one card. Measures
// [data-hit] (the tap target), NOT the [data-edit] group bbox — the map
// group's bbox unions its leader line, which would mask a too-small hit rect.
const WIDENED = [['roadmap', T + '/roadmap/', 'Habit app roadmap'],
                 ['map', T + '/map/', 'Assumption map'],
                 ['why', T + '/why/', 'Habit retention'],
                 ['tree', T + '/tree/', 'Bid or no bid'],
                 ['bets', T + '/bets/', 'Habitat portfolio']];

for(const [name, url, chip] of WIDENED){
  const page = await ctx.newPage();
  await page.goto(url, {waitUntil: 'networkidle'}).catch(()=>{});
  await page.waitForTimeout(400);
  const b = page.getByRole('button', {name: chip});
  if(await b.count()) await b.click();
  await page.waitForTimeout(600);
  const {hits, cards} = await page.evaluate(() => ({
    hits: [...document.querySelectorAll('#preview svg [data-hit]')]
      .map(el => { const r = el.getBoundingClientRect(); return {x: r.x, y: r.y, w: r.width, h: r.height}; }),
    cards: document.querySelectorAll('#preview svg [data-edit^="cardmenu"]').length,
  }));
  ok(cards > 0, `${name}: cards carry a cardmenu target`);
  ok(hits.length >= cards, `${name}: every cardmenu card has a data-hit tap rect`);
  ok(hits.every(r => Math.max(r.w, r.h) >= 44), `${name}: every card tap rect long-axis >= 44px`);
  const overlap = hits.some((a, i) => hits.some((b2, j) => j > i &&
    a.x < b2.x + b2.w && b2.x < a.x + a.w && a.y < b2.y + b2.h && b2.y < a.y + a.h));
  ok(!overlap, `${name}: no two card tap rects intersect`);
  await page.close();
}

await browser.close();
console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
