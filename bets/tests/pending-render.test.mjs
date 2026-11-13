/* The pending picture: every element whose value comes from the simulation carries data-mc (and nothing else does), a bet with no
   last result shows an ellipsis and no exposure bar, and nothing breaks with no last result at all. Both views, both layouts. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {simulate} from '../engine.js';
import {carrySim} from '../sim-memo.js';
import {renderBoard} from '../render.js';
import {renderQuadrant} from '../render-quadrant.js';
import {renderBetsPresentation} from '../render-presentation.js';
import {betsLarge} from '../../dev/feel-audit/stress-btp.mjs';

const COLORS = {ink: '#141b21', muted: '#5b6670', accent: '#c05621', accentInk: '#8e4a1e', bg: '#f7f8f6', card: '#ffffff', border: '#e2e5e1',
  err: '#b3403a', track: '#e7e9e5', status: {done: '#1d7a3e', doing: '#2b6cb0', risk: '#9a6a00', blocked: '#b3403a'},
  statusInk: {done: '#1c753c', doing: '#245e98', risk: '#8e6200', blocked: '#a83a34'}};
const measure = (s, font) => { const m = /(\d+(?:\.\d+)?)px/.exec(font || ''); return String(s).length * (m ? +m[1] : 12) * 0.55; };
const SRC = `title: T
unit: £k
G
  Alpha: stake 100, odds 40-60%, payoff 300-500
    kill: stop
  Beta: stake 50, odds 20-30%, payoff 100-200`;

const views = [['board', renderBoard], ['quadrant', renderQuadrant]];
const widths = [['wide', 900], ['narrow', 400]];
const tags = svg => [...svg.matchAll(/<(text|line|rect|g|circle)\b[^>]*data-mc=""[^>]*>(?:([^<]*)<\/text>)?/g)];

for(const [name, render] of views) for(const [layout, width] of widths){
  test(`${name} ${layout}: the figures carry data-mc, a new bet is an ellipsis with no bar`, () => {
    const before = parse(SRC), sim = simulate(before);
    const final = render(before, sim, {colors: COLORS, measure, width, intent: 'live'});
    assert.ok(tags(final).length > 0, 'the simulated figures are marked');
    const edited = parse(SRC.replace('  Beta:', '  Gamma: stake 10, odds 50%, payoff 30\n  Beta:'));
    const pendingSvg = render(edited, carrySim({model: before, sim}, edited), {colors: COLORS, measure, width, intent: 'live'});
    if(name === 'board'){
      assert.equal([...pendingSvg.matchAll(/<text[^>]*data-mc=""[^>]*>(?:EV )?…<\/text>/g)].length, layout === 'wide' ? 3 : 1, 'the new bet: ellipses in its figures');
      assert.equal((pendingSvg.match(/data-exposure-range/g) || []).length, 2, 'two bars: the two bets that have figures');
    } else assert.equal((pendingSvg.match(/data-allocation-mark=/g) || []).length, 2, 'the new bet has no bubble until its figures arrive');
    for(const t of tags(pendingSvg)) assert.ok(!/^(Alpha|Beta|Gamma|T)$/.test(t[2] || ''), 'names and the title are not marked: ' + t[0]);
  });
  test(`${name} ${layout}: with no last result at all it still draws, every bet pending`, () => {
    const model = parse(betsLarge()), pendingSvg = render(model, carrySim(null, model), {colors: COLORS, measure, width, intent: 'live'});
    assert.ok(pendingSvg.startsWith('<svg'));
    if(name === 'board') assert.ok(pendingSvg.includes('…'));
  });
}

test('the presentation slide carries nothing pending-related', () => {
  const model = parse(SRC), svg = renderBetsPresentation(model, simulate(model), {colors: COLORS, measure, intent: 'presentation'});
  assert.ok(!svg.includes('data-mc'));
});

test('exports (intent native) are the same drawing, marked; no dim style is in them', () => {
  const model = parse(SRC), svg = renderBoard(model, simulate(model), {colors: COLORS, measure, intent: 'native'});
  assert.ok(!/opacity="0?\.6"|data-sim/.test(svg));
});
