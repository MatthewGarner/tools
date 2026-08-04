import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {simulate} from '../engine.js';
import {BOARD_LEDGER_THRESHOLD, boardPlan, measuredLines, presentationSelection, sourceBets} from '../layout.js';

const measure = (s, font) => { const m = /(\d+(?:\.\d+)?)px/.exec(font || ''); return String(s).length * (m ? +m[1] : 12) * 0.55; };

const denseSource = count => `title: Dense book\nunit: £k\nPortfolio\n` +
  Array.from({length: count}, (_, i) => `  Bet ${i + 1}: stake ${10 + i}, odds 30-50%, payoff ${40 + i}-${80 + i}`).join('\n');

test('source-order display IDs are stable render data and do not mutate parsed bets', () => {
  const model = parse(denseSource(12));
  const records = sourceBets(model, simulate(model));
  assert.equal(records[0].id, 'B01');
  assert.equal(records[11].id, 'B12');
  assert.equal(records[5].sourceOrder, 6);
  assert.equal('id' in model.groups[0].bets[0], false, 'display ID never becomes model state');
});

test('board switches to the exhaustive ledger only above eight bets', () => {
  const at = parse(denseSource(BOARD_LEDGER_THRESHOLD));
  const over = parse(denseSource(BOARD_LEDGER_THRESHOLD + 1));
  assert.equal(boardPlan(at, simulate(at), {measure}).mode, 'board');
  const plan = boardPlan(over, simulate(over), {measure});
  assert.equal(plan.mode, 'ledger');
  assert.equal(plan.rows.length, BOARD_LEDGER_THRESHOLD + 1);
});

test('board rows grow for long names and stacked audits instead of shrinking type', () => {
  const model = parse(`G\n  A deliberately long position name that needs several measured lines: stake 10, odds 95-100%, payoff 1-2`);
  const plan = boardPlan(model, simulate(model), {measure, nameWidth: 90});
  assert.ok(plan.rows[0].nameLines.length > 2);
  assert.ok(plan.rows[0].rec.audits.length >= 2);
  assert.ok(plan.rows[0].height > 48);
  for(const line of plan.rows[0].nameLines) assert.ok(measure(line, '600 13px sans-serif') <= 90.01);
});

test('measuredLines breaks a single long token so it cannot invade the numeric strip', () => {
  const lines = measuredLines('Supercalifragilisticexpialidocious', '600 13px sans-serif', 60, measure);
  assert.ok(lines.length > 1);
  for(const line of lines) assert.ok(measure(line, '600 13px sans-serif') <= 60.01);
});

test('presentation selection is stake upper bound, then |P50 EV|, then source order', () => {
  const model = parse(`G\n  First tie: stake 10-100, odds 50%, payoff 10\n  Larger EV: stake 20-100, odds 50%, payoff 10\n  Highest stake: stake 2-120, odds 50%, payoff 10\n  Lower stake: stake 90, odds 50%, payoff 10`);
  const bets = model.groups[0].bets;
  const sim = {bets: new Map([
    [bets[0].srcLine, {ev: {p50: 40}, audits: []}],
    [bets[1].srcLine, {ev: {p50: -80}, audits: []}],
    [bets[2].srcLine, {ev: {p50: 1}, audits: []}],
    [bets[3].srcLine, {ev: {p50: 999}, audits: []}],
  ])};
  const names = presentationSelection(model, sim, 4).selected.map(r => r.b.name);
  assert.deepEqual(names, ['Highest stake', 'Larger EV', 'First tie', 'Lower stake']);
});
