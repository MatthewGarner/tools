/* Export-fidelity audit for Roadmap and Timeline (not registered in the gate).

   Drives the REAL pages and REAL buttons with Playwright, captures the bytes a
   user would receive (downloads, clipboard, unzipped slide sets, Markdown), then
   measures them. Product code is never called to fake an export; the only module
   imported from the product is the pure DSL parser, used to know how many items a
   document really has.

   Phases (default: all)        node dev/pw/export-audit.mjs [flags]
     capture   load each stress document, click every export path, save raw artefacts
     analyse   run the checks on saved artefacts, write findings
     sheets    compose labelled contact sheets from saved artefacts
     axis      (timeline) month-tick continuity on the saved SVG downloads; no browser
     onscreen  re-take only the on-screen screenshots with menus closed (no exports)
     probes    other routes into dark mode (OS scheme flips after load, masthead toggle) vs the captured dark export
               (needs the 'example' documents captured first)

   Flags
     --tool roadmap|timeline   --doc a,b (substring match)   --theme light|dark
     --view grid,board,...     --phase capture,analyse,sheets   --out <dir>
     --browser chromium|webkit   --viewport 375x812   (default chromium 1280x800)
     --base http://host:port   (default: start our own dev/serve.mjs on a free port)
     --timeout 10000           default per-action bound in ms

   Stress documents: dev/fixtures/export-stress/{roadmap,timeline}/*.txt (each starts with a comment line saying
   what it stresses; compare-changed is loaded after snapshotting compare-base through the real History menu).
   Examples: node dev/pw/export-audit.mjs --tool roadmap --doc long-text --theme light --view grid,register
             node dev/pw/export-audit.mjs --tool timeline --doc example --phase analyse

   Evidence layout (outside the worktree, never committed):
     <out>/raw/<tool>/<doc>/<theme>/<view>/…   artefacts + manifest.json
     <out>/findings/<tool>--<doc>.json         one record per artefact per check
     <out>/findings.json                       all of the above merged
     <out>/sheets/…                            contact sheets                   */
import {chromium, webkit} from 'playwright';
import {deflateRawSync, inflateRawSync} from 'node:zlib';
import {readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, statSync, rmSync} from 'node:fs';
import {join, dirname, resolve, basename} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {startServer} from './session.mjs';
import {checkSlideSet, checkPngScale, measureSvgInPage, contrast, checkSelfContained, checkWidthParity, checkGeometry, checkAxisMonths, checkPicture} from './export-checks.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const FIXTURES = join(ROOT, 'dev/fixtures/export-stress');
const FIXED_NOW = new Date('2026-11-12T10:00:00Z');   // deterministic "today" for date-less documents

export const TOOLS = {
  roadmap: {
    path: '/roadmap/',
    views: ['grid', 'board', 'focus', 'register', 'register+outcome'],
    deckDetails: ['complete', 'titles'],
    viewAttr: svg => svg.dataset.chapterLayout,
  },
  timeline: {
    path: '/timeline/',
    views: ['field', 'review', 'decisions', 'register'],
    deckDetails: [null],
    viewAttr: svg => svg.dataset.direction,
  },
};
/* a "changed" document is compared against its base through the real Snapshot UI */
const COMPARE_BASE = {'compare-changed': 'compare-base'};

/* ------------------------------------------------------------------ utilities */
export const sleep = ms => new Promise(r => setTimeout(r, ms));
const arg = (name, fallback) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : fallback; };
const asList = v => (v ? String(v).split(',').map(s => s.trim()).filter(Boolean) : null);
const slug = s => String(s).replace(/[^a-z0-9+_.-]+/gi, '-');
const ensure = dir => { mkdirSync(dir, {recursive: true}); return dir; };
const round = (n, p = 2) => Math.round(n * 10 ** p) / 10 ** p;
const r1 = n => round(n, 2);
const normText = s => String(s ?? '').replace(/[   ]/g, ' ').replace(/\s+/g, ' ').trim();

export function loadFixtures(tool){
  const dir = join(FIXTURES, tool);
  return readdirSync(dir).filter(f => f.endsWith('.txt')).sort()
    .map(f => ({name: f.replace(/\.txt$/, ''), source: readFileSync(join(dir, f), 'utf8')}));
}
/* the shared-link form a user's Share button produces: z:+base64url(deflate-raw(JSON)) */
export const hashFor = source => 'z:' + deflateRawSync(Buffer.from(JSON.stringify({t: source, e: 0}))).toString('base64url');

/* Slide sets are STORED zips (assets/export-zip.js); read the central directory. */
export function readStoredZip(buf){
  const files = [];
  let end = -1;
  for(let i = buf.length - 22; i >= 0; i--) if(buf.readUInt32LE(i) === 0x06054b50){ end = i; break; }
  if(end < 0) throw new Error('not a zip: no end-of-central-directory record');
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  for(let n = 0; n < count; n++){
    if(buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory');
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), nlen = buf.readUInt16LE(p + 28);
    const elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nlen).toString('utf8');
    const lnlen = buf.readUInt16LE(off + 26), lelen = buf.readUInt16LE(off + 28);
    const data = buf.slice(off + 30 + lnlen + lelen, off + 30 + lnlen + lelen + csize);
    files.push({name, bytes: method === 0 ? data : inflateRawSync(data), method});
    p += 46 + nlen + elen + clen;
  }
  return files;
}

/* ------------------------------------------------------------------ findings */
export class Findings {
  constructor(){ this.records = []; }
  add(rec){ this.records.push({pass: null, values: {}, note: '', ...rec}); }
}

/* ------------------------------------------------------------------ in-page functions
   (self-contained: Playwright serialises them, so no closure variables) */


/* decode a PNG (as base64) and summarise it */
async function analysePngInPage(b64){
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const bm = await createImageBitmap(new Blob([bytes], {type: 'image/png'}));
  const w = bm.width, h = bm.height;
  const cv = new OffscreenCanvas(w, h), g = cv.getContext('2d', {willReadFrequently: true});
  g.drawImage(bm, 0, 0);
  const d = g.getImageData(0, 0, w, h).data;
  const px = (x, y) => { const o = (y * w + x) * 4; return [d[o], d[o + 1], d[o + 2], d[o + 3]]; };
  const corners = [px(0, 0), px(w - 1, 0), px(0, h - 1), px(w - 1, h - 1)];
  const bg = corners[0];
  let minA = 255, nonOpaque = 0, minx = w, miny = h, maxx = -1, maxy = -1, nonBg = 0, lum = 0;
  const seen = new Set();
  for(let y = 0; y < h; y++) for(let x = 0; x < w; x++){
    const o = (y * w + x) * 4, a = d[o + 3];
    if(a < minA) minA = a;
    if(a < 255) nonOpaque++;
    const diff = Math.abs(d[o] - bg[0]) + Math.abs(d[o + 1] - bg[1]) + Math.abs(d[o + 2] - bg[2]);
    if(diff > 12){ nonBg++; if(x < minx) minx = x; if(x > maxx) maxx = x; if(y < miny) miny = y; if(y > maxy) maxy = y; }
    if((x + y) % 7 === 0){ seen.add((d[o] >> 4) << 8 | (d[o + 1] >> 4) << 4 | d[o + 2] >> 4); lum += .2126 * d[o] + .7152 * d[o + 1] + .0722 * d[o + 2]; }
  }
  const bbox = nonBg ? [minx, miny, maxx + 1, maxy + 1] : null;
  /* does non-background paint touch each edge? (outer 2px ring) */
  const touch = {left: false, right: false, top: false, bottom: false};
  const isInk = (x, y) => { const p = px(x, y); return Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) > 12; };
  for(let y = 0; y < h; y += 2){ if(isInk(0, y) || isInk(1, y)) touch.left = true; if(isInk(w - 1, y) || isInk(w - 2, y)) touch.right = true; }
  for(let x = 0; x < w; x += 2){ if(isInk(x, 0) || isInk(x, 1)) touch.top = true; if(isInk(x, h - 1) || isInk(x, h - 2)) touch.bottom = true; }
  return {w, h, bg, corners, minAlpha: minA, nonOpaquePixels: nonOpaque, nonBgPixels: nonBg, nonBgFraction: nonBg / (w * h), bbox,
    margins: bbox ? {left: bbox[0], top: bbox[1], right: w - bbox[2], bottom: h - bbox[3]} : null,
    distinctColours: seen.size, meanLum: lum / (w * h / 7), edgeTouch: touch};
}

/* per-pixel difference of two PNGs, clustered into 32px tiles */
async function diffPngInPage(args){
  const [a64, b64, tol] = args;
  const load = async b => { const by = Uint8Array.from(atob(b), c => c.charCodeAt(0)); const bm = await createImageBitmap(new Blob([by], {type: 'image/png'}));
    const cv = new OffscreenCanvas(bm.width, bm.height), g = cv.getContext('2d', {willReadFrequently: true}); g.drawImage(bm, 0, 0);
    return {w: bm.width, h: bm.height, d: g.getImageData(0, 0, bm.width, bm.height).data}; };
  const A = await load(a64), B = await load(b64);
  /* a one- or two-pixel difference is the rounding of a fractional scale; compare the common area */
  if(Math.abs(A.w - B.w) > 2 || Math.abs(A.h - B.h) > 2) return {sizeMismatch: true, a: [A.w, A.h], b: [B.w, B.h]};
  const CW = Math.min(A.w, B.w), CH = Math.min(A.h, B.h);
  const T = 32, tw = Math.ceil(CW / T), th = Math.ceil(CH / T);
  const tiles = new Uint32Array(tw * th);
  let count = 0, maxDiff = 0, sum = 0;
  for(let y = 0; y < CH; y++) for(let x = 0; x < CW; x++){
    const o = (y * A.w + x) * 4, q = (y * B.w + x) * 4;
    const dd = Math.max(Math.abs(A.d[o] - B.d[q]), Math.abs(A.d[o + 1] - B.d[q + 1]), Math.abs(A.d[o + 2] - B.d[q + 2]), Math.abs(A.d[o + 3] - B.d[q + 3]));
    if(dd > maxDiff) maxDiff = dd;
    if(dd > tol){ count++; sum += dd; tiles[(Math.floor(y / T)) * tw + Math.floor(x / T)]++; }
  }
  const comp = new Int32Array(tw * th).fill(-1), regions = [];
  for(let s = 0; s < tiles.length; s++){
    if(!tiles[s] || comp[s] >= 0) continue;
    const id = regions.length, stack = [s]; comp[s] = id;
    const r = {tiles: 0, pixels: 0, x0: 1e9, y0: 1e9, x1: -1, y1: -1};
    while(stack.length){
      const t = stack.pop(), tx = t % tw, ty = (t - tx) / tw;
      r.tiles++; r.pixels += tiles[t];
      r.x0 = Math.min(r.x0, tx * T); r.y0 = Math.min(r.y0, ty * T); r.x1 = Math.max(r.x1, Math.min(A.w, (tx + 1) * T)); r.y1 = Math.max(r.y1, Math.min(A.h, (ty + 1) * T));
      for(let dy = -1; dy <= 1; dy++) for(let dx = -1; dx <= 1; dx++){
        const nx = tx + dx, ny = ty + dy; if(nx < 0 || ny < 0 || nx >= tw || ny >= th) continue;
        const n = ny * tw + nx; if(tiles[n] && comp[n] < 0){ comp[n] = id; stack.push(n); }
      }
    }
    regions.push(r);
  }
  regions.sort((p, q) => q.pixels - p.pixels);
  return {w: A.w, h: A.h, diffPixels: count, ratio: count / (A.w * A.h), maxDiff, meanDiff: count ? sum / count : 0, regionCount: regions.length, regions: regions.slice(0, 8)};
}

/* compose a contact sheet. rows: [{label, cells:[{label, b64|null, note}]}] */
async function composeSheetInPage(spec){
  const {cellW, sliceH, part, rows, title} = spec;
  const imgs = new Map();
  for(const r of rows) for(const c of r.cells) if(c.b64 && !imgs.has(c.b64)){
    const by = Uint8Array.from(atob(c.b64), x => x.charCodeAt(0));
    imgs.set(c.b64, await createImageBitmap(new Blob([by], {type: 'image/png'})));
  }
  const n = Math.max(...rows.map(r => r.cells.length));
  const labelH = 34, gap = 16, rowLabelH = 40, head = 46;
  const W = n * cellW + (n + 1) * gap;
  const rowH = r => labelH + Math.min(sliceH, Math.max(...r.cells.map(c => { const bm = c.b64 && imgs.get(c.b64); return bm ? Math.ceil(bm.height * Math.min(1, cellW / bm.width)) : 40; })));
  const H = head + rows.reduce((s, r) => s + rowLabelH + rowH(r) + gap, 0);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#777'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#fff'; g.font = '600 24px sans-serif'; g.textBaseline = 'middle';
  g.fillText(title, gap, head / 2);
  let y = head;
  for(const r of rows){
    g.fillStyle = '#ffd34d'; g.font = '600 20px sans-serif'; g.fillText(r.label, gap, y + rowLabelH / 2);
    y += rowLabelH;
    const rh = rowH(r);
    r.cells.forEach((c, ci) => {
      const x = gap + ci * (cellW + gap);
      g.fillStyle = '#222'; g.fillRect(x, y, cellW, labelH);
      g.fillStyle = '#fff'; g.font = '500 16px sans-serif'; g.fillText(c.label, x + 8, y + labelH / 2);
      const bm = c.b64 && imgs.get(c.b64);
      g.fillStyle = '#4a4a4a'; g.fillRect(x, y + labelH, cellW, rh - labelH);
      if(bm){
        const s = Math.min(1, cellW / bm.width), sy = part * sliceH / s;
        const srcH = Math.min(bm.height - sy, (rh - labelH) / s);
        if(srcH > 0){
          g.imageSmoothingQuality = 'high';
          g.drawImage(bm, 0, sy, bm.width, srcH, x, y + labelH, bm.width * s, srcH * s);
        }
        g.strokeStyle = '#000'; g.strokeRect(x + .5, y + labelH + .5, bm.width * s - 1, Math.max(0, Math.min(bm.height * s - part * sliceH, rh - labelH)) - 1);
      } else {
        g.fillStyle = '#fff'; g.font = '16px sans-serif'; g.fillText(c.note || 'not captured', x + 10, y + labelH + 24);
      }
    });
    y += rh + gap;
  }
  const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = ''; for(let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  const parts = Math.max(...rows.flatMap(r => r.cells.map(c => { const bm = c.b64 && imgs.get(c.b64); return bm ? Math.ceil(bm.height * Math.min(1, cellW / bm.width) / sliceH) : 1; })));
  return {b64: btoa(s), parts};
}

/* -------------------------------------------------------------- browser plumbing */
/* --browser chromium|webkit and --viewport WxH (e.g. 375x812: a phone, touch) re-run the same captures and checks */
const BROWSER = arg('browser', 'chromium');
const [VW, VH] = String(arg('viewport', '1280x800')).split('x').map(Number);
async function launch(){ return (BROWSER === 'webkit' ? webkit : chromium).launch(); }
async function withRetry(browserRef, label, fn){
  for(let attempt = 1; attempt <= 2; attempt++){
    try{ return await fn(browserRef.browser); }
    catch(e){
      if(attempt === 1 && /closed|crash|Target page|disconnected/i.test(e.message)){
        console.log(`  [retry] ${label}: ${e.message.split('\n')[0]}`);
        try{ await browserRef.browser.close(); }catch(_){}
        browserRef.browser = await launch();
        continue;
      }
      throw e;
    }
  }
}
async function newAppContext(browser, base, theme, {dsf = 1} = {}){
  const ctx = await browser.newContext({viewport: {width: VW, height: VH}, deviceScaleFactor: dsf, reducedMotion: 'reduce', acceptDownloads: true, colorScheme: theme, ...(VW < 600 ? {isMobile: true, hasTouch: true} : {})});
  if(BROWSER !== 'webkit') await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], {origin: new URL(base).origin});   // WebKit has no such permission: its clipboard reads may fail, and the audit records that
  await ctx.clock.setFixedTime(FIXED_NOW);
  return ctx;
}
async function waitReady(page, timeout){
  await page.waitForFunction(() => {
    const fs = document.getElementById('fontstatus');
    return (document.querySelector('#preview svg') || document.querySelector('#preview .placeholder')) && (!fs || fs.hidden);
  }, null, {timeout});
  await settle(page);
}
async function settle(page, polls = 3){
  let last = null, same = 0;
  for(let i = 0; i < 40 && same < polls; i++){
    const cur = await page.evaluate(() => document.querySelector('#preview svg')?.outerHTML.length ?? -1);
    if(cur === last) same++; else { same = 0; last = cur; }
    await sleep(120);
  }
}
async function openMenu(page, innerSelector){
  /* menus are absolutely positioned and overlap: close any other open disclosure first (by clicking its summary) */
  const others = await page.evaluate(sel => [...document.querySelectorAll('details.action-disclosure[open]')].filter(d => !d.querySelector(sel)).map((d, i) => d.className), innerSelector);
  for(const _ of others){
    const other = page.locator('details.action-disclosure[open]').filter({hasNot: page.locator(innerSelector)}).first();
    await other.locator('summary').first().click().catch(() => {});
  }
  const open = await page.evaluate(sel => document.querySelector(sel)?.closest('details')?.open, innerSelector);
  if(open === false) await page.locator(`details:has(${innerSelector}) > summary`).first().click();
}
async function readClipboardImage(page){
  const b64 = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    for(const it of items) if(it.types.includes('image/png')){
      const buf = new Uint8Array(await (await it.getType('image/png')).arrayBuffer());
      let s = ''; for(let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      return btoa(s);
    }
    return null;
  });
  return b64 ? Buffer.from(b64, 'base64') : null;
}
const clearClipboard = page => page.evaluate(() => navigator.clipboard.writeText('')).catch(() => {});
async function pollClipboardImage(page, timeout){
  const end = Date.now() + timeout;
  while(Date.now() < end){
    try{ const b = await readClipboardImage(page); if(b) return b; }catch(_){}
    await sleep(200);
  }
  return null;
}
/* Click a download button and take the file. A refusal is a transient message the button shows
   for ~2s ("PNG exceeds 3M-unit area - download SVG"): watch for it, because by the time a
   download timeout expires it has long reverted. watchFlash=false for buttons whose label
   legitimately changes while working (slide download: "Preparing 1 of 3"). */
async function download(page, selector, dest, timeout, {watchFlash = true} = {}){
  const loc = page.locator(selector).first();
  const label = await loc.textContent().catch(() => '');
  const dlp = page.waitForEvent('download', {timeout});
  dlp.catch(() => {});
  try{ await page.click(selector, {timeout}); }catch(e){ return {ok: false, error: e.message.split('\n')[0], label}; }
  const t0 = Date.now();
  let flash = null;
  while(Date.now() - t0 < timeout){
    const won = await Promise.race([dlp.then(d => ({d}), () => ({gone: true})), sleep(100).then(() => null)]);
    if(won?.d){ await won.d.saveAs(dest); return {ok: true, suggested: won.d.suggestedFilename(), file: dest, flash}; }
    if(won?.gone) break;
    if(watchFlash && !flash){ const now = await loc.textContent().catch(() => label); if(now !== label) flash = now; }
    if(flash && Date.now() - t0 > 1200){ return {ok: false, refusal: flash, label, error: 'button showed a message instead of downloading'}; }
  }
  const after = await loc.textContent().catch(() => '');
  return {ok: false, error: 'no download within ' + timeout + 'ms', label, buttonTextAfter: after, refusal: flash};
}

/* ------------------------------------------------------------------ capture */
async function loadDoc(page, base, tool, source, timeout){
  await page.goto(base + TOOLS[tool].path + '#' + hashFor(source), {waitUntil: 'load', timeout: timeout * 3});
  await waitReady(page, timeout * 2);
}
async function switchView(page, tool, view, timeout){
  const [style, group] = view.split('+');
  await page.locator(`#stylepicker [data-style="${style}"]`).click({timeout});
  await page.waitForFunction(([t, s]) => {
    const svg = document.querySelector('#preview svg');
    if(!svg) return false;
    return (t === 'roadmap' ? svg.dataset.chapterLayout : svg.dataset.direction) === s;
  }, [tool, style], {timeout}).catch(() => {});
  if(group){
    await page.locator(`#grouppicker [data-group="${group}"]`).click({timeout});
    await page.waitForFunction(g => document.querySelector(`#grouppicker [data-group="${g}"]`)?.getAttribute('aria-pressed') === 'true', group, {timeout});
  }
  await settle(page);
}
async function closeMenus(page){
  for(let i = 0; i < 4; i++){
    const n = await page.locator('details.action-disclosure[open]').count();
    if(!n) return;
    await page.locator('details.action-disclosure[open] > summary').first().click().catch(() => {});
    await sleep(80);
  }
}
async function openDoc(page, base, tool, doc, timeout){
  const baseName = COMPARE_BASE[doc.name];
  if(baseName){
    const baseDoc = loadFixtures(tool).find(d => d.name === baseName);
    await setupCompare(page, base, tool, baseDoc.source, timeout);
    await page.goto(base + TOOLS[tool].path + '#' + hashFor(doc.source), {waitUntil: 'load'});
    await page.reload({waitUntil: 'load'});
    await waitReady(page, timeout * 2);
    await selectSnapshot(page, timeout);
  } else await loadDoc(page, base, tool, doc.source, timeout);
}
async function pageState(page){
  return page.evaluate(() => {
    const vis = el => !!el && !el.hidden && el.getClientRects().length > 0;
    const t = id => document.getElementById(id);
    return {
      warnings: [...document.querySelectorAll('#warns li')].map(l => l.textContent),
      fontStatus: vis(t('fontstatus')) ? t('fontmessage')?.textContent : null,
      narrowNote: vis(t('narrowcomposition')) ? t('narrowcomposition').textContent : null,
      copypngHidden: !!t('copypng')?.hidden, copypngDisabled: !!t('copypng')?.disabled,
      dlpngDisabled: !!t('dlpng')?.disabled, dlsvgDisabled: !!t('dlsvg')?.disabled, copymdDisabled: !!t('copymd')?.disabled,
      exportdeckDisabled: !!t('exportdeck')?.disabled,
      changepreviewVisible: vis(t('changepreview')),
      verdict: vis(t('verdict')) ? t('verdict').innerText : null,
      metrics: vis(t('metrics')) ? t('metrics').innerText : null,
      headlineField: t('headline')?.value ?? null,
      kicker: t('kicker')?.textContent ?? null,
      readout: t('readout')?.textContent ?? null,
      boardWindow: vis(t('boardwindow')) ? {range: t('boardrange')?.textContent} : null,
      groupPickerVisible: vis(t('grouppicker')),
    };
  });
}
async function onscreenSnapshot(page){
  return page.evaluate(() => {
    const svg = document.querySelector('#preview svg');
    if(!svg) return {svg: false, placeholder: document.querySelector('#preview')?.innerText};
    const norm = s => s.replace(/[   ]/g, ' ').replace(/\s+/g, ' ').trim();
    return {svg: true, width: svg.getAttribute('width'), height: svg.getAttribute('height'), viewBox: svg.getAttribute('viewBox'),
      texts: [...svg.querySelectorAll('text')].filter(t => !t.closest('[data-add-control]') && t.textContent.trim() !== '\u22ef').map(t => norm(t.textContent)).filter(Boolean),
      keys: [...svg.querySelectorAll('[data-key]')].map(g => g.getAttribute('data-key')),
      mskeys: [...new Set([...svg.querySelectorAll('[data-mskey]')].map(g => g.getAttribute('data-mskey')))],
      fieldItems: svg.querySelectorAll('[data-field-item]').length,
      pageScrollWidth: document.documentElement.scrollWidth, innerWidth};
  });
}

async function captureDeck(page, {tool, dir, label, detail, timeout, opener = '#exportdeck'}){
  ensure(dir);
  const rec = {label, detail, ok: false, pages: [], states: {}};
  const btn = await page.evaluate(sel => { const b = document.querySelector(sel); return b ? {hidden: b.hidden || !b.getClientRects().length, disabled: b.disabled} : null; }, opener);
  rec.opener = {selector: opener, ...btn};
  if(!btn || btn.disabled){ rec.error = 'opener ' + opener + (btn ? ' is disabled' : ' not found'); return rec; }
  await openMenu(page, opener);   // a closed <details> menu can still report client rects; open it explicitly
  await page.click(opener, {timeout});
  await page.waitForSelector('#slidepreviewdialog[open]', {timeout});
  if(tool === 'roadmap' && detail){
    await page.selectOption('#exportdetail', detail, {timeout});
    await sleep(200);
  }
  await settle(page, 2);
  rec.states = await page.evaluate(() => {
    const t = id => document.getElementById(id);
    const vis = el => !!el && !el.hidden && el.getClientRects().length > 0;
    return {position: vis(t('slideposition')) ? t('slideposition').textContent : null, errorVisible: vis(t('slideerror')), errorText: t('slideerror')?.textContent,
      copyText: t('slidecopy')?.textContent ?? null, downloadLabel: vis(t('slidedownload')) ? t('slidedownload').textContent : null,
      title: t('slidepreviewtitle')?.textContent, canvasVisible: vis(t('slidecanvas')), firstSvg: t('slidecanvas')?.querySelector('svg') ? {w: t('slidecanvas').querySelector('svg').getAttribute('width'), h: t('slidecanvas').querySelector('svg').getAttribute('height')} : null};
  });
  const m = /Slide 1 of (\d+)/.exec(rec.states.position || '');
  const n = m ? +m[1] : 0;
  rec.pageCount = n;
  if(!n){ await page.click('#slideclose', {timeout}).catch(() => {}); rec.refused = true; return rec; }
  /* Copy slide PNG (roadmap only) while on page 1 */
  if(tool === 'roadmap' && !(await page.locator('#slidecopyimage').isHidden())){
    await clearClipboard(page);
    await page.click('#slidecopyimage', {timeout});
    const buf = await pollClipboardImage(page, timeout);
    rec.slideCopyText = await page.locator('#slidecopyimage').textContent();
    if(buf){ writeFileSync(join(dir, 'slide-copy-page-01.png'), buf); rec.slideCopyFile = 'slide-copy-page-01.png'; }
  }
  for(let i = 0; i < n; i++){
    const svg = await page.evaluate(() => document.querySelector('#slidecanvas svg')?.outerHTML ?? null);
    const pos = await page.locator('#slideposition').textContent();
    const num = String(i + 1).padStart(2, '0');
    if(svg) writeFileSync(join(dir, `page-${num}.dom.svg`), svg);
    await page.locator('#slidecanvas').screenshot({path: join(dir, `page-${num}.preview.png`)}).catch(() => {});
    rec.pages.push({index: i + 1, position: pos, domSvg: svg ? `page-${num}.dom.svg` : null, preview: `page-${num}.preview.png`});
    if(i < n - 1){ await page.click('#slidenext', {timeout}); await sleep(120); }
  }
  await page.screenshot({path: join(dir, 'dialog.png')}).catch(() => {});
  const dl = await download(page, '#slidedownload', join(dir, 'download.bin'), Math.max(timeout, 3000 * n), {watchFlash: false});
  rec.download = dl;
  if(dl.ok){
    const buf = readFileSync(dl.file);
    rec.downloadBytes = buf.length;
    if(/\.zip$/i.test(dl.suggested)){
      rec.zipEntries = readStoredZip(buf).map(f => { const name = basename(f.name); writeFileSync(join(dir, name), f.bytes); return {name, bytes: f.bytes.length}; });
    } else { writeFileSync(join(dir, basename(dl.suggested)), buf); rec.zipEntries = [{name: basename(dl.suggested), bytes: buf.length}]; }
    rec.ok = true;
  }
  await page.click('#slideclose', {timeout}).catch(() => {});
  await sleep(120);
  return rec;
}

async function captureView(page, ctx){
  const {tool, doc, theme, view, dir, timeout} = ctx;
  ensure(dir);
  const m = {tool, doc, theme, view, artefacts: [], states: {}, errors: []};
  const add = (format, file, extra = {}) => m.artefacts.push({format, file, ...extra});
  const guard = async (name, fn) => { try{ await fn(); }catch(e){ m.errors.push({step: name, error: e.message.split('\n')[0]}); } };
  m.states.before = await pageState(page);
  m.onscreen = await onscreenSnapshot(page);
  await guard('onscreen', async () => { await closeMenus(page); await page.locator('#preview').screenshot({path: join(dir, 'onscreen.png')}); add('onscreen', 'onscreen.png'); });
  /* full-detail SVG / PNG downloads */
  await guard('svg', async () => {
    await openMenu(page, '#dlsvg');
    const r = await download(page, '#dlsvg', join(dir, 'export.svg'), timeout);
    if(r.ok) add('svg', 'export.svg', {suggested: r.suggested}); else m.errors.push({step: 'svg', ...r});
  });
  await guard('png', async () => {
    await openMenu(page, '#dlpng');
    const r = await download(page, '#dlpng', join(dir, 'export.png'), timeout);
    if(r.ok) add('png', 'export.png', {suggested: r.suggested}); else m.errors.push({step: 'png', ...r});
  });
  /* Copy PNG via the real clipboard */
  await guard('copy-png', async () => {
    const st = await page.evaluate(() => { const b = document.getElementById('copypng'); return {hidden: b.hidden, label: b.textContent, aria: b.getAttribute('aria-label')}; });
    m.states.copypng = st;
    if(st.hidden){ return; }
    await clearClipboard(page);
    await page.click('#copypng', {timeout});
    const buf = await pollClipboardImage(page, timeout);
    m.states.copypngAfter = await page.locator('#copypng').textContent();
    if(buf){ writeFileSync(join(dir, 'copy.png'), buf); add('copy-png', 'copy.png'); }
    else m.errors.push({step: 'copy-png', error: 'no image on the clipboard', buttonText: m.states.copypngAfter});
  });
  /* Copy as Markdown */
  await guard('markdown', async () => {
    await openMenu(page, '#copymd');
    await page.evaluate(() => navigator.clipboard.writeText('<<empty>>'));
    await page.click('#copymd', {timeout});
    await sleep(250);
    const md = await page.evaluate(() => navigator.clipboard.readText());
    if(md && md !== '<<empty>>'){ writeFileSync(join(dir, 'copy.md'), md); add('markdown', 'copy.md'); }
    else m.errors.push({step: 'markdown', error: 'clipboard unchanged', text: await page.locator('#copymd').textContent()});
  });
  /* 16:9 deck(s) */
  for(const detail of TOOLS[tool].deckDetails){
    await guard('deck-' + (detail || 'default'), async () => {
      const name = 'deck' + (detail ? '-' + detail : '');
      const rec = await captureDeck(page, {tool, dir: ensure(join(dir, name)), label: name, detail, timeout});
      m.decks = {...(m.decks || {}), [name]: rec};
    });
  }
  if(tool === 'roadmap'){
    /* The dialog's "Include" select is page-global state: Copy PNG on the page reads it too.
       Probe once (first view): leave Titles only selected, close the dialog, Copy PNG. Then reset. */
    if(ctx.fullSlideOnce) await guard('copy-after-titles', async () => {
      await page.evaluate(() => { const s = document.getElementById('exportdetail'); s.value = 'titles'; s.dispatchEvent(new Event('change', {bubbles: true})); });
      await sleep(300);
      const hidden = await page.evaluate(() => document.getElementById('copypng').hidden);
      m.states.copyAfterTitles = {copypngHidden: hidden};
      if(!hidden){
        await clearClipboard(page);
        await page.click('#copypng', {timeout});
        const buf = await pollClipboardImage(page, timeout);
        if(buf){ writeFileSync(join(dir, 'copy-after-titles.png'), buf); add('copy-after-titles', 'copy-after-titles.png'); }
      }
    });
    await page.evaluate(() => { const s = document.getElementById('exportdetail'); if(s.value !== 'complete'){ s.value = 'complete'; s.dispatchEvent(new Event('change', {bubbles: true})); } });
    await sleep(200);
  }
  if(ctx.compare){
    await guard('deck-changes', async () => {
      const vis = await page.evaluate(() => { const b = document.getElementById('changepreview'); return b && !b.hidden; });
      if(!vis){ m.states.changepreview = 'hidden'; return; }
      const rec = await captureDeck(page, {tool, dir: ensure(join(dir, 'deck-changes')), label: 'deck-changes (History > Review change deck…)', detail: null, timeout, opener: '#changepreview'});
      m.decks = {...(m.decks || {}), 'deck-changes': rec};
    });
  }
  m.states.after = await pageState(page);
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(m, null, 1));
  return m;
}

/* Markdown import (roadmap only): paste the exported Markdown through File > Import markdown. */
async function captureImportRoundTrip(page, {dir, timeout}){
  ensure(dir);
  const res = {ok: false};
  try{
    /* Markdown of the freshly loaded document (no view change), then paste it back in */
    await page.evaluate(() => navigator.clipboard.writeText('<<empty>>'));
    await openMenu(page, '#copymd');
    await page.click('#copymd', {timeout}); await sleep(250);
    const md = await page.evaluate(() => navigator.clipboard.readText());
    res.mdBefore = md;
    await page.locator('details.tool-file > summary').click({timeout});
    await page.locator('[data-item="import-markdown"]').click({timeout});
    await page.waitForSelector('#importarea', {state: 'visible', timeout});
    await page.fill('#importarea', md);
    await page.click('#importgo', {timeout});
    await sleep(600); await settle(page);
    res.srcAfter = await page.evaluate(() => { try{ return localStorage.getItem('roadmap-src'); }catch(_){ return null; } });
    await page.evaluate(() => navigator.clipboard.writeText('<<empty>>'));
    await openMenu(page, '#copymd');
    await page.click('#copymd', {timeout}); await sleep(250);
    res.mdAfter = await page.evaluate(() => navigator.clipboard.readText());
    res.onscreen = await onscreenSnapshot(page);
    res.ok = true;
  }catch(e){ res.error = e.message.split('\n')[0]; }
  writeFileSync(join(dir, 'import-roundtrip.json'), JSON.stringify(res, null, 1));
  return res;
}

async function setupCompare(page, base, tool, baseSource, timeout){
  await loadDoc(page, base, tool, baseSource, timeout);
  await openMenu(page, '#snap');
  await page.click('#snap', {timeout});
  await page.waitForFunction(() => document.querySelectorAll('#snapsel option').length > 1, null, {timeout});
}
async function selectSnapshot(page, timeout){
  await openMenu(page, '#snapsel');
  await page.selectOption('#snapsel', {index: 1}, {timeout});
  await sleep(300); await settle(page);
}

/* Re-take only the on-screen screenshots (menus closed) without repeating any export. */
async function recaptureOnscreen(browser, base, {tool, doc, theme, views, outRoot, timeout}){
  const ctx = await newAppContext(browser, base, theme);
  try{
    const page = await ctx.newPage(); page.setDefaultTimeout(timeout);
    await openDoc(page, base, tool, doc, timeout);
    for(const view of views){
      const dir = join(outRoot, 'raw', tool, doc.name, theme, slug(view));
      if(!existsSync(dir)) continue;
      await switchView(page, tool, view, timeout);
      await closeMenus(page); await page.mouse.move(0, 0); await settle(page, 2);
      await page.locator('#preview').screenshot({path: join(dir, 'onscreen.png')});
    }
  } finally { await ctx.close().catch(() => {}); }
}

async function captureCase(browser, base, {tool, doc, source, theme, views, outRoot, timeout}){
  const caseRoot = ensure(join(outRoot, 'raw', tool, doc.name, theme));
  const ctx = await newAppContext(browser, base, theme);
  const page = await ctx.newPage();
  page.setDefaultTimeout(timeout);
  const runtime = [];
  page.on('pageerror', e => runtime.push('pageerror: ' + e.message));
  page.on('console', msg => { if(msg.type() === 'error') runtime.push('console: ' + msg.text().slice(0, 300)); });
  page.on('requestfailed', r => runtime.push('requestfailed: ' + r.url().slice(0, 200)));
  const manifests = [];
  try{
    const baseName = COMPARE_BASE[doc.name];
    const compare = !!baseName;
    if(compare){
      const baseDoc = loadFixtures(tool).find(d => d.name === baseName);
      await setupCompare(page, base, tool, baseDoc.source, timeout);
      await page.goto(base + TOOLS[tool].path + '#' + hashFor(source), {waitUntil: 'load'});
      await page.reload({waitUntil: 'load'});
      await waitReady(page, timeout * 2);
      await selectSnapshot(page, timeout);
    } else await loadDoc(page, base, tool, source, timeout);
    /* print path (F8): the real beforeprint handler, print media emulated, every sheet photographed, and the PDF the browser
       would print (which fires beforeprint itself). print.png used to be the unprinted page and was blank for every document. */
    const printDir = ensure(join(caseRoot, 'print'));
    const sheets = [];
    try{
      await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
      await page.emulateMedia({media: 'print'});
      await sleep(250);
      const n = await page.locator('#print-artefact .print-page').count();
      for(let i = 0; i < n; i++){
        const file = `print-p${String(i + 1).padStart(2, '0')}.png`;
        await page.locator('#print-artefact .print-page').nth(i).screenshot({path: join(printDir, file)});
        sheets.push(file);
      }
      const geometry = await page.evaluate(() => [...document.querySelectorAll('#print-artefact .print-page')].map(sheet => {
        const rows = []; let vbs = [];
        for(const svg of sheet.querySelectorAll('svg')){
          if(svg.querySelector('svg')) continue;
          const vb = svg.viewBox.baseVal; vbs.push([vb.y, vb.y + vb.height]);
          for(const g of svg.querySelectorAll('[data-key],[data-field-item]')){ const b = g.getBBox(); rows.push([vb.y, vb.y + vb.height, b.y, b.y + b.height]); }
        }
        return {vbs, rows, w: sheet.getBoundingClientRect().width, h: sheet.getBoundingClientRect().height};
      }));
      await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
      writeFileSync(join(printDir, 'print-geometry.json'), JSON.stringify(geometry));
    }catch(e){ runtime.push('print capture: ' + e.message); }
    await page.pdf({path: join(printDir, 'print.pdf'), landscape: true, preferCSSPageSize: true, printBackground: true}).catch(e => runtime.push('print pdf: ' + e.message));
    await page.emulateMedia({media: 'screen'});
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint'))).catch(() => {});
    const loadState = await pageState(page);
    writeFileSync(join(printDir, 'print.json'), JSON.stringify({sheets, pdf: existsSync(join(printDir, 'print.pdf')) ? statSync(join(printDir, 'print.pdf')).size : null, pdfPages: existsSync(join(printDir, 'print.pdf')) ? (readFileSync(join(printDir, 'print.pdf'), 'latin1').match(/\/Type\s*\/Page\b/g) || []).length : null}, null, 1));
    let first = true;
    for(const view of views){
      const dir = ensure(join(caseRoot, slug(view)));
      try{
        await switchView(page, tool, view, timeout);
        const m = await captureView(page, {tool, doc: doc.name, theme, view, dir, timeout, compare, fullSlideOnce: first});
        m.loadWarnings = loadState.warnings;
        manifests.push(m);
        first = false;
        console.log(`    ${tool}/${doc.name}/${theme}/${view}: ${m.artefacts.map(a => a.format).join(',')}${m.errors.length ? '  ERR ' + m.errors.map(e => e.step).join(',') : ''}`);
      }catch(e){
        if(/closed|crash|Target page|disconnected/i.test(e.message)) throw e;
        manifests.push({tool, doc: doc.name, theme, view, artefacts: [], errors: [{step: 'view', error: e.message.split('\n')[0]}]});
        console.log(`    ${tool}/${doc.name}/${theme}/${view}: VIEW FAILED ${e.message.split('\n')[0]}`);
      }
    }
    if(tool === 'roadmap' && theme === 'light'){
      /* Markdown import round trip, from the roadmap's own Markdown for the first view */
      await page.goto('about:blank');   // a hash-only navigation would keep the page's edited state
      await loadDoc(page, base, tool, source, timeout);
      await captureImportRoundTrip(page, {dir: ensure(join(caseRoot, 'import')), timeout});
    }
  } finally {
    writeFileSync(join(caseRoot, 'runtime.json'), JSON.stringify({runtime, loadWarnings: manifests[0]?.loadWarnings ?? null}, null, 1));
    await ctx.close().catch(() => {});
  }
  return manifests;
}

/* ------------------------------------------------------------------ analysis */

const POOL = new WeakMap();
async function pooled(browser, key, make){
  let m = POOL.get(browser); if(!m){ m = new Map(); POOL.set(browser, m); }
  if(!m.has(key)) m.set(key, make());
  return m.get(key);
}
export async function measureStandalone(browser, file, dsf){
  const ctx = await pooled(browser, 'standalone' + dsf, () => browser.newContext({viewport: {width: 1300, height: 900}, deviceScaleFactor: dsf, colorScheme: 'light'}));
  try{
    const page = await ctx.newPage();
    const refs = [];
    page.on('request', r => { if(!r.url().startsWith('file:') && !r.url().startsWith('data:')) refs.push(r.url()); });
    await page.goto(pathToFileURL(file).href);
    const geo = await page.evaluate(measureSvgInPage, null);
    geo.networkRequests = refs;
    await page.close();
    return geo;
  } catch(e){ throw e; }
}
async function measureInApp(appPage, svg){ return appPage.evaluate(measureSvgInPage, svg); }

/* The SVG as an <img> stretched to exactly the delivered PNG's pixel size (screenshot at device scale 1): the same decode path the
   product's canvas uses, at the same scale factor, so a reduced-scale PNG is compared like with like (F10). */
export async function rasteriseAtSize(browser, svgText, w, h){
  if(!(w > 0 && h > 0) || w > 16000 || h > 16000) return null;
  const ctx = await pooled(browser, 'rasterimg', () => browser.newContext({viewport: {width: 1300, height: 900}, deviceScaleFactor: 1, colorScheme: 'light'}));
  const page = await ctx.newPage();
  try{
    await page.setViewportSize({width: w, height: h});
    const uri = 'data:image/svg+xml;base64,' + Buffer.from(svgText).toString('base64');
    await page.setContent(`<body style="margin:0;background:#fff"><img id="i" src="${uri}" style="display:block;width:${w}px;height:${h}px"></body>`);
    await page.waitForFunction(() => document.getElementById('i').complete);
    await sleep(100);
    return await page.screenshot({clip: {x: 0, y: 0, width: w, height: h}});
  } finally { await page.close(); }
}

/* Rasterise a standalone SVG in the browser at 2x (the PNG's scale) with its embedded fonts. */
export async function rasteriseFile(browser, file, w, h, scale = 2){
  if(!(w > 0 && h > 0) || h * scale > 15000 || w * scale > 15000) return null;
  const ctx = await pooled(browser, 'raster' + scale, () => browser.newContext({viewport: {width: 1300, height: 900}, deviceScaleFactor: scale, colorScheme: 'light'}));
  const page = await ctx.newPage();
  try{
    await page.setViewportSize({width: Math.ceil(w), height: Math.ceil(h)});
    await page.goto(pathToFileURL(file).href);
    await page.evaluate(async () => { try{ await document.fonts.ready; }catch(_){} });
    await sleep(150);
    return await page.screenshot({clip: {x: 0, y: 0, width: Math.ceil(w), height: Math.ceil(h)}});
  } finally { await page.close(); }
}
/* Rasterise an SVG string inline in the app origin (site fonts) at 2x, for deck pages whose
   embedded-font form is never delivered as an SVG. */
export async function rasteriseInline(browser, base, tool, svg, w, h, theme){
  const page = await pooled(browser, `inline|${tool}|${theme}`, async () => {
    const ctx = await browser.newContext({viewport: {width: 1920, height: 1080}, deviceScaleFactor: 2, colorScheme: theme});
    const p = await ctx.newPage();
    await p.goto(base + TOOLS[tool].path, {waitUntil: 'load'});
    await waitReady(p, 15000).catch(() => {});
    return p;
  });
  await page.setViewportSize({width: Math.ceil(w), height: Math.ceil(h)});
  await page.evaluate(s => { document.body.innerHTML = ''; document.body.style.cssText = 'margin:0;background:#fff'; const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:0;top:0'; d.innerHTML = s; document.body.appendChild(d); }, svg);
  await sleep(200);
  return await page.screenshot({clip: {x: 0, y: 0, width: Math.ceil(w), height: Math.ceil(h)}});
}

async function pngStats(lab, buf){ return lab.evaluate(analysePngInPage, buf.toString('base64')); }
async function pngDiff(lab, a, b, tol = 24){ return lab.evaluate(diffPngInPage, [a.toString('base64'), b.toString('base64'), tol]); }

function pngChecks(stats, {svgW, svgH, kind, expectScale = 2, centred = true}){
  const out = [];
  out.push({check: 'png:dimensions', pass: true, values: {w: stats.w, h: stats.h, svgW, svgH, scaleX: svgW ? r1(stats.w / svgW) : null, scaleY: svgH ? r1(stats.h / svgH) : null}});
  if(svgW) out.push(checkPngScale(stats, svgW, svgH));
  if(kind === 'deck') out.push({check: 'png:aspect-16x9', pass: stats.w * 9 === stats.h * 16, values: {w: stats.w, h: stats.h, ratio: r1(stats.w / stats.h), exact16x9: stats.w * 9 === stats.h * 16}});
  out.push({check: 'png:transparency', pass: stats.minAlpha === 255, values: {minAlpha: stats.minAlpha, nonOpaquePixels: stats.nonOpaquePixels}});
  out.push({check: 'png:blank', pass: stats.nonBgFraction > .002 && stats.distinctColours > 3, values: {nonBgFraction: round(stats.nonBgFraction, 4), distinctColours: stats.distinctColours}});
  if(stats.margins){
    const m = stats.margins;
    out.push({check: 'png:margins', pass: null, values: {...m, bbox: stats.bbox, edgeTouch: stats.edgeTouch, leftRightAsymmetry: m.left - m.right, topBottomAsymmetry: m.top - m.bottom,
      asymmetric: Math.abs(m.left - m.right) > 2 * 2, touchesEdge: Object.values(stats.edgeTouch).some(Boolean)}, note: 'pixel bbox of non-background paint (bg = corner pixel). Asymmetry is flagged when left/right differ by >2 CSS px (4 device px); full-bleed panels legitimately touch edges'});
  }
  return out;
}

function svgInfoForRefusal(m, dir){
  try{ const t = readFileSync(join(dir, 'export.svg'), 'utf8').match(/<svg\b[^>]*>/)[0]; return [+t.match(/\bwidth="([\d.]+)"/)[1], +t.match(/\bheight="([\d.]+)"/)[1]]; }catch(_){ return null; }
}
async function analyseView(ctx, m, state){
  const {findings, browser, lab, base, outRoot, appPages} = ctx;
  const {tool, doc, theme, view} = m;
  const dir = join(outRoot, 'raw', tool, doc, theme, slug(view));
  const rec = (format, artefact, check, extra) => findings.add({tool, doc, theme, view, format, artefact: artefact && `raw/${tool}/${doc}/${theme}/${slug(view)}/${artefact}`, check, ...extra});
  const recs = (format, artefact, list) => list.forEach(c => rec(format, artefact, c.check, {pass: c.pass, values: c.values, note: c.note}));
  const art = fmt => m.artefacts.find(a => a.format === fmt);
  const appPage = appPages[theme];
  /* ---- capture errors / refusals */
  for(const e of m.errors){
    if(e.refusal){
      const sz = svgInfoForRefusal(m, dir);
      rec(e.step, null, 'refusal:download', {pass: null, values: {message: e.refusal, svgSize: sz, area: sz && sz[0] * sz[1], sideMax: sz && Math.max(...sz)}, note: 'the page refused with a transient button message (reverts after ~2s); a clear refusal is acceptable - check the message matches the artefact size and that the button stays enabled'});
    } else rec(e.step === 'view' ? 'view' : e.step, null, 'capture-error', {pass: false, values: e, note: 'could not capture this path (see values.error / buttonText)'});
  }
  /* ---- SVG export */
  const svgA = art('svg');
  let svgInfo = null, svgGeo = null, svgText = null;
  if(svgA){
    const file = join(dir, svgA.file);
    svgText = readFileSync(file, 'utf8');
    const standalone1 = await measureStandalone(browser, file, 1);
    const standalone2 = await measureStandalone(browser, file, 2);
    svgGeo = standalone1;
    const inApp = await measureInApp(appPage, svgText.replace(/<style\b[^>]*data-chapter-fonts="embedded"[^>]*>[\s\S]*?<\/style>/g, ''));
    svgInfo = {w: +standalone1.attrW, h: +standalone1.attrH, viewBox: standalone1.viewBox};
    rec('svg', svgA.file, 'svg:size', {pass: true, values: {width: standalone1.attrW, height: standalone1.attrH, viewBox: standalone1.viewBox, bytes: Buffer.byteLength(svgText), texts: standalone1.texts.length, shapes: standalone1.shapes.length}});
    recs('svg', svgA.file, checkSelfContained(svgText, standalone1));
    if(tool === 'roadmap') recs('svg', svgA.file, checkPicture(standalone1, {style: view.split('+')[0]}));
    rec('svg', svgA.file, 'self-contained:network-requests', {pass: standalone1.networkRequests.length === 0, values: {requests: standalone1.networkRequests}, note: 'requests the SVG made when opened alone'});
    const parity = checkWidthParity(standalone1, inApp); rec('svg', svgA.file, parity.check, {pass: parity.pass, values: parity.values, note: parity.note});
    const parity2 = checkWidthParity(standalone1, standalone2);
    rec('svg', svgA.file, 'self-contained:text-width-1x-vs-2x', {pass: parity2.pass, values: parity2.values, note: 'the same SVG opened at devicePixelRatio 1 vs 2'});
    for(const c of checkGeometry(standalone1, svgText)){
      const pass = c.check === 'truncation' ? (c.unrecoverableFail ? false : null) : c.pass;
      rec('svg', svgA.file, c.check + '@1x', {pass, values: c.values, note: c.note});
    }
    const g2 = checkGeometry(standalone2, svgText).filter(c => ['clipped-text', 'overlap:text-text'].includes(c.check));
    for(const c of g2) rec('svg', svgA.file, c.check + '@2x', {pass: c.pass, values: {count: c.values.count}, note: 'same measurement at devicePixelRatio 2'});
    /* raster reference at 2x */
    const ref = await rasteriseFile(browser, file, svgInfo.w, svgInfo.h);
    if(ref){ writeFileSync(join(dir, 'export.svg.ref.png'), ref); state.refs.set(dir + '|svg', ref); }
    else rec('svg', svgA.file, 'raster-reference', {pass: null, values: {skipped: true}, note: 'SVG too large to screenshot at 2x'});
    /* mirror: items, texts */
    state.svgGeo = standalone1;
  }
  /* ---- PNG export */
  const pngA = art('png');
  if(pngA){
    const buf = readFileSync(join(dir, pngA.file));
    const stats = await pngStats(lab, buf);
    recs('png', pngA.file, pngChecks(stats, {svgW: svgInfo?.w, svgH: svgInfo?.h, kind: 'plain'}));
    let ref = state.refs.get(dir + '|svg');
    const pngScale = svgInfo?.w ? stats.w / svgInfo.w : 2;   // the canvas is drawn edge to edge, so this is the exact scale
    if(svgA) ref = await rasteriseAtSize(browser, readFileSync(join(dir, svgA.file), 'utf8'), stats.w, stats.h) || ref;   // F10: the SVG at exactly the PNG's size and scale
    if(ref){
      /* at a fractional scale the same SVG decoded twice differs by anti-aliasing at glyph edges (crops are identical to the eye); count only real differences there */
      const d = await pngDiff(lab, buf, ref, Math.abs(pngScale - 2) > .001 ? 64 : 24);
      rec('png', pngA.file, 'png-vs-svg-raster', {pass: d.sizeMismatch ? false : d.ratio < 0.001, values: {...d, pngScale: Math.round(pngScale * 1000) / 1000}, note: 'PNG download vs the same SVG decoded as an image at the PNG\'s own pixel size (same path, same scale factor): under 0.1% of pixels may differ; pixels differing by >24/255 on any channel; regions are 32px-tile clusters'});
    } else if(svgA) rec('png', pngA.file, 'png-vs-svg-raster', {pass: null, values: {skipped: true}});
    else rec('png', pngA.file, 'png-vs-svg-raster', {pass: null, values: {skipped: 'no SVG captured'}});
  } else if(svgA) rec('png', null, 'png:missing', {pass: null, values: {}, note: 'the PNG button produced no file (see capture-error)'});
  /* ---- Copy PNG */
  const copyA = art('copy-png');
  if(copyA){
    const buf = readFileSync(join(dir, copyA.file));
    const stats = await pngStats(lab, buf);
    recs('copy-png', copyA.file, pngChecks(stats, {svgW: svgInfo?.w, svgH: svgInfo?.h, kind: 'copy'}));
    if(pngA){
      const dl = readFileSync(join(dir, pngA.file));
      const ds = await pngStats(lab, dl);
      const dd = await pngDiff(lab, buf, dl);
      rec('copy-png', copyA.file, 'copy-png-equals-png-download', {pass: dd.sizeMismatch ? false : dd.diffPixels === 0, values: {byteIdentical: Buffer.compare(buf, dl) === 0, copySize: [stats.w, stats.h], downloadSize: [ds.w, ds.h], ...dd}, note: 'P4: Copy PNG is the picture Download PNG gives (pixel comparison)'});
    }
    const cat = art('copy-after-titles');
    const titlesDeck = m.decks?.['deck-titles'];
    if(cat && titlesDeck?.zipEntries?.[0]){
      const a = readFileSync(join(dir, cat.file)), b = readFileSync(join(dir, 'deck-titles', titlesDeck.zipEntries[0].name));
      const dd = await pngDiff(lab, a, b), dc = await pngDiff(lab, a, buf);
      rec('copy-png', cat.file, 'copy-png-follows-dialog-detail-select', {pass: dc.sizeMismatch ? null : dc.diffPixels === 0, values: {equalsTitlesOnlySlide: dd.diffPixels === 0, equalsCompleteCopy: dc.diffPixels === 0, diffVsComplete: dc.diffPixels}, note: 'Copy PNG on the page after choosing "Titles only" in the slide dialog and closing it: pass = unaffected (equals the complete copy); fail = silently copies the titles-only slide'});
    }
  } else if(m.states.copypng?.hidden) rec('copy-png', null, 'copy-png-hidden', {pass: null, values: {label: m.states.copypng.label, reason: 'button hidden: deck is not exactly one page'}, note: 'no Copy PNG for this view/document'});
  /* ---- Markdown */
  const mdA = art('markdown');
  if(mdA){
    const md = readFileSync(join(dir, mdA.file), 'utf8');
    state.md.set(view, md);
  }
  /* ---- decks */
  for(const [name, d] of Object.entries(m.decks || {})){
    rec('deck', null, 'deck:summary', {pass: null, values: {deck: name, ok: d.ok, pageCount: d.pageCount ?? 0, position: d.states?.position, errorVisible: d.states?.errorVisible, errorText: d.states?.errorVisible ? d.states.errorText : undefined, copy: d.states?.copyText, downloadLabel: d.states?.downloadLabel, download: d.download && {ok: d.download.ok, suggested: d.download.suggested, error: d.download.error, buttonTextAfter: d.download.buttonTextAfter}, zipEntries: d.zipEntries, slideCopyText: d.slideCopyText, opener: d.opener, error: d.error}});
    if(d.refused || d.states?.errorVisible) rec('deck', null, 'deck:refusal', {pass: null, values: {deck: name, message: d.states?.errorText, copy: d.states?.copyText}, note: 'the page refused to build a slide set (clear refusal: acceptable; check whether the document really cannot fit)'});
    if(d.error) rec('deck', null, 'deck:unavailable', {pass: false, values: {deck: name, error: d.error}});
    if(d.ok === false && !d.refused && !d.error) rec('deck', null, 'deck:download-failed', {pass: false, values: {deck: name, download: d.download}});
    const dirD = join(dir, name);
    state.decks.push({view, name, dir: dirD, rec: d});
    const pageFiles = (d.zipEntries || []).filter(e => /\.png$/.test(e.name));
    if(d.pageCount && pageFiles.length !== d.pageCount) rec('deck', null, 'deck:page-count', {pass: false, values: {deck: name, dialogPages: d.pageCount, downloadedPages: pageFiles.length}, note: 'slides shown in the dialog vs files in the download'});
    const pngs = [], domSvgs = [];
    for(let i = 0; i < pageFiles.length; i++){
      const pf = pageFiles[i], p = join(dirD, pf.name);
      const buf = readFileSync(p), stats = await pngStats(lab, buf);
      const pg = d.pages[i];
      const dom = pg?.domSvg ? readFileSync(join(dirD, pg.domSvg), 'utf8') : null;
      let w = 1920, h = 1080;
      const mm = dom && /\bwidth="([\d.]+)"[^>]*\bheight="([\d.]+)"/.exec(dom.match(/<svg\b[^>]*>/)[0]);
      if(mm){ w = +mm[1]; h = +mm[2]; }
      recs('deck-page-png', `${name}/${pf.name}`, pngChecks(stats, {svgW: w, svgH: h, kind: 'deck'}));
      pngs.push({name: pf.name, stats});
      if(dom) domSvgs.push(dom);
      if(dom){
        const refKey = `${dirD}|${i}`;
        const refBuf = await rasteriseInline(browser, base, tool, dom, w, h, theme).catch(() => null);
        if(refBuf){
          writeFileSync(join(dirD, pf.name.replace(/\.png$/, '.ref.png')), refBuf);
          const df = await pngDiff(lab, buf, refBuf);
          rec('deck-page-png', `${name}/${pf.name}`, 'png-vs-svg-raster', {pass: df.sizeMismatch ? false : df.ratio < 0.001, values: df, note: 'delivered slide PNG vs the slide SVG (as shown in the dialog, site fonts) rasterised inline at 2x'});
        }
        /* geometry on the DOM SVG */
        const geo = await measureInApp(appPage, dom);
        for(const c of checkGeometry(geo, dom)){
          const pass = c.check === 'truncation' ? (c.unrecoverableFail ? false : null) : c.pass;
          rec('deck-page-svg', `${name}/${pg.domSvg}`, c.check, {pass, values: c.values, note: c.note});
        }
        state.deckGeo.set(`${dirD}|${i}`, geo);
        if(i === 0 && copyA && name === (m.decks.deck ? 'deck' : 'deck-complete')) { /* handled above */ }
      }
      if(d.slideCopyFile && i === 0){
        const cp = readFileSync(join(dirD, d.slideCopyFile));
        const sd = await pngDiff(lab, cp, buf);
        rec('deck-page-png', `${name}/${d.slideCopyFile}`, 'slide-copy-equals-download-page-1', {pass: sd.sizeMismatch ? false : sd.diffPixels === 0, values: {byteIdentical: Buffer.compare(cp, buf) === 0, copyBytes: cp.length, pageBytes: buf.length, ...sd}, note: 'Copy slide PNG (clipboard) vs the same page in the downloaded set, pixel comparison'});
      }
    }
    /* set-level checks (S1-S6): the whole slide set, as the dialog showed it */
    if(domSvgs.length && domSvgs.length === pageFiles.length){
      const furniture = [state.parsed?.title, ...(['grid', 'board'].includes(view.split('+')[0]) ? state.parsed?.horizons || [] : [])].filter(Boolean);   // horizon names are furniture only where they are column headers
      for(const c of checkSlideSet(domSvgs, {furniture, style: view.split('+')[0], laneBand: tool === 'timeline' ? 110 : 0})) rec('deck', `${name}`, c.check, {pass: c.pass, values: c.values, note: c.note});
    }
  }
  /* ---- on-screen vs export, per view */
  state.views.push({view, m, svgGeo: state.svgGeo, svgText});
  state.svgGeo = null;
}

/* cross-view / document-level checks that need several artefacts */
function mirrorAndMarkdown(ctx, tool, doc, theme, state, source){
  const {findings} = ctx;
  const parsed = state.parsed;
  const itemTitles = parsed.items.map(i => normText(tool === 'roadmap' ? i.title : i.label));
  for(const v of state.views){
    const {m, svgGeo, view} = v;
    const base = {tool, doc, theme, view};
    const onTexts = (m.onscreen?.texts || []).slice().sort();
    const count = (arr, x) => arr.filter(y => y === x).length;
    if(svgGeo && m.onscreen?.svg){
      const exTexts = svgGeo.texts.map(t => normText(t.text)).filter(Boolean);
      /* wrapping differs between the live view (fits the stage) and the export (native width), so compare
         word tokens, not strings; axis ticks (months, quarters, years) are scale-dependent and reported apart */
      const tok = arr => { const m = new Map(); for(const t of arr) for(const w of t.split(' ')) if(w) m.set(w, (m.get(w) || 0) + 1); return m; };
      const AXIS = /^(Q[1-4]|\d{4}|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/;
      const a = tok(onTexts), b = tok(exTexts);
      const lacking = [], extra = [];
      for(const [w, n] of a) if((b.get(w) || 0) < n) lacking.push(w + (n > 1 ? ' x' + (n - (b.get(w) || 0)) : ''));
      for(const [w, n] of b) if((a.get(w) || 0) < n) extra.push(w + (n > 1 ? ' x' + (n - (a.get(w) || 0)) : ''));
      const content = ws => ws.filter(w => !AXIS.test(w.replace(/ x\d+$/, '')));
      findings.add({...base, format: 'svg', artefact: null, check: 'mirror:text', pass: content(lacking).length === 0 && content(extra).length === 0,
        values: {onScreenTexts: onTexts.length, exportTexts: exTexts.length, wordsOnScreenNotInExport: content(lacking).slice(0, 30), wordsInExportNotOnScreen: content(extra).slice(0, 30), axisTickWordsOnlyOnScreen: lacking.filter(w => AXIS.test(w.replace(/ x\d+$/, ''))).slice(0, 20), axisTickWordsOnlyInExport: extra.filter(w => AXIS.test(w.replace(/ x\d+$/, ''))).slice(0, 20)}, note: 'word-token comparison (wrap-invariant) of every <text> on the on-screen SVG vs the SVG download; month/quarter/year axis ticks reported separately'});
      const onKeys = tool === 'roadmap' ? m.onscreen.keys.length : m.onscreen.mskeys.length;
      const exKeys = tool === 'roadmap' ? svgGeo.keys.length : null;
      findings.add({...base, format: 'svg', artefact: null, check: 'mirror:item-count', pass: null, values: {documentItems: parsed.items.length, onScreen: onKeys, svgExport: exKeys, note: tool === 'timeline' ? 'timeline exports carry no per-item key; compared by label text below' : ''}});
      if(tool === 'timeline'){
        const miss = itemTitles.filter(t => !exTexts.some(x => x.includes(t.slice(0, 20)) || t.includes(x)));
        findings.add({...base, format: 'svg', artefact: null, check: 'mirror:items-in-export', pass: miss.length === 0, values: {documentItems: itemTitles.length, missingFromSvg: miss.slice(0, 20), missing: miss.length}, note: 'each milestone label (first 20 chars) found in the SVG download text'});
        const missScreen = itemTitles.filter(t => !onTexts.some(x => x.includes(t.slice(0, 20)) || t.includes(x)));
        findings.add({...base, format: 'onscreen', artefact: null, check: 'mirror:items-on-screen', pass: missScreen.length === 0, values: {documentItems: itemTitles.length, missingOnScreen: missScreen.slice(0, 20), missing: missScreen.length}});
      } else {
        const exp = parsed.items.length;
        findings.add({...base, format: 'svg', artefact: null, check: 'mirror:roadmap-items', pass: svgGeo.keys.length === exp && m.onscreen.keys.length === exp, values: {documentItems: exp, onScreen: m.onscreen.keys.length, svgExport: svgGeo.keys.length}, note: 'cards (data-key groups) on screen vs export vs items parsed from the source (a duplicate title is still one card per item)'});
      }
      /* verdict / headline / title text */
      const joined = normText(exTexts.join(' '));
      const verdict = m.states?.before?.verdict;
      if(verdict){
        const body = normText(verdict.replace(/^\s*Verdict\s*/i, '').replace(/\bCopy\b.*$/i, ''));
        const probe = body.split(/\s+/).slice(0, 8).join(' ');
        findings.add({...base, format: 'svg', artefact: null, check: 'mirror:verdict-text', pass: null, values: {onScreenVerdict: verdict.slice(0, 200), probe, presentInSvgExport: joined.includes(probe)}, note: 'is the on-screen verdict sentence in the SVG download? (the DSL says authored verdicts travel with exports)'});
      }
      const hl = parsed.headline;
      if(hl) findings.add({...base, format: 'svg', artefact: null, check: 'mirror:headline-text', pass: joined.includes(normText(hl).slice(0, 40)), values: {headline: hl.slice(0, 80)}});
    }
    /* markdown: every title present */
    const md = state.md.get(view);
    if(md){
      const mdN = normText(md.replace(/&mdash;/g, '—').replace(/&amp;mdash;/g, '&mdash;'));   // a literal dash in a title is written as an entity (M2)
      const miss = itemTitles.filter(t => !mdN.includes(t));
      const bullets = tool === 'roadmap' ? md.split('\n').filter(l => /^- /.test(l)).length : null;
      findings.add({...base, format: 'markdown', artefact: `raw/${tool}/${doc}/${theme}/${slug(view)}/copy.md`, check: 'markdown:titles', pass: miss.length === 0 && (bullets === null || bullets === parsed.items.length),
        values: {documentItems: itemTitles.length, missing: miss.slice(0, 20), missingCount: miss.length, bullets, bytes: md.length}, note: 'every item title (parsed from the source) appears in the Markdown; roadmap also bullets === items'});
      if(tool === 'roadmap'){
        const lost = [];
        if(parsed.headline && !md.includes(parsed.headline)) lost.push('headline');
        if(parsed.verdict && parsed.verdict !== 'off' && !md.includes(parsed.verdict)) lost.push('verdict');
        if(parsed.story && !md.includes(parsed.story)) lost.push('story (only present while a comparison is active)');
        if(parsed.dateStr && !md.includes(parsed.dateStr)) lost.push('date');
        findings.add({...base, format: 'markdown', artefact: null, check: 'markdown:authored-fields', pass: null, values: {absentFromMarkdown: lost}, note: 'authored fields not present in the Markdown output (informational: Markdown is a source-shaped summary)'});
      }
    }
    /* decks: coverage and consistency */
    for(const d of state.decks.filter(x => x.view === view)){
      const geos = [];
      for(let i = 0; i < (d.rec.pages || []).length; i++){ const g = state.deckGeo.get(`${d.dir}|${i}`); if(g) geos.push(g); }
      if(!geos.length) continue;
      const pageTexts = geos.map(g => g.texts.map(t => normText(t.text)));
      const hay = normText(pageTexts.flat().join(' '));
      const titlesOnly = d.name.includes('titles');
      const missing = [], fragmented = [];
      for(const it of parsed.items){
        const title = normText(tool === 'roadmap' ? it.title : it.label);
        if(hay.includes(title)) continue;
        const words = title.split(' ').filter(w => w.length > 2);
        if(words.length && words.every(w => hay.includes(w.slice(0, 12)))) fragmented.push(title.slice(0, 60)); else missing.push(title.slice(0, 60));
      }
      const noteMissing = [];
      if(!titlesOnly && tool === 'roadmap') for(const it of parsed.items) if(it.note){ const w = normText(it.note).split(' ').slice(0, 5).join(' '); if(w && !hay.includes(w) && !hay.includes(w.slice(0, 20))) noteMissing.push(normText(it.note).slice(0, 50)); }
      const dcheck = {...base, format: 'deck', artefact: `raw/${tool}/${doc}/${theme}/${slug(view)}/${d.name}/`};
      findings.add({...dcheck, check: 'deck:item-coverage', pass: missing.length === 0 && (titlesOnly || noteMissing.length === 0), values: {deck: d.name, pages: geos.length, documentItems: parsed.items.length, itemsMissingFromAllPages: missing.slice(0, 20), missingCount: missing.length, titlesOnlyAcrossBreaks: fragmented.length, fragmentedTitles: fragmented.slice(0, 5), commentaryMissing: noteMissing.slice(0, 10)}, note: 'every parsed item title found in the text of some slide (titles split into numbered continuations counted separately); commentary checked for complete decks'});
      /* paging labels */
      const pageLabels = geos.map(g => g.texts.map(t => normText(t.text)).filter(t => /^\d+ of \d+$/.test(t)));
      const n = geos.length;
      const okLabels = n === 1 ? true : pageLabels.every((l, i) => l.length === 1 && l[0] === `${i + 1} of ${n}`);
      findings.add({...dcheck, check: 'deck:page-numbering', pass: okLabels, values: {deck: d.name, pages: n, labels: pageLabels}, note: 'multi-slide sets must label each slide "k of N" in the footer; a single slide carries none'});
      /* repeated header consistency: texts in the top 22% with identical position across pages */
      const hdr = geos.map(g => g.texts.filter(t => t.ink[1] < g.viewBox[3] * .22).map(t => `${normText(t.text)}@${Math.round(t.ink[0])},${Math.round(t.ink[1])}`));
      const set0 = new Set(hdr[0]);
      const diffs = hdr.slice(1).map((h, i) => ({page: i + 2, onlyHere: h.filter(x => !set0.has(x)).slice(0, 6), missing: [...set0].filter(x => !h.includes(x)).slice(0, 6)}));
      findings.add({...dcheck, check: 'deck:header-consistency', pass: null, values: {deck: d.name, pages: n, headerTextsOnPage1: hdr[0]?.length, differingPages: diffs.filter(x => x.onlyHere.length || x.missing.length).length, diffs: diffs.filter(x => x.onlyHere.length || x.missing.length).slice(0, 5)}, note: 'texts in the top 22% of each slide compared with page 1 (text + position); differences can be legitimate (page-specific headings) - judge on the sheet'});
      const ftr = geos.map(g => g.texts.filter(t => t.base > g.viewBox[3] * .9).map(t => Math.round(t.base)));
      const ys = [...new Set(ftr.flat())];
      findings.add({...dcheck, check: 'deck:footer-position', pass: ys.length <= 1 || null, values: {deck: d.name, footerBaselineYs: ys}, note: 'baselines of text in the bottom 10% of each slide, across all pages (one value expected when footers are aligned)'});
    }
  }
  /* page-count/coverage agreement is within deck:item-coverage; refusal listing is deck:refusal */
}

function compareModels(a, b, tool){
  const fields = tool === 'roadmap'
    ? ['title', 'headline', 'story', 'verdict', 'dateStr', 'horizons', 'wip', 'style', 'focus', 'group', 'palette', 'accent', 'font', 'timeAxis', 'fade', 'basis']
    : ['title', 'verdict', 'style', 'palette', 'accent', 'font', 'today'];
  const diffs = [];
  /* source line numbers move when lines are added; basis is an editor setting the Markdown copy need not carry (M1) */
  const plain = v => JSON.stringify(v ?? null, (k, x) => k === 'srcLine' ? undefined : x);
  for(const f of fields) if(plain(a[f]) !== plain(b[f]) && !(f === 'basis' && b[f] == null)) diffs.push({field: f, before: a[f] ?? null, after: b[f] ?? null});
  const ik = i => JSON.stringify([i.lane, i.h, i.title, i.note, i.status, i.url, i.span, i.declaredSpan, i.bet, i.cond], (k, v) => k === 'srcLine' ? undefined : v);
  const A = a.items.map(ik), B = b.items.map(ik);
  if(A.length !== B.length) diffs.push({field: 'items.length', before: A.length, after: B.length});
  /* Markdown regroups items by horizon then lane, so compare as multisets and report order separately */
  const count = arr => arr.reduce((m, k) => (m.set(k, (m.get(k) || 0) + 1), m), new Map());
  const ca = count(A), cb = count(B), changed = [];
  for(const [k, n] of ca) if((cb.get(k) || 0) < n) changed.push({lost: JSON.parse(k)});
  for(const [k, n] of cb) if((ca.get(k) || 0) < n) changed.push({gained: JSON.parse(k)});
  const orderChanged = changed.length === 0 && A.some((k, i) => k !== B[i]);
  return {fieldDiffs: diffs, itemDiffs: changed, orderChanged};
}

async function analyseDoc(ctx, tool, doc, themes, outRoot, parse){
  const parsed = parse(doc.source);
  const result = [];
  for(const theme of themes){
    const caseRoot = join(outRoot, 'raw', tool, doc.name, theme);
    const manifests = [];
    if(!existsSync(caseRoot)) continue;
    for(const v of readdirSync(caseRoot)){
      const mf = join(caseRoot, v, 'manifest.json');
      if(existsSync(mf)) manifests.push(JSON.parse(readFileSync(mf, 'utf8')));
    }
    const order = TOOLS[tool].views;
    manifests.sort((a, b) => order.indexOf(a.view) - order.indexOf(b.view));
    const state = {refs: new Map(), md: new Map(), views: [], decks: [], deckGeo: new Map(), parsed, svgGeo: null};
    const runtimeF = join(caseRoot, 'runtime.json');
    const runtime = existsSync(runtimeF) ? JSON.parse(readFileSync(runtimeF, 'utf8')) : {runtime: []};
    ctx.findings.add({tool, doc: doc.name, theme, view: null, format: 'page', artefact: null, check: 'page:runtime-errors', pass: runtime.runtime.filter(x => !/^requestfailed.*(favicon)/.test(x)).length === 0, values: {errors: runtime.runtime.slice(0, 10)}});
    ctx.findings.add({tool, doc: doc.name, theme, view: null, format: 'page', artefact: null, check: 'parse:warnings', pass: null, values: {warnings: runtime.loadWarnings ?? manifests[0]?.loadWarnings ?? [], parserWarnings: parsed.warnings, items: parsed.items.length}, note: 'warnings the real page shows for this document (notes, not failures)'});
    for(const m of manifests){
      try{ await analyseView(ctx, m, state); }
      catch(e){ ctx.findings.add({tool, doc: doc.name, theme, view: m.view, format: 'analysis', artefact: null, check: 'analysis-error', pass: false, values: {error: e.stack?.split('\n').slice(0, 3).join(' | ')}}); console.log(`    analysis error ${tool}/${doc.name}/${theme}/${m.view}: ${e.message}`); }
    }
    mirrorAndMarkdown(ctx, tool, doc.name, theme, state, doc.source);
    /* print: every sheet, in the light theme, no row cut, the last sheet more than a legend, the PDF as long as the sheets */
    const pj = join(caseRoot, 'print', 'print.json');
    if(existsSync(pj)){
      const pr = JSON.parse(readFileSync(pj, 'utf8'));
      const geo = existsSync(join(caseRoot, 'print', 'print-geometry.json')) ? JSON.parse(readFileSync(join(caseRoot, 'print', 'print-geometry.json'), 'utf8')) : [];
      const tones = [];
      for(const f of pr.sheets) { const st = await pngStats(ctx.lab, readFileSync(join(caseRoot, 'print', f))); tones.push({f, w: st.w, h: st.h, meanLum: r1(st.meanLum), nonBg: round(st.nonBgFraction, 4)}); }
      const cut = [];
      geo.forEach((sh, i) => sh.rows.forEach(([y0, y1, top, bottom]) => { if(top < y0 - .5 && bottom > y0 + .5 || top < y1 - .5 && bottom > y1 + .5) cut.push({sheet: i + 1}); }));
      const rowsPer = geo.map(sh => sh.rows.filter(([y0, y1, top, bottom]) => top >= y0 - .5 && bottom <= y1 + .5).length);
      const base = {tool, doc: doc.name, theme, view: '(source style)', format: 'print', artefact: `raw/${tool}/${doc.name}/${theme}/print/`};
      ctx.findings.add({...base, check: 'print:sheets', pass: pr.sheets.length >= 1 && tones.every(t => t.nonBg > .002), values: {sheets: tones, pdfPages: pr.pdfPages}, note: 'F8: every printed sheet photographed under print media (the old print.png was the unprinted page, blank white); each must show something'});
      ctx.findings.add({...base, check: 'print:light-theme', pass: tones.every(t => t.meanLum > 150), values: {meanLuminance: tones.map(t => t.meanLum)}, note: 'R1: light paper whatever the page theme'});
      ctx.findings.add({...base, check: 'print:rows-not-cut', pass: cut.length === 0, values: {cut: cut.slice(0, 6)}, note: 'F8: no row or card is cut by a page break'});
      ctx.findings.add({...base, check: 'print:last-sheet-not-legend', pass: geo.length < 2 || rowsPer.at(-1) >= 1, values: {rowsPerSheet: rowsPer}, note: 'F8: the last sheet carries at least one row (not the legend alone)'});
      ctx.findings.add({...base, check: 'print:pdf-matches-sheets', pass: pr.pdfPages == null || pr.pdfPages === pr.sheets.length, values: {pdfPages: pr.pdfPages, sheets: pr.sheets.length}, note: 'F8: the PDF the browser prints has the same number of pages as the sheets photographed'});
    }
    /* Markdown import round trip */
    const rt = join(caseRoot, 'import', 'import-roundtrip.json');
    if(tool === 'roadmap' && existsSync(rt)){
      const r = JSON.parse(readFileSync(rt, 'utf8'));
      if(!r.ok) ctx.findings.add({tool, doc: doc.name, theme, view: null, format: 'markdown', artefact: null, check: 'markdown:import-roundtrip', pass: false, values: r});
      else {
        const after = parse(r.srcAfter || '');
        const cmp = compareModels(parsed, after, tool);
        const mdBefore = r.mdBefore;
        ctx.findings.add({tool, doc: doc.name, theme, view: '(source style)', format: 'markdown', artefact: `raw/${tool}/${doc.name}/${theme}/import/import-roundtrip.json`, check: 'markdown:import-roundtrip-model', pass: cmp.fieldDiffs.length === 0 && cmp.itemDiffs.length === 0,
          values: {...cmp, itemDiffs: cmp.itemDiffs.slice(0, 10), orderNote: cmp.orderChanged ? 'item order within the document was regrouped by horizon then lane (content identical)' : undefined, itemsBefore: parsed.items.length, itemsAfter: after.items.length, markdownIdenticalAfterReexport: mdBefore === r.mdAfter}, note: 'File > Import markdown of the page\'s own "Copy source as Markdown", then the resulting source parsed with the real parser and compared field by field with the original source'});
      }
    }
  }
}

/* ------------------------------------------------------------------ sheets */
async function makeSheets(ctx, tool, doc, themes, outRoot){
  const {lab} = ctx;
  const sheetDir = ensure(join(outRoot, 'sheets'));
  const b64 = f => f && existsSync(f) ? readFileSync(f).toString('base64') : null;
  const views = TOOLS[tool].views;
  for(const view of views){
    const rowsFor = pick => themes.map(theme => {
      const d = join(outRoot, 'raw', tool, doc.name, theme, slug(view));
      return {label: `${tool} / ${doc.name} / ${view} / ${theme}`, cells: pick(d, theme)};
    }).filter(r => r.cells.length);
    const mf = theme => { const f = join(outRoot, 'raw', tool, doc.name, theme, slug(view), 'manifest.json'); return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; };
    if(!themes.some(t => mf(t))) continue;
    const a = rowsFor(d => [
      {label: 'on-screen view (1x)', b64: b64(join(d, 'onscreen.png')), note: 'not captured'},
      {label: 'SVG export (rasterised 2x, standalone)', b64: b64(join(d, 'export.svg.ref.png')), note: 'no SVG export'},
      {label: 'PNG download (2x)', b64: b64(join(d, 'export.png')), note: 'no PNG export'},
    ]);
    const decks = (d, theme) => {
      const m = mf(theme); const cells = [];
      cells.push({label: 'Copy PNG (clipboard)', b64: b64(join(d, 'copy.png')), note: m?.states?.copypng?.hidden ? 'Copy PNG hidden (deck is not 1 page)' : 'not captured'});
      for(const [name, rec] of Object.entries(m?.decks || {})){
        if(name === 'deck-fullslide') continue;
        const pages = (rec.zipEntries || []).filter(e => /\.png$/.test(e.name)).slice(0, 3);
        if(!pages.length) cells.push({label: `${name}`, b64: null, note: rec.states?.errorVisible ? 'REFUSED: ' + (rec.states.errorText || '').slice(0, 90) : (rec.error || 'no pages')});
        pages.forEach((p, i) => cells.push({label: `${name} p${i + 1}/${rec.pageCount}`, b64: b64(join(d, name, p.name))}));
      }
      return cells;
    };
    const b = rowsFor(decks);
    for(const [tag, rows] of [['a', a], ['b', b]]){
      if(!rows.length) continue;
      /* chunk the cells into rows of <=4 and split tall images into parts */
      const chunks = [];
      const maxCells = Math.max(...rows.map(r => r.cells.length));
      for(let c0 = 0; c0 < maxCells; c0 += 3) chunks.push(rows.map(r => ({...r, cells: r.cells.slice(c0, c0 + 3)})).filter(r => r.cells.length));
      for(let ci = 0; ci < chunks.length; ci++){
        let part = 0, parts = 1;
        do {
          const res = await lab.evaluate(composeSheetInPage, {cellW: 1100, sliceH: 1500, part, rows: chunks[ci], title: `${tool} / ${doc.name} / ${view}  [${tag}${chunks.length > 1 ? ci + 1 : ''}${parts > 1 ? ' part ' + (part + 1) : ''}]`});
          parts = res.parts;
          const name = `sheet-${tool}-${doc.name}-${slug(view)}-${tag}${chunks.length > 1 ? ci + 1 : ''}${parts > 1 ? '-p' + (part + 1) : ''}.png`;
          writeFileSync(join(sheetDir, name), Buffer.from(res.b64, 'base64'));
          part++;
        } while(part < parts && part < 6);
      }
    }
  }
}


/* Probe: do the other routes into dark mode (OS scheme flipping after load, the masthead toggle)
   export the same SVG as a page that loaded in dark? Compared with the captured dark export. */
async function probeTheme(browser, base, tool, outRoot, timeout){
  const findings = new Findings();
  const view = tool === 'roadmap' ? 'grid' : 'field';
  const doc = loadFixtures(tool).find(d => d.name === 'example');
  const ref = join(outRoot, 'raw', tool, 'example', 'dark', view, 'export.svg');
  if(!existsSync(ref)) return findings.records;
  const dir = ensure(join(outRoot, 'raw', tool, 'example', 'probe-theme'));
  const refText = readFileSync(ref, 'utf8');
  const exportSvg = async (page, name) => {
    await openMenu(page, '#dlsvg');
    const r = await download(page, '#dlsvg', join(dir, name), timeout);
    return r.ok ? readFileSync(join(dir, name), 'utf8') : null;
  };
  const cmp = (a, b) => { if(a === b) return {identical: true}; let i = 0; while(i < Math.min(a.length, b.length) && a[i] === b[i]) i++; return {identical: false, lengthA: a.length, lengthB: b.length, firstDiffAt: i, contextA: a.slice(Math.max(0, i - 60), i + 80), contextB: b.slice(Math.max(0, i - 60), i + 80)}; };
  for(const route of ['os-scheme-flips-after-load', 'masthead-toggle']){
    const ctx = await newAppContext(browser, base, 'light');
    try{
      const page = await ctx.newPage(); page.setDefaultTimeout(timeout);
      await loadDoc(page, base, tool, doc.source, timeout);
      await switchView(page, tool, view, timeout);
      if(route === 'os-scheme-flips-after-load') await page.emulateMedia({colorScheme: 'dark'});
      else await page.locator('.mg-appearance').click();
      await sleep(600); await settle(page);
      const themeAttr = await page.evaluate(() => document.documentElement.dataset.theme ?? null);
      const svg = await exportSvg(page, route + '.svg');
      const bg = svg && (svg.match(/<rect[^>]*fill="(#[0-9a-f]{6})"/i) || [])[1];
      const same = svg ? cmp(refText, svg) : null;
      findings.add({tool, doc: 'example', theme: 'light->dark via ' + route, view, format: 'svg', artefact: svg ? `raw/${tool}/example/probe-theme/${route}.svg` : null, check: 'theme:route-matches-os-dark-export',
        pass: svg ? same.identical : false, values: {route, dataTheme: themeAttr, firstRectFill: bg, ...(same || {error: 'no svg'})}, note: 'SVG exported after switching to dark by this route vs the SVG exported by a page that loaded in OS dark'});
    }catch(e){ findings.add({tool, doc: 'example', theme: route, view, format: 'svg', artefact: null, check: 'theme:route-matches-os-dark-export', pass: false, values: {error: e.message.split('\n')[0]}}); }
    finally{ await ctx.close(); }
  }
  return findings.records;
}

/* ------------------------------------------------------------------ main */
async function main(){
  const tools = asList(arg('tool')) || Object.keys(TOOLS);
  const docFilter = asList(arg('doc'));
  const themes = asList(arg('theme')) || ['light', 'dark'];
  const viewFilter = asList(arg('view'));
  const phases = asList(arg('phase')) || ['capture', 'analyse', 'sheets', 'probes'];
  const timeout = +arg('timeout', 10000);
  const outRoot = resolve(arg('out', resolve(ROOT, '../../../docs/superpowers/specs/export-audit')));
  ensure(outRoot); ensure(join(outRoot, 'findings'));
  let server = null, base = arg('base');
  if(!base){ server = await startServer(); base = server.base; }
  console.log(`export-audit: ${base}  out=${outRoot}  tools=${tools}  phases=${phases}`);
  const browserRef = {browser: await launch()};
  try{
    for(const tool of tools){
      const {parse} = await import(pathToFileURL(join(ROOT, tool, 'parse.js')).href);
      const docs = loadFixtures(tool).filter(d => !docFilter || docFilter.some(f => d.name === f || d.name.includes(f)));
      const views = TOOLS[tool].views.filter(v => !viewFilter || viewFilter.includes(v) || viewFilter.includes(v.split('+')[0]));
      for(const doc of docs){
        console.log(`== ${tool}/${doc.name}`);
        if(phases.includes('capture')){
          for(const theme of themes){
            const caseDir = join(outRoot, 'raw', tool, doc.name, theme);
            rmSync(caseDir, {recursive: true, force: true});
            try{
              await withRetry(browserRef, `${tool}/${doc.name}/${theme}`, b => captureCase(b, base, {tool, doc, source: doc.source, theme, views, outRoot, timeout}));
            }catch(e){ console.log(`  CASE FAILED ${tool}/${doc.name}/${theme}: ${e.message.split('\n')[0]}`); }
          }
        }
        if(phases.includes('onscreen')) for(const theme of themes){
          try{ await withRetry(browserRef, `onscreen ${tool}/${doc.name}/${theme}`, b => recaptureOnscreen(b, base, {tool, doc, theme, views, outRoot, timeout})); }
          catch(e){ console.log(`  ONSCREEN FAILED ${tool}/${doc.name}/${theme}: ${e.message.split('\n')[0]}`); }
        }
        if(phases.includes('analyse') || phases.includes('sheets')){ // (probes run after all documents)
          const lab = await (await browserRef.browser.newContext({viewport: {width: 800, height: 600}})).newPage();
          await lab.goto('about:blank');
          const appPages = {};
          const appCtxs = [];
          if(phases.includes('analyse')) for(const theme of themes){
            const c = await newAppContext(browserRef.browser, base, theme); appCtxs.push(c);
            const p = await c.newPage(); p.setDefaultTimeout(timeout);
            await p.goto(base + TOOLS[tool].path, {waitUntil: 'load'}); await waitReady(p, timeout * 2).catch(() => {});
            appPages[theme] = p;
          }
          const ctx = {findings: new Findings(), browser: browserRef.browser, lab, base, outRoot, appPages};
          if(phases.includes('analyse')){
            await analyseDoc(ctx, tool, doc, themes, outRoot, parse);
            writeFileSync(join(outRoot, 'findings', `${tool}--${doc.name}.json`), JSON.stringify(ctx.findings.records, null, 1));
            const fails = ctx.findings.records.filter(r => r.pass === false);
            console.log(`  analysed: ${ctx.findings.records.length} records, ${fails.length} fail`);
          }
          if(phases.includes('sheets')) await makeSheets(ctx, tool, doc, themes, outRoot);
          for(const c of appCtxs) await c.close().catch(() => {});
          await lab.context().close();
        }
      }
    }
    if(phases.includes('axis') && tools.includes('timeline')){
      const f = new Findings();
      for(const doc of loadFixtures('timeline')) for(const theme of themes) for(const view of TOOLS.timeline.views){
        const file = join(outRoot, 'raw', 'timeline', doc.name, theme, slug(view), 'export.svg');
        if(!existsSync(file) || (docFilter && !docFilter.some(x => doc.name.includes(x)))) continue;
        const r = checkAxisMonths(readFileSync(file, 'utf8'));
        if(r.ticks >= 3) f.add({tool: 'timeline', doc: doc.name, theme, view, format: 'svg', artefact: `raw/timeline/${doc.name}/${theme}/${slug(view)}/export.svg`, check: 'axis:month-ticks-consecutive', pass: r.gaps.length === 0, values: r, note: 'month tick labels on the time axis of the SVG download; a skipped month leaves an irregular scale'});
      }
      writeFileSync(join(outRoot, 'findings', 'timeline--axis.json'), JSON.stringify(f.records, null, 1));
      console.log(`  axis: ${f.records.length} records, ${f.records.filter(r => r.pass === false).length} fail`);
    }
    if(phases.includes('probes')) for(const tool of tools){
      const recs = await probeTheme(browserRef.browser, base, tool, outRoot, timeout);
      writeFileSync(join(outRoot, 'findings', `${tool}--probe-theme.json`), JSON.stringify(recs, null, 1));
      console.log(`  probe ${tool}: ${recs.length} records`);
    }
    /* merge */
    const all = [];
    for(const f of readdirSync(join(outRoot, 'findings')).filter(f => f.endsWith('.json')).sort()) all.push(...JSON.parse(readFileSync(join(outRoot, 'findings', f), 'utf8')));
    writeFileSync(join(outRoot, 'findings.json'), JSON.stringify(all, null, 1));
    console.log(`findings.json: ${all.length} records, ${all.filter(r => r.pass === false).length} failing`);
  } finally {
    await browserRef.browser.close().catch(() => {});
    if(server) server.stop();
  }
}
if(process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
