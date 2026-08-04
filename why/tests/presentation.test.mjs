import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {project} from '../project.js';
import {renderMap} from '../render-map.js';
import {renderOst} from '../render-ost.js';
import {selectWhyPresentation, renderWhyPresentation} from '../render-presentation.js';

const measure = text => String(text || '').length * 7;
const colors = {card:'#fff',border:'#ddd',ink:'#222',muted:'#667',accent:'#08c',accentInk:'#067',bg:'#f7f8f6',
  err:'#b33',status:{done:'#1D7A3E',doing:'#0C7FAE',risk:'#9A6A00',blocked:'#B3403A'},
  statusInk:{done:'#1C753C',doing:'#0B709A',risk:'#8E6200',blocked:'#B3403A'}};
const ctx = {measure, colors, today:'2026-08-04'};

const DOC = `title: Dense discovery review
outcome: First outcome
  Short need
    Short fix [testing]
  Deeper need
    Nested need
      Deepest fix [delivering]
        ? critical belief [testing]
outcome: Second outcome
  Need two
    Fix two [delivering]
outcome: Third outcome
  Need three
outcome: A fourth outcome with a deliberately long label that must remain inside measured map bounds
  Need four
    Fix four [testing]`;

test('OST presentation deterministically selects first outcome and deepest solution chain', () => {
  const model = parse(DOC);
  const selection = selectWhyPresentation(model);
  assert.deepEqual(selection.path.map(n => n.label), ['First outcome','Deeper need','Nested need','Deepest fix']);
  assert.ok(selection.omitted > 0);
  const svg = renderWhyPresentation(model, ctx);
  assert.match(svg, /width="1920" height="1080"/);
  assert.ok(svg.includes('SHOWING OUTCOME 1 OF 4'));
  assert.ok(svg.includes('DEEPEST SOLUTION CHAIN'));
  assert.ok(!svg.includes('data-edit='));
});

test('dense native OST stacks and indexes outcomes; wrapped fields expose one canonical edit target', () => {
  const model = parse(DOC);
  const svg = renderOst(model, project(model), {...ctx, edit:true});
  for(const id of ['O01','O02','O03','O04']) assert.ok(svg.includes('data-outcome-id="' + id + '"'));
  const first = model.outcomes[3];
  const targets = svg.match(new RegExp('data-edit="label" data-line="' + first.srcLine + '"', 'g')) || [];
  assert.equal(targets.length, 1);
});

test('dense Roadmap projection grows measured bounds and indexes outcome bands', () => {
  const dense = parse(DOC);
  const short = parse('outcome: O\n  N\n    S [delivering]');
  const denseSvg = renderMap(dense, project(dense), ctx);
  const shortSvg = renderMap(short, project(short), ctx);
  const width = svg => +(svg.match(/width="([\d.]+)"/) || [0,0])[1];
  const height = svg => +(svg.match(/height="([\d.]+)"/) || [0,0])[1];
  assert.ok(width(denseSvg) > width(shortSvg));
  assert.ok(height(denseSvg) > height(shortSvg));
  assert.ok(denseSvg.includes('O01 · FIRST OUTCOME'));
  assert.ok(denseSvg.includes('O04 · A FOURTH OUTCOME'));
});

test('Why Map presentation delegates to fixed Roadmap presentation with selection stated', () => {
  const model = parse(DOC);
  const svg = renderMap(model, project(model), {...ctx, intent:'presentation'});
  assert.match(svg, /width="1920" height="1080"/);
  assert.ok(svg.includes('SHOWING 3 OF 3 HORIZONS'));
});
