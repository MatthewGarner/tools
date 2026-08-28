import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {EXAMPLES} from '../examples.js';
import {resolve} from '../zones.js';
import {readout} from '../readout.js';
import {render, nudge} from '../render.js';

const ctx = {
  colors: {card:'#fff', border:'#ddd', ink:'#222', muted:'#667', accent:'#08c', bg:'#f7f8f6',
    err:'#b33', status:{done:'#1D7A3E', doing:'#0C7FAE', risk:'#9A6A00', blocked:'#B3403A'},
    brand:'#E2231A', brandText:'#D62015'},
  measure: t => t.length * 7,
};
const run = (src, extra = {}) => {
  const m = parse(src);
  const r = resolve(m);
  return render(m, r, readout(m, r), {...ctx, ...extra});
};

test('assumptions map renders zones, cards, axes, verdict', () => {
  const svg = run('preset: assumptions\ntitle: T\nA @ 20,80 :: test: interview five\nB @ 70,60\nC', {edit:true});
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes('data-plane'));
  assert.ok(svg.includes('TEST FIRST'));
  /* axis names print LITERALLY uppercase with absolute tracking (Swiss 6c) —
     a CSS text-transform would not survive the export */
  assert.match(svg, /letter-spacing="1\.80"[^>]*>EVIDENCE</);
  assert.ok(!/>Evidence</.test(svg), 'no sentence-case axis label left in the plane');
  assert.ok(svg.includes('data-raw="Evidence"'), 'the rewrite still carries the author’s own casing');
  assert.ok(svg.includes('data-edit="label"'));
  assert.ok(svg.includes('sit in test first'));
  assert.ok(!svg.includes('NaN'));
});

test('map annotations never need leader lines: a label belongs beside its mark or in the field index', () => {
  const svg = run('preset: assumptions\ntitle: T\nA @ 20,80\nB @ 70,60', {edit:true});
  const cards = [...svg.matchAll(/<g data-edit="cardmenu"[^>]*>[\s\S]*?<\/g>/g)].map(match => match[0]);
  assert.ok(cards.length >= 2, 'the direct field supplies two card annotations');
  assert.ok(cards.every(card => !card.includes('<line ')),
    'a connector would slice through text and turn the field into a diagram');
});

test('unplaced items render in a tray with data-tray; tray absent when all placed', () => {
  const withTray = run('preset: assumptions\nA @ 20,80\nLegal sign-off');
  assert.ok(withTray.includes('UNPLACED'));
  assert.ok(withTray.includes('data-tray'));
  const without = run('preset: assumptions\nA @ 20,80');
  assert.ok(!without.includes('UNPLACED'));
});

test('grid hairlines and named-cell labels; anonymous cells unlabelled', () => {
  const svg = run('zones: grid 2x2\nzone 1,2: Quick wins\nx: E\ny: V\nP @ 80,20');
  assert.ok(svg.includes('QUICK WINS'));
  assert.ok(!svg.includes('>1,1<'));      // anonymous cell gets no label text
});

test('zone-name edit targets: declared zones carry data-zone; preset rule zones do not', () => {
  const declared = run('zones: grid 2x2\nzone 1,2: Quick wins\nx: E\ny: V', {edit:true});
  assert.ok(declared.includes('data-zone="c:1,2"'));
  const preset = run('preset: assumptions\nA @ 20,80', {edit:true});
  assert.ok(!preset.includes('data-zone="r:test first"'));
  const futures = run('preset: futures', {edit:true});
  assert.ok(futures.includes('data-zone="c:1,2"'));   // preset cells editable via insert path
});

test('axis edit targets carry data-axis and srcLine or -1', () => {
  const svg = run('x: Effort (low → high)\ny: Value\nA @ 10,10', {edit:true});
  assert.ok(svg.includes('data-axis="x"'));
  assert.ok(/<g data-edit="axis" data-line="0"[^>]*data-axis="x"/.test(svg));
  const preset = run('preset: risk\nA @ 10,10', {edit:true});
  assert.ok(/<g data-edit="axis" data-line="-1"[^>]*data-axis="x"/.test(preset));
});

test('escaping: labels with <, &, " render escaped', () => {
  const svg = run('preset: assumptions\nA <b> & "q" @ 20,80');
  assert.ok(svg.includes('A &lt;b&gt; &amp; &quot;q&quot;'));
  assert.ok(!svg.includes('<b>'));
});

test('slide variant scales up', () => {
  const base = run('preset: risk\nA @ 60,85');
  const slide = run('preset: risk\nA @ 60,85', {slide: true});
  const w = s => +s.match(/width="(\d+)"/)[1];
  const h = s => +s.match(/height="(\d+)"/)[1];
  assert.ok(w(slide) > w(base));
  assert.ok(h(slide) > h(base), 'slide scale must enlarge both physical dimensions');
  assert.ok(Math.abs(w(slide) / h(slide) - w(base) / h(base)) < 0.01,
    'slide scale preserves the field aspect ratio instead of adding horizontal whitespace');
});

test('nudge separates overlapping boxes deterministically and clamps to bounds', () => {
  const boxes = [{x:10, y:10, w:60, h:20}, {x:12, y:12, w:60, h:20}];
  const out = nudge(boxes, 0, 0, 200, 100);
  const [a, b] = out;
  const overlap = Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) &&
                  Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y);
  assert.ok(!overlap);
  assert.deepEqual(out, nudge(boxes, 0, 0, 200, 100));     // deterministic
  for(const o of out){ assert.ok(o.x >= 0 && o.y >= 0 && o.x + o.w <= 200 && o.y + o.h <= 100); }
  assert.deepEqual(nudge([{x:5, y:5, w:10, h:10}], 0, 0, 100, 100), [{x:5, y:5, w:10, h:10}]);
});

test('nudge: fixed obstacles never move; free boxes move off them', () => {
  const boxes = [{x:10, y:10, w:60, h:20, fixed:true}, {x:12, y:12, w:60, h:20}];
  const out = nudge(boxes, 0, 0, 200, 100);
  assert.deepEqual({x: out[0].x, y: out[0].y}, {x:10, y:10});   // fixed unchanged
  const [a, b] = out;
  const overlap = Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) &&
                  Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y);
  assert.ok(!overlap);
});

/* Swiss 6c dropped the visible capsule rect (Claude Design 34: bare marker +
   label). The capsule GEOMETRY is unchanged and still drives nudge and the hit
   box, so these tests reconstruct it from the label baseline it prints on:
   the label sits cardPadX (8) in from the box's left edge and 6px up from its
   bottom, and the box is cardH (20) tall. */
const CAP_H = 20, CAP_PAD_X = 8, CAP_BASE_UP = 6;
const capsuleFromLabel = (x, base) => ({x: x - CAP_PAD_X, y: base + CAP_BASE_UP - CAP_H, h: CAP_H});

test('zone labels remain available as semantic geometry while authored marks stay exact', () => {
  /* futures: cell label sits at the cell centre; author a card exactly there */
  const svg = run('preset: futures\nx: A\ny: B\nSignal @ 25,25', {edit:true});
  const label = svg.match(/<g data-edit="zonename"[^>]*data-zone="c:1,1"[^>]*><text x="([\d.]+)" y="([\d.]+)"/);
  const item = svg.match(/<text data-edit="label"[^>]*x="([\d.]+)" y="([\d.]+)"/);
  assert.ok(label && item);
  const mark = svg.match(/transform="rotate\(45 ([\d.]+) ([\d.]+)\)"/);
  assert.ok(mark && +mark[1] === 277 && +mark[2] === 433, 'the map never silently moves an authored position');
});

test('authored positions unchanged by nudge: markers stay at exact coordinates', () => {
  /* two items at the same spot: labels separate, both diamonds at the same centre */
  const svg = run('x: A\ny: B\nOne @ 50,50\nTwo @ 50,50');
  const marks = [...svg.matchAll(/transform="rotate\(45 ([\d.]+) ([\d.]+)\)"/g)].map(m => m[1] + ',' + m[2]);
  assert.equal(marks.length, 2, 'one diamond marker per placed item');
  assert.equal(new Set(marks).size, 1);
});

test('flagged items use the restrained red only for the semantic test-first claim', () => {
  const svg = run('preset: assumptions\nUntested bet @ 20,80', {edit:true});
  /* the err-inked label … */
  const lab = svg.match(/<text data-edit="label"[^>]*x="([\d.]+)" y="([\d.]+)"[^>]*fill="#b33"/);
  assert.ok(lab, 'flagged label carries the err hue');
  /* and the diamond itself is err-inked (geometry survives greyscale) */
  assert.match(svg, /<rect [^>]*fill="#b33" transform="rotate\(45 /);
  /* an unflagged item gets neither red label nor red marker */
  const clean = run('preset: assumptions\nSettled bet @ 20,80 :: test: five interviews', {edit:true});
  assert.doesNotMatch(clean, /data-edit="label"[^>]*fill="#b33"/, 'a settled item is not painted as a warning');
});

test('placed cards carry data-edit="cardmenu" with a >=44px data-hit rect as the first child; tray items do not', () => {
  const source = 'preset: assumptions\nPlaced one @ 20,80\nUnplaced one';
  const editable = run(source, {edit:true});
  const g = editable.match(/<g data-edit="cardmenu" data-line="1"[^>]*>(<rect data-hit=""[^>]*\/>)/);
  assert.ok(g, 'expected cardmenu group with a data-hit rect as its first child');
  const h = +g[1].match(/height="([\d.]+)"/)[1];
  assert.ok(h >= 44, 'hit rect must be at least 44px tall, got ' + h);
  /* export/golden path (edit:false): the tray item keeps its plain data-line
     group — no cardmenu, no data-hit */
  const clean = run(source);
  const trayGroup = clean.match(/<g data-line="\d+" data-tray="1">[\s\S]*?<\/g>/);
  assert.ok(trayGroup, 'expected a tray group');
  assert.ok(!trayGroup[0].includes('cardmenu') && !trayGroup[0].includes('data-hit'),
    'tray items must stay bare in export renders (goldens are edit:false)');
});

test('edit mode: tray items become cardmenu triggers (Place on map… is the coarse placement path)', () => {
  const svg = run('preset: assumptions\nPlaced one @ 20,80\nUnplaced one', {edit: true});
  const trayGroup = svg.match(/<g data-line="\d+" data-tray="1"[^>]*>(<rect data-hit=""[^>]*\/>)/);
  assert.ok(trayGroup, 'expected an edit-mode tray group with a data-hit rect as its first child');
  assert.ok(trayGroup[0].includes('data-edit="cardmenu"'), 'tray group must be a cardmenu trigger in edit mode');
  assert.ok(trayGroup[0].includes('data-menu=""'), 'tray cardmenu must carry the coarse-redirect data-menu marker');
  assert.ok(trayGroup[0].includes('role="button"'), 'tray cardmenu must be keyboard-operable');
  /* the margin row is a true coarse target, not a text-sized click area */
  const h = +trayGroup[1].match(/height="([\d.]+)"/)[1];
  assert.ok(h >= 44, 'tray menu must be at least 44px tall, got ' + h);
});

test('cardmenu hit rect gives the label a stable coarse plane', () => {
  /* futures preset nudges cards off zone labels, so the box != the marker here */
  const svg = run('preset: futures\nx: A\ny: B\nSignal @ 25,25', {edit:true});
  const item = svg.match(/<text data-edit="label"[^>]*x="([\d.]+)" y="([\d.]+)"/);
  const hit = svg.match(/<rect data-hit="" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/);
  assert.ok(item && hit);
  assert.ok(+hit[3] >= 44 || +hit[4] >= 44, 'whole-card menu plane has a coarse target');
  assert.ok(+hit[1] <= +item[1], 'menu plane starts before the factual label');
});

test('plane-level widens: axis, zonename and additem targets get a >=44px invisible box, no data-hit', () => {
  const svg = run('zones: grid 2x2\nzone 1,2: Quick wins\nx: Effort\ny: Value\nThing @ 20,80', {edit: true});
  for(const re of [
    /<g data-edit="axis" data-line="-?\d+" data-raw="[^"]*"[^>]*data-axis="x">[\s\S]*?<rect x="([-\d.]+)" y="([-\d.]+)" width="(\d+)" height="(\d+)" fill="[^"]*" fill-opacity="0"\/>/,
    /<g data-edit="zonename"[^>]*>[\s\S]*?<rect x="([-\d.]+)" y="([-\d.]+)" width="(\d+)" height="(\d+)" fill="[^"]*" fill-opacity="0"\/>/,
    /<g data-edit="additem"[^>]*>[\s\S]*?<rect x="([-\d.]+)" y="([-\d.]+)" width="(\d+)" height="(\d+)" fill="[^"]*" fill-opacity="0"\/>/,
  ]){
    const m = svg.match(re);
    assert.ok(m, 'expected a widened invisible box for ' + re);
    assert.ok(+m[3] >= 44 && +m[4] >= 44, 'box must be >=44px, got ' + m[3] + 'x' + m[4]);
  }
  assert.ok(!/data-edit="axis"[\s\S]{0,400}?data-hit/.test(svg.match(/<g data-edit="axis"[\s\S]*?<\/g>/)[0]),
    'plane-level widens do not carry data-hit (only cardmenu cards do)');
});

test('axis y-label hit box is clamped so it never runs past x=0', () => {
  const svg = run('x: Effort\ny: Value\nA @ 50,50', {edit:true});
  const m = svg.match(/<g data-edit="axis" data-line="-?\d+" data-raw="Value"[^>]*data-axis="y">[\s\S]*?<rect x="([-\d.]+)"/);
  assert.ok(m);
  assert.ok(+m[1] >= 0, 'y-axis hit box x must be clamped to >=0, got ' + m[1]);
});

test('non-editable wide and narrow renders contain no interaction chrome', () => {
  const source = 'zones: grid 2x2\nzone 1,2: Quick wins\nx: Effort\ny: Value\nPlaced @ 20,80\nUnplaced';
  for(const svg of [run(source), run(source, {width:390})]){
    assert.match(svg, /Placed|PLACED/);
    assert.match(svg, /Unplaced|UNPLACED/);
    assert.doesNotMatch(svg, /data-(?:edit|hit|menu|title-hit|position-hit)=/);
    assert.doesNotMatch(svg, /role="button"|tabindex="0"/);
  }
});

/* collect every card [data-hit] rect as a box for overlap assertions */
function hitRects(svg){
  return [...svg.matchAll(/<rect data-hit="" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)]
    .map(m => ({x: +m[1], y: +m[2], w: +m[3], h: +m[4]}));
}
function anyOverlap(rects){
  for(let i = 0; i < rects.length; i++) for(let j = i + 1; j < rects.length; j++){
    const a = rects[i], b = rects[j];
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if(ox > 0.01 && oy > 0.01) return [i, j];
  }
  return null;
}

test('card hit rects never overlap on the default first-run example (EXAMPLES[0])', () => {
  /* the REAL EXAMPLES[0], imported — not a copy. autoloadExample() puts this in front of
     every brand-new user, and a copy of it here once drifted from the app, so this check
     passed on text nobody ever saw. nudge() only separates the visible capsules; the
     hit-rect height cap is what keeps taps unambiguous. */
  const src = EXAMPLES[0].src;
  for(const extra of [{edit: true}, {edit: true, slide: true}]){
    const rects = hitRects(run(src, extra));
    assert.equal(rects.length, 8, 'seven placed cards + the unplaced tray item get hit rects');
    const svg = run(src, extra);
    assert.doesNotMatch(svg, /FIELD INDEX · SOURCE ORDER/,
      'the first-run map keeps its claim labels in the coordinate field');
    const hit = anyOverlap(rects);
    assert.equal(hit, null, extra.slide ? 'slide-mode default overlaps ' + hit : 'default overlaps ' + hit);
  }
});

test('direct field labels remain immediately adjacent to their own marker', () => {
  const svg = run(EXAMPLES[0].src, {edit: true});
  const geometries = [...svg.matchAll(/data-geometry="([\d.,-]+)"/g)].map(match => match[1].split(',').map(Number));
  assert.equal(geometries.length, 7, 'the default map keeps all placed claims in the field');
  for(const [cx, cy, x, y, w, h] of geometries){
    const dx = Math.max(x - cx, 0, cx - (x + w));
    const dy = Math.max(y - cy, 0, cy - (y + h));
    assert.ok(Math.hypot(dx, dy) <= 8,
      'a direct label must touch its diamond’s immediate reading area; got ' + dx + '×' + dy + ' away');
  }
});

test('crowded stack keeps direct claims while reserving distinct 44px menu planes', () => {
  /* Three authored claims on the same coordinate must remain a readable field,
     with the label layout—not tiny click strips—making the edit planes separate. */
  const svg = run('x: A\ny: B\nAlpha @ 50,50\nBeta @ 50,50\nGamma @ 50,50', {edit: true});
  const rects = hitRects(svg);
  assert.equal(rects.length, 3);
  assert.doesNotMatch(svg, /FIELD INDEX · SOURCE ORDER/);
  assert.equal(anyOverlap(rects), null, 'direct menu planes must remain separate');
  assert.ok(rects.every(r => r.h >= 44), 'each menu route remains a true 44px target');
});


/* ---------- Swiss 6b: metrics row + verdict block ---------- */

test('metrics row: model title then readout.js counts, uppercase and letterspaced', () => {
  const svg = run('preset: assumptions\ntitle: Lantern bets\nA @ 20,80\nB @ 30,90\nC @ 80,20\nD');
  assert.match(svg, /font-weight="500" letter-spacing="1\.8" fill="#667">3 OF 4 PLACED · 2 ZONES OCCUPIED · 2 FLAGGED</);
  assert.match(svg, /letter-spacing="1\.8"/);
});

test('metrics row is gone without a title (the minimal header keeps its own shape)', () => {
  assert.doesNotMatch(run('preset: assumptions\nA @ 20,80'), /PLACED/);
});

test('verdict block: VERDICT kicker and one restrained shared key figure', () => {
  const svg = run('preset: assumptions\ntitle: T\nA @ 20,80\nB @ 30,90\nC @ 80,20\nD');
  assert.match(svg, />VERDICT</);
  assert.match(svg, /font-size="24" font-weight="700"/);
  assert.match(svg, /<tspan class="vfig" fill="#D62015">2 of 3<\/tspan>/,
    'the verdict may carry exactly one shared key figure, never decorative field chrome');
  assert.match(svg, /assumptions sit in test first/);
});

test('the verdict flows below the field — a long verdict never overlaps its decision margin', () => {
  const long = 'verdict: ' + 'This deliberately long authored verdict keeps stating the decision and its consequence '.repeat(4) +
    '\npreset: risk\ntitle: T\nA @ 90,90\nB @ 10,10';
  const svg = run(long);
  const ys = [...svg.matchAll(/y="([\d.]+)"[^>]*font-size="24"/g)].map(m => +m[1]);
  assert.ok(ys.length >= 2, 'the long verdict really did wrap');
  const planeY = +svg.match(/data-plane="1"[^>]*y="([\d.]+)"/)[1];
  assert.ok(ys.at(-1) > planeY + 540, 'the verdict starts after the coordinate field');
});

test('semantic item geometry is identical with and without edit chrome', () => {
  const src = 'preset: futures\ntitle: Geometry\nSignal one @ 25,25\nSignal two @ 75,75';
  const plain = run(src), editable = run(src, {edit: true});
  const geometry = svg => [...svg.matchAll(/data-geometry="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(geometry(editable), geometry(plain));
});

test('long title uses measured lines and increases the header before the field', () => {
  const svg = run('title: ' + 'A deliberately long map title that should settle cleanly across measured lines without clipping '.repeat(3) + '\npreset: risk\nA @ 50,50');
  const lines = [...svg.matchAll(/data-title-line="(\d+)"/g)];
  assert.ok(lines.length >= 2);
  const planeY = +svg.match(/data-plane="1"[^>]*y="([\d.]+)"/)[1];
  assert.ok(planeY > 70);
});

test('dense native map keeps one field and moves source detail into its factual margin', () => {
  const src = 'preset: risk\ntitle: Dense\n' + Array.from({length: 12}, (_, i) => `Risk ${i + 1} @ 50,50`).join('\n');
  const svg = run(src);
  assert.doesNotMatch(svg, /data-map-key=""/);
  assert.match(svg, /FIELD INDEX · SOURCE ORDER/);
  for(const id of ['M01', 'M06', 'M12']) assert.ok(svg.includes(id));
  for(let i = 1; i <= 12; i++) assert.ok(svg.includes('Risk ' + i));
  assert.equal(+svg.match(/data-plane="1"[^>]*width="([\d.]+)"/)[1], 820, 'field keeps its reading width');
  assert.equal(+svg.match(/<svg[^>]*width="(\d+)"/)[1], 1234, 'native artboard holds a fixed decision margin');
});

test('narrow dense map becomes a source-order placement ledger', () => {
  const src = 'preset: assumptions\ntitle: Dense\n' + Array.from({length: 10}, (_, i) => `Item ${i + 1} @ 50,50`).join('\n');
  const svg = run(src, {width: 390});
  const plane = svg.match(/data-plane="1"[^>]*y="([\d.]+)"[^>]*width="([\d.]+)" height="([\d.]+)"/);
  assert.equal(+plane[2], 354);
  assert.match(svg, /data-map-layout="zone-atlas-phone"[^>]*data-narrow=""/);
  assert.match(svg, /SOURCE ORDER · PLACEMENT AUDIT/);
});

test('small maps across core presets retain direct labels', () => {
  for(const preset of ['futures', 'assumptions', 'risk']){
    const svg = run(`preset: ${preset}\nOne @ 20,80\nTwo @ 80,20`);
    assert.ok(!svg.includes('data-map-key=""'), preset + ' unexpectedly keyed');
    assert.ok(svg.includes('>One<') && svg.includes('>Two<'));
  }
});

/* ---------- `verdict:` on the artefact (2026-07-31) ---------- */
test('verdict: off drops the band from the readout', () => {
  const svg = run('verdict: off\npreset: assumptions\ntitle: T\nA @ 20,80\nB @ 70,60');
  assert.ok(!svg.includes('VERDICT'));
  assert.match(svg, /^<svg[\s\S]*<\/svg>$/);
});

test('verdict: <text> replaces the tool line, keeping the anatomy', () => {
  const svg = run('verdict: We test A before anything else\npreset: assumptions\ntitle: T\nA @ 20,80\nB @ 70,60');
  assert.ok(svg.includes('VERDICT'));
  assert.ok(svg.includes('We test A before anything else'));
});
