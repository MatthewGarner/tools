import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {parse} from '../parse.js';
import {project} from '../project.js';
import {renderOst} from '../render-ost.js';
import {renderMap} from '../render-map.js';

const ctx = (extra = {}) => ({
  colors: {card:'#fff', border:'#ddd', ink:'#222', muted:'#667', accent:'#08c',
    bg:'#f7f8f6', err:'#b33', status:{done:'#1D7A3E', doing:'#0C7FAE', risk:'#9A6A00', blocked:'#B3403A'}},
  measure: t => t.length * 7,
  ...extra,
});
const DOC = [
  'title: Q3 retention',
  'outcome: Improve 90-day retention',
  '  Readers lose their place between sessions',
  '    Reading reminders [testing]',
  '      ? users want to be interrupted',
  '    Resume where you left off [delivering]',
  '      ? freezes reduce churn [holds]',
  '  Choosing the next book is work',
  '  Orphan feature [delivering]',
].join('\n');
const run = (renderer, doc = DOC, extra = {}) => {
  const m = parse(doc);
  return renderer(m, project(m), ctx(extra));
};

test('map view: outcome band, opportunity lanes, ghost chip, audit badges', () => {
  const svg = run(renderMap);
  assert.match(svg, /^<svg[\s\S]*<\/svg>$/);
  assert.ok(!svg.includes('NaN'));
  assert.ok(svg.includes('IMPROVE 90-DAY RETENTION'), 'outcome band header');
  assert.ok(svg.includes('Resume where you left off'));
  assert.ok(svg.includes('CHOOSING THE NEXT'), 'unaddressed opportunity is a lane');
  assert.ok(svg.includes('no committed solution yet'), 'ghost chip instead of repeated title');
  assert.ok(svg.includes('stroke-dasharray'), 'ghost card dashed');
  assert.ok(svg.includes('UNTESTED BET'), 'reading reminders flagged');
  assert.ok(svg.includes('NO WHY'), 'orphan flagged');
});

test('map view: deeper unaddressed sub-opportunity renders as named OPPORTUNITY card', () => {
  const doc = [
    'outcome: O',
    '  Big need',
    '    Addressed sub',
    '      Fix [delivering]',
    '    Ignored sub',
  ].join('\n');
  const svg = run(renderMap, doc);
  assert.ok(svg.includes('Ignored sub'), 'named card, not ghost');
  assert.ok(svg.includes('OPPORTUNITY'), 'opportunity capsule');
  assert.ok(svg.includes('BIG NEED'), 'sits in its first-level lane');
});

test('map view: broken assumption badge in err colour', () => {
  const doc = 'outcome: O\n  Need\n    Shaky [delivering]\n      ? belief [broken]';
  const svg = run(renderMap, doc);
  assert.ok(svg.includes('BROKEN ASSUMPTION'));
  assert.ok(svg.includes('#b33'), 'err colour used');
});

/* Gate B: committed solutions with a broken assumption stay live entries
   (project() untouched — see project.test.mjs) but render.map view as a
   distinct at-risk ghost: dashed border + the loud BROKEN ASSUMPTION badge,
   fully legible and fully editable — never roadmap's `ghost`/`worldState`
   vocabulary (those mean an authored roadmap fact, not "this tree still
   says delivering but its own assumption broke"). */
test('map view: broken-assumption solution is a dashed at-risk ghost, stays editable', () => {
  const doc = 'outcome: O\n  Need\n    Shaky [delivering]\n      ? belief [broken]';
  const svg = run(renderMap, doc, {edit: true});
  assert.ok(svg.includes('BROKEN ASSUMPTION'), 'badge stays legible');
  assert.ok(svg.includes('stroke-dasharray="3 3"'), 'at-risk ghost is dashed');
  assert.ok(svg.includes('data-edit="cardmenu"') && svg.includes('data-edit="title"'),
    'stays fully editable — never the ghost treatment, which strips data-edit');
  assert.ok(!svg.includes('worldState'), 'never roadmap\'s worldState vocabulary');
});

test('map view: healthy doc (no broken assumptions) carries no at-risk markup — untested/no-why unaffected', () => {
  const svg = run(renderMap);   // DOC: testing+untested, delivering+holds, delivering+no-why — no broken assumption anywhere
  assert.ok(svg.includes('UNTESTED BET'));
  assert.ok(svg.includes('NO WHY'));
  /* the only stroke-dasharray in a healthy map is the ghost placeholder chip
     ('no committed solution yet'), never a real card */
  const cardDash = /<rect data-hit="" [^>]*stroke-dasharray/;
  assert.ok(!cardDash.test(svg), 'no real card is dashed without a broken assumption');
});

test('map view: no-why + broken-assumption composite keeps both facts (NO WHY lane placement + BROKEN ASSUMPTION badge), same at-risk treatment', () => {
  const doc = 'outcome: O\n  Orphan [delivering]\n    ? belief [broken]';
  /* an orphan solution has no opportunity ancestor, so it renders in the
     "no why" lane rather than under a named opportunity */
  const svg = run(renderMap, doc);
  assert.ok(svg.includes('⚠ no why') || svg.includes('no why'), 'NO WHY lane placement kept');
  assert.ok(svg.includes('BROKEN ASSUMPTION'), 'BROKEN ASSUMPTION badge kept');
  assert.ok(svg.includes('stroke-dasharray="3 3"'), 'no-why + broken composite is still an at-risk ghost');
});

test('ost view: cards, status pills, assumption glyphs, dashed unaddressed', () => {
  const svg = run(renderOst);
  assert.match(svg, /^<svg[\s\S]*<\/svg>$/);
  assert.ok(!svg.includes('NaN'));
  assert.ok(svg.includes('DELIVERING') && svg.includes('TESTING'));
  /* long assumptions wrap inside the card instead of overflowing it */
  assert.ok(svg.includes('? users want to'));
  assert.ok(svg.includes('be interrupted'));
  assert.ok(!svg.includes('>? users want to be interrupted<'), 'row wrapped, not overflowing');
  assert.ok(svg.includes('✓ freezes reduce churn'));
  assert.ok(svg.includes('stroke-dasharray'), 'unaddressed opportunity dashed');
});

/* Swiss 6c: the status tag is the house square — a tinted FILL in the status
   hue with the LABEL in that hue's contrast-boosted `-ink` variant. Both states
   keep a fill AND a label, so nothing rests on colour alone, and the tool's five
   solution states survive (the mockup's two-state blue/ink would lose three). */
test('ost status tags: tinted fill in the status hue, label in its -ink variant', () => {
  const INK = {colors: {card:'#fff', border:'#ddd', ink:'#222', muted:'#667',
    accent:'#0088CC', accentInk:'#0A6C94', bg:'#f7f8f6', err:'#b33',
    status:{done:'#1D7A3E', doing:'#0C7FAE', risk:'#9A6A00', blocked:'#B3403A'},
    statusInk:{done:'#1C753C', doing:'#1A44C2', risk:'#8E6200', blocked:'#B3403A'}},
    measure: t => t.length * 7};
  const m = parse(DOC);
  for(const [name, extra] of [['wide', {}], ['narrow', {width: 380}]]){
    const svg = renderOst(m, project(m), {...INK, ...extra});
    assert.match(svg, /rx="0" fill="#1D7A3E1F"/, name + ': delivering fill is the 12% status tint');
    assert.match(svg, /fill="#1C753C"[^>]*>DELIVERING</, name + ': delivering label is the -ink variant');
    assert.ok(!/fill="#1D7A3E"[^>]*>DELIVERING</.test(svg), name + ': the un-boosted hue is not used as label text');
    /* the holding assumption reads in the same boosted ink, and keeps its glyph */
    assert.match(svg, /fill="#1C753C"[^>]*>✓ freezes reduce churn</, name + ': ✓ glyph + boosted ink');
    /* the model's palette accent has no -ink token of its own, so the TESTING
       tag stays a single hue — fill tint plus label, as it always was */
    assert.match(svg, /rx="0" fill="#1F4FD81F"/, name + ': testing fill is the palette accent tint');
    assert.match(svg, /fill="#1F4FD8"[^>]*>TESTING</, name + ': testing label stays the palette accent');
  }
});

test('ost status labels defer pointer input to their canonical pill target', () => {
  const m = parse(DOC);
  const svg = renderOst(m, project(m), ctx({edit: true}));
  assert.match(svg, /data-edit="status"[\s\S]*<text[^>]*pointer-events="none">TESTING<\/text>/);
});

/* A ctx without the -ink tokens (older callers, the test harnesses) must still
   render — it falls back to the fill hue rather than emitting undefined. */
test('ost status tags fall back to the fill hue when no -ink tokens are supplied', () => {
  const svg = run(renderOst);
  assert.ok(!svg.includes('undefined'));
  assert.match(svg, /fill="#1D7A3E"[^>]*>DELIVERING</);
});

/* A hue tint() can't build (anything but a 6-digit hex) must not leave the tag
   as bare coloured text — it outlines instead, so the state is still a SHAPE. */
test('ost status tags outline when the hue admits no tint (never colour alone)', () => {
  const svg = run(renderOst, DOC, {colors: {card:'#fff', border:'#ddd', ink:'#222', muted:'#667',
    accent:'#08c', bg:'#f7f8f6', err:'#b33',
    status:{done:'#3a3', doing:'#0C7FAE', risk:'#9A6A00', blocked:'#B3403A'}}});
  assert.match(svg, /rx="0" fill="none" stroke="#3a3" stroke-width="1"\/>/);
});

test('ost view: shipped dimmed; escaping works in both views', () => {
  const doc = 'outcome: O\n  Need & <more>\n    Old thing [shipped]\n    Live [delivering]';
  const ost = run(renderOst, doc);
  assert.ok(ost.includes('opacity="0.42"'));
  assert.ok(ost.includes('Need &amp; &lt;more&gt;'));
  assert.ok(run(renderMap, doc).includes('Need &amp; &lt;more&gt;'));
});

/* Gate B byte-identity guard: the committed why-map golden (a healthy doc,
   no broken assumptions) must render EXACTLY as it did before the atRisk
   flag existed — mirrors dev/golden.mjs's own fixture/ctx so this test fails
   the moment the render path drifts, independent of `golden.mjs verify`. */
test('map view: golden fixture (no broken assumptions) is byte-identical to the committed golden', () => {
  const ctxBase = {
    colors: {card:'#fff',border:'#ddd',ink:'#222',muted:'#667',accent:'#08c',bg:'#f7f8f6',
      err:'#b33', status:{done:'#1D7A3E',doing:'#1F4FD8',risk:'#9A6A00',blocked:'#B3403A'},
      statusInk:{done:'#1C753C',doing:'#1A44C2',risk:'#8E6200',blocked:'#B3403A'}, accentInk:'#0A6C94',
      brand:'#E2231A', brandText:'#D62015'},
    measure: (t) => t.length * 7,
  };
  const doc = 'title: T\noutcome: Retention\n  Losing your place\n    Reading reminders [testing]\n      ? wanted\n' +
    '    Resume where you left off [delivering]\n      ? works [holds]\n  Choosing is work\n  Orphan [delivering]';
  const m = parse(doc);
  const pr = project(m);
  const svg = renderMap(m, pr, {...ctxBase}).replace(/\d{4}-\d{2}-\d{2}/, 'DATE');
  const goldenPath = fileURLToPath(new URL('../../dev/golden/why-map.svg', import.meta.url));
  const golden = readFileSync(goldenPath, 'utf8');
  assert.equal(svg, golden);
});

test('palette scheme applies in both views', () => {
  const doc = 'palette: ember\noutcome: O\n  Need\n    Fix [delivering]';
  assert.ok(run(renderOst, doc).includes('#B04E1E'));
  assert.ok(run(renderMap, doc).includes('#B04E1E'));
});
