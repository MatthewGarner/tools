import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {simulate} from '../engine.js';
import {renderBoard} from '../render.js';

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

test('board carries lane names, title, and every slip name', () => {
  const svg = renderBoard(model, sim, CTX);
  assert.match(svg, /GROWTH/);
  assert.match(svg, /PLATFORM/);
  assert.match(svg, /Search revamp/);
  assert.match(svg, /Billing rewrite/);
});

test('header carries the fan verdict + P(loses money) + independence caveat', () => {
  const svg = renderBoard(model, sim, CTX);
  assert.match(svg, /P\(loses money\)/);
  assert.match(svg, /Portfolio net EV/);
  assert.match(svg, /independent/i);
});

test('audit badges render for known audits (loser + certainty + no-kill)', () => {
  const svg = renderBoard(model, sim, CTX);
  assert.match(svg, /LOSES AT P50/);        // Sure loser
  assert.match(svg, /ODDS IMPLY CERTAINTY/); // Billing rewrite 90-100
  assert.match(svg, /NO KILL CRITERION/);
});

test('edit hooks on stake / odds / payoff / kill with data-line', () => {
  const svg = renderBoard(model, sim, CTX);
  assert.match(svg, /data-edit="stake" data-line="4"/);
  assert.match(svg, /data-edit="odds" data-line="4"/);
  assert.match(svg, /data-edit="payoff" data-line="4"/);
  assert.match(svg, /data-edit="kill" data-line="5"/);
});

test('hostile bet name is escaped', () => {
  const m = parse(`G\n  <img src=x onerror=alert(1)>: stake 10, odds 20-40%, payoff 30-60`);
  const svg = renderBoard(m, simulate(m), CTX);
  assert.ok(!svg.includes('<img'), 'no raw <img');
  assert.match(svg, /&lt;img/);
});

test('no NaN / undefined; well-formed shell; no bare data-edit attribute', () => {
  const svg = renderBoard(model, sim, CTX);
  assert.ok(!/NaN|undefined/.test(svg), 'no NaN/undefined');
  assert.match(svg, /^<svg /);
  assert.match(svg, /<\/svg>$/);
  assert.ok(!/ data-edit(?![=])/.test(svg), 'no bare data-edit');
});

test('degenerate all-point model does not NaN', () => {
  const m = parse(`G\n  Fixed: stake 10, odds 50-50%, payoff 100-100`);
  const svg = renderBoard(m, simulate(m), CTX);
  assert.ok(!/NaN/.test(svg));
});

test('narrow relayout (<520) emits the stacked layout and keeps edit hooks', () => {
  const svg = renderBoard(model, sim, {...CTX, width: 390});
  assert.match(svg, /data-narrow=""/);
  assert.match(svg, /viewBox="0 0 390 /);
  assert.match(svg, /data-edit="odds"/);
  assert.match(svg, /data-menu=""/);      // slip-level card-menu hook for coarse pointers
});
