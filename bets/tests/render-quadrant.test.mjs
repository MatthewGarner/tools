import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {simulate} from '../engine.js';
import {renderQuadrant} from '../render-quadrant.js';

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
