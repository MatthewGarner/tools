/* Controls scenario (finding F42): measures every control in the Roadmap and Timeline
   control rows and utility rows, and holds both tools to one control language.
   Also runnable alone to print the measurement table:
     node dev/feel-audit/controls.mjs [outDir]   (writes controls-measure.json) */
import {newPage, openTool, sleep, waitQuiet} from './lib.mjs';

export const CONTROLS = [
  ['view', '#stylepicker button'],
  ['group', '#grouppicker button'],
  ['disclosure', '.action-disclosure > summary'],
  ['exportdeck', '#exportdeck'],
  ['editsource', '#editsource, #railtab'],
  ['zoom', '#zoomctl button'],
  ['copypng', '#copypng'],
  ['undo', '.touch-undo'],
  ['snapshot', '#reviewsnap'],
  ['boardstep', '#boardprev, #boardnext'],
  ['select', 'select.ctl'],
];

const STATE_PROPS = ['backgroundColor', 'color', 'borderTopColor', 'borderBottomColor', 'boxShadow', 'textDecorationLine', 'opacity', 'outlineStyle', 'outlineWidth', 'outlineOffset', 'outlineColor'];

/* collect visible controls of the page, tagging each with data-ctl-probe */
export async function collect(page) {
  return page.evaluate(([controls, props]) => {
    const seen = new Set(), rows = [];
    const label = el => (el.getAttribute('aria-label') || el.textContent || el.id || '').trim().replace(/\s+/g, ' ').slice(0, 28);
    for (const [key, sel] of controls) for (const el of document.querySelectorAll(sel)) {
      if (seen.has(el)) continue;
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      if (!r.width || !r.height || cs.visibility === 'hidden') continue;
      const closed = el.closest('details:not([open])');
      if (closed && !(el.parentElement === closed && el.tagName === 'SUMMARY')) continue;
      seen.add(el);
      let k = key;
      if (key === 'disclosure') k = /appearance/i.test(el.textContent) ? 'appearance' : 'disclosure:' + label(el).toLowerCase();
      el.setAttribute('data-ctl-probe', rows.length);
      rows.push({key: k, label: label(el), idx: rows.length, tag: el.tagName.toLowerCase(),
        h: +r.height.toFixed(1), w: +r.width.toFixed(1), y: Math.round(r.y + scrollY), fontSize: cs.fontSize, fontWeight: cs.fontWeight, transform: cs.textTransform, letterSpacing: cs.letterSpacing,
        padding: cs.padding, border: cs.borderTopWidth + ' ' + cs.borderTopStyle, radius: cs.borderTopLeftRadius,
        pressedAttr: el.getAttribute('aria-pressed') || el.getAttribute('aria-selected') || (el.classList.contains('on') ? 'on' : ''), disabled: !!el.disabled,
        transition: cs.transitionDuration + ' ' + cs.transitionProperty.slice(0, 60)});
    }
    return rows;
  }, [CONTROLS, STATE_PROPS]);
}

const sig = (o, props) => props.map(p => o[p]).join('|');
async function styleOf(page, idx) {
  return page.evaluate(([i, props]) => { const el = document.querySelector(`[data-ctl-probe="${i}"]`); if (!el) return null; const cs = getComputedStyle(el); return {...Object.fromEntries(props.map(p => [p, cs[p]])), transition: cs.transitionDuration + ' ' + cs.transitionProperty.slice(0, 60)}; }, [idx, STATE_PROPS]);
}

/* hover and focus-visible styles of a control, from real input */
export async function states(page, row) {
  const loc = page.locator(`[data-ctl-probe="${row.idx}"]`);
  await loc.scrollIntoViewIfNeeded();
  await page.mouse.move(1, 1); await page.keyboard.press('Shift'); await sleep(260);
  const base = await styleOf(page, row.idx);
  const box = await loc.boundingBox();
  let hover = null;
  if (box) { await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 20)); await sleep(300); hover = await styleOf(page, row.idx); await page.mouse.move(1, 1); await sleep(260); }
  await page.keyboard.press('Shift');
  await loc.evaluate(el => el.focus({focusVisible: true}));
  await sleep(300);
  const focus = await styleOf(page, row.idx);
  await loc.evaluate(el => el.blur()); await sleep(100);
  const hoverDelta = hover ? STATE_PROPS.filter(p => hover[p] !== base[p]) : [];
  const focusDelta = focus ? STATE_PROPS.filter(p => focus[p] !== base[p]) : [];
  const focusRing = !!focus && focus.outlineStyle !== 'none' && parseFloat(focus.outlineWidth) > 0;
  return {hoverChanged: !!hover && hoverDelta.length > 0, focusRing, hoverDelta, focusDelta,
    focusRingSpec: focus ? `${focus.outlineWidth} ${focus.outlineStyle} offset ${focus.outlineOffset}` : '', hoverTr: base && base.transition, hasHover: !!hover};
}

/* measure every visible control, in each view of the tool, with real-input states */
export async function measureTool(browser, base, tool, kind, opts = {}) {
  const {ctx, page} = await newPage(browser, kind, opts);
  await openTool(page, base, tool);
  const out = [], seen = new Set();
  const visit = async () => {
    for (const r of await collect(page)) {
      const k = r.key + '|' + r.label;
      if (seen.has(k)) continue; seen.add(k);
      Object.assign(r, await states(page, r));
      out.push(r);
    }
  };
  await visit();
  const views = await page.locator('#stylepicker button').evaluateAll(bs => bs.map(b => b.dataset.style));
  for (const v of views) {
    await page.locator(`#stylepicker [data-style="${v}"]`).click(); await waitQuiet(page, {quiet: 300, max: 4000});
    await visit();
  }
  await ctx.close();
  return out;
}

/* ---- the controls scenario ---- */
const cache = {}, disabledCache = {};
async function tokenMs(env) {
  const {ctx, page} = await newPage(env.browser, 'desktop', {});
  await openTool(page, env.base, 'roadmap');
  const v = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--dur-fast').trim());
  await ctx.close();
  return parseFloat(v) * (v.endsWith('ms') ? 1 : 1000);
}
async function disabledStyle(env, tool, kind) {
  const {ctx, page} = await newPage(env.browser, kind, {});
  await openTool(page, env.base, tool);
  const s = await page.evaluate(() => { const b = document.querySelector('#copypng'); b.disabled = true; const cs = getComputedStyle(b); return cs.opacity + ' ' + cs.cursor; });
  await ctx.close();
  return s;
}
const SEG = ['view', 'group', 'zoom'];
export async function controls(env, tool, kind) {
  const {check, note} = env.R;
  const w = `${tool}/${kind}/${env.mode}`;
  const rows = await measureTool(env.browser, env.base, tool, kind);
  cache[tool + '/' + kind] = rows;
  note('controls.table', w, 'controls measured', rows.map(r => `${r.key}:${r.label} ${r.w}x${r.h} ${r.fontSize}/${r.transform} ${r.padding}`));
  if (kind === 'phone') {
    const small = rows.filter(r => r.h < 44 || r.w < 44).map(r => `${r.key}:${r.label} ${r.w}x${r.h}`);
    check('controls.tap', w, 'controls under 44x44', small.length ? small : 'none', small.length === 0, 'every control at least 44x44');
  }
  const silent = rows.filter(r => !r.disabled && r.hasHover && !r.hoverChanged && !['true', 'on'].includes(r.pressedAttr)).map(r => r.key + ':' + r.label);
  check('controls.hover', w, 'controls with no computed-style change on hover', silent.length ? silent : 'none', silent.length === 0, 'every control changes on hover');
  const ring = rows.filter(r => !r.disabled && !r.focusRing).map(r => r.key + ':' + r.label);
  check('controls.focus', w, 'controls with no focus-visible ring', ring.length ? ring : 'none', ring.length === 0, 'every control shows a ring on focus-visible');
  const noPress = rows.filter(r => SEG.includes(r.key) && r.pressedAttr === '').map(r => r.key + ':' + r.label);
  check('controls.pressed', w, 'toggle controls exposing no pressed/selected state', noPress.length ? noPress : 'none', noPress.length === 0, 'every segment exposes its pressed state');
  const weights = new Set(rows.filter(r => r.focusRing).map(r => r.focusRingSpec.split(' ')[0]));
  check('controls.ring.weight', w, 'focus ring weight across controls', [...weights], weights.size === 1, 'one ring weight');
  const offsets = new Set(rows.filter(r => r.focusRing && !SEG.includes(r.key)).map(r => r.focusRingSpec));
  check('controls.ring.offset', w, 'focus ring spec across standalone controls', [...offsets], offsets.size === 1, 'one ring offset for standalone controls');
  const tok = await tokenMs(env);
  const ms = r => Math.round(parseFloat((r.hoverTr || '0s').split(' ')[0]) * 1000);
  const offTok = rows.filter(r => !['true', 'on'].includes(r.pressedAttr) && ms(r) !== tok).map(r => `${r.key}:${r.label} ${ms(r)}ms`);
  check('controls.timing', w, `unselected controls whose hover transition is not --dur-fast (${tok}ms)`, offTok.length ? offTok : 'none', offTok.length === 0, 'every control eases at --dur-fast');
  /* disabled: the same dimming and cursor on a button in each tool (probe a throwaway disabled Copy PNG) */
  const dis = await disabledStyle(env, tool, kind);
  disabledCache[tool + '/' + kind] = dis;
  const other = tool === 'timeline' ? cache['roadmap/' + kind] : null;
  if (other) {
    const fam = rows.concat(other).map(r => r.h);
    const per = r => Object.fromEntries(r.map(x => [x.key + ':' + x.label, x.h]));
    check('controls.height.equal', `${kind}/${env.mode}`, 'every control height, both tools', new Set(fam).size === 1 ? [...new Set(fam)] : {roadmap: per(other), timeline: per(rows)}, new Set(fam).size === 1, 'one control height per viewport');
    check('controls.disabled', `${kind}/${env.mode}`, 'disabled button opacity and cursor (roadmap, timeline)', [disabledCache['roadmap/' + kind], disabledCache['timeline/' + kind]], disabledCache['roadmap/' + kind] === disabledCache['timeline/' + kind], 'identical disabled style');
    const ys = r => [...new Set(r.filter(x => x.key === 'view').map(x => x.y))];
    note('controls.rowtop', `${kind}/${env.mode}`, 'view control top y (roadmap, timeline)', [ys(other), ys(rows)]);
  }
}

/* standalone: print the table */
if (import.meta.url === 'file://' + process.argv[1]) {
  const {chromium, startServer} = await import('./lib.mjs');
  const {writeFileSync} = await import('node:fs');
  const out = process.argv[2] || '/tmp/feel-audit';
  const server = await startServer(), browser = await chromium.launch();
  const all = {};
  try { for (const kind of ['desktop', 'phone']) for (const tool of ['roadmap', 'timeline']) all[tool + '/' + kind] = await measureTool(browser, server.base, tool, kind); }
  finally { await browser.close(); server.stop(); }
  writeFileSync(out + '/controls-measure.json', JSON.stringify(all, null, 1));
  for (const [k, rows] of Object.entries(all)) {
    console.log('\n== ' + k);
    for (const r of rows) console.log(`${r.key.padEnd(18)} ${r.label.padEnd(20)} ${r.w}x${r.h} y${r.y} ${r.fontSize} ${r.fontWeight} ${r.transform} ls=${r.letterSpacing} pad=${r.padding} bd=${r.border} rad=${r.radius} | hover:${r.hoverDelta.join(',') || '-'} | focus:${r.focusRingSpec}/${r.focusDelta.join(',') || '-'} | tr:${r.hoverTr} | pressed:${r.pressedAttr}`);
  }
}
