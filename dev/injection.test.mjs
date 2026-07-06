/* Adversarial labels through every parser → renderer: output must stay
   well-formed XML with nothing unescaped. esc() slips become failures here,
   not shared-URL exploits (the CSP is the second wall). */
import {test} from 'node:test';
import assert from 'node:assert/strict';

const EVIL = [
  '<script>alert(1)</script>',
  '"><img src=x onerror=alert(1)>',
  "' onmouseover='alert(1)",
  ']]><x>&amp;',
  'a & b < c > d "quoted"',
  'rtl ‮gnp.exe',
];
const label = i => EVIL[i % EVIL.length] + ' item ' + i;
const ctx = {
  colors: {card: '#ffffff', border: '#dddddd', ink: '#222222', muted: '#66777a',
    accent: '#0088cc', accent2: '#c05621', bg: '#f7f8f6', err: '#b3403a', track: '#edf0ee',
    status: {done: '#1D7A3E', doing: '#0C7FAE', risk: '#9A6A00', blocked: '#B3403A'}},
  measure: t => t.length * 7, today: 20640,
};
const TAG = /^<[a-zA-Z][\w:-]*((\s+[\w:-]+=("[^"<]*"|'[^'<]*'))*)\s*\/?>$/;
function assertClean(out, who){
  assert.ok(!/<script/i.test(out.replace(/&lt;script/gi, '')), who + ': raw <script> leaked');
  for(const tag of out.match(/<[^!/][^>]*>/g) || [])
    assert.match(tag, TAG, who + ': malformed tag ' + tag.slice(0, 120));
}

test('roadmap renderer escapes hostile titles/items/lanes', async () => {
  const {parse} = await import('../roadmap/parse.js');
  const {render} = await import('../roadmap/render.js');
  const doc = 'title: ' + EVIL[0] + '\ndate: 2026-07-06\nNOW\n' +
    EVIL.map((e, i) => e.replace(/:/g, ';') + ' lane: ' + label(i)).join('\n');
  assertClean(render(parse(doc), {...ctx, edit: true}), 'roadmap');
});

test('why renderers escape hostile labels in both projections', async () => {
  const {parse} = await import('../why/parse.js');
  const {project} = await import('../why/project.js');
  const {renderOst} = await import('../why/render-ost.js');
  const {renderMap} = await import('../why/render-map.js');
  const doc = 'outcome: ' + EVIL[1] + '\n  ' + EVIL[2] + '\n    ' + EVIL[3] + ' [testing]\n      ? ' + EVIL[4];
  const m = parse(doc), pr = project(m);
  assertClean(renderOst(m, pr, {...ctx, edit: true}), 'why-ost');
  assertClean(renderMap(m, pr, ctx), 'why-map');
});

test('tree renderer escapes hostile option labels', async () => {
  const {parse} = await import('../tree/parse.js');
  const {evaluate} = await import('../tree/engine.js');
  const {render} = await import('../tree/render.js');
  const doc = 'decision: ' + EVIL[0] + '\n' +
    '  ' + EVIL[1] + '\n    100\n  ' + EVIL[4] + '\n    50 .. 90';
  const m = parse(doc);
  assertClean(render(m, evaluate(m), {...ctx, edit: true}), 'tree');
});

test('map renderer + readout escape hostile labels, fields, zone names', async () => {
  const {parse} = await import('../map/parse.js');
  const {resolve} = await import('../map/zones.js');
  const {readout} = await import('../map/readout.js');
  const {render} = await import('../map/render.js');
  const doc = 'title: ' + EVIL[0] + '\nx: ' + EVIL[4] + '\ny: safe\nzone band; x + y > 120\n' +
    EVIL.map((e, i) => e.replace(/[@:]/g, ' ') + ' ' + i + ' @ ' + (i * 15 + 5) + ',' + (i * 12 + 8) +
      ' :: note: ' + EVIL[(i + 1) % EVIL.length].replace(/:/g, ' ')).join('\n');
  const m = parse(doc), r = resolve(m);
  assertClean(render(m, r, readout(m, r), {...ctx, edit: true}), 'map');
});

test('gauge overlay + FORM HTML escape hostile question text and names', async () => {
  const {parse} = await import('../gauge/parse.js');
  const {sessionStats} = await import('../gauge/engine.js');
  const {renderOverlay} = await import('../gauge/render-overlay.js');
  const {renderForm} = await import('../gauge/render-form.js');
  const doc = 'title: ' + EVIL[0] + '\nnames: on\n' +
    EVIL.map(e => e.replace(/:/g, ' ') + ' :: prob').join('\n');
  const m = parse(doc);
  const responses = [{values: m.questions.map(() => 50), name: EVIL[1].slice(0, 39)}];
  assertClean(renderOverlay(m, sessionStats(m, responses), ctx), 'gauge-overlay');
  const html = renderForm(m, {editable: true});
  assert.ok(!/<script/i.test(html.replace(/&lt;script/gi, '')), 'gauge-form: raw <script> leaked');
  assert.ok(!/onerror=/i.test(html.replace(/onerror&#?[=x]/gi, '').replace(/&quot;/g, '')) ||
    !/<img[^>]*onerror/i.test(html), 'gauge-form: live onerror attribute');
});

test('timeline renderer escapes hostile lanes, labels and notes', async () => {
  const {parse} = await import('../timeline/parse.js');
  const {render} = await import('../timeline/render.js');
  const doc = 'title: ' + EVIL[0] + '\n' +
    EVIL.map((e, i) => e.replace(/[:\[\]]/g, ' ') + ': item ' + i + ' 2026-0' + (i % 8 + 1) +
      ' .. 2026-1' + (i % 2) + ' // ' + EVIL[(i + 2) % EVIL.length]).join('\n');
  assertClean(render(parse(doc), ctx, null, {edit: true}), 'timeline');
});

test('risk renderer + markdown escape hostile titles and structure labels', async () => {
  const {parse} = await import('../energy/risk/parse.js');
  const {simulate} = await import('../energy/risk/engine.js');
  const {render} = await import('../energy/risk/render.js');
  const doc = 'title: ' + EVIL[0] + '\nmerchant: 60..180\n' +
    EVIL.map((e, i) => 'floor: ' + (65 + i) + ' share 60% "' + e.replace(/"/g, '') + ' item ' + i + '"').join('\n');
  const m = parse(doc);
  assertClean(render(m, simulate(m), ctx, {edit: true}), 'risk');
});

test('cycles renderer escapes a hostile title', async () => {
  const {parse} = await import('../energy/cycles/parse.js');
  const {simulate} = await import('../energy/cycles/engine.js');
  const {render} = await import('../energy/cycles/render.js');
  const doc = 'title: ' + EVIL[0] + '\nbattery: 100MW / 200MWh\nspread: 35..85\ncharge: 20\ndrift: 0\nrte: 88%\nfade: 0.01 %/cycle\ncalendar: 1.5 %/yr\ncycles: 6000 over 15yr';
  const m = parse(doc);
  assertClean(render(m, simulate(m, {seed: 1, n: 500}), ctx, {edit: true}), 'cycles');
});
