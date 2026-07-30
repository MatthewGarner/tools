import {test} from 'node:test';
import assert from 'node:assert/strict';
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
  '  Users forget mid-afternoon habits',
  '    Smart reminders [testing]',
  '      ? users want to be interrupted',
  '    Streak freeze [delivering]',
  '      ? freezes reduce churn [holds]',
  '  Habits feel like chores',
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
  assert.ok(svg.includes('Streak freeze'));
  assert.ok(svg.includes('HABITS FEEL'), 'unaddressed opportunity is a lane');
  assert.ok(svg.includes('no committed solution yet'), 'ghost chip instead of repeated title');
  assert.ok(svg.includes('stroke-dasharray'), 'ghost card dashed');
  assert.ok(svg.includes('UNTESTED BET'), 'smart reminders flagged');
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
    assert.match(svg, /fill="#1C753C">DELIVERING</, name + ': delivering label is the -ink variant');
    assert.ok(!/fill="#1D7A3E">DELIVERING</.test(svg), name + ': the un-boosted hue is not used as label text');
    /* the holding assumption reads in the same boosted ink, and keeps its glyph */
    assert.match(svg, /fill="#1C753C"[^>]*>✓ freezes reduce churn</, name + ': ✓ glyph + boosted ink');
    /* the model's palette accent has no -ink token of its own, so the TESTING
       tag stays a single hue — fill tint plus label, as it always was */
    assert.match(svg, /rx="0" fill="#1F4FD81F"/, name + ': testing fill is the palette accent tint');
    assert.match(svg, /fill="#1F4FD8">TESTING</, name + ': testing label stays the palette accent');
  }
});

/* A ctx without the -ink tokens (older callers, the test harnesses) must still
   render — it falls back to the fill hue rather than emitting undefined. */
test('ost status tags fall back to the fill hue when no -ink tokens are supplied', () => {
  const svg = run(renderOst);
  assert.ok(!svg.includes('undefined'));
  assert.match(svg, /fill="#1D7A3E">DELIVERING</);
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

test('palette scheme applies in both views', () => {
  const doc = 'palette: ember\noutcome: O\n  Need\n    Fix [delivering]';
  assert.ok(run(renderOst, doc).includes('#B04E1E'));
  assert.ok(run(renderMap, doc).includes('#B04E1E'));
});
