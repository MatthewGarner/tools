/* Bets and Tree simulate off the main thread (bets/sim-worker.js, tree/sim-worker.js). What that must do for the reader, on a large
   document: an edit costs the main thread no long task, its figures are final within a stated time, nothing leaves the page while
   they are pending, a stale run never paints, and a document the engine cannot solve leaves the worker usable.
   The page's own signal is #preview[data-sim] = pending | final | error. */
import {measure, waitQuiet, sleep, press, shot} from './lib.mjs';
import {where, fresh, LARGE} from './scenarios-btp.mjs';
import {readFileSync, mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

/* final within this long of the edit reaching the source (it includes the 120ms typing pause); a 4x phone-class CPU gets four times */
export const FINAL_MS = {normal: 700, cpu4x: 2800};

/* one number in the source, changed to a value no other edit uses: a Bets stake, or a Tree payoff */
const EDIT = {
  bets: n => [/stake 20,/, `stake ${20 + n},`],
  tree: n => [/: 1M to 3M/, `: 1M to ${3 + n}M`],
};
export async function setSource(page, tool, n){
  await page.evaluate(async ([tool, n, from, to]) => {
    const {EditorView} = await import('/assets/vendor/codemirror.js');
    const view = EditorView.findFromDOM(document.querySelector('.cm-editor'));
    const doc = view.state.doc.toString();
    const m = new RegExp(from).exec(doc);
    if(!m) throw new Error('nothing to edit');
    view.dispatch({changes: {from: m.index, to: m.index + m[0].length, insert: to}});
  }, [tool, n, EDIT[tool](n)[0].source, EDIT[tool](n)[1]]);
}
/* records every change of #preview[data-sim] and every artefact swap, with the text the artefact says */
export async function logSim(page){
  await page.evaluate(() => {
    const pv = document.getElementById('preview');
    const L = window.__simLog = [];
    const text = () => { const s = pv.querySelector('svg'); return s ? s.textContent.replace(/\s+/g, ' ') : ''; };
    const note = why => L.push({t: performance.now(), why, sim: pv.dataset.sim, dim: 'simDim' in pv.dataset, text: text()});
    note('start');
    new MutationObserver(ms => {
      for(const m of ms) note(m.type === 'attributes' ? 'attr:' + m.attributeName : 'swap');
    }).observe(pv, {attributes: true, attributeFilter: ['data-sim', 'data-sim-dim', 'aria-busy'], childList: true});
  });
}
export const simLog = page => page.evaluate(() => window.__simLog);
const waitFinal = (page, timeout = 15000) => page.waitForFunction(() => document.getElementById('preview').dataset.sim === 'final', null, {timeout});
const reference = async (env, tool, source) => {
  const {ctx, page} = await fresh(env, tool, 'desktop', {source});
  await waitFinal(page);
  const text = await page.evaluate(() => document.querySelector('#preview svg').textContent.replace(/\s+/g, ' '));
  await ctx.close();
  return text;
};
async function openLarge(env, tool, source){
  const {ctx, page} = await fresh(env, tool, 'desktop', {source});
  await waitFinal(page);
  /* the source rail is closed on load: open it so the editor is the focus of the typing */
  const closed = await page.locator('#workspace').evaluate(w => w.classList.contains('collapsed') || w.classList.contains('focus-artefact'));
  if(closed) await press(page, page.locator('#railtab'), false);
  await waitQuiet(page, {quiet: 400});
  return {ctx, page};
}

/* An edit on a large document: the main thread never holds a long task, and the figures are final in a stated time. */
export async function simEdit(env, tool){
  const {check, note} = env.R, w = where(tool, 'desktop', env.mode);
  const large = LARGE[tool]();
  const {ctx, page} = await openLarge(env, tool, large);
  await logSim(page);
  const edits = [];
  for(let n = 1; n <= 3; n++){
    const t0 = await page.evaluate(() => performance.now());
    const s = await measure(page, () => setSource(page, tool, n), {quiet: 500, max: 10000});
    const log = await simLog(page);
    const after = log.filter(l => l.t >= t0);
    const pend = after.find(l => l.sim === 'pending'), fin = after.find(l => l.sim === 'final' && pend && l.t > pend.t);
    const swaps = after.filter(l => l.why === 'swap');
    edits.push({n, pendingAt: pend ? Math.round(pend.t - t0) : null, finalAt: fin ? Math.round(fin.t - t0) : null, swaps: swaps.length,
      longTaskMax: s.longTaskMax, dimmedBeforeFinal: after.some(l => l.dim && l.sim === 'pending'), settled: s.settled});
  }
  note('sim.edit', w, 'three source edits on the large document', edits);
  check('sim.edit.longtask', w, 'longest main-thread task across an edit and its repaint (the simulation is off the thread)', edits.map(e => e.n + ':' + e.longTaskMax).join(' '),
    edits.every(e => e.longTaskMax <= (env.mode === 'normal' ? 50 : 150)), env.mode === 'normal' ? '<= 50ms' : '<= 150ms (4x CPU; reported)');
  check('sim.edit.pending', w, 'the artefact repaints from what is known before the run returns (data-sim reads pending, then final)', edits.map(e => e.n + ':' + e.pendingAt + '->' + e.finalAt).join(' '),
    edits.every(e => e.pendingAt != null && e.finalAt != null && e.finalAt >= e.pendingAt), 'pending, then final');
  check('sim.edit.final', w, 'edit reaches the source -> figures final (ms, includes the 120ms typing pause)', edits.map(e => e.n + ':' + e.finalAt).join(' '),
    edits.every(e => e.finalAt != null && e.finalAt <= FINAL_MS[env.mode]), '<= ' + FINAL_MS[env.mode] + 'ms');
  check('sim.edit.swaps', w, 'artefact swaps per edit (one pending, one final)', edits.map(e => e.n + ':' + e.swaps).join(' '), edits.every(e => e.swaps >= 1 && e.swaps <= 2), '1 or 2');
  await ctx.close();
}

/* Nothing leaves the page with pending figures: a press during the wait does not export, shows it is working, and then exports the
   final figures; the file is the one a press after the run gives. */
export async function simExport(env, tool){
  const {check, note} = env.R, w = where(tool, 'desktop', env.mode);
  const {ctx, page} = await openLarge(env, tool, LARGE[tool]());
  await logSim(page);
  await page.waitForFunction(() => document.querySelector('#dlsvg') && !document.querySelector('#dlsvg').disabled, null, {timeout: 10000});
  const dir = mkdtempSync(join(tmpdir(), 'sim-export-'));
  const downloads = [];
  page.on('download', d => downloads.push({at: Date.now(), d}));
  await setSource(page, tool, 2);
  await page.waitForFunction(() => document.getElementById('preview').dataset.sim === 'pending', null, {timeout: 5000, polling: 5}).catch(() => {});
  const state = await page.evaluate(() => ({sim: document.getElementById('preview').dataset.sim, t: performance.now()}));
  await page.click('#dlsvg');
  const working = await page.evaluate(() => { const b = document.getElementById('dlsvg'); return {working: b.dataset.working !== undefined, busy: b.getAttribute('aria-busy')}; });
  const early = downloads.length;
  await waitFinal(page);
  const finalAt = await page.evaluate(() => performance.now());
  const t1 = Date.now();
  await page.waitForEvent('download', {timeout: 8000}).catch(() => {});
  await sleep(300);
  const held = downloads[0];
  const heldText = held ? readFileSync(await held.d.path(), 'utf8') : '';
  await page.click('#dlsvg');
  await sleep(600);
  const later = downloads[1];
  const laterText = later ? readFileSync(await later.d.path(), 'utf8') : '';
  note('sim.export', w, 'Download SVG pressed while the run is pending', {pendingWhenPressed: state.sim, working, downloadsBeforeFinal: early, held: !!held, laterFile: !!later, sameFile: heldText === laterText, bytes: heldText.length, finalAt: Math.round(finalAt), dir});
  check('sim.export.pending', w, 'the press landed while the figures were pending (otherwise this check proves nothing)', state.sim, state.sim === 'pending', 'pending');
  check('sim.export.waits', w, 'nothing is exported while pending, and the control shows it is working', {downloadsBeforeFinal: early, working}, early === 0 && working.working && working.busy === 'true', 'no file before final; data-working + aria-busy');
  check('sim.export.final', w, 'the held press exports once, and the file is the one the final figures give', {held: !!held, count: downloads.length - (later ? 1 : 0), sameFile: heldText === laterText && heldText.length > 0},
    !!held && downloads.length === 2 && heldText.length > 0 && heldText === laterText, 'exactly one file for the press, identical to a press after the run');
  void t1;
  await ctx.close();
}

/* A newer edit supersedes a run in flight: the old run's figures are never painted as final. */
export async function simStale(env, tool){
  const {check, note} = env.R, w = where(tool, 'desktop', env.mode);
  const base = LARGE[tool]();
  const change = n => { const [re, to] = EDIT[tool](n); return base.replace(re, to); };
  const refA = await reference(env, tool, change(7)), refB = await reference(env, tool, change(8));
  const {ctx, page} = await openLarge(env, tool, base);
  await logSim(page);
  await setSource(page, tool, 7);
  await page.waitForFunction(() => document.getElementById('preview').dataset.sim === 'pending', null, {timeout: 5000, polling: 5});
  await setSource(page, tool, 8);   // an edit of the same number: the first edit's figures are now wrong
  await waitFinal(page);
  await sleep(1200);   // anything late would have arrived by now
  const log = await simLog(page);
  const finals = log.filter(l => l.sim === 'final' && l.why === 'swap' || l.sim === 'final' && l.why === 'attr:data-sim');
  const text = await page.evaluate(() => document.querySelector('#preview svg').textContent.replace(/\s+/g, ' '));
  const paintedA = log.some(l => l.sim === 'final' && l.text === refA);
  note('sim.stale', w, 'edit, then a second edit while the first run is in flight', {states: log.map(l => l.sim + ':' + l.why).join(' '), finals: finals.length});
  check('sim.stale.never', w, 'the superseded run\'s figures never paint as final', paintedA, !paintedA && refA !== refB, 'no final state ever showed the first edit');
  check('sim.stale.ends', w, 'the page ends on the last edit\'s final figures (the same as a page loaded with it)', text === refB, text === refB, 'identical to the reference page');
  await ctx.close();
}

/* The engine cannot solve a document: the page says so, keeps the last figures, exports nothing, and the worker stays usable.
   A stand-in worker answers an error for one marked document (the real engines accept every document the parsers do); the real
   worker's own error path is proved in bets/tests/sim-worker.test.mjs and tree/tests/sim-worker.test.mjs. */
export async function simError(env, tool){
  const {check, note} = env.R, w = where(tool, 'desktop', env.mode);
  const actual = tool === 'bets' ? 'bets/sim-memo.js' : 'tree/eval-wire.js', fn = tool === 'bets' ? 'runSimulations' : 'runEvaluation';
  const marker = tool === 'bets' ? 'stake 33,' : '1M to 33M';
  const stand = `import {${fn}} from './${actual.split('/')[1]}';
self.onmessage = ({data: {payload, reqId}}) => {
  try{
    if(JSON.stringify(payload).includes(${JSON.stringify(marker)})) throw new Error('cannot solve this');
    self.postMessage({result: ${fn}(payload), reqId});
  }catch(e){ self.postMessage({error: String(e.message || e), reqId}); }
};
`;
  const base = LARGE[tool]();
  const {ctx, page} = await fresh(env, tool, 'desktop', {source: base, contextOptions: {serviceWorkers: 'block'}});
  await page.route('**/' + tool + '/sim-worker.js', route => route.fulfill({contentType: 'text/javascript', body: stand}));
  await page.reload({waitUntil: 'load'});
  await page.waitForFunction(() => document.querySelector('#preview svg') && document.getElementById('preview').dataset.sim === 'final', null, {timeout: 15000});
  const closed = await page.locator('#workspace').evaluate(el => el.classList.contains('collapsed') || el.classList.contains('focus-artefact'));
  if(closed) await press(page, page.locator('#railtab'), false);
  await waitQuiet(page, {quiet: 400});
  const bad = (re, to) => page.evaluate(async ([from, to]) => {
    const {EditorView} = await import('/assets/vendor/codemirror.js');
    const view = EditorView.findFromDOM(document.querySelector('.cm-editor'));
    const doc = view.state.doc.toString(); const m = new RegExp(from).exec(doc);
    view.dispatch({changes: {from: m.index, to: m.index + m[0].length, insert: to}});
  }, [re.source, to]);
  const alive = () => page.evaluate(t => window['__' + t + 'WorkerAlive'](), tool);
  const [re, to] = [EDIT[tool](0)[0], tool === 'bets' ? 'stake 33,' : ': 1M to 33M'];
  await bad(re, to);
  await page.waitForFunction(() => document.getElementById('preview').dataset.sim === 'error', null, {timeout: 8000}).catch(() => {});
  await sleep(300);
  const afterError = await page.evaluate(() => ({sim: document.getElementById('preview').dataset.sim, warns: document.getElementById('warns').textContent, svg: !!document.querySelector('#preview svg'), alive: true}));
  const aliveAfterError = await alive();
  const dl = await page.evaluate(() => { const b = document.getElementById('dlsvg'); b.click(); return b.dataset.working === undefined; });
  await sleep(200);
  /* an ordinary edit afterwards: the same worker answers it */
  await bad(/stake 33,|: 1M to 33M/, tool === 'bets' ? 'stake 21,' : ': 1M to 4M');
  await waitFinal(page);
  const aliveAfter = await alive();
  const swapped = await page.evaluate(() => document.getElementById('warns').textContent);
  note('sim.error', w, 'a document the engine cannot solve, then an ordinary edit', {afterError, aliveAfterError, aliveAfter, warnsAfter: swapped, dl});
  check('sim.error.reported', w, 'the page says it could not solve the numbers, keeps its picture, and reads data-sim=error', afterError,
    afterError.sim === 'error' && /could not solve/.test(afterError.warns) && afterError.svg, 'message in the warnings, last figures kept');
  check('sim.error.worker', w, 'the worker is still alive after a model error, and answers the next edit', {aliveAfterError, aliveAfter}, aliveAfterError === true && aliveAfter === true, 'alive');
  check('sim.error.recovers', w, 'the next ordinary edit ends final with the message gone', swapped, !/could not solve/.test(swapped), 'message cleared');
  await shot(page, `${env.out}/shots/${tool}-sim-error-${env.mode}.png`);
  await ctx.close();
}
