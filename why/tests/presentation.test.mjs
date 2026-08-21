import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {project} from '../project.js';
import {renderDeliveryLens as renderMap} from '../render-delivery-lens.js';
import {renderCausalField as renderOst} from '../render-causal-field.js';
import {renderCausalPresentation as renderWhyPresentation} from '../causal-presentation.js';

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

test('Causal Field presentation is complete when it fits; it never selects a preferred path', () => {
  const model = parse(DOC);
  const svg = renderWhyPresentation(model, ctx);
  assert.match(svg, /width="1920" height="1080"/);
  const mode = (svg.match(/data-causal-presentation="(plate|refusal)"/) || [])[1];
  assert.ok(mode === 'plate' || mode === 'refusal');
  if(mode === 'plate') assert.ok(svg.includes('First outcome') && svg.includes('Second outcome') && svg.includes('Third outcome'));
  else assert.match(svg, /CANNOT FIT COMPLETE CAUSAL FIELD/);
  assert.doesNotMatch(svg, /DEEPEST SOLUTION CHAIN|SHOWING OUTCOME/);
  assert.ok(!svg.includes('data-edit='));
});

test('dense native Causal Field retains source identity and one canonical edit target per label', () => {
  const model = parse(DOC);
  const svg = renderOst(model, project(model), {...ctx, edit:true});
  for(const outcome of model.outcomes) assert.ok(svg.includes('data-causal-node="' + outcome.srcLine + '"'));
  const first = model.outcomes[3];
  const targets = svg.match(new RegExp('data-edit="label" data-line="' + first.srcLine + '"', 'g')) || [];
  assert.equal(targets.length, 1);
});

test('dense Delivery Lens grows vertically and retains every readiness source row', () => {
  const dense = parse(DOC);
  const short = parse('outcome: O\n  N\n    S [delivering]');
  const denseSvg = renderMap(dense, project(dense), ctx);
  const shortSvg = renderMap(short, project(short), ctx);
  const width = svg => +(svg.match(/width="([\d.]+)"/) || [0,0])[1];
  const height = svg => +(svg.match(/height="([\d.]+)"/) || [0,0])[1];
  assert.ok(height(denseSvg) > height(shortSvg));
  assert.equal(width(denseSvg), width(shortSvg), 'a ledger has one stable reading width');
  const included = [...project(dense).now, ...project(dense).next, ...project(dense).later, ...project(dense).noWhy];
  for(const item of included) assert.ok(denseSvg.includes('data-readiness-node="' + item.node.srcLine + '"'));
});

test('Delivery Lens presentation is a complete plate or an explicit refusal', () => {
  const model = parse(DOC);
  const svg = renderMap(model, project(model), {...ctx, intent:'presentation'});
  assert.match(svg, /width="1920" height="1080"/);
  assert.match(svg, /data-readiness-presentation="(plate|refusal)"/);
  assert.equal((svg.match(/>Dense discovery review<\/text>/g) || []).length, 1, 'the export title owns one place on the plate');
  assert.doesNotMatch(svg, /SHOWING \d+ OF/);
});

test('all presentation refusal paths use the same measured title policy', () => {
  const title = Array.from({length:18}, () => 'abcdefgh').join(' ');
  const model = parse('title: ' + title + '\noutcome: O\n  Need\n    Fix [testing]');
  const fontAware = {
    ...ctx,
    measure: (text, font) => String(text).length * (+((String(font).match(/\d+/) || [38])[0])) * .4,
  };
  const causal = renderWhyPresentation(model, fontAware);
  const lens = renderMap(model, project(model), {...fontAware, intent:'presentation'});
  assert.match(causal, /data-causal-title-refusal/, 'the Field does not pass a 38px check then overflow at its 42px refusal heading');
  assert.match(lens, /data-readiness-title-refusal/, 'the Lens uses the same whole-title policy');
  assert.doesNotMatch(causal, new RegExp('>' + title + '<'), 'the long source title is never emitted as one overflowing refusal line');
});
