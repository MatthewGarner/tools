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

test('narrow + edit: per-structure ⋯ menus, title Rename targets, ＋ Add structure; wide/non-edit stay clean', () => {
  const m = parse(DOC);
  const narrow = render(m, simulate(m), {...ctx, width: 360}, {edit: true, focus: null});
  // three structures get a ⋯ card menu carrying their kind; merchant does NOT
  assert.equal((narrow.match(/data-edit="cardmenu"/g) || []).length, 3, 'three structure ⋯ menus (not merchant)');
  for(const k of ['floor', 'toll', 'insure']) assert.ok(narrow.includes('data-kind="' + k + '"'), 'menu for ' + k);
  assert.ok(narrow.includes('data-menu=""'), 'card menu entry point');
  // rename targets on the structure titles (3, one per structure)
  assert.equal((narrow.match(/data-edit='label'/g) || []).length, 3, 'three Rename targets');
  // one ＋ Add structure picker capsule
  assert.equal((narrow.match(/data-edit="addleg"/g) || []).length, 1, 'one Add-structure capsule');
  // the golden paths carry NONE of this
  assert.ok(!render(m, simulate(m), {...ctx, width: 360}).includes('data-edit'), 'narrow non-edit stays clean');
  const wideEdit = render(m, simulate(m), ctx, {edit: true, focus: 2});
  assert.ok(!wideEdit.includes('data-menu') && !wideEdit.includes('data-edit="addleg"') && !wideEdit.includes("data-edit='label'"),
    'wide edit (the golden path) has no card menu / capsule / rename');
});

test('every tag is well-formed XML (single-root, quoted attributes)', () => {
  const out = svg({edit: true});
  const outN = render(parse(DOC), simulate(parse(DOC)), {...ctx, width: 360}, {edit: true, focus: null});
  const TAG = /^<[a-zA-Z][\w:-]*((\s+[\w:-]+=("[^"<]*"|'[^'<]*'))*)\s*\/?>$/;
  for(const src of [out, outN])
    for(const tag of src.match(/<[^!/][^>]*>/g) || [])
      assert.match(tag, TAG, 'malformed tag ' + tag.slice(0, 120));
});
