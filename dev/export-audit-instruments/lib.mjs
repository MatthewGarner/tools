/* Shared plumbing for the instruments export audit (Fermi, Bets, Tree, Rank, Paths).
   Drives the REAL pages and buttons; nothing here calls product code to fake an export. */
import {chromium} from '../pw/node_modules/playwright/index.mjs';
import {deflateRawSync} from 'node:zlib';
import {mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync} from 'node:fs';
import {join, dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {startServer} from '../pw/session.mjs';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '../..');
export const FIXED_NOW = new Date('2026-11-12T10:00:00Z');
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const ensure = dir => { mkdirSync(dir, {recursive: true}); return dir; };
export const arg = (name, fallback) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : fallback; };
export const asList = v => (v ? String(v).split(',').map(s => s.trim()).filter(Boolean) : null);
export const slug = s => String(s).replace(/[^a-z0-9+_.-]+/gi, '-');
export const normText = s => String(s ?? '').replace(/[   ]/g, ' ').replace(/\s+/g, ' ').trim();

/* the link form Share writes: z: + base64url(deflate-raw(JSON)) */
export const hashFor = state => 'z:' + deflateRawSync(Buffer.from(JSON.stringify(state))).toString('base64url');

/* Stress documents: docs/<tool>/<name>.txt (DSL source) or .json (page state). First line of a .txt
   is a // comment saying what it stresses; it is kept (the DSLs read // as a comment). */
export function loadDocs(tool){
  const dir = join(HERE, 'docs', tool);
  return readdirSync(dir).filter(f => /\.(txt|json)$/.test(f)).sort().map(f => {
    const raw = readFileSync(join(dir, f), 'utf8');
    const name = f.replace(/\.(txt|json)$/, '');
    if(f.endsWith('.json')){ const j = JSON.parse(raw); return {name, kind: 'state', about: j.about || '', state: j.state, opts: j.opts || {}}; }
    return {name, kind: 'source', about: (raw.split('\n')[0] || '').replace(/^\/\/\s*/, ''), source: raw};
  });
}

export async function boot(){
  const srv = await startServer();
  const browser = await chromium.launch();
  return {srv, browser, async close(){ await browser.close().catch(() => {}); srv.stop(); }};
}

export async function newContext(browser, base, theme, {width = 1280, height = 800} = {}){
  const ctx = await browser.newContext({viewport: {width, height}, deviceScaleFactor: 1, reducedMotion: 'reduce', acceptDownloads: true, colorScheme: theme});
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], {origin: new URL(base).origin});
  await ctx.clock.setFixedTime(FIXED_NOW);
  return ctx;
}

/* Record every canvas fillText (text, font, x, y, canvas size): the Fermi PNG is drawn on a canvas, so
   this is the only way to read what text it carries without OCR. */
export const CANVAS_SPY = () => {
  window.__fill = [];
  const orig = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function(text, x, y, maxW){
    try{ window.__fill.push({text: String(text), font: this.font, x, y, cw: this.canvas.width, ch: this.canvas.height, maxW: maxW ?? null, onPage: this.canvas.isConnected}); }catch(_){}
    return orig.apply(this, arguments);
  };
};

export async function settle(page, sel = '#preview', polls = 3){
  let last = null, same = 0;
  for(let i = 0; i < 40 && same < polls; i++){
    const cur = await page.evaluate(s => document.querySelector(s)?.innerHTML.length ?? -1, sel);
    if(cur === last) same++; else { same = 0; last = cur; }
    await sleep(120);
  }
  await page.evaluate(() => document.fonts.ready.then(() => true)).catch(() => {});
}

export async function openMenus(page){
  /* the Export disclosure is a <details>: open every one so its buttons are clickable */
  await page.evaluate(() => { for(const d of document.querySelectorAll('details.action-disclosure, details.export, details')) if(d.querySelector('button[id]')) d.open = true; });
}
export async function closeMenus(page){
  await page.evaluate(() => { for(const d of document.querySelectorAll('details[open]')) if(d.querySelector('button[id]')) d.open = false; });
}

export const clearClipboard = page => page.evaluate(() => navigator.clipboard.writeText('')).catch(() => {});
export async function readClipboardText(page){ return page.evaluate(() => navigator.clipboard.readText()).catch(e => null); }
export async function readClipboardImage(page){
  const b64 = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    for(const it of items) if(it.types.includes('image/png')){
      const buf = new Uint8Array(await (await it.getType('image/png')).arrayBuffer());
      let s = ''; for(let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      return btoa(s);
    }
    return null;
  }).catch(() => null);
  return b64 ? Buffer.from(b64, 'base64') : null;
}
export async function pollClipboard(page, kind, timeout = 8000){
  const end = Date.now() + timeout;
  while(Date.now() < end){
    const v = kind === 'image' ? await readClipboardImage(page) : await readClipboardText(page);
    if(v && (kind === 'image' || v.length)) return v;
    await sleep(150);
  }
  return null;
}

/* Click a control and take the file; a refusal shows as a changed button label instead. */
export async function clickDownload(page, selector, dest, timeout = 12000){
  const loc = page.locator(selector).first();
  if(!await loc.count()) return {ok: false, error: 'control not found: ' + selector};
  const label = await loc.textContent().catch(() => '');
  const state = await loc.evaluate(b => ({hidden: b.hidden || !b.getClientRects().length, disabled: b.disabled})).catch(() => ({}));
  if(state.disabled) return {ok: false, error: 'control disabled', label, ...state};
  if(state.hidden) timeout = 2500;   // a hidden control is tried briefly: it may still work, but it is not offered
  const dlp = page.waitForEvent('download', {timeout}); dlp.catch(() => {});
  try{ await loc.evaluate(b => b.click()); }catch(e){ return {ok: false, error: e.message.split('\n')[0], label}; }
  const t0 = Date.now(); let flash = null;
  while(Date.now() - t0 < timeout){
    const won = await Promise.race([dlp.then(d => ({d}), () => ({gone: true})), sleep(100).then(() => null)]);
    if(won?.d){ await won.d.saveAs(dest); return {ok: true, suggested: won.d.suggestedFilename(), file: dest, flash, hiddenControl: state.hidden}; }
    if(won?.gone) break;
    if(!flash){ const now = await loc.textContent().catch(() => label); if(now !== label) flash = now; }
    if(flash && Date.now() - t0 > 1500) return {ok: false, refusal: flash, label, error: 'button showed a message instead of downloading', hiddenControl: state.hidden};
  }
  return {ok: false, error: 'no download within ' + timeout + 'ms', label, refusal: flash, hiddenControl: state.hidden};
}

/* Click a copy control (programmatic click: the control may sit in a closed menu) and read what landed. */
export async function clickCopy(page, selector, kind, timeout = 8000){
  const loc = page.locator(selector).first();
  if(!await loc.count()) return {ok: false, error: 'control not found: ' + selector};
  const label = await loc.textContent().catch(() => '');
  const state = await loc.evaluate(b => ({hidden: b.hidden || !b.getClientRects().length, disabled: b.disabled})).catch(() => ({}));
  if(state.disabled) return {ok: false, error: 'control disabled', label, ...state};
  if(state.hidden) timeout = 1500;
  await clearClipboard(page);
  await page.evaluate(() => { window.__prompted = null; window.prompt = (m, v) => { window.__prompted = v; return null; }; });
  await loc.evaluate(b => b.click());
  const value = await pollClipboard(page, kind, timeout);
  const after = await loc.textContent().catch(() => '');
  const status = await page.evaluate(() => { const s = document.getElementById('exportstatus'); return s && !s.hidden ? s.textContent : null; });
  const prompted = await page.evaluate(() => window.__prompted);
  return {ok: !!value, value, label, after, status, prompted, hiddenControl: state.hidden};
}

/* ------------------------------------------------------------------ in-page image helpers */
export async function analysePngInPage(b64){
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const bm = await createImageBitmap(new Blob([bytes], {type: 'image/png'}));
  const w = bm.width, h = bm.height;
  const cv = new OffscreenCanvas(w, h), g = cv.getContext('2d', {willReadFrequently: true});
  g.drawImage(bm, 0, 0);
  const d = g.getImageData(0, 0, w, h).data;
  const bg = [d[0], d[1], d[2], d[3]];
  let minA = 255, minx = w, miny = h, maxx = -1, maxy = -1, nonBg = 0, lum = 0, n = 0;
  for(let y = 0; y < h; y++) for(let x = 0; x < w; x++){
    const o = (y * w + x) * 4;
    if(d[o + 3] < minA) minA = d[o + 3];
    const diff = Math.abs(d[o] - bg[0]) + Math.abs(d[o + 1] - bg[1]) + Math.abs(d[o + 2] - bg[2]);
    if(diff > 12){ nonBg++; if(x < minx) minx = x; if(x > maxx) maxx = x; if(y < miny) miny = y; if(y > maxy) maxy = y; }
    if((x + y) % 7 === 0){ lum += .2126 * d[o] + .7152 * d[o + 1] + .0722 * d[o + 2]; n++; }
  }
  const bbox = nonBg ? [minx, miny, maxx + 1, maxy + 1] : null;
  return {w, h, bg, minAlpha: minA, nonBgFraction: nonBg / (w * h), bbox, margins: bbox ? {left: bbox[0], top: bbox[1], right: w - bbox[2], bottom: h - bbox[3]} : null, meanLum: lum / n};
}

/* rasterise an SVG string at a scale into PNG base64 (the browser's own rasteriser: the reference) */
export async function rasteriseSvgInPage([svg, scale]){
  const blob = new Blob([svg], {type: 'image/svg+xml'});
  const url = URL.createObjectURL(blob);
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('svg decode failed')); img.src = url; });
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
  const vb = (doc.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
  const W = +doc.getAttribute('width') || vb[2] || img.naturalWidth, H = +doc.getAttribute('height') || vb[3] || img.naturalHeight;
  const c = document.createElement('canvas'); c.width = Math.ceil(W * scale); c.height = Math.ceil(H * scale);
  const g = c.getContext('2d'); g.drawImage(img, 0, 0, W * scale, H * scale);
  URL.revokeObjectURL(url);
  const b = await new Promise(r => c.toBlob(r, 'image/png'));
  const buf = new Uint8Array(await b.arrayBuffer());
  let s = ''; for(let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return {b64: btoa(s), W, H};
}

export async function diffPngInPage([a64, b64, tol]){
  const load = async b => { const by = Uint8Array.from(atob(b), c => c.charCodeAt(0)); const bm = await createImageBitmap(new Blob([by], {type: 'image/png'}));
    const cv = new OffscreenCanvas(bm.width, bm.height), g = cv.getContext('2d', {willReadFrequently: true}); g.drawImage(bm, 0, 0);
    return {w: bm.width, h: bm.height, d: g.getImageData(0, 0, bm.width, bm.height).data}; };
  const A = await load(a64), B = await load(b64);
  if(Math.abs(A.w - B.w) > 2 || Math.abs(A.h - B.h) > 2) return {sizeMismatch: true, a: [A.w, A.h], b: [B.w, B.h]};
  const W = Math.min(A.w, B.w), H = Math.min(A.h, B.h);
  let count = 0, maxDiff = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for(let y = 0; y < H; y++) for(let x = 0; x < W; x++){
    const o = (y * A.w + x) * 4, q = (y * B.w + x) * 4;
    const dd = Math.max(Math.abs(A.d[o] - B.d[q]), Math.abs(A.d[o + 1] - B.d[q + 1]), Math.abs(A.d[o + 2] - B.d[q + 2]), Math.abs(A.d[o + 3] - B.d[q + 3]));
    if(dd > maxDiff) maxDiff = dd;
    if(dd > tol){ count++; if(x < x0) x0 = x; if(y < y0) y0 = y; if(x > x1) x1 = x; if(y > y1) y1 = y; }
  }
  return {w: W, h: H, diffPixels: count, ratio: count / (W * H), maxDiff, region: count ? [x0, y0, x1 + 1, y1 + 1] : null};
}

/* side-by-side board: images (base64) with labels, scaled to a common height */
export async function sideBySideInPage({cells, title, maxW = 1100}){
  const bms = [];
  for(const c of cells){ const by = Uint8Array.from(atob(c.b64), x => x.charCodeAt(0)); bms.push(await createImageBitmap(new Blob([by], {type: 'image/png'}))); }
  const scales = bms.map(b => Math.min(1, maxW / b.width));
  const gap = 20, head = 50, lab = 30;
  const W = bms.reduce((s, b, i) => s + b.width * scales[i], 0) + gap * (bms.length + 1);
  const H = head + lab + Math.max(...bms.map((b, i) => b.height * scales[i])) + gap;
  const cv = document.createElement('canvas'); cv.width = Math.ceil(W); cv.height = Math.ceil(H);
  const g = cv.getContext('2d'); g.fillStyle = '#777'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#fff'; g.font = '600 20px sans-serif'; g.textBaseline = 'middle'; g.fillText(title, gap, head / 2);
  let x = gap;
  bms.forEach((b, i) => {
    g.fillStyle = '#ffd34d'; g.font = '600 16px sans-serif'; g.fillText(cells[i].label, x, head + lab / 2);
    g.drawImage(b, x, head + lab, b.width * scales[i], b.height * scales[i]);
    g.strokeStyle = '#000'; g.strokeRect(x + .5, head + lab + .5, b.width * scales[i] - 1, b.height * scales[i] - 1);
    x += b.width * scales[i] + gap;
  });
  const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = ''; for(let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return btoa(s);
}

/* ------------------------------------------------------------------ Markdown checks (pure) */
export function checkMarkdownTables(md){
  const lines = md.split('\n');
  const problems = [];
  let i = 0;
  const cells = l => { const inner = l.trim().replace(/^\|/, '').replace(/\|$/, ''); return inner.split(/(?<!\\)\|/); };
  while(i < lines.length){
    if(/^\s*\|/.test(lines[i]) && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])){
      const n = cells(lines[i]).length;
      let j = i + 2;
      while(j < lines.length && /^\s*\|/.test(lines[j])){
        const c = cells(lines[j]).length;
        if(c !== n) problems.push({line: j + 1, expected: n, got: c, text: lines[j].slice(0, 120)});
        j++;
      }
      i = j;
    } else i++;
  }
  /* a table row interrupted by a raw newline inside a cell */
  return problems;
}
