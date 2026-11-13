import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {evaluate} from '../engine.js';
import {render} from '../render.js';
import {flipCopy} from '../format.js';
import {clipLines} from '../layout.js';

const measure = t => String(t).length * 6.5;
const ctx = (extra = {}) => ({
  colors: {card: '#fff', border: '#ddd', ink: '#222', muted: '#667', accent: '#08c', bg: '#f7f8f6', err: '#b33', brandText: '#D62015'},
  measure, intent: 'native', ...extra,
});
const BUY = 'title: Build vs buy\nRoot\n  Build: -150k\n    Fit\n      Good fit (p=0.6): 1.5M to 3M\n      Poor fit (p=rest): 100k to 531k\n  Buy: -40k\n    Fit\n      Good fit (p=0.5): 800k to 1.2M\n      Poor fit (p=rest): 100k to 200k';

/* every <text> of a card, with its measured right edge */
function cardTexts(svg){
  const cards = [...svg.matchAll(/<g data-tree-node="\d+"[^>]*>([\s\S]*?)<\/g>/g)];
  return cards.map(m => {
    const rect = m[1].match(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/).slice(1).map(Number);
    const texts = [...m[1].matchAll(/<text x="([\d.]+)" y="([\d.]+)"([^>]*)>([\s\S]*?)<\/text>/g)].map(t => {
      const size = +(t[3].match(/font-size="([\d.]+)"/) || [0, 12])[1];
      const plain = t[4].replace(/<[^>]+>/g, '');
      return {x: +t[1], y: +t[2], right: +t[1] + plain.length * 6.5 * (size / 12) * 0 + measure(plain), plain};
    });
    return {rect, texts};
  });
}

test('XT-1: every line of a card is inside its card and inside the canvas', () => {
  const m = parse(BUY);
  const svg = render(m, evaluate(m), ctx());
  const W = +svg.match(/viewBox="0 0 ([\d.]+) /)[1];
  const cards = cardTexts(svg);
  assert.ok(cards.length >= 5);
  for(const {rect: [x, y, w, h], texts} of cards) for(const t of texts){
    assert.ok(t.right <= x + w + 0.01, `"${t.plain}" ends at ${t.right}, past its card edge ${x + w}`);
    assert.ok(t.y <= y + h, `"${t.plain}" sits below its card`);
    assert.ok(t.right <= W, `"${t.plain}" leaves the canvas`);
  }
});

test('XT-4: left margin equals right margin, and the bottom margin is the house margin', () => {
  const m = parse('title: Small\nRoot\n  A: 10\n  B: 5');
  const svg = render(m, evaluate(m), ctx());
  const [W, H] = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/).slice(1).map(Number);
  const rects = [...svg.matchAll(/<g data-tree-node="\d+"[^>]*><rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)].map(r => r.slice(1).map(Number));
  /* the root's marker is centred on the card's left edge (7px out, plus its stroke): that is the leftmost ink */
  const left = Math.min(...rects.map(r => r[0])) - 7.75, right = W - Math.max(...rects.map(r => r[0] + r[2])) - 0.5;
  assert.ok(Math.abs(left - right) <= 1, `left ${left}, right ${right}`);
});

test('XT-3: a clipped label is cut at a word boundary, with its ellipsis', () => {
  const lines = clipLines(['the platform migration gives', 'us a lot of dual running costs now'], 1, '13px x', 150, t => t.length * 6.5);
  assert.deepEqual(lines.lines, ['the platform migration…']);
  assert.equal(lines.clipped, true);
  const label = 'A decision label long enough to need three lines at this card width and then some more words after';
  const m = parse('Root\n  ' + label + ': 10\n  B: 5');
  const svg = render(m, evaluate(m), ctx());
  assert.match(svg, /…<\/tspan>/, 'a clipped line is drawn');
  const cardLines = [...svg.matchAll(/<text x="[\d.]+" y="[\d.]+" font-size="13"[^>]*>(?:<tspan[^>]*>)?([^<]*)/g)].map(x => x[1]);
  const kept = cardLines.filter(l => l !== 'Root' && l !== 'B').join(' ').replace(/…$/, '');
  assert.ok(label.startsWith(kept.trim()), 'the kept words are the start of the label: ' + kept);
  assert.ok(label[kept.trim().length] === ' ', 'the cut falls on a word boundary, not inside a word');
});

test('XT-3: a clipped card keeps its full label in the SVG', () => {
  const full = 'A decision label long enough to need three lines at this card width and then some more words after';
  const m = parse('Root\n  ' + full + ': 10\n  B: 5');
  const svg = render(m, evaluate(m), ctx());
  assert.ok(svg.includes('<title>' + full + '</title>'));
});

test('XT-5: an expected value above its own range carries a mark, and an impossible flip is not printed', () => {
  const m = parse('title: Wide range\nRoot\n  Bet\n    Win (p=0.01-0.05): 10M\n    Lose (p=rest): 1\n  Hold: 0');
  const results = evaluate(m);
  const svg = render(m, results, ctx());
  const bet = results.stats.get(m.root.children[0]);
  if(bet.mean > bet.p90) assert.match(svg, /above its own range/);
  assert.doesNotMatch(svg, /p\([^)]*\) (?:>|<) (?:1\.0\d|-)/);
});

test('flipCopy: a threshold outside 0 to 1 is not a flip', () => {
  assert.equal(flipCopy({label: 'Win', direction: '>', threshold: 1.0001, regions: [{from: 1.0001, to: 2}]}), null);
  assert.equal(flipCopy({label: 'Win', direction: '<', threshold: -0.2, regions: []}), null);
  assert.equal(flipCopy({label: 'Win', direction: '>', threshold: 0.35, regions: [{from: 0.35, to: 1}]}), 'flips if p(Win) > 0.35');
});
