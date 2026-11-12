/* Export fidelity gate: the export contract (docs: the export-contract spec, rules E1-E7, P1-P4, S1-S7, A1-A5, G1, M1-M2, R1)
   held as checks on what the real buttons produce. Roadmap and Timeline, the built-in examples plus the stress documents
   in dev/fixtures/export-stress, light, and the examples again in dark. The checks themselves live in export-checks.mjs and are
   shared with the full release-time matrix, dev/pw/export-audit.mjs (every document, theme, view and format).
   Run from dev/pw with the server up (BASE), like the sibling suites. Every wait is bounded; a failure names the document,
   view and rule. Budget: 90 seconds at --jobs 3. */
import {chromium, webkit} from 'playwright';
import {readFileSync, readdirSync, mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {deflateRawSync} from 'node:zlib';
import {report, tally} from './_harness.mjs';
import {checkGeometry, measureSvgInPage, checkSelfContained, checkPicture, checkSlideSet, checkTimelineAxis, checkPngScale} from './export-checks.mjs';
import {parse as parseRoadmap} from '../../roadmap/parse.js';
import {roadmapToMarkdown, markdownToRoadmapDsl} from '../../roadmap/markdown.js';

const T = process.env.BASE || 'http://localhost:8087';
const results = [];
const ok = (name, pass, detail = '') => { results.push((pass ? 'PASS ' : 'FAIL ') + name + (pass ? '' : detail ? ' — ' + detail : '')); if(!pass) console.log('FAIL ' + name + (detail ? ' — ' + detail : '')); };
const FIXTURES = new URL('../fixtures/export-stress/', import.meta.url);
const load = (tool, name) => readFileSync(new URL(`${tool}/${name}.txt`, FIXTURES), 'utf8');
const hashFor = source => 'z:' + deflateRawSync(Buffer.from(JSON.stringify({t: source, e: 0}))).toString('base64url');
const scratch = mkdtempSync(join(tmpdir(), 'export-fidelity-'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const T0 = Date.now();

const TOOLS = {
  roadmap: {path: '/roadmap/', views: ['grid', 'board', 'focus', 'register', 'register+outcome'],
    light: ['example', 'example-quarterly', 'minimal', 'long-text', 'dense', 'awkward-text', 'every-feature'], dark: ['example']},
  timeline: {path: '/timeline/', views: ['field', 'review', 'decisions', 'register'],
    light: ['example', 'example-2', 'example-3', 'minimal', 'long-text', 'dense', 'awkward-text', 'every-feature', 'extreme-dates'], dark: ['example']},
};
/* big documents get the views that stress the layout; the built-in examples get every view */
const VIEWS_FOR = (tool, doc) => ['example', 'example-2', 'example-quarterly', 'minimal'].includes(doc) || ['long-text', 'every-feature'].includes(doc) ? TOOLS[tool].views : TOOLS[tool].views.slice(0, 2);

/* EXPORT_BROWSER=webkit and EXPORT_VIEWPORT=375x812 re-run the same contract in Safari's engine and at phone width (U7 pass; not part of the gate) */
const WEBKIT = process.env.EXPORT_BROWSER === 'webkit';
const [VW, VH] = (process.env.EXPORT_VIEWPORT || '1280x800').split('x').map(Number);
const PHONE = VW < 600;
const browser = await (WEBKIT ? webkit : chromium).launch();
const fail = [];

async function ready(page){
  await page.waitForFunction(() => {
    const fs = document.getElementById('fontstatus');
    return document.querySelector('#preview svg') && (!fs || fs.hidden);
  }, null, {timeout: 15000});
  let last = null;
  for(let i = 0; i < 12; i++){
    const now = await page.evaluate(() => document.querySelector('#preview svg')?.outerHTML.length);
    if(now === last) break;
    last = now; await sleep(120);
  }
}
async function openDoc(page, tool, source){
  await page.goto('about:blank');
  await page.goto(T + TOOLS[tool].path + '#' + hashFor(source), {waitUntil: 'load'});
  await ready(page);
}
async function setView(page, tool, view){
  const [style, group] = view.split('+');
  await page.locator(`#stylepicker [data-style="${style}"]`).click({timeout: 8000});
  await page.waitForFunction(([t, s]) => { const svg = document.querySelector('#preview svg'); return svg && (t === 'roadmap' ? svg.dataset.chapterLayout : svg.dataset.direction) === s; }, [tool, style], {timeout: 8000});
  if(group){ await page.locator(`#grouppicker [data-group="${group}"]`).click({timeout: 8000}); await page.waitForFunction(g => document.querySelector(`#grouppicker [data-group="${g}"]`)?.getAttribute('aria-pressed') === 'true', group, {timeout: 8000}); }
  await ready(page);
}
async function openExportMenu(page){
  const open = await page.evaluate(() => document.querySelector('#dlsvg')?.closest('details')?.open);
  if(!open) await page.locator('details:has(#dlsvg) > summary').first().click();
}
async function downloadFrom(page, selector){
  await openExportMenu(page);
  const [d] = await Promise.all([page.waitForEvent('download', {timeout: 10000}), page.locator(selector).click({timeout: 8000})]);
  return d.path();
}
const pngSize = buf => ({w: buf.readUInt32BE(16), h: buf.readUInt32BE(20)});
async function slideSet(page, tool){
  await page.locator('#exportdeck').click({timeout: 8000});
  await page.waitForSelector('#slidepreviewdialog[open]', {timeout: 8000});
  await ready2(page);
  const n = +(/of (\d+)/.exec(await page.locator('#slideposition').textContent())?.[1] || 0);
  const svgs = [];
  for(let i = 0; i < n; i++){
    svgs.push(await page.evaluate(() => document.querySelector('#slidecanvas svg')?.outerHTML ?? null));
    if(i < n - 1){ await page.locator('#slidenext').click({timeout: 8000}); await sleep(60); }
  }
  await page.locator('#slideclose').click({timeout: 8000});
  return svgs;
}
const ready2 = page => page.waitForFunction(() => document.querySelector('#slidecanvas svg') || !document.getElementById('slideerror')?.hidden, null, {timeout: 12000});
const stripFonts = svg => svg.replace(/<style\b[^>]*data-chapter-fonts="embedded"[^>]*>[\s\S]*?<\/style>/g, '');
/* Named, reasoned exceptions: a rule the layout cannot meet on that document in that view, reported by the suite and read by the
   reviewer. Nothing is exempt by default; each entry says what was measured. */
const KNOWN = [
  {where: 'timeline/every-feature/light/register', check: 'slides:lane-split', why: 'Launch (4 rows) cannot be kept whole or split 2+2 in two slides, and a third slide would leave 2 unlaned rows alone (a thin slide); one issue either way'},
  {where: 'timeline/long-text/light/decisions', check: 'slides:orphans', why: 'slide 1 is one very tall decision card (40% of the body) and the next card does not fit beside it'},
  {where: 'timeline/long-text/dark/decisions', check: 'slides:orphans', why: 'as the light theme'},
];
const known = (where, c) => KNOWN.find(k => where.startsWith(k.where) && k.check === c.check);
const fails = list => list.filter(c => c.pass === false);

async function checkDoc(page, tool, doc, theme){
  const source = load(tool, doc);
  const tag = `${tool}/${doc}/${theme}`;
  await openDoc(page, tool, source);
  const horizons = tool === 'roadmap' ? parseRoadmap(source).horizons : [];
  const title = tool === 'roadmap' ? parseRoadmap(source).title : '';
  const lanes = tool === 'roadmap' ? parseRoadmap(source).lanes : [];
  /* at phone width the view picker is not offered: the document's own view is exported (the picture is independent of the window, E5) */
  for(const wanted of PHONE ? [null] : VIEWS_FOR(tool, doc)){
    if(wanted) await setView(page, tool, wanted);
    const view = wanted || await page.evaluate(t => { const svg = document.querySelector('#preview svg'); return (t === 'roadmap' ? svg.dataset.chapterLayout : svg.dataset.direction) + (t === 'roadmap' && document.querySelector('#grouppicker [aria-pressed=true][data-group=outcome]') ? '+outcome' : ''); }, tool);
    /* ---- the picture (SVG download): E2 E3 E4 P1 P2 G1 A1-A5 */
    const file = await downloadFrom(page, '#dlsvg');
    const svg = readFileSync(file, 'utf8');
    /* the page's own fonts are measured (a data: face is blocked inside the page); the embedded faces are checked as text */
    const geo = await page.evaluate(measureSvgInPage, stripFonts(svg));
    const bad = [...checkGeometry(geo, svg).filter(c => ['clipped-text', 'overlap:text-text', 'overlap:text-shape', 'off-canvas:shapes', 'contrast'].includes(c.check)),
      ...checkSelfContained(svg, geo).filter(c => ['self-contained:external-refs', 'self-contained:generic-fallback', 'self-contained:font-families'].includes(c.check)),
      ...(tool === 'roadmap' ? checkPicture(geo, {style: view.split('+')[0]}) : checkTimelineAxis(svg))];
    ok(`${tag}/${view}: the picture meets E2/E3/E4/P1/P2/G1/A1-A5`, fails(bad).length === 0, fails(bad).map(c => `${c.check} ${JSON.stringify(c.values).slice(0, 160)}`).join(' | '));
    ok(`${tag}/${view}: one theme, matching the page (${theme}) (E4)`, (/<rect x="0" y="0"[^>]*fill="(#[0-9A-Fa-f]{6})"/.exec(svg)?.[1] || '').toUpperCase() === (theme === 'light' ? '#F6F3ED' : '#171A18'));
    /* ---- the slide set: S1-S7 */
    const slides = await slideSet(page, tool);
    ok(`${tag}/${view}: slides are made, 16:9 and complete`, slides.length > 0 && slides.every(s => s && /width="1920"[^>]*height="1080"/.test(s)), `${slides.length} slides`);
    if(slides.length){
      const set = checkSlideSet(slides, {tool, horizons, lanes, furniture: [title, ...(['grid', 'board'].includes(view.split('+')[0]) ? horizons : [])].filter(Boolean), style: view.split('+')[0], laneBand: tool === 'timeline' ? 110 : 0});
      const bad = fails(set).filter(c => { const k = known(`${tag}/${view}`, c); if(k) console.log(`KNOWN ${tag}/${view}: ${c.check} ${JSON.stringify(c.values).slice(0, 140)} (${k.why})`); return !k; });
      ok(`${tag}/${view}: the slide set meets S1-S6 (${slides.length} slide${slides.length === 1 ? '' : 's'})`, bad.length === 0, bad.map(c => `${c.check} ${JSON.stringify(c.values).slice(0, 160)}`).join(' | '));
      if(tool === 'timeline'){
        const axis = fails(checkTimelineAxis(slides[0]));
        ok(`${tag}/${view}: the slide axis meets A1-A4`, axis.length === 0, axis.map(c => c.check + ' ' + JSON.stringify(c.values).slice(0, 120)).join(' | '));
      }
      if(slides.length === 1 && view === TOOLS[tool].views[0]){
        const g = await page.evaluate(measureSvgInPage, stripFonts(slides[0]));
        const sb = fails(checkGeometry(g, slides[0]).filter(c => ['clipped-text', 'overlap:text-text', 'overlap:text-shape', 'contrast'].includes(c.check)));
        ok(`${tag}/${view}: the slide has no clipped or overlapping text and readable contrast (E2/E4)`, sb.length === 0, sb.map(c => c.check + ' ' + JSON.stringify(c.values).slice(0, 140)).join(' | '));
      }
    }
  }
}

try{
  /* ---- documents, light and dark */
  for(const theme of ['light', 'dark']){
    const ctx = await browser.newContext({viewport: {width: VW, height: VH}, reducedMotion: 'reduce', acceptDownloads: true, colorScheme: theme});
    if(!WEBKIT) await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], {origin: new URL(T).origin});
    ctx.setDefaultTimeout(10000);
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    for(const tool of Object.keys(TOOLS)) for(const doc of TOOLS[tool][theme]){
      try{ await checkDoc(page, tool, doc, theme); }
      catch(error){ ok(`${tool}/${doc}/${theme}: ran to the end`, false, String(error?.message || error).split('\n')[0]); }
    }
    ok(`${theme}: no page errors while exporting`, errors.length === 0, errors.slice(0, 2).join(' | '));
    await ctx.close();
  }

  /* ---- E5, E6, P3, P4, E7 on the real buttons */
  {
    const ctx = await browser.newContext({viewport: {width: VW, height: VH}, reducedMotion: 'reduce', acceptDownloads: true});
    if(!WEBKIT) await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], {origin: new URL(T).origin});
    const page = await ctx.newPage();
    for(const tool of Object.keys(TOOLS)){
      await openDoc(page, tool, load(tool, 'example'));
      const a = readFileSync(await downloadFrom(page, '#dlsvg'), 'utf8'), b = readFileSync(await downloadFrom(page, '#dlsvg'), 'utf8');
      ok(`${tool}: the same plan gives the same bytes twice (E6)`, a === b);
      await page.setViewportSize({width: 375, height: 812}); await sleep(400);
      const phone = readFileSync(await downloadFrom(page, '#dlsvg'), 'utf8');
      ok(`${tool}: the picture is the same at 375px wide and 1280px (E5)`, a === phone);
      await page.setViewportSize({width: 1280, height: 800}); await sleep(300);
      /* a closed dialog's choice must not change the copy (E5) */
      if(tool === 'roadmap'){
        await page.locator('#exportdeck').click(); await page.waitForSelector('#slidepreviewdialog[open]');
        await page.selectOption('#exportdetail', 'titles'); await page.locator('#slideclose').click();
      }
      await openExportMenu(page);
      const pngFile = await downloadFrom(page, '#dlpng');
      await page.evaluate(() => navigator.clipboard.writeText('')).catch(() => {});
      await page.locator('#copypng').click();
      await page.waitForFunction(() => /^Copied/.test(document.getElementById('copypng').textContent), null, {timeout: 8000}).catch(() => {});
      const copied = WEBKIT ? 'unreadable' : await page.evaluate(async () => { const items = await navigator.clipboard.read(); for(const i of items) if(i.types.includes('image/png')){ const buf = new Uint8Array(await (await i.getType('image/png')).arrayBuffer()); return Array.from(buf.slice(0, 24)); } return null; });
      const dl = readFileSync(pngFile);
      ok(`${tool}: Copy PNG is present and copies the picture Download PNG gives (P4), whatever the dialog last chose (E5)`, !!copied && (copied === 'unreadable' || (Buffer.from(copied).readUInt32BE(16) === dl.readUInt32BE(16) && Buffer.from(copied).readUInt32BE(20) === dl.readUInt32BE(20))) && !(await page.locator('#copypng').isHidden()));   // WebKit: the clipboard cannot be read back by the harness, so only presence is checked
    }
    /* P3 + E7: a plan too large for 2x is saved at a lower scale and the status line says so and stays */
    await openDoc(page, 'roadmap', load('roadmap', 'dense-quarterly'));
    const dense = readFileSync(await downloadFrom(page, '#dlpng'));
    const size = pngSize(dense);
    const svgText = readFileSync(await downloadFrom(page, '#dlsvg'), 'utf8');
    const dims = /<svg[^>]*width="([\d.]+)"[^>]*height="([\d.]+)"/.exec(svgText);
    const scale = checkPngScale({w: size.w, h: size.h}, +dims[1], +dims[2]);
    ok(`roadmap/dense-quarterly: the PNG is made at the largest scale that fits, not refused (P3)`, scale.pass, JSON.stringify(scale.values));
    await sleep(2600);
    const status = await page.evaluate(() => { const s = document.getElementById('exportstatus'); return s && !s.hidden ? s.textContent : ''; });
    ok(`roadmap/dense-quarterly: a reduced-scale PNG is stated in a status line that stays after the button label reverts (E7)`, scale.values.scaleX >= 2 || /not 2x/.test(status), status);
    await ctx.close();
  }

  /* ---- R1: print prints the artefact alone, light, whatever the page shows */
  {
    const ctx = await browser.newContext({viewport: {width: VW, height: VH}, reducedMotion: 'reduce', colorScheme: 'dark'});
    const page = await ctx.newPage();
    for(const tool of Object.keys(TOOLS)){
      await openDoc(page, tool, load(tool, 'dense'));
      await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
      await page.emulateMedia({media: 'print'});
      const info = await page.evaluate(() => {
        const sheets = [...document.querySelectorAll('#print-artefact .print-page')];
        const cut = [], rowsPer = [];
        sheets.forEach((sheet, i) => {
          let rows = 0;
          for(const svg of sheet.querySelectorAll('svg')){
            if(svg.querySelector('svg')) continue;   // a wrapper: its nested slices are checked
            const vb = svg.viewBox.baseVal, y0 = vb.y, y1 = vb.y + vb.height;
            for(const g of svg.querySelectorAll('[data-key],[data-field-item]')){
              const b = g.getBBox();
              if(b.y < y0 - .5 && b.y + b.height > y0 + .5 || b.y < y1 - .5 && b.y + b.height > y1 + .5) cut.push({sheet: i + 1, row: (g.getAttribute('data-key') || g.getAttribute('data-field-item') || '').slice(0, 30)});
              else if(b.y >= y0 - .5 && b.y + b.height <= y1 + .5) rows++;
            }
          }
          rowsPer.push(rows);
        });
        const ratios = [...document.querySelectorAll('#print-artefact .print-page > svg')].map(s => s.getBoundingClientRect().height / s.getBoundingClientRect().width);
        const widths = [...document.querySelectorAll('#print-artefact .print-page > svg')].map(s => s.getBoundingClientRect().width / sheets[0].getBoundingClientRect().width);
        return {pages: sheets.length, shown: [...document.body.children].filter(e => getComputedStyle(e).display !== 'none').map(e => e.id || e.tagName),
          light: /<rect x="0" y="0"[^>]*fill="#F6F3ED"/i.test(document.querySelector('#print-artefact svg')?.outerHTML || ''), cut, rowsPer,
          tall: ratios.some(r => r > .66 + .001), narrowest: Math.min(...widths)};
      });
      ok(`${tool}: print shows the artefact alone, in the light theme, in sheets that fit (R1)`, info.pages >= 1 && info.shown.join() === 'print-artefact' && info.light && !info.tall, JSON.stringify(info));
      ok(`${tool}: no row is cut by a page break, the last sheet is not just the legend, and a short artefact is shrunk onto one sheet (F8)`,
        info.cut.length === 0 && (info.pages === 1 ? info.narrowest >= .69 : info.rowsPer.at(-1) >= 1), JSON.stringify(info));
      await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
      await page.emulateMedia({media: 'screen'});
      ok(`${tool}: afterprint puts the page back`, await page.locator('#print-artefact').count() === 0);
    }
    await ctx.close();
  }

  /* ---- M1: Markdown copy imports back to the same plan (pure modules, every stress document) */
  for(const file of readdirSync(new URL('roadmap/', FIXTURES)).filter(f => f.endsWith('.txt'))){
    const a = parseRoadmap(readFileSync(new URL('roadmap/' + file, FIXTURES), 'utf8'));
    const b = parseRoadmap(markdownToRoadmapDsl(roadmapToMarkdown(a, {href: ''})));
    const key = it => JSON.stringify([it.title, it.note || '', it.lane || '', it.h, it.status || null, it.span || 1, it.bet ? [it.bet.name, it.bet.outcome || ''] : null, it.cond ? [it.cond.when, it.cond.name] : null]);
    const same = a.title === b.title && a.headline === b.headline && a.story === b.story && (a.verdict ?? null) === (b.verdict ?? null) && (a.dateStr ?? null) === (b.dateStr ?? null) &&
      JSON.stringify(a.horizons) === JSON.stringify(b.horizons) && JSON.stringify(a.items.map(key).sort()) === JSON.stringify(b.items.map(key).sort());
    ok(`roadmap/${file.replace('.txt', '')}: Markdown copy imports back to the same plan (M1/M2)`, same);
  }
} catch(error){
  ok('the suite ran to the end without a crash', false, String(error?.stack || error).split('\n').slice(0, 3).join(' / '));
} finally {
  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 10000))]);
}
console.log(`export-fidelity: ${Math.round((Date.now() - T0) / 1000)}s`);
results.forEach(r => console.log(r));
report('export-fidelity', {...tally(results), min: 300});
