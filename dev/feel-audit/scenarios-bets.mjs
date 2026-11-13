/* Bets-only scenarios: editing stake/odds/payoff on the Board, the snapshot compare
   ghost, Quadrant dots gliding on an edit, and the narrow-bucket relayout. */
import {measure, waitQuiet, sleep, sourceText, press, shot, newPage, openTool} from './lib.mjs';
import {BAR} from './checks.mjs';
import {pointOn, paintOf, motionOf} from './scenarios.mjs';
import {fresh, where, timeToRender, CFG} from './scenarios-btp.mjs';
import {betsLarge} from './stress-btp.mjs';

/* stake / odds / payoff: desktop clicks the figure, phone goes through the card menu */
export async function values(env, kind, {source, label = 'example'} = {}){
  const {check, note} = env.R;
  const w = where('bets', kind, env.mode), phone = kind === 'phone';
  const {ctx, page} = await fresh(env, 'bets', kind, {source});
  const edits = [['stake', /^Edit stake/, '95'], ['odds', /^Edit odds/, '35-55%'], ['payoff', /^Edit payoff/, '320-520']];
  const res = [];
  for(const [k, row, value] of edits){
    let openS;
    if(phone){
      await press(page, await pointOn(page, CFG.bets.card, {nth: 0, resolve: '[data-edit]'}), true); await sleep(200);
      openS = await measure(page, () => press(page, page.locator('.eip-pop button', {hasText: row}).first(), true), {quiet: 200});
    }else{
      const p = await pointOn(page, `#preview [data-edit="${k}"]`, {nth: 0, resolve: '[data-edit]'});
      await sleep(150);
      openS = await measure(page, () => press(page, p, false), {quiet: 200});
    }
    const field = await page.evaluate(() => { const i = document.querySelector('.eip-input'); if(!i) return null; const r = i.getBoundingClientRect(); return {font: parseFloat(getComputedStyle(i).fontSize), bottom: Math.round(r.bottom), w: Math.round(r.width), focused: document.activeElement === i, value: i.value, inputmode: i.inputMode}; });
    if(!field){ res.push({k, error: 'no field'}); continue; }
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type(value);
    const t = await page.evaluate(() => performance.now());
    const applied = await timeToRender(page, () => page.keyboard.press('Enter'));
    const settled = await waitQuiet(page, {quiet: 400});
    const st = await page.evaluate(t0 => { const F = window.__feel; const lt = F.lt.filter(l => l[0] >= t0); const ev = F.ev.filter(e => e[1] >= t0 - 5 && e[0] === 'keydown'); return {active: F.describe(document.activeElement), longTaskMax: Math.round(Math.max(0, ...lt.map(l => l[1]))), enterEvent: ev.length ? Math.round(Math.max(...ev.map(e => e[2]))) : null, fieldGone: !document.querySelector('.eip-input')}; }, t);
    const src = await sourceText(page);
    res.push({k, openPaint: paintOf(openS), field, applied, ...st, inSource: src.includes(value.replace('%', ''))});
  }
  note(`values.${label}`, w, 'edit stake, odds, payoff in place', res);
  check(`values.${label}.applied`, w, 'Enter -> board repainted with the new figure (ms, per field)', res.map(r => r.k + ':' + r.applied).join(' '), res.every(r => r.applied >= 0 && r.applied <= BAR.commit[env.mode]), '<= ' + BAR.commit[env.mode] + 'ms (a discrete edit skips the typing debounce)');
  check(`values.${label}.enter`, w, 'Enter keydown -> next paint (Event Timing; the field must close at once)', res.map(r => r.k + ':' + r.enterEvent).join(' '), res.every(r => r.enterEvent == null || r.enterEvent <= BAR.paint[env.mode]), '<= ' + BAR.paint[env.mode] + 'ms');
  check(`values.${label}.longtask`, w, 'longest task after a value commit (the 40,000-run simulation)', res.map(r => r.k + ':' + r.longTaskMax).join(' '), res.every(r => r.longTaskMax <= (env.mode === 'normal' ? 50 : 150)), env.mode === 'normal' ? '<= 50ms' : '<= 150ms');
  if(env.mode === 'normal'){
    check(`values.${label}.focus`, w, 'focus after each value commit', res.map(r => r.k + ':' + r.active).join(' '), res.every(r => !/^body\b/.test(r.active || 'body')), 'on the edited figure or its card (not body)');
    if(phone) check(`values.${label}.font`, w, 'value field font size on a phone', res.map(r => r.k + ':' + (r.field && r.field.font)).join(' '), res.every(r => r.field && r.field.font >= 16), '>= 16px');
    check(`values.${label}.inputmode`, w, 'numeric keyboard hint on stake/payoff fields', res.map(r => r.k + ':' + (r.field && (r.field.inputmode || 'none'))).join(' '), res.filter(r => r.k !== 'odds').every(r => r.field && /decimal|numeric|text/.test(r.field.inputmode) && r.field.inputmode !== 'text'), 'inputmode=decimal (recorded: odds and ranges need "-" and "%")');
  }
  await ctx.close();
}

/* History: snapshot, edit, compare -> ghost marks on the board */
export async function snapshot(env, kind){
  const {check, note} = env.R;
  const w = where('bets', kind, env.mode), phone = kind === 'phone';
  const {ctx, page} = await fresh(env, 'bets', kind);
  const hist = page.locator('details.history > summary');
  await press(page, hist, phone); await sleep(150);
  const snapBtn = page.locator('#snap');
  const before = (await snapBtn.textContent()).trim();
  const snap = await measure(page, () => press(page, snapBtn, phone), {quiet: 300});
  const st = await page.evaluate(() => ({options: document.getElementById('snapsel').options.length, label: document.getElementById('snap').textContent.trim(), status: document.querySelector('.tool-status')?.textContent, open: document.querySelector('details.history').open, active: window.__feel.describe(document.activeElement)}));
  note('snapshot', w, 'take a snapshot', {before, firstResponse: snap.firstResponse, settled: snap.settled, ...st});
  check('snapshot.feedback', w, 'snapshot acknowledged within 100ms', {firstResponse: snap.firstResponse, ...st}, snap.firstResponse != null && snap.firstResponse <= BAR.feedback, 'a visible confirmation');
  await sleep(2600);
  const later = (await snapBtn.textContent()).trim();
  check('snapshot.label', w, 'snapshot button label 2.6s later', {before, flashed: st.label, later}, later === before, 'returns to "' + before + '"');
  /* change a stake in the source, then compare against the snapshot */
  await page.evaluate(async () => {
    const {EditorView} = await import('/assets/vendor/codemirror.js');
    const view = EditorView.findFromDOM(document.querySelector('.cm-editor'));
    const doc = view.state.doc.toString(); const i = doc.indexOf('stake 80');
    view.dispatch({changes: {from: i, to: i + 8, insert: 'stake 140'}});
  });
  await sleep(400);   // past the typing debounce
  await waitQuiet(page, {quiet: 500});
  if(!(await page.locator('details.history').evaluate(d => d.open))) await press(page, hist, phone);
  await sleep(150);
  const val = await page.locator('#snapsel option').nth(1).getAttribute('value');
  const t0 = await page.evaluate(() => performance.now());
  await page.locator('#snapsel').selectOption(val);
  const ttr = await page.evaluate(t0 => new Promise(res => { const tick = () => { const F = window.__feel; const m = F.muts.find(m => m[0] >= t0 && m[2] === 'childList' && /#preview/.test(m[1])); if(m) res(Math.round(m[0] - t0)); else if(performance.now() - t0 > 3000) res(null); else requestAnimationFrame(tick); }; tick(); }), t0);
  await waitQuiet(page, {quiet: 500});
  const cmp = await page.evaluate(t0 => { const F = window.__feel; const lt = F.lt.filter(l => l[0] >= t0); const svg = document.querySelector('#preview svg'); return {longTaskMax: Math.round(Math.max(0, ...lt.map(l => l[1]))), ghostMarks: svg ? svg.querySelectorAll('[data-compare], [data-ghost], [data-prev], [stroke-dasharray]').length : 0, compareText: /since|was|baseline|snapshot/i.test(svg?.textContent || ''), active: F.describe(document.activeElement), open: document.querySelector('details.history').open}; }, t0);
  note('compare', w, 'compare with the snapshot', {ttr, ...cmp});
  check('compare.render', w, 'compare select -> board redrawn with the comparison (ms)', {ttr, longTaskMax: cmp.longTaskMax}, ttr != null && ttr <= BAR.commit[env.mode] + 50, '<= ' + (BAR.commit[env.mode] + 50) + 'ms');
  check('compare.shown', w, 'the board shows what changed since the snapshot', cmp, cmp.compareText, 'comparison wording / ghost marks on the board');
  await shot(page, `${env.out}/shots/bets-${kind}-compare-${env.mode}.png`, {fullPage: true});
  /* an edit with the compare on */
  if(env.mode === 'normal' && !phone){
    const p = await pointOn(page, '#preview [data-edit="stake"]', {nth: 1, resolve: '[data-edit]'});
    if(p){
      await page.mouse.click(p.x, p.y); await sleep(150);
      await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.type('77');
      const applied = await timeToRender(page, () => page.keyboard.press('Enter'));
      check('compare.edit', w, 'value commit with a compare open -> repainted (ms)', applied, applied >= 0 && applied <= BAR.commit[env.mode], '<= ' + BAR.commit[env.mode] + 'ms');
    }
  }
  await ctx.close();
}

/* Quadrant: dots glide (FLIP on data-key) when a value changes */
export async function quadrantGlide(env){
  const {check, note} = env.R;
  const w = where('bets', 'desktop', env.mode);
  const {ctx, page} = await fresh(env, 'bets', 'desktop');
  await page.locator('#viewtoggle [data-view="quadrant"]').click();
  await waitQuiet(page, {quiet: 500});
  const s = await measure(page, () => page.evaluate(async () => {
    const {EditorView} = await import('/assets/vendor/codemirror.js');
    const view = EditorView.findFromDOM(document.querySelector('.cm-editor'));
    const doc = view.state.doc.toString(); const i = doc.indexOf('odds 40-60%');
    view.dispatch({changes: {from: i, to: i + 11, insert: 'odds 70-85%'}});
  }), {quiet: 500});
  note('quadrant.edit', w, 'change odds while on Quadrant', {settled: s.settled, swaps: s.svgSwaps, anims: s.animations, layout: s.layoutAnimated, dropped: s.dropped, longTaskMax: s.longTaskMax});
  check('quadrant.glide', w, 'Quadrant dots glide to their new position after an edit', motionOf(s).filter(a => /transform/.test(a)), s.animations.some(a => /transform/.test(a)), 'FLIP transform transition runs');
  check('quadrant.layoutprops', w, 'layout properties animated on a Quadrant edit', s.layoutAnimated.length ? s.layoutAnimated : 'none', !s.layoutAnimated.length, 'none');
  await shot(page, `${env.out}/shots/bets-quadrant-desktop-${env.mode}.png`);
  await ctx.close();
}

/* narrow bucket: a desktop window narrowed across 520px re-lays out once, without a flash */
export async function narrow(env){
  const {check, note} = env.R;
  const w = where('bets', 'desktop', env.mode);
  const {ctx, page} = await fresh(env, 'bets', 'desktop');
  await page.locator('#railtab').click(); await waitQuiet(page, {quiet: 500});
  const res = [];
  for(const width of [900, 600, 480, 1280]){
    const s = await measure(page, () => page.setViewportSize({width, height: 800}), {quiet: 500});
    res.push({width, settled: s.settled, swaps: s.svgSwaps, empty: s.emptyFrames, longTaskMax: s.longTaskMax, anims: s.animations, layout: s.layoutAnimated, cls: s.clsNoInput});
    await shot(page, `${env.out}/shots/bets-narrow-${width}.png`);
  }
  note('narrow', w, 'resize the window across the narrow bucket', res);
  check('narrow.empty', w, 'frames with no artefact while relaying out', res.map(r => r.width + ':' + r.empty.length).join(' '), res.every(r => !r.empty.length), 'never empty');
  check('narrow.layoutprops', w, 'layout properties animated by a resize', res.flatMap(r => r.layout), res.every(r => !r.layout.length), 'none');
  await ctx.close();
}

export const large = () => betsLarge();
