import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {simulate} from '../engine.js';
import {renderBoard} from '../render.js';
import {renderQuadrant} from '../render-quadrant.js';
import {renderBetsPresentation} from '../render-presentation.js';

const colors = {ink: '#141b21', muted: '#5b6670', accent: '#2855c7', accentInk: '#2047a6',
  bg: '#f7f8f6', card: '#ffffff', border: '#d8dcd8', err: '#ad3e37', track: '#e7e9e5',
  status: {risk: '#9a6a00'}};
const measure = (s, font) => {
  const px = /(\d+(?:\.\d+)?)px/.exec(font || '');
  return String(s).length * (px ? +px[1] : 12) * 0.55;
};
const ctx = {colors, measure};
const source = `title: Allocation review\nunit: £k\nGrowth\n  Referral flow v2: stake 80, odds 40-60%, payoff 300-500\n    kill: Signups per referral stay under 0.3 by 2026-09-15\n  Paid acquisition push: stake 220, odds 15-25%, payoff 150-300\n    kill: CAC exceeds £40 for two consecutive months\nPlatform\n  Sync engine rewrite: stake 150, odds 90-98%, payoff 180-260\n  Publisher storefront pilot: stake 60, odds 15-25%, payoff 250-450\n    kill: Fewer than 20 publishers onboarded by 2026-10-01\n  E-reader sync: stake 60, odds 30-40%, payoff 150-280\n    kill: No retail partner signed by 2026-11-01`;
const model = parse(source), sim = simulate(model);

test('Allocation Field Board is one continuous exposure ledger, not a card stack', () => {
  const svg = renderBoard(model, sim, ctx);
  assert.match(svg, /data-bets-surface="allocation-field"/);
  assert.equal((svg.match(/data-exposure-range=""/g) || []).length, 5,
    'each priced position owns one range on the shared exposure scale');
  assert.equal((svg.match(/data-exposure-median=""/g) || []).length, 5,
    'each position has one median notch');
  assert.equal((svg.match(/data-condition-receipt=""/g) || []).length, 2,
    'the two portfolio conditions are factual receipts, not summary cards');
  assert.doesNotMatch(svg, /data-bet-card=/);
});

test('Allocation Field Board retains every position at density and keeps the quiet phone register', () => {
  const dense = parse('Portfolio\n' + Array.from({length: 12}, (_, i) =>
    `  Position ${i + 1}: stake ${20 + i}, odds 30-50%, payoff ${80 + i}-${160 + i}`).join('\n'));
  const wide = renderBoard(dense, simulate(dense), ctx);
  const phone = renderBoard(model, sim, {...ctx, width: 390, edit: true});
  assert.equal((wide.match(/data-exposure-range=""/g) || []).length, 12);
  for(let i = 1; i <= 12; i++) assert.match(wide, new RegExp('Position ' + i));
  assert.match(phone, /data-bets-surface="allocation-field"/);
  assert.equal((phone.match(/data-exposure-range=""/g) || []).length, 5);
  assert.doesNotMatch(phone, /data-bet-card=/);
});

test('phone Allocation Field and Plane preserve a long authored title by wrapping it into the instrument', () => {
  const long = parse('title: A deliberately long allocation review title that must remain legible on a narrow instrument\nG\n  Bet: stake 20, odds 30-50%, payoff 80-160');
  for(const render of [renderBoard, renderQuadrant]){
    const svg = render(long, simulate(long), {...ctx, width: 390});
    assert.ok((svg.match(/data-bets-title-line=""/g) || []).length >= 2);
    for(const word of ['deliberately', 'allocation', 'instrument']) assert.match(svg, new RegExp(word));
  }
});

test('Allocation Plane retains the shared scenario receipts and allocates one geometric mark per bet', () => {
  const svg = renderQuadrant(model, sim, ctx);
  assert.match(svg, /data-bets-surface="allocation-plane"/);
  assert.match(svg, /data-allocation-zero=""/);
  assert.equal((svg.match(/data-allocation-mark=""/g) || []).length, 5);
  assert.equal((svg.match(/data-condition-receipt=""/g) || []).length, 2);
  assert.equal((svg.match(/data-zone/g) || []).length, 0,
    'risk and certainty are factual rules, never shaded dashboard regions');
  assert.ok((svg.match(/data-allocation-guide=""/g) || []).length >= 3,
    'quiet probability guides carry the plane without a boxed grid');
});

test('16:9 Allocation Field export is a single legible instrument, not a selected-card grid', () => {
  const svg = renderBetsPresentation(model, sim, ctx);
  assert.match(svg, /data-bets-surface="allocation-field-presentation"/);
  assert.equal((svg.match(/data-exposure-range=""/g) || []).length, 5);
  assert.equal((svg.match(/data-condition-receipt=""/g) || []).length, 2);
  assert.equal((svg.match(/data-portfolio-exposure=""/g) || []).length, 2,
    'the presentation closes with the two portfolio ranges rather than unused slide space');
  assert.doesNotMatch(svg, /data-bet-card=/);
  for(const name of ['Referral flow v2', 'Paid acquisition push', 'Sync engine rewrite', 'Publisher storefront pilot', 'E-reader sync'])
    assert.match(svg, new RegExp(name));
});
