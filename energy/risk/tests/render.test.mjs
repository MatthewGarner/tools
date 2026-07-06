import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {simulate} from '../engine.js';
import {render, toMarkdown} from '../render.js';

const ctx = {colors: {card: '#fff', border: '#ddd', ink: '#222', muted: '#667',
  accent: '#C05621', bg: '#f7f8f6', err: '#b33', track: '#edf0ee',
  status: {done: '#1D7A3E', doing: '#0C7FAE', risk: '#9A6A00', blocked: '#B3403A'}},
  measure: t => t.length * 7};

const DOC = 'title: Route to market\nmerchant: 60..180\nfloor: 70 share 60% fee 5\ntoll: 95\ninsure: premium 6 attach 65 limit 30';
const svg = (opts = {}) => { const m = parse(DOC); return render(m, simulate(m), ctx, opts); };

test('renders one row per structure + merchant on a shared axis', () => {
  const out = svg();
  assert.ok(out.startsWith('<svg'));
  assert.ok(out.includes('Merchant') && out.includes('Floor 70 / 60%') &&
            out.includes('Toll 95') && out.includes('Insure @65'));
  assert.ok(out.includes('£k/MW/yr'));
});

test('edit mode marks every parameter with data-edit/line/raw/field', () => {
  const out = svg({edit: true});
  for(const f of ['level', 'share', 'fee', 'fixed', 'premium', 'attach', 'limit', 'merchantLo', 'merchantHi'])
    assert.ok(out.includes("data-field='" + f + "'"), 'missing field ' + f);
  assert.ok(out.includes("data-edit='num'") && out.includes("data-line='"), 'edit plumbing attrs');
  assert.ok(out.includes("data-focus='"), 'row focus targets');
});

test('verdict for the focused row appears; focus switches it', () => {
  assert.match(svg(), /The floor binds/);            // default focus = first structure
  assert.match(svg({focus: 2}), /The toll beats merchant/);
});

test('no diagram without merchant; markdown export carries the table + verdicts', () => {
  const m = parse('floor: 70');
  assert.equal(render(m, simulate(m), ctx), '');
  const full = parse(DOC);
  const md = toMarkdown(full, simulate(full));
  assert.match(md, /\| *Structure *\|/);
  assert.match(md, /The floor binds/);
});

test('every tag is well-formed XML (single-root, quoted attributes)', () => {
  const out = svg({edit: true});
  const TAG = /^<[a-zA-Z][\w:-]*((\s+[\w:-]+=("[^"<]*"|'[^'<]*'))*)\s*\/?>$/;
  for(const tag of out.match(/<[^!/][^>]*>/g) || [])
    assert.match(tag, TAG, 'malformed tag ' + tag.slice(0, 120));
});
