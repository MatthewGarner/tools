import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {renderBoardLive} from '../render-board.js';

/* extracts the px size out of a font string like '700 18px ...' — a bare
   parseInt(f) grabs the LEADING number, which is the font-WEIGHT (e.g. 700),
   not the size, and makes every word wrap onto its own line */
const measure = (s, f) => (s ? s.length : 0) * (parseInt((String(f).match(/(\d+)px/) || [])[1], 10) || 12) * 0.55;
const ctx = {colors: {bg: '#fff', ink: '#111', muted: '#666', border: '#ccc', card: '#fff', accent: '#c05621',
  err: '#c00', status: {risk: '#c05621', blocked: '#c00', doing: '#2b6'}, statusInk: {risk: '#a03', blocked: '#900'}},
  measure, dark: false, today: '2026-07-04'};
const doc = 'title: Habitat board\ndate: 2026-07-04\nNOW\nCore: Streak freeze [doing] -- ship first\nGrowth: Widget gallery\nNEXT\nLATER\nCore: Coach marketplace';

test('edit:false emits ZERO edit markup (the export/golden path)', () => {
  const svg = renderBoardLive(parse(doc), {...ctx, edit: false});
  for(const attr of ['data-edit', 'data-hit', 'data-hdrop', 'data-menu', 'data-key'])
    assert.ok(!svg.includes(attr), 'edit:false must not emit ' + attr);
  assert.ok(svg.includes('Streak freeze'));           // still renders the content
});

test('edit:true emits a cardmenu group with data-line + data-key per item', () => {
  const m = parse(doc);
  const svg = renderBoardLive(m, {...ctx, edit: true});
  const it = m.items.find(i => i.title === 'Streak freeze');
  assert.ok(svg.includes('data-edit="cardmenu" data-line="' + it.srcLine + '"'));
  assert.ok(svg.includes('data-key="streak freeze"'));
  assert.ok(/data-edit="title" data-line="\d+" data-raw="Streak freeze"/.test(svg));
});

test('edit:true emits a data-hdrop band per horizon and a +add per column', () => {
  const m = parse(doc);
  const svg = renderBoardLive(m, {...ctx, edit: true});
  for(let h = 0; h < m.horizons.length; h++)
    assert.ok(svg.includes('data-hdrop="' + h + '"'), 'band for horizon ' + h);
  assert.ok(svg.includes('data-edit="additem"') && svg.includes('data-col="Later"'));  // empty col too
});

test('the lane tag is an edit target; an item without a lane still gets an add-lane target', () => {
  const m = parse('NOW\nCore: Has lane\nUnlaned item');
  const svg = renderBoardLive(m, {...ctx, edit: true});
  assert.ok(/data-edit="lane" data-line="\d+" data-raw="Core"/.test(svg));
  assert.ok(/data-edit="lane" data-line="\d+" data-raw=""/.test(svg));   // add-lane ghost
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
