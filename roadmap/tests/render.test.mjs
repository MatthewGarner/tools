import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {render} from '../render.js';

const ctx = (extra = {}) => ({
  colors: {card:'#fff',border:'#ddd',ink:'#222',muted:'#667',accent:'#08c',accentInk:'#067',bg:'#f7f8f6',
    err:'#b33', status:{done:'#1D7A3E',doing:'#0C7FAE',risk:'#9A6A00',blocked:'#B3403A'},
    statusInk:{done:'#1C753C',doing:'#0B709A',risk:'#8E6200',blocked:'#B3403A'}},
  measure: (t) => t.length * 7,
  ...extra,
});

test('svg has dims, no NaN, legend for used statuses', () => {
  const m = parse('title: T\nNOW\nA: one [doing]\nNEXT\nB: two [risk]');
  const svg = render(m, ctx());
  assert.match(svg, /width="\d+" height="\d+"/);
  assert.ok(!svg.includes('NaN'));
  assert.ok(svg.includes('IN PROGRESS') && svg.includes('AT RISK'));
});

test('XML escaping in titles', () => {
  const m = parse('NOW\nA & B <critical> item');
  assert.ok(render(m, ctx()).includes('A &amp; B &lt;critical&gt;'));
});

test('long titles wrap and grow the layout', () => {
  const short = parse('NOW\nX: tiny');
  const long = parse('NOW\nX: an extremely long initiative title that will definitely need to wrap across several lines of the card to fit');
  const hOf = m => +render(m, ctx()).match(/height="(\d+)"/)[1];
  assert.ok(hOf(long) > hOf(short));
});

test('confidence fade on later columns; fade: off disables', () => {
  const faded = parse('NOW\na\nNEXT\nb\nLATER\nc');
  assert.ok(render(faded, ctx()).includes('opacity="0.65"'));
  const flat = parse('fade: off\nNOW\na\nNEXT\nb\nLATER\nc');
  assert.ok(!render(flat, ctx()).includes('opacity="0.'));
});

test('WIP overload flag renders on first column', () => {
  const m = parse('NOW\n' + Array.from({length:8}, (_, i) => 'item ' + i).join('\n') + '\nNEXT\nx');
  assert.ok(render(m, ctx()).includes('8 ITEMS'));
});

test('diff badges, dropped strip, legend key', () => {
  const cur = parse('NOW\nA: brand new thing\nA: moved thing\nNEXT\nA: stayed put');
  const diff = {
    badge: it => it.title === 'brand new thing' ? {kind:'new', label:'New'} :
                 it.title === 'moved thing' ? {kind:'moved', label:'was Next'} : null,
    dropped: ['old abandoned thing'],
    since: '2026-06-01',
    any: true,
  };
  const svg = render(cur, ctx({diff}));
  assert.ok(svg.includes('>NEW<'));
  assert.ok(svg.includes('WAS NEXT'));
  assert.ok(svg.includes('DROPPED SINCE 2026-06-01'));
  assert.ok(svg.includes('old abandoned thing'));
  assert.ok(svg.includes('line-through'), 'dropped items struck through');
});

test('slide mode scales wider', () => {
  const m = parse('NOW\nA: one\nNEXT\nB: two');
  const wOf = svg => +svg.match(/width="(\d+)"/)[1];
  assert.ok(wOf(render(m, ctx({slide: true}))) > wOf(render(m, ctx())));
});

test('cards carry data-line for drag targeting', () => {
  const m = parse('NOW\nA: item one');
  assert.match(render(m, ctx()), /<g[^>]* data-line="1"/);
});

test('non-ghost cards carry data-edit="cardmenu" on the group and data-hit="" on the background rect; ghosts carry neither', () => {
  const m = parse('NOW\nA: item one\nNEXT\nB: item two');
  m.items[1].ghost = true;   // synthetic ghost, as why/render-map.js produces
  const svg = render(m, ctx());
  assert.match(svg, /<g data-edit="cardmenu" data-line="1"[^>]*><rect data-hit=""/);
  const ghostGroup = svg.match(/<g[^>]*data-line="\d+"[^>]*>(?:(?!<g).)*stroke-dasharray="3 3"/s);
  assert.ok(ghostGroup, 'expected a dashed (ghost) card in the output');
  assert.ok(!ghostGroup[0].includes('data-edit="cardmenu"'), 'ghost card group must not carry cardmenu');
  assert.ok(!ghostGroup[0].includes('data-hit=""'), 'ghost card rect must not carry data-hit');
});

test('8-column generated view renders wider than 3-column', () => {
  const wide = parse('horizons: monthly from Jan 2027 x8\nJan 2027\nA: x');
  const norm = parse('NOW\nA: x');
  const wOf = m => +render(m, ctx()).match(/width="(\d+)"/)[1];
  assert.ok(wOf(wide) > wOf(norm));
});

test('palette resolves per theme; accent overrides; names consistent with parse', async () => {
  const {PALETTES} = await import('../render.js');
  const {PALETTE_NAMES} = await import('../parse.js');
  assert.deepEqual(Object.keys(PALETTES).sort(), [...PALETTE_NAMES].sort());
  const m = parse('palette: ember\nNOW\nA: x\nNEXT\nB: y');
  const emberSvg = render(m, ctx());
  assert.ok(emberSvg.includes('#C05621'), 'ember light in header bar');
  assert.ok(emberSvg.includes('#f3ede8') && emberSvg.includes('#fefcfb'),
    'palette washes background and tints cards');
  assert.ok(!emberSvg.includes('#f7f8f6'), 'ctx bg fully replaced');
  assert.ok(render(m, ctx({dark: true})).includes('#C97A35'), 'ember dark variant');
  const m2 = parse('accent: #123ABC\npalette: plum\nNOW\nA: x\nNEXT\nB: y');
  const svg2 = render(m2, ctx());
  assert.ok(svg2.includes('#123ABC') && !svg2.includes('#9D3E78'), 'accent beats palette');
});

test('unknown palette warns and keeps ocean', () => {
  const m = parse('palette: neon\nNOW\nA: x');
  assert.equal(m.palette, 'ocean');
  assert.ok(m.warnings.some(w => w.includes('neon')));
});

test('cell hit rects: one per lane x horizon with data-cell coords', () => {
  const m = parse('NOW\nCore: a\nGrowth: b\nNEXT\nCore: c\nLATER\nplain');
  const svg = render(m, ctx());
  const rects = svg.match(/data-cell="[^"]*"/g);
  // 3 lanes (Core, Growth, '') x 3 horizons
  assert.equal(rects.length, 9);
  assert.ok(svg.includes('data-cell="1|Core"'));
  assert.ok(svg.includes('data-cell="2|"'), 'laneless cell addressable');
});

test('linked items render an anchor with escaped href and marker', () => {
  const m = parse('NOW\nCore: Linked item -> https://x.io/a?b=1&c=2\nNEXT\ny');
  const svg = render(m, ctx());
  assert.ok(svg.includes('<a href="https://x.io/a?b=1&amp;c=2" target="_blank" rel="noopener">'));
  assert.ok(svg.includes('↗'));
  const plain = render(parse('NOW\nCore: No link\nNEXT\ny'), ctx());
  assert.ok(!plain.includes('<a '));
});
