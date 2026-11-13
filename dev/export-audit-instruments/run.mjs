/* Export audit for Fermi, Bets, Tree, Rank and Paths (not registered in the gate).

   Drives the real pages and buttons in headless Chromium, keeps the bytes a user would receive, then
   measures them. Product code is never called to make an export.

     node dev/export-audit-instruments/run.mjs [--tool bets,tree] [--doc a0,many] [--theme light|dark]
                                               [--phase capture,analyse] [--out <dir>]

   capture  open each stress document (docs/<tool>/), every view, click every export control; save
            raw/<tool>/<doc>/<theme>/<view>/… and a manifest. Light: also Share → reopen → re-export.
   analyse  checks on the saved artefacts; prints one PASS/FAIL line per check id, tags a failure that
            matches a confirmed finding as [known XX-n]; writes results.json.

   Also: print.mjs (browser Print → PDF → page images and text), handoff.mjs (Paths → Roadmap), make-docs.mjs
   (regenerates docs/), known.mjs (confirmed findings, by id). Needs pdftoppm/pdftotext and python3+PIL for print.

   Default --out: /Users/matthew/repos/tools/docs/superpowers/specs/export-audit-instruments (local, gitignored). */
import {writeFileSync, readFileSync, existsSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {arg, asList, boot, newContext, loadDocs, ensure, sleep, CANVAS_SPY, openMenus, closeMenus, clickDownload, clickCopy, readClipboardText, clearClipboard, pollClipboard} from './lib.mjs';
import {TOOLS} from './tools.mjs';
import {analyse} from './analyse.mjs';

const OUT = arg('out', '/Users/matthew/repos/tools/docs/superpowers/specs/export-audit-instruments');
const tools = asList(arg('tool')) || Object.keys(TOOLS);
const docFilter = asList(arg('doc'));
const themes = asList(arg('theme')) || ['light', 'dark'];
const phases = asList(arg('phase')) || ['capture', 'analyse'];

async function pageInfo(page, tool, view, liveSel){
  return page.evaluate(([tool, view, liveSel]) => {
    const vis = el => !!el && !el.hidden && el.getClientRects().length > 0;
    const live = document.querySelector(liveSel);
    const svg = live?.querySelector('svg');
    const t = id => document.getElementById(id);
    return {
      warnings: [...document.querySelectorAll('#warns li, #err, #warn, #cfwarn')].filter(vis).map(l => l.textContent.trim()).filter(Boolean),
      placeholder: document.querySelector('#preview .placeholder')?.textContent ?? null,
      verdict: vis(t('verdict')) ? t('verdict').innerText : null,
      metrics: vis(t('metrics')) ? t('metrics').innerText : null,
      liveSvg: svg ? svg.outerHTML : null,
      liveText: live ? live.innerText : null,
      tiles: tool === 'fermi' ? {p10: t('p10')?.textContent, p50: t('p50')?.textContent, p90: t('p90')?.textContent, spread: t('spread')?.textContent, tout: t('tout')?.textContent, cftout: t('cftout')?.textContent, sens: t('srows')?.innerText, method: t('estmethod')?.textContent, pourverdict: t('pourverdict')?.innerText, resultsShown: vis(t('results')), cfShown: vis(t('cfresults'))} : null,
      rank: tool === 'rank' ? {rows: [...document.querySelectorAll('#rrows > *')].map(r => r.innerText.replace(/\s+/g, ' ').trim()), flip: t('flipline')?.textContent, verdictBody: document.querySelector('.rverdict, #verdictdetail, #rexplain')?.innerText ?? null, wobble: document.querySelector('#ww')?.value} : null,
      controls: [...document.querySelectorAll('button[id], .vcopy')].filter(b => /png|svg|copy|md|doc|receipt/i.test(b.id + b.className)).map(b => ({id: b.id || b.className, visible: vis(b), disabled: b.disabled, text: b.textContent.trim()})),
      pageScrollWidth: document.documentElement.scrollWidth, innerWidth,
      fontsOk: [...document.fonts].every(f => f.status !== 'error'),
    };
  }, [tool, view, liveSel]);
}

async function captureView(page, T, tool, doc, theme, view, dir){
  const man = {tool, doc: doc.name, theme, view, about: doc.about, exports: {}};
  await T.select(page, view);
  await closeMenus(page);
  const liveSel = typeof T.live === 'function' ? T.live(view) : T.live;
  const info = await pageInfo(page, tool, view, liveSel);
  man.page = {...info, liveSvg: undefined};
  if(info.liveSvg) writeFileSync(join(dir, 'live.svg'), info.liveSvg);
  const loc = page.locator(liveSel).first();
  if(await loc.count() && await loc.isVisible().catch(() => false)) await loc.screenshot({path: join(dir, 'live.png')}).catch(e => { man.liveShotError = e.message; });
  await page.screenshot({path: join(dir, 'page.png'), fullPage: true}).catch(() => {});
  for(const ex of T.exports(view, doc)){
    await openMenus(page);
    await page.evaluate(() => { window.__fill = []; });
    let r;
    if(ex.kind === 'svg' || ex.kind === 'png'){
      r = await clickDownload(page, ex.sel, join(dir, ex.id + '.' + ex.kind));
    } else if(ex.kind === 'copypng'){
      r = await clickCopy(page, ex.sel, 'image');
      if(r.value){ writeFileSync(join(dir, ex.id + '.png'), r.value); r.file = join(dir, ex.id + '.png'); }
      r.value = undefined;
    } else {
      r = await clickCopy(page, ex.sel, 'text');
      if(r.value){ writeFileSync(join(dir, ex.id + (ex.kind === 'md' ? '.md' : '.txt')), r.value); }
      r.value = undefined;
    }
    if(ex.canvas) r.canvasText = await page.evaluate(() => window.__fill.filter(f => !f.onPage));
    man.exports[ex.id] = {...r, sel: ex.sel, kind: ex.kind, receipt: !!ex.receipt};
    await closeMenus(page);
    await sleep(150);
  }
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(man, null, 1));
  return man;
}

/* Share → the copied link → a fresh page → the same export again. */
async function captureShare(ctx, base, T, tool, doc, view, dir, page){
  const out = {};
  await clearClipboard(page);
  await page.locator('[data-act="share"]').first().click();
  const url = await pollClipboard(page, 'text', 6000);
  out.url = url; out.urlLength = url?.length ?? null;
  out.status = await page.evaluate(() => [...document.querySelectorAll('.tool-status, [role=status]')].map(s => s.textContent.trim()).filter(Boolean).join(' | '));
  if(!url || !/^http/.test(url)) return out;
  const p2 = await ctx.newPage();
  await p2.addInitScript(CANVAS_SPY);
  await p2.goto(url, {waitUntil: 'load'});
  await T.ready(p2);
  await T.select(p2, view);
  const ex = T.exports(view, doc).find(e => e.kind === 'svg' && !e.receipt) || T.exports(view, doc).find(e => e.kind === 'md');
  await openMenus(p2);
  if(ex.kind === 'svg') out.reexport = await clickDownload(p2, ex.sel, join(dir, 'share-' + ex.id + '.svg'));
  else { const r = await clickCopy(p2, ex.sel, 'text'); if(r.value) writeFileSync(join(dir, 'share-' + ex.id + '.md'), r.value); out.reexport = {ok: r.ok, id: ex.id}; }
  out.reexportId = ex.id;
  out.liveText = await p2.evaluate(sel => document.querySelector(sel)?.innerText ?? null, typeof T.live === 'function' ? T.live(view) : T.live);
  await p2.close();
  return out;
}

async function capture(env){
  for(const tool of tools){
    const T = TOOLS[tool];
    for(const doc of loadDocs(tool)){
      if(docFilter && !docFilter.some(f => doc.name.includes(f))) continue;
      for(const theme of themes){
        const ctx = await newContext(env.browser, env.srv.base, theme);
        await ctx.addInitScript(CANVAS_SPY);
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        try{
          await page.goto(env.srv.base + T.path + '#' + T.hash(doc), {waitUntil: 'load'});
          await T.ready(page);
          for(const view of T.views(doc)){
            const dir = ensure(join(OUT, 'raw', tool, doc.name, theme, view));
            const t0 = Date.now();
            const man = await captureView(page, T, tool, doc, theme, view, dir);
            if(theme === 'light'){
              man.share = await captureShare(ctx, env.srv.base, T, tool, doc, view, dir, page).catch(e => ({error: e.message.split('\n')[0]}));
            }
            man.errors = errors.slice();
            writeFileSync(join(dir, 'manifest.json'), JSON.stringify(man, null, 1));
            const sum = Object.entries(man.exports).map(([k, v]) => k + ':' + (v.ok ? 'ok' : 'no')).join(' ');
            console.log(`captured ${tool}/${doc.name}/${theme}/${view} ${sum} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
          }
        }catch(e){ console.log(`CAPTURE ERROR ${tool}/${doc.name}/${theme}: ${e.message.split('\n')[0]}`); }
        await ctx.close();
      }
    }
  }
}

const env = await boot();
try{
  if(phases.includes('capture')) await capture(env);
  if(phases.includes('analyse')) await analyse(env, {OUT, tools, docFilter, themes});
}finally{ await env.close(); }
