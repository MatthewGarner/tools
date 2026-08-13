import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeHash} from '../assets/series.js';
import {handoffHref, handoffMeta, handoffReturnHref, targetHashState,
  validHandoffMeta, validHandoffReturn} from '../assets/handoff.js';
import {toLink as premortemLink, fromLink as readPremortemLink} from '../premortem/store.js';

const FLOWS = [
  {from:'map', to:'gauge', kind:'question-set'},
  {from:'gauge', to:'fermi', kind:'range-estimate', safeRoot:true},
  {from:'timeline', to:'premortem', kind:'risk-register'},
  {from:'roadmap', to:'paths', kind:'decision-plan'},
  {from:'paths', to:'roadmap', kind:'delivery-projection'},
];

async function decodedState(href){
  return decodeHash(href.slice(href.indexOf('#') + 1));
}

test('all five handoffs carry a copied-URL-safe, source-scoped return path', async () => {
  for(const flow of FLOWS){
    const returnTo = flow.safeRoot
      ? `/${flow.from}/`
      : await handoffReturnHref(`/${flow.from}/`, {t:`${flow.from} source`, e:0});
    const meta = handoffMeta(flow.from, flow.kind, `${flow.from} source`, returnTo);
    const href = await handoffHref(`/${flow.to}/`, {t:`${flow.to} draft`}, meta);
    assert.ok(href, `${flow.from} → ${flow.to}`);
    const target = await decodedState(href);
    assert.equal(target.x.returnTo, returnTo);
    assert.equal(validHandoffMeta(target.x, {from:flow.from, kind:flow.kind}).returnTo, returnTo);
    assert.equal(validHandoffReturn(returnTo, flow.from), returnTo);
    assert.deepEqual(targetHashState({t:'edited target'}, target.x).x, target.x,
      'target edits can keep the inert return control in their copied URL');
  }
});

test('return paths cannot escape the source tool or carry hostile URL syntax', () => {
  for(const value of [
    'https://example.test/map/', '//example.test/map/', '/gauge/#state',
    '/map/../../gauge/', '/map/#bad value', '/map/#<script>', '/map/\\evil',
  ]) assert.equal(validHandoffReturn(value, 'map'), null, value);
  assert.equal(handoffMeta('map', 'question-set', 'Map', '/gauge/'), null);
  assert.equal(validHandoffMeta({v:1, mode:'draft', from:'map', kind:'question-set',
    returnTo:'/gauge/'}), null);
});

test('oversized source state is refused rather than silently dropping its return', async () => {
  assert.equal(await handoffReturnHref('/map/', {t:'x'.repeat(20000)}, 40), null);
});

test('Premortem target codec retains the Timeline return in a direct copied URL', async () => {
  const returnTo = await handoffReturnHref('/timeline/', {t:'title: Plan\nWork 2026-09'});
  const doc = {v:1, id:'handoff', title:'Plan', question:'It slipped. Why?', unit:'£k', people:5,
    phase:'FRAME', entries:[], x:handoffMeta('timeline', 'risk-register', 'Timeline', returnTo)};
  const link = await premortemLink(doc);
  const imported = await readPremortemLink(link);
  assert.equal(imported.x.returnTo, returnTo);
  assert.notEqual(imported.id, doc.id);
});

test('each target exposes an honest return control and no-writeback statement', () => {
  for(const [file, control, source] of [
    ['gauge/index.html', 'returnsource', 'Map'],
    ['fermi/index.html', 'returnsource', 'Gauge'],
    ['premortem/index.html', 'returntosource', 'Timeline'],
    ['paths/index.html', 'handoffreturn', 'Roadmap'],
    ['roadmap/index.html', 'handoffreturn', 'Paths'],
  ]){
    const html = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
    assert.match(html, new RegExp(`id="${control}"[^>]*>Return to ${source}`), file);
    assert.match(html, /do(?:es)? not update (?:the source|Map|Gauge|Roadmap|Paths)/, file);
  }
});

test('source apps mint returns from current URL-local state; Gauge deliberately omits its session secret', () => {
  for(const file of ['map/app.js', 'timeline/app.js', 'roadmap/app.js', 'paths/app.js']){
    const js = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
    assert.match(js, /handoffReturnHref\(/, file);
    assert.match(js, /editor\.getText\(\)/, file);
  }
  const gauge = readFileSync(new URL('../gauge/session.js', import.meta.url), 'utf8');
  assert.match(gauge, /handoffMeta\('gauge',[\s\S]*?'\/gauge\/'\)/);
  assert.doesNotMatch(gauge, /handoffReturnHref\(\s*['"]\/gauge\//,
    'a copied Fermi URL must not acquire the facilitator key from Gauge location state');
});
