import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {resolve} from '../zones.js';
import {readout} from '../readout.js';
import {renderMapPresentation} from '../render-presentation.js';

const colors = {ink:'#111', muted:'#666', accent:'#a50', accentInk:'#850', bg:'#fff', card:'#fff', border:'#ddd',
  err:'#b33', status:{done:'#080', risk:'#a70', blocked:'#b33'}};
const measure = text => String(text).length * 12;
const source = 'preset: assumptions\ntitle: Presentation map\n' +
  Array.from({length: 11}, (_, i) => `Item ${i + 1} @ ${10 + i * 7},${90 - i * 6}`).join('\n');
const model = parse(source), resolved = resolve(model), ro = readout(model, resolved);

test('presentation is fixed 1920×1080 and remains complete at plate scale', () => {
  const svg = renderMapPresentation(model, resolved, ro, {colors, measure});
  assert.match(svg, /^<svg[^>]+width="1920" height="1080" viewBox="0 0 1920 1080"/);
  assert.match(svg, /data-map-layout="zone-atlas-plate"/);
  assert.match(svg, /FIELD INDEX · SOURCE ORDER/);
  for(let i = 1; i <= 11; i++) assert.match(svg, new RegExp('Item ' + i));
  assert.doesNotMatch(svg, /SELECTION ·|FURTHER IN FULL SVG|DOWNLOAD SVG/);
  assert.ok(!svg.includes('data-edit='));
});

test('presentation display IDs remain source IDs when the field needs an index', () => {
  const svg = renderMapPresentation(model, resolved, ro, {colors, measure});
  assert.match(svg, /M01/);
  assert.match(svg, /M08/);
  assert.equal('id' in model.items[0], false);
});
