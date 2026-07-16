import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderOverlay} from '../render-overlay.js';
import {sessionStats} from '../engine.js';
import {parse} from '../parse.js';

const ctx = {
  colors: {card: '#fff', border: '#ddd', ink: '#222', muted: '#667', accent: '#08c',
    bg: '#f7f8f6', err: '#b33',
    status: {done: '#1D7A3E', doing: '#0C7FAE', risk: '#9A6A00', blocked: '#B3403A'}},
  measure: t => t.length * 7,
};
const M = parse('title: Q3 review\nnames: on\nShip by Q3 :: prob\nWeeks to migrate :: range weeks');
const RESP = [
  {values: [80, [4, 8]], name: 'Ana'},
  {values: [75, [6, 12]], name: 'Ben'},
  {values: [20, [5, 9]], name: 'Cy'},
  {values: [15, [30, 50]], name: 'Di'},
];
const svg = () => renderOverlay(M, sessionStats(M, RESP), ctx);

test('valid SVG with integer dimensions', () => {
  const s = svg();
  assert.match(s, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="960" height="\d+"/);
  assert.ok(s.endsWith('</svg>'));
});

test('header carries title, verdict, response count', () => {
  const s = svg();
  assert.ok(s.includes('Q3 review'));
  assert.ok(s.includes('discuss'));            // verdict names discussion items
  assert.ok(s.includes('4 responses'));
});

test('headlines and pills present per question', () => {
  const s = svg();
  assert.ok(s.includes('Split room:'));
  assert.ok(s.includes('DISCUSS'));
  assert.ok(s.includes('median'));
});

test('named rows are labelled; anonymous are not', () => {
  assert.ok(svg().includes('Ana'));
  const anon = parse('Weeks :: range weeks');
  const s = renderOverlay(anon, sessionStats(anon, RESP.map(r => ({values: [r.values[1]]}))), ctx);
  assert.ok(!s.includes('Ana'));
});

test('overlap band labelled when a common zone exists', () => {
  const m = parse('Weeks :: range weeks');
  const agree = [{values: [[4, 8]]}, {values: [[5, 9]]}, {values: [[3, 7]]}];
  const s = renderOverlay(m, sessionStats(m, agree), ctx);
  assert.ok(s.includes('common ground'));
  assert.ok(s.includes('ALIGNED'));
});

test('empty and single-response panels degrade to a message', () => {
  const m = parse('A :: prob');
  const s0 = renderOverlay(m, sessionStats(m, []), ctx);
  assert.ok(s0.includes('No responses yet.'));
  const s1 = renderOverlay(m, sessionStats(m, [{values: [50]}]), ctx);
  assert.ok(s1.includes('Only one response'));
});

test('question text and names are escaped', () => {
  const m = parse('a <b> :: prob');
  const s = renderOverlay(m, sessionStats(m, [{values: [50]}]), ctx);
  assert.ok(!s.includes('<b>'));
});

test('header pluralizes the response count', () => {
  const m = parse('A :: prob');
  const one = renderOverlay(m, sessionStats(m, [{values: [50]}]), ctx);
  assert.ok(one.includes('1 response ·'));       // singular, not "1 responses"
  assert.ok(!one.includes('1 responses'));
  const two = renderOverlay(m, sessionStats(m, [{values: [50]}, {values: [60]}]), ctx);
  assert.ok(two.includes('2 responses ·'));
});

test('deterministic: same inputs, identical string', () => {
  assert.equal(svg(), svg());
});

/* ---- chips reveal panel ---- */
const ook = assert.ok;
function wellFormed(svg){
  ook(svg.startsWith('<svg') && svg.trimEnd().endsWith('</svg>'), 'svg envelope');
  ook((svg.match(/"/g) || []).length % 2 === 0, 'balanced attribute quotes');
  ook(!/\bNaN\b|\bundefined\b/.test(svg), 'no NaN/undefined');
}
test('chips panel: bar + share per option, both winner pills, XML-decodable', () => {
  const model = parse('Pick :: chips Acme | BuildCo');
  const stats = sessionStats(model, [{values: [[60, 40]]}, {values: [[55, 45]]}, {values: [[0, 100]]}]);
  const svg = renderOverlay(model, stats, ctx);
  ook(svg.includes('Acme') && svg.includes('BuildCo'));
  ook(/SHOW OF HANDS/.test(svg));                    // stated pill
  ook((svg.match(/first choice/g) || []).length >= 1);
  ook(!svg.includes('NaN'));
  wellFormed(svg);
});

test('chips panel escapes hostile option labels', () => {
  const model = parse('Pick :: chips <img src=x> | B');
  const svg = renderOverlay(model, sessionStats(model, [{values: [[60, 40]]}, {values: [[50, 50]]}]), ctx);
  ook(!svg.includes('<img'));
});

/* ---- narrow (phone) relayout — opts.width < 520 ---- */
const narrowSvg = (w = 360) => renderOverlay(M, sessionStats(M, RESP), ctx, {width: w});

test('narrow: svg takes the given width; floor-clamped; opts without width stays wide', () => {
  assert.match(narrowSvg(), /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="360" height="\d+" viewBox="0 0 360 /);
  assert.match(narrowSvg(120), /^<svg [^>]*width="300"/);       // MIN_W floor
  assert.equal(renderOverlay(M, sessionStats(M, RESP), ctx, {}), svg());
});

test('narrow: the verdict wraps to multiple lines instead of truncating', () => {
  const count14 = s => (s.match(/font-size="14"/g) || []).length;   // verdict is the only 14px text
  assert.equal(count14(svg()), 1);
  ook(count14(narrowSvg()) >= 2, 'verdict wraps at 360');
});

test('narrow: panel headlines wrap to multiple 13px lines', () => {
  const count13 = s => (s.match(/font-size="13"/g) || []).length;
  ook(count13(narrowSvg()) > count13(svg()), 'headlines gained wrap lines');
});

test('narrow: question titles use the full width (more chars per line than the pill-reserved wide head would allow at 360)', () => {
  // a long question at 360: wide reserve (cw-110) would leave 122px; narrow wraps at full cw (304)
  const m = parse('A question title that runs long enough to need the whole panel width on a phone :: prob');
  const s = renderOverlay(m, sessionStats(m, [{values: [40]}, {values: [60]}]), ctx, {width: 360});
  const lines = [...s.matchAll(/font-size="15"[^>]*>([^<]+)</g)].map(x => x[1]);
  ook(lines.length >= 2, 'title wrapped');
  ook(lines.every(t => t.length * 7 <= 304 + 7), 'every line fits the narrow content width');
});

test('narrow: no anchor x beyond the narrow width, none negative', () => {
  const s = narrowSvg();
  const xs = [...s.matchAll(/\s(?:x|x1|x2|cx)="(-?[\d.]+)"/g)].map(m => +m[1]);
  ook(xs.length > 20, 'found coordinates');
  ook(Math.max(...xs) <= 360, 'max x ' + Math.max(...xs));
  ook(Math.min(...xs) >= 0, 'min x ' + Math.min(...xs));
  wellFormed(s);
});

test('narrow chips: label line carries share + first choices; SHOW OF HANDS on its own row', () => {
  const model = parse('Pick :: chips Acme | BuildCo');
  const stats = sessionStats(model, [{values: [[60, 40]]}, {values: [[55, 45]]}, {values: [[0, 100]]}]);
  const s = renderOverlay(model, stats, ctx, {width: 360});
  ook(/SHOW OF HANDS/.test(s));
  ook(s.includes('% · '), 'share and votes merged into the label line');
  ook(s.includes('first choice'));
  wellFormed(s);
});

test('narrow delphi: pill gets its own header row, count line wraps, well-formed', async () => {
  const {mergeFinal, delphiStats} = await import('../engine.js');
  const r1 = [{who: 'a', values: [80, [4, 8]]}, {who: 'b', values: [30, [6, 12]]}, {who: 'c', values: [55, [5, 9]]}];
  const r2 = [{who: 'a', values: [60, [5, 8]]}, {who: 'b', values: [45, [6, 10]]}];
  const opts = {delphi: delphiStats(M, r1, r2), round1: sessionStats(M, r1)};
  const stats = sessionStats(M, mergeFinal(r1, r2));
  const wide = renderOverlay(M, stats, ctx, opts);
  const narrow = renderOverlay(M, stats, ctx, {...opts, width: 360});
  for(const s of [wide, narrow]){ ook(s.includes('DELPHI ROUND 2')); wellFormed(s); }
  const count12 = s => (s.match(/font-size="12"/g) || []).length;
  ook(count12(narrow) > count12(wide), 'delphi count line wraps on narrow');
});

test('narrow: deterministic', () => {
  assert.equal(narrowSvg(), narrowSvg());
});
