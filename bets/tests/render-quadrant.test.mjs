import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {simulate} from '../engine.js';
import {renderQuadrant, placeLabels, boxesOverlap, layoutBubbles, prep, NAME_ONLY_THRESHOLD} from '../render-quadrant.js';

const COLORS = {ink: '#141b21', muted: '#5b6670', accent: '#c05621', accentInk: '#8e4a1e',
  bg: '#f7f8f6', card: '#ffffff', border: '#e2e5e1', err: '#b3403a', track: '#e7e9e5',
  status: {done: '#1d7a3e', doing: '#2b6cb0', risk: '#9a6a00', blocked: '#b3403a'},
  statusInk: {done: '#1c753c', doing: '#245e98', risk: '#8e6200', blocked: '#a83a34'}};
const measure = (s, font) => { const m = /(\d+(?:\.\d+)?)px/.exec(font || ''); return String(s).length * (m ? +m[1] : 12) * 0.55; };
const CTX = {colors: COLORS, measure};

const SRC = `title: Q3 portfolio
unit: £k
Growth
  Search revamp: stake 120, odds 30-50%, payoff 400-900
    kill: CTR flat after 2 sprints by 2026-09-01
  Sure loser: stake 100, odds 10-20%, payoff 50-80
Platform
  Billing rewrite: stake 200, odds 90-100%, payoff 250-350`;
const model = parse(SRC);
const sim = simulate(model);

test('title + P(LOSES MONEY) present', () => {
  const svg = renderQuadrant(model, sim, CTX);
  assert.match(svg, /Q3 portfolio/);
  assert.match(svg, /P\(LOSES MONEY\)/i);
});

test('every bet name rendered & escaped', () => {
  const svg = renderQuadrant(model, sim, CTX);
  assert.match(svg, /Search revamp/);
  assert.match(svg, /Sure loser/);
  assert.match(svg, /Billing rewrite/);
  const m = parse('G\n  <img src=x onerror=alert(1)>: stake 10, odds 20-40%, payoff 30-60');
  const svg2 = renderQuadrant(m, simulate(m), CTX);
  assert.ok(!svg2.includes('<img'), 'no raw <img');
  assert.match(svg2, /&lt;img/);
});

test('a bubble (<circle) per bet', () => {
  const svg = renderQuadrant(model, sim, CTX);
  const circles = svg.match(/<circle/g) || [];
  // 3 bets, one of which (Billing rewrite) has no kill -> extra dashed ring circle
  assert.ok(circles.length >= 4, 'expected at least one circle per bet plus the no-kill ring');
});

test('dashed ring for a no-kill bet, none for a bet with a kill', () => {
  const noKill = parse('G\n  A: stake 10, odds 20-40%, payoff 30-60');
  const withKill = parse('G\n  A: stake 10, odds 20-40%, payoff 30-60\n    kill: watch this by 2026-01-01');
  const svgNo = renderQuadrant(noKill, simulate(noKill), CTX);
  const svgYes = renderQuadrant(withKill, simulate(withKill), CTX);
  const dashedCircles = svg => (svg.match(/<circle[^>]*stroke-dasharray[^>]*>/g) || []).length;
  assert.ok(dashedCircles(svgNo) >= 1, 'no-kill bet gets a dashed ring');
  assert.equal(dashedCircles(svgYes), 0, 'killed-guarded bet has no dashed ring');
});

test('axis titles present', () => {
  const svg = renderQuadrant(model, sim, CTX);
  assert.match(svg, /ODDS OF SUCCESS/);
  assert.match(svg, /NET EV/);
});

test('certainty-zone label present when a bet has odds >= 90', () => {
  const svg = renderQuadrant(model, sim, CTX);   // Billing rewrite is 90-100%
  assert.match(svg, /CERTAINTY ZONE/);
});

test('loss region present when a bet EV < 0', () => {
  // "Sure loser" (odds 10-20%, payoff 50-80, stake 100) should EV-lose at p50
  const svg = renderQuadrant(model, sim, CTX);
  assert.match(svg, /data-zone="loss"/);
});

test('no NaN / undefined; well-formed shell', () => {
  const svg = renderQuadrant(model, sim, CTX);
  assert.ok(!/NaN|undefined/.test(svg), 'no NaN/undefined');
  assert.match(svg, /^<svg /);
  assert.match(svg, /<\/svg>$/);
});

test('narrow (<520) fits viewBox to width, no wider content', () => {
  const svg = renderQuadrant(model, sim, {...CTX, width: 390});
  assert.match(svg, /viewBox="0 0 390 /);
  // every numeric x= / cx= / x1= / x2= attribute value must be <= 390
  for(const m of svg.matchAll(/(?:^|\s)(?:x|cx|x1|x2)="(-?[\d.]+)"/g)){
    const v = parseFloat(m[1]);
    assert.ok(v <= 390.01, 'x-coordinate ' + v + ' exceeds narrow width 390');
  }
});

test('degenerate single all-point-bet model renders without NaN', () => {
  const m = parse('G\n  Fixed: stake 10, odds 50-50%, payoff 100-100');
  const svg = renderQuadrant(m, simulate(m), CTX);
  assert.ok(!/NaN/.test(svg));
  assert.match(svg, /^<svg /);
  assert.match(svg, /<\/svg>$/);
});

test('empty portfolio (no groups) renders header + empty plot, no crash', () => {
  const m = parse('title: Empty book\nunit: £k');
  const svg = renderQuadrant(m, simulate(m), CTX);
  assert.ok(!/NaN|undefined/.test(svg));
  assert.match(svg, /Empty book/);
  assert.match(svg, /^<svg /);
  assert.match(svg, /<\/svg>$/);
});

test('read-only view: no edit hooks', () => {
  const svg = renderQuadrant(model, sim, CTX);
  assert.ok(!/data-edit=/.test(svg), 'quadrant is read-only — no edit targets');
});

test('lane legend carries lane names', () => {
  const svg = renderQuadrant(model, sim, CTX);
  assert.match(svg, /GROWTH/);
  assert.match(svg, /PLATFORM/);
});

/* ---------------- greedy label placement ---------------- */

const CROWDED_SRC = `title: Q4 crowded portfolio
unit: £k
Growth
  Search revamp: stake 120, odds 40-55%, payoff 300-500
    kill: CTR flat after 2 sprints by 2026-09-01
  Onboarding tweak: stake 60, odds 45-55%, payoff 90-140
  Referral loop: stake 50, odds 42-52%, payoff 80-130
  Paid acq test: stake 70, odds 35-50%, payoff 100-160
Platform
  Billing rewrite: stake 200, odds 90-100%, payoff 250-350
  Infra migration: stake 90, odds 48-58%, payoff 120-200
  API v2: stake 40, odds 44-54%, payoff 60-100
  Cache layer: stake 55, odds 46-56%, payoff 70-120
Risk
  Sure loser: stake 100, odds 10-20%, payoff 50-80
  Moonshot: stake 30, odds 5-15%, payoff 800-1500
  Compliance fix: stake 80, odds 47-53%, payoff 100-150
    kill: no lift after 1 sprint by 2026-10-01
  Support tool: stake 45, odds 43-53%, payoff 65-110`;
const crowdedModel = parse(CROWDED_SRC);
const crowdedSim = simulate(crowdedModel);

// mirrors renderWide's geo (bets/render-quadrant.js) closely enough to drive
// layoutBubbles/placeLabels directly, without going through SVG string output
const WIDE_GEO = {plotX0: 92, plotY0: 112, plotX1: 926, plotY1: 512,
  dark: false, rMin: 10, rMax: 30, nameSize: 12.5, microSize: 10,
  tickSize: 9.5, axisTitleSize: 10.5, legendSize: 9.5, unit: '£k', padX: 16, padTop: 16};

function placedFor(model, sim, geo){
  const P = prep(model, sim);
  const items = layoutBubbles(P, sim, geo);
  const bounds = {x0: geo.plotX0 - geo.padX, x1: geo.plotX1 + geo.padX,
    y0: geo.plotY0 - geo.padTop, y1: geo.plotY1};
  return placeLabels(items, {bounds, measure, nameSize: geo.nameSize, microSize: geo.microSize, gap: 6});
}

test('crowded portfolio (12 bets): no two placed label boxes overlap', () => {
  // 12 bets > NAME_ONLY_THRESHOLD, so this exercises microSize:null via the
  // real renderWide path too — but here we drive layoutBubbles directly with
  // microcopy still on, the harder case, to stress-test the placer itself.
  const placed = placedFor(crowdedModel, crowdedSim, WIDE_GEO);
  assert.equal(placed.length, 12);
  for(let i = 0; i < placed.length; i++){
    for(let j = i + 1; j < placed.length; j++){
      assert.ok(!boxesOverlap(placed[i].box, placed[j].box),
        placed[i].name + ' overlaps ' + placed[j].name);
    }
  }
});

test('crowded portfolio: no label box overlaps another bubble', () => {
  const placed = placedFor(crowdedModel, crowdedSim, WIDE_GEO);
  for(const p of placed){
    for(const other of placed){
      const dx = Math.max(other.cx - (p.box.x + p.box.w), p.box.x - other.cx, 0);
      const dy = Math.max(other.cy - (p.box.y + p.box.h), p.box.y - other.cy, 0);
      const dist = Math.hypot(dx, dy);
      // dist===0 with dx=dy=0 only possible if box actually contains the
      // bubble centre; a real overlap needs dist < radius, checked exactly:
      const nx = Math.max(p.box.x, Math.min(other.cx, p.box.x + p.box.w));
      const ny = Math.max(p.box.y, Math.min(other.cy, p.box.y + p.box.h));
      const trueDist = Math.hypot(other.cx - nx, other.cy - ny);
      assert.ok(trueDist >= other.radius - 0.01,
        p.name + '\'s label box overlaps a bubble at (' + other.cx + ',' + other.cy + ')');
    }
  }
});

test('placeLabels: leader line only when the label is not snug against its bubble', () => {
  // eight bets stacked at (near enough) the same point with full name+microcopy
  // boxes: ring-1 only has 8 compass slots, and their near-identical centres
  // mean each new bet's slot collides with an already-taken one well before
  // all 8 are exhausted, so the lowest-priority bets must spill to the escape
  // ring -> forces both a snug (no-leader) pick for the highest-stake bet and
  // an escape-ring (leader) pick for at least one lower-priority bet.
  const items = Array.from({length: 8}, (_, i) => ({
    cx: 300 + i * 0.2, cy: 300 - i * 0.2, radius: 16,
    name: 'Portfolio bet number ' + i, micro: (100 - i * 5) + ' @ 30–50% → pays 200–400',
    stake: 100 - i * 10, absEv: 50 - i * 5,
  }));
  const bounds = {x0: 0, y0: 0, x1: 900, y1: 900};
  const placed = placeLabels(items, {bounds, measure, nameSize: 12, microSize: 10, gap: 6});
  assert.equal(placed.length, 8);
  for(const p of placed) assert.equal(typeof p.leader, 'boolean');
  for(let i = 0; i < placed.length; i++) for(let j = i + 1; j < placed.length; j++)
    assert.ok(!boxesOverlap(placed[i].box, placed[j].box), placed[i].name + ' overlaps ' + placed[j].name);
  assert.ok(placed.some(p => !p.leader), 'the highest-priority bet should still get a snug, leader-free placement');
  assert.ok(placed.some(p => p.leader), 'a lower-priority bet in this cluster should need a leader line');
});

test('placeLabels: never drops a label, even in a pathologically tight box', () => {
  const items = [
    {cx: 50, cy: 50, radius: 40, name: 'This is a rather long bet name that will not fit easily', micro: null, stake: 10, absEv: 5},
  ];
  const bounds = {x0: 0, y0: 0, x1: 100, y1: 100};   // far too small for the label
  const placed = placeLabels(items, {bounds, measure, nameSize: 12, microSize: null, gap: 6});
  assert.equal(placed.length, 1);
  assert.ok(placed[0].box && Number.isFinite(placed[0].box.x) && Number.isFinite(placed[0].box.y));
});

test('name-only mode: microcopy absent past NAME_ONLY_THRESHOLD bets, present at/under it', () => {
  assert.equal(NAME_ONLY_THRESHOLD, 9);
  const svgCrowded = renderQuadrant(crowdedModel, crowdedSim, CTX);   // 12 bets
  assert.ok(!svgCrowded.includes('→ pays'), 'name-only mode should drop the microcopy line past the threshold');
  const svgSmall = renderQuadrant(model, sim, CTX);   // 3 bets, well under threshold
  assert.ok(svgSmall.includes('→ pays'), 'small portfolios keep the microcopy line');
});

test('crowded portfolio narrow: no coordinate exceeds the 390 viewBox (escape-ring/fallback safety)', () => {
  const svg = renderQuadrant(crowdedModel, crowdedSim, {...CTX, width: 390});
  assert.match(svg, /viewBox="0 0 390 /);
  for(const m of svg.matchAll(/(?:^|\s)(?:x|cx|x1|x2)="(-?[\d.]+)"/g)){
    const v = parseFloat(m[1]);
    assert.ok(v <= 390.01 && v >= -0.01, 'x-coordinate ' + v + ' out of the narrow 390 viewBox');
  }
});

test('crowded portfolio golden-shape sanity: a bubble + label per bet, well-formed', () => {
  const svg = renderQuadrant(crowdedModel, crowdedSim, CTX);
  assert.ok(!/NaN|undefined/.test(svg), 'no NaN/undefined');
  assert.match(svg, /^<svg /);
  assert.match(svg, /<\/svg>$/);
  const circles = svg.match(/<circle/g) || [];
  assert.ok(circles.length >= 12, 'at least one bubble per bet');
  for(const name of ['Search revamp', 'Onboarding tweak', 'Referral loop', 'Paid acq test',
    'Billing rewrite', 'Infra migration', 'API v2', 'Cache layer',
    'Sure loser', 'Moonshot', 'Compliance fix', 'Support tool']){
    assert.ok(svg.includes(name), 'missing label text for ' + name);
  }
});
