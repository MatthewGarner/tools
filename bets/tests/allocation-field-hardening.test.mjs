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
const source = `title: A deliberately long allocation review title that must stay whole in every live instrument\nG\n  Bet: stake 20, odds 30-50%, payoff 80-160\n    kill: ${Array.from({length: 42}, () => 'measured').join(' ')} END-KILL`;
const model = parse(source), sim = simulate(model);

test('live wide views measure authored titles and use unambiguous probability captions', () => {
  for(const render of [renderBoard, renderQuadrant]){
    const svg = render(model, sim, ctx);
    assert.ok((svg.match(/data-bets-title-line=""/g) || []).length >= 2,
      'a wide title must be measured rather than emitted as one unbounded text node');
  }
  const plane = renderQuadrant(model, sim, ctx);
  assert.match(plane, /LOW ODDS OF SUCCESS ≤ 10%/);
  assert.match(plane, /HIGH ODDS OF SUCCESS ≥ 90%/);
});

test('phone Board preserves long unbroken source and routes coarse editing through one menu plane', () => {
  const token = 'A'.repeat(116);
  const m = parse(`title: ${token}\nG\n  ${token}: stake 20, odds 30-50%, payoff 80-160\n    kill: ${Array.from({length: 42}, () => 'measured').join(' ')} END-KILL`);
  const svg = renderBoard(m, simulate(m), {...ctx, width: 390, edit: true, coarse: true});
  assert.ok((svg.match(/data-bets-title-line=""/g) || []).length >= 2,
    'a single unbroken title must be split at a measured character boundary');
  assert.match(svg, /END-KILL/, 'the final authored kill word remains visible');
  assert.doesNotMatch(svg, /data-edit="(?:name|stake|odds|payoff|kill)"/,
    'coarse editing is intentionally menu-first, not a cluster of undersized direct targets');
  const menuHits = [...svg.matchAll(/data-edit="cardmenu"[\s\S]*?<rect data-hit=""[^>]*width="([\d.]+)" height="([\d.]+)"/g)];
  assert.equal(menuHits.length, 1, 'each coarse row has one intentional menu plane');
  assert.ok(+menuHits[0][1] >= 44 && +menuHits[0][2] >= 44,
    'the coarse menu plane meets the 44px minimum in both dimensions');
});

test('Copy PNG either keeps every admitted source line with both portfolio rails or refuses', () => {
  const crowded = parse(`title: Dense field\nG\n  ${Array.from({length: 190}, () => 'position').join(' ')}: stake 20, odds 30-50%, payoff 80-160\n    kill: ${Array.from({length: 80}, () => 'criterion').join(' ')} END-KILL`);
  const svg = renderBetsPresentation(crowded, simulate(crowded), ctx);
  assert.match(svg, /data-bets-density-refusal=""/,
    'one over-height row cannot evict the factual portfolio ranges from a presentation field');

  const regular = renderBetsPresentation(model, sim, ctx);
  assert.match(regular, /END-KILL/, 'the complete measured kill text is retained');
  assert.equal((regular.match(/data-portfolio-exposure=""/g) || []).length, 2,
    'a normal plate always retains both named outcome ranges');
});

test('Copy PNG measures exception receipts and discloses the actual selection size', () => {
  const m = parse(`title: Receipts\nG\n  Invalid ${'x'.repeat(130)}: stake 10, odds 150%, payoff 30\n  Invalid ${'y'.repeat(130)}: stake 10, odds 150%, payoff 30\n  Invalid ${'z'.repeat(130)}: stake 10, odds 150%, payoff 30\n  Sound: stake 20, odds 30-50%, payoff 80-160`);
  const svg = renderBetsPresentation(m, simulate(m), ctx);
  const unscored = [...svg.matchAll(/<text data-bets-unscored-line="" x="96" y="([\d.]+)"[^>]*>([^<]*)<\/text>/g)];
  assert.ok(unscored.length >= 2,
    'three malformed positions wrap into measured receipt lines rather than one overflowing right-aligned string');
  for(const id of ['B01', 'B02', 'B03']) assert.match(unscored.map(line => line[2]).join(' '), new RegExp(id));
  const positionY = +(svg.match(/<text x="96" y="([\d.]+)"[^>]*>POSITION<\/text>/) || [])[1];
  assert.ok(Math.max(...unscored.map(line => +line[1])) < positionY - 20,
    'measured malformed-source receipts reserve a quiet gap before the table header');
  assert.match(svg, /1-POSITION SELECTION/);
});

test('Copy PNG refuses an all-unscored receipt before its source facts leave the plate', () => {
  const m = parse(`title: Invalid allocation inventory\nG\n${Array.from({length: 80}, (_, i) =>
    '  Invalid position ' + String(i + 1).padStart(2, '0') + ' ' + 'unbroken-source-fact-'.repeat(9) +
    ': stake 10, odds 150%, payoff 30').join('\n')}`);
  const svg = renderBetsPresentation(m, simulate(m), ctx);
  assert.match(svg, /data-bets-density-refusal=""/,
    'a measured all-unscored receipt must refuse before it can pass the 16:9 footer');
  assert.doesNotMatch(svg, /<text[^>]*>POSITION<\/text>/,
    'a refusal contains no table header beyond the physical plate');
});
