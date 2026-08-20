import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {renderBoardLive} from '../render-board.js';

/* extracts the px size out of a font string like '700 18px ...' — a bare
   parseInt(f) grabs the LEADING number, which is the font-WEIGHT (e.g. 700),
   not the size, and makes every word wrap onto its own line */
const measure = (s, f) => (s ? s.length : 0) * (parseInt((String(f).match(/(\d+)px/) || [])[1], 10) || 12) * 0.55;
const ctx = {colors: {bg: '#fff', ink: '#111', muted: '#666', border: '#ccc', card: '#fff', accent: '#c05621',
  err: '#c00', status: {risk: '#c05621', blocked: '#c00', doing: '#2b6', done: '#187a46'}, statusInk: {risk: '#a03', blocked: '#900', done: '#17663d'}},
  measure, dark: false, today: '2026-07-04'};
const doc = 'title: Lantern board\ndate: 2026-07-04\nNOW\nCore: Resume where you left off [doing] -- ship first\nGrowth: Widget gallery\nNEXT\nLATER\nCore: Publisher storefront';

test('edit:false emits ZERO edit markup (the export/golden path)', () => {
  const svg = renderBoardLive(parse(doc), {...ctx, edit: false});
  for(const attr of ['data-edit', 'data-hit', 'data-hdrop', 'data-menu', 'data-key'])
    assert.ok(!svg.includes(attr), 'edit:false must not emit ' + attr);
  assert.ok(svg.includes('Resume where you left off'));           // still renders the content
});

test('edit:true emits a cardmenu group with data-line + data-key per item', () => {
  const m = parse(doc);
  const svg = renderBoardLive(m, {...ctx, edit: true});
  const it = m.items.find(i => i.title === 'Resume where you left off');
  assert.ok(svg.includes('data-edit="cardmenu" data-line="' + it.srcLine + '"'));
  assert.ok(svg.includes('data-key="resume where you left off"'));
  assert.ok(/data-edit="title" data-line="\d+" data-raw="Resume where you left off"/.test(svg));
});

test('edit:true emits a data-hdrop band per horizon and a +add per column', () => {
  const m = parse(doc);
  const svg = renderBoardLive(m, {...ctx, edit: true});
  for(let h = 0; h < m.horizons.length; h++)
    assert.ok(svg.includes('data-hdrop="' + h + '"'), 'band for horizon ' + h);
  assert.ok(svg.includes('data-edit="additem"') && svg.includes('data-col="Later"'));  // empty col too
});

test('each Board commitment is an open ledger row with a closing rule', () => {
  const svg = renderBoardLive(parse(doc), {...ctx, edit: true});
  assert.doesNotMatch(svg, /data-board-field=""/, 'horizons remain open rather than becoming pale wells');
  assert.match(svg, /stroke-width="1" opacity="0\.7"/, 'a single hairline closes each commitment row');
});

test('the lane tag is an edit target; missing facts have hover-revealed, real add targets', () => {
  const m = parse('NOW\nCore: Has lane\nUnlaned item');
  const svg = renderBoardLive(m, {...ctx, edit: true});
  assert.ok(/data-edit="lane" data-line="\d+" data-raw="Core"/.test(svg));
  assert.ok(/data-edit="lane" data-line="\d+" data-raw=""/.test(svg));   // add-lane ghost
  assert.match(svg, /data-empty-control=""[^>]*>SET LANE<\/text>/);
  assert.match(svg, /data-empty-control=""[^>]*>SET STATUS<\/text>/);
  assert.doesNotMatch(svg, /data-edit="(?:lane|status)"[^>]*width="1"/, 'the controls have a usable text target');
});

test('the drop band is painted BEFORE its cards (z-order: under, so clicks reach the cards)', () => {
  const m = parse('NOW\nCore: Alpha');
  const svg = renderBoardLive(m, {...ctx, edit: true});
  assert.ok(svg.indexOf('data-hdrop="0"') < svg.indexOf('data-edit="cardmenu"'),
    'band must precede the card group in source order');
});

test('height is content-driven (no fixed 1080) and width grows with horizon count', () => {
  // parse() always yields >=2 horizons (DEFAULT_HORIZONS has 3, and a
  // `horizons:` line needs 2-8 names) — 'NOW\nA' still carries all 3 default
  // horizons even though only one header is used, so this compares an
  // explicit 5-horizon doc against an explicit 2-horizon one instead.
  const w5 = +renderBoardLive(parse('horizons: A, B, C, D, E\nA\nItem'), {...ctx, edit: true}).match(/width="(\d+)"/)[1];
  const w2 = +renderBoardLive(parse('horizons: A, B\nA\nItem'), {...ctx, edit: true}).match(/width="(\d+)"/)[1];
  assert.ok(w5 > w2, 'more horizons → wider board');
  const h = +renderBoardLive(parse('NOW\nA'), {...ctx, edit: true}).match(/height="(\d+)"/)[1];
  assert.ok(h > 0 && h !== 1080, 'content height, not the slide 1080');
});

test('long live Board cards retain every title and note word by growing', () => {
  const long = 'A deliberately long Board title that must retain its final source words rather than quietly becoming an ellipsis';
  const note = 'The supporting note also stays complete through its final verification detail.';
  const shortH = +renderBoardLive(parse('style: board\nNOW\nCore: Short'), {...ctx, edit:true}).match(/height="(\d+)"/)[1];
  const svg = renderBoardLive(parse('style: board\nNOW\nCore: ' + long + ' -- ' + note), {...ctx, edit:true});
  assert.ok(+svg.match(/height="(\d+)"/)[1] > shortH);
  for(const word of ['final', 'words', 'verification', 'detail']) assert.match(svg, new RegExp(word));
  assert.doesNotMatch(svg, /…/);
});

test('a long lane and run wrap before they can collide with a right-aligned status', () => {
  const m = parse(`style: board
horizons: quarterly from Q1 2026 x3
Q1 2026
An unusually long delivery lane name: Long-running commitment [doing] x3`);
  m.horizons = ['First planning horizon', 'Second planning horizon', 'Third planning horizon'];
  const svg = renderBoardLive(m, {...ctx, edit:true, boardColumnWidth:260});
  assert.match(svg, /RUNS/, 'the span remains an explicit factual line');
  assert.match(svg, /THIRD PLANNING HORIZON/, 'the true end remains present rather than clipped');
  assert.equal((svg.match(/data-edit="lane"/g) || []).length, 1, 'the wrapped detail has one canonical lane edit target');
  assert.match(svg, />IN PROGRESS</, 'status remains independently legible');
  assert.doesNotMatch(svg, /fill="undefined"/);
});

test('an unlaned span keeps its run factual and offers lane assignment separately', () => {
  const svg = renderBoardLive(parse(`style: board
horizons: quarterly from Q1 2026 x2
Q1 2026
Sync engine rewrite x2`), {...ctx, edit:true});
  assert.match(svg, />RUNS Q1 2026 – Q2 2026<\/text>/, 'the span is visibly explicit');
  assert.doesNotMatch(svg, /data-edit="lane"[^>]*>RUNS/, 'the factual run is never a lane editor');
  assert.match(svg, /data-empty-control=""[^>]*>SET LANE<\/text>/, 'the missing authoring field has its own quiet target');
});

test('a windowed Board header keeps its count and WIP state attached to its source horizon', () => {
  const m = parse(`style: board
wip: 1
horizons: A, B, C
A
Core: One [bet: experiment]
Growth: Two
B
Growth: Conditional [if experiment]
C
Core: Later`);
  const svg = renderBoardLive(m, {...ctx, edit: true, boardWindow: {indices: [1]}});
  assert.match(svg, />B<\/text>/, 'the visible column is the selected source horizon');
  assert.match(svg, />1<\/text>/, 'the total comes from B, not the first visible slot');
  assert.doesNotMatch(svg, /OVER WIP/, 'A being over WIP cannot leak into B');
});
