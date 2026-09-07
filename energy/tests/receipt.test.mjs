import test from 'node:test';
import assert from 'node:assert/strict';
import {modelLink, withReceipt} from '../../assets/energy-receipt.js';
import {decodeHash} from '../../assets/series.js';
import {assumptionLines, toMarkdown} from '../frequency/render.js';
import {paramsFromControls, PRESETS} from '../frequency/state.js';
import {simulate} from '../frequency/engine.js';

test('exact Energy model link round-trips current unicode source, independent of browser URL debounce', async () => {
  const state={t:'title: Fictional café\nmerchant: 75..200',e:0};
  const link=modelLink('risk',state);
  assert.deepEqual(await decodeHash(link.split('#')[1]),state);
});
test('Frequency battery receipt distinguishes synchronous, requested and effective inertia and reproduces controls', async () => {
  const v=PRESETS.stack, p=paramsFromControls(v), result=simulate(p);
  const link=modelLink('frequency',{i:v.inertia,tr:v.trip,dr:v.dr,dm:v.dm,dc:v.dc,g:v.gfm});
  const markdown=toMarkdown(result,p,link);
  assert.match(markdown,/80 GVA·s synchronous \+ 20 GVA·s effective grid-forming = 100 GVA·s effective inertia/);
  assert.match(markdown,/DR 0.5, DM 0.5, DC 1.5 GW/);
  assert.equal((await decodeHash(markdown.match(/\[Open this model\]\([^#]+#([^)]*)\)/)[1])).g,20);
  const capped=assumptionLines({...p,eGfm:100});
  assert.match(capped[0],/50 GVA·s effective grid-forming = 130 GVA·s effective inertia \(100 requested\)/);
});
test('receipt extends outer artboard, escapes text, and preserves nested charts', () => {
  const svg='<svg width="1200" height="600" viewBox="0 0 1200 600"><svg width="100" height="100"><text>chart</text></svg></svg>';
  const result=withReceipt(svg,{lines:['Fictional <asset>'],limitation:'Illustrative only',link:'https://example.test/#abc',colors:{bg:'#fff',ink:'#111',muted:'#666',accent:'#700'},measure:s=>s.length*7});
  assert.match(result,/height="730" viewBox="0 0 1200 730"/);
  assert.match(result,/<\/svg><g data-receipt="true">/);
  assert.match(result,/Fictional &lt;asset&gt;/);
  assert.match(result,/href="https:\/\/example.test\/#abc"/);
});
