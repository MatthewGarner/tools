import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
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
  const svg = run('preset: assumptions\ntitle: T\nA @ 20,80 :: test: interview five\nB @ 70,60\nC');
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
  const declared = run('zones: grid 2x2\nzone 1,2: Quick wins\nx: E\ny: V');
  assert.ok(declared.includes('data-zone="c:1,2"'));
  const preset = run('preset: assumptions\nA @ 20,80');
  assert.ok(!preset.includes('data-zone="r:test first"'));
  const futures = run('preset: futures');
  assert.ok(futures.includes('data-zone="c:1,2"'));   // preset cells editable via insert path
});

test('axis edit targets carry data-axis and srcLine or -1', () => {
  const svg = run('x: Effort (low → high)\ny: Value\nA @ 10,10');
  assert.ok(svg.includes('data-axis="x"'));
  assert.ok(/<g data-edit="axis" data-line="0"[^>]*data-axis="x"/.test(svg));
  const preset = run('preset: risk\nA @ 10,10');
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
  assert.ok(w(slide) > w(base));
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

test('zone labels are nudge obstacles: a card authored on a zone label moves off it', () => {
  /* futures: cell label sits at the cell centre; author a card exactly there */
  const svg = run('preset: futures\nx: A\ny: B\nSignal @ 25,25');
  const label = svg.match(/<g data-edit="zonename"[^>]*data-zone="c:1,1"[^>]*><text x="([\d.]+)" y="([\d.]+)"/);
  const item = svg.match(/<text data-edit="label"[^>]*x="([\d.]+)" y="([\d.]+)"/);
  assert.ok(label && item);
  const cap = capsuleFromLabel(+item[1], +item[2]);
  /* the item's box must not contain the zone label's baseline */
  const ly = +label[2];
  assert.ok(ly < cap.y - 2 || ly > cap.y + cap.h + 2, 'zone label baseline inside the item box');
});

test('authored positions unchanged by nudge: markers stay at exact coordinates', () => {
  /* two items at the same spot: labels separate, both diamonds at the same centre */
  const svg = run('x: A\ny: B\nOne @ 50,50\nTwo @ 50,50');
  const marks = [...svg.matchAll(/transform="rotate\(45 ([\d.]+) ([\d.]+)\)"/g)].map(m => m[1] + ',' + m[2]);
  assert.equal(marks.length, 2, 'one diamond marker per placed item');
  assert.equal(new Set(marks).size, 1);
});

test('flagged items are marked by shape AND colour, never colour alone', () => {
  const svg = run('preset: assumptions\nUntested bet @ 20,80');
  /* the err-inked label … */
  const lab = svg.match(/<text data-edit="label"[^>]*x="([\d.]+)" y="([\d.]+)"[^>]*fill="#b33"/);
  assert.ok(lab, 'flagged label carries the err hue');
  /* … plus a rule under it, which is what survives greyscale and colour-blindness */
  const rule = new RegExp('<rect x="' + lab[1] + '" y="' + (+lab[2] + 3).toFixed(2) +
    '" width="[\\d.]+" height="2\\.00" fill="#b33"/>');
  assert.match(svg, rule);
  /* and the marker itself is err-inked */
  assert.match(svg, /<rect [^>]*fill="#b33" transform="rotate\(45 /);
  /* an unflagged item gets neither */
  const clean = run('preset: assumptions\nSettled bet @ 20,80 :: test: five interviews');
  assert.ok(!/height="2\.00" fill="#b33"/.test(clean));
});

test('placed cards carry data-edit="cardmenu" with a >=44px data-hit rect as the first child; tray items do not', () => {
  const svg = run('preset: assumptions\nPlaced one @ 20,80\nUnplaced one');
  const g = svg.match(/<g data-edit="cardmenu" data-line="1"[^>]*>(<rect data-hit=""[^>]*\/>)/);
  assert.ok(g, 'expected cardmenu group with a data-hit rect as its first child');
  const h = +g[1].match(/height="([\d.]+)"/)[1];
  assert.ok(h >= 44, 'hit rect must be at least 44px tall, got ' + h);
  /* export/golden path (edit:false): the tray item keeps its plain data-line
     group — no cardmenu, no data-hit */
  const trayGroup = svg.match(/<g data-line="\d+" data-tray="1">[\s\S]*?<\/g>/);
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
  /* the hit rect fills the row pitch (26px) — capped so adjacent rows never overlap */
  const h = +trayGroup[1].match(/height="([\d.]+)"/)[1];
  assert.equal(h, 26);
});

test('cardmenu hit rect is centred on the label box, not the authored marker', () => {
  /* futures preset nudges cards off zone labels, so the box != the marker here */
  const svg = run('preset: futures\nx: A\ny: B\nSignal @ 25,25');
  const item = svg.match(/<text data-edit="label"[^>]*x="([\d.]+)" y="([\d.]+)"/);
  const hit = svg.match(/<rect data-hit="" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/);
  assert.ok(item && hit);
  const cap = capsuleFromLabel(+item[1], +item[2]);
  const hitCentreY = +hit[2] + (+hit[4]) / 2;
  assert.ok(Math.abs(cap.y + cap.h / 2 - hitCentreY) < 0.5, 'hit rect must centre on the label box centre');
  /* left edge: the padding strip the suites tap to open the menu without
     landing on a glyph must still exist */
  assert.ok(Math.abs(+hit[1] - cap.x) < 0.5, 'hit rect starts one card-padding left of the label');
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
  const svg = run('x: Effort\ny: Value\nA @ 50,50');
  const m = svg.match(/<g data-edit="axis" data-line="-?\d+" data-raw="Value"[^>]*data-axis="y">[\s\S]*?<rect x="([-\d.]+)"/);
  assert.ok(m);
  assert.ok(+m[1] >= 0, 'y-axis hit box x must be clamped to >=0, got ' + m[1]);
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
  /* verbatim EXAMPLES[0] "Assumption map" from map/app.js — the content
     autoloadExample() loads for a brand-new user. nudge() only separates the
     visible capsules; the hit-rect height cap is what keeps taps unambiguous. */
  const src = `preset: assumptions
title: Habitat — launch assumptions

Users will log habits daily @ 30,90 :: test: watch 5 onboarding sessions
Streak anxiety drives churn @ 75,80 :: note: held in Q2 interviews
Users want social features @ 20,55 :: test: fake-door invite flow
Push reminders feel caring, not naggy @ 35,75
People will pay for coaching @ 15,85
Habit templates save setup time @ 80,45
App-store reviews drive installs @ 55,25
Legal sign-off on health claims
`;
  for(const extra of [{edit: true}, {edit: true, slide: true}]){
    const rects = hitRects(run(src, extra));
    assert.equal(rects.length, 8, 'seven placed cards + the unplaced tray item get hit rects');
    const hit = anyOverlap(rects);
    assert.equal(hit, null, extra.slide ? 'slide-mode default overlaps ' + hit : 'default overlaps ' + hit);
  }
});

test('crowded stack: hit-rect heights cap to the neighbour gap, no overlap; floor never below the visible card', () => {
  /* three items authored on top of each other: nudge stacks the capsules
     tightly, so the 44px boxes would overlap without the cap */
  const svg = run('x: A\ny: B\nAlpha @ 50,50\nBeta @ 50,50\nGamma @ 50,50', {edit: true});
  const rects = hitRects(svg);
  assert.equal(rects.length, 3);
  assert.equal(anyOverlap(rects), null, 'capped hit rects must not overlap');
  /* at least one card is capped below the full 44, and none below the 20px card height */
  assert.ok(rects.some(r => r.h < 44 - 0.01), 'expected at least one capped (<44) hit rect in a crowded stack');
  assert.ok(rects.every(r => r.h >= 20 - 0.01), 'hit rect never shrinks below the visible card height');
});


/* ---------- Swiss 6b: metrics row + verdict block ---------- */

test('metrics row: model title then readout.js counts, uppercase and letterspaced', () => {
  const svg = run('preset: assumptions\ntitle: Habitat bets\nA @ 20,80\nB @ 30,90\nC @ 80,20\nD');
  assert.match(svg, /font-weight="500" letter-spacing="1\.8" fill="#667">3 OF 4 PLACED · 2 ZONES OCCUPIED · 2 FLAGGED</);
  assert.match(svg, /letter-spacing="1\.8"/);
});

test('metrics row is gone without a title (the minimal header keeps its own shape)', () => {
  assert.doesNotMatch(run('preset: assumptions\nA @ 20,80'), /PLACED/);
});

test('verdict block: VERDICT kicker, 24px display line, exactly one brand figure', () => {
  const svg = run('preset: assumptions\ntitle: T\nA @ 20,80\nB @ 30,90\nC @ 80,20\nD');
  assert.match(svg, />VERDICT</);
  assert.match(svg, /font-size="24" font-weight="700" letter-spacing="-0\.36"/);
  assert.match(svg, /<tspan fill="#D62015">2 of 3<\/tspan>/);
  assert.equal((svg.match(/#D62015/g) || []).length, 1, 'brand red appears once and only on the figure');
  assert.match(svg, /assumptions sit in test first/);
});

test('bare (poster embed) drops the verdict block but keeps the zone columns', () => {
  const bare = run('preset: assumptions\ntitle: T\nA @ 20,80\nB @ 80,20', {bare: true});
  assert.doesNotMatch(bare, />VERDICT</);
  assert.doesNotMatch(bare, /#D62015/);
  assert.match(bare, /TEST FIRST/);
});

test('the verdict advance drives the readout flow — a long verdict never overlaps a zone column', () => {
  const long = 'preset: risk\ntitle: T\n' +
    'A catastrophically long risk label that will certainly wrap the display line @ 90,90\nB @ 10,10';
  const svg = run(long);
  const ys = [...svg.matchAll(/y="([\d.]+)" font-family="'Helvetica Neue'[^>]*font-size="24"/g)].map(m => +m[1]);
  assert.ok(ys.length >= 2, 'the long verdict really did wrap');
  const zoneY = +svg.match(/y="([\d.]+)" font-size="10\.5" font-weight="600" letter-spacing="0\.8"/)[1];
  assert.ok(zoneY > ys[ys.length - 1], 'the zone columns start below the last verdict line');
});
