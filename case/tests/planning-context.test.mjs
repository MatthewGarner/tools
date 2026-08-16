import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planningRole, parseRoadmapBasis, inspectPlanningContext, projectPlanningContexts} from '../planning-context.js';

test('planning roles are distinct for the three planning instruments', () => {
  assert.deepEqual(planningRole('/paths/#state'), {
    kind:'paths', role:'Decision plan', scope:'All outcomes', basis:null,
  });
  assert.deepEqual(planningRole('https://tools.matthewgarner.me/roadmap/#state'), {
    kind:'roadmap', role:'Delivery roadmap', scope:'Commitment and shaped work', basis:null,
  });
  assert.deepEqual(planningRole('/timeline/#state'), {
    kind:'timeline', role:'Timing forecast', scope:'P50–P90 ranges', basis:null,
  });
  assert.equal(planningRole('/tree/#state'), null, 'non-planning exhibits keep their existing presentation');
});

test('bare pages and teaching placeholder hashes do not claim to be artefacts', async () => {
  for(const url of ['/paths/', '/roadmap/#', '/timeline/#eyJ2IjoxfQ']){
    assert.equal(planningRole(url), null, url);
    assert.equal(await inspectPlanningContext(url), null, url);
  }
});

test('only canonical local or exact-suite HTTPS URLs receive planning context', () => {
  for(const url of [
    'http://tools.matthewgarner.me/paths/#x',
    'https://tools.matthewgarner.me.evil.test/paths/#x',
    'https://user@tools.matthewgarner.me/paths/#x',
    'https://tools.matthewgarner.me:444/paths/#x',
    '//evil.test/paths/#x',
    '/paths/extra/#x',
    '/paths/../roadmap/#x',
    '/paths/%2e%2e/roadmap/#x',
    '/tree/../paths/#x',
    'https://tools.matthewgarner.me/paths/../roadmap/#x',
    '/paths/?redirect=https://evil.test/#x',
    'javascript:alert(1)',
  ]) assert.equal(planningRole(url), null, url);
  assert.equal(planningRole('https://tools.matthewgarner.me/paths/#x').kind, 'paths');
});

test('Paths and Timeline roles never decode or inspect member state', async () => {
  let calls = 0;
  const decode = async () => { calls++; throw new Error('must not run'); };
  assert.equal((await inspectPlanningContext('/paths/#hostile', {decode})).scope, 'All outcomes');
  assert.equal((await inspectPlanningContext('/timeline/#hostile', {decode})).scope, 'P50–P90 ranges');
  assert.equal(calls, 0);
});

test('a valid Roadmap basis enriches the claim with exact known and assumed ledgers', async () => {
  const text = [
    'title: Lantern delivery projection',
    'basis: paths "Lantern growth decisions"; answered pricing=yes@2026-08-03; assumed groups=no@2026-08-12, retention=yes@2026-08-12',
    'NOW',
    'Core: Resume position fix',
  ].join('\n');
  const context = await inspectPlanningContext('/roadmap/#state', {decode: async hash => {
    assert.equal(hash, 'state');
    return {t:text};
  }});
  assert.deepEqual(context, {
    kind:'roadmap', role:'Delivery projection', scope:'One exact Paths outcome',
    basis:{
      source:'Lantern growth decisions',
      known:[{key:'pricing', direction:'yes', date:'2026-08-03'}],
      assumed:[
        {key:'groups', direction:'no', date:'2026-08-12'},
        {key:'retention', direction:'yes', date:'2026-08-12'},
      ],
    },
  });
});

test('Roadmap basis recognition is atomic under hostile and ambiguous receipts', () => {
  assert.equal(parseRoadmapBasis('basis: paths "Growth <review> & reset"; assumed groups=no@2026-08-12').source,
    'Growth <review> & reset');
  for(const text of [
    'basis: paths "A"',
    'basis: paths ""; assumed x=yes@2026-08-12',
    'basis: paths "A // B"; assumed x=yes@2026-08-12',
    'basis: paths "A"; answered x=yes@2026-08-12; assumed X=no@2026-08-13',
    'basis: paths "A"; answered x=yes@2026-08-12; answered y=no@2026-08-13',
    'basis: paths "A"; unknown x=yes@2026-08-12',
    'basis: paths "A"; assumed x=yes@2026-08-12;',
    'basis: paths "A"; assumed ' + Array.from({length:9}, (_, i) => 'x' + i + '=yes@2026-08-12').join(','),
    'basis: paths "A"; assumed ' + 'x'.repeat(33) + '=yes@2026-08-12',
  ]) assert.equal(parseRoadmapBasis(text), null, text);
});

test('the real shared URL decoder enriches a legacy Roadmap link without fetching it', async () => {
  const text = 'basis: paths "Growth decisions"; answered pricing=yes@2026-08-03; assumed groups=no@2026-08-12\nNOW\nCore: Work';
  const hash = Buffer.from(JSON.stringify({t:text}), 'utf8').toString('base64');
  const context = await inspectPlanningContext('/roadmap/#' + hash);
  assert.equal(context.role, 'Delivery projection');
  assert.equal(context.basis.source, 'Growth decisions');
  assert.equal(context.basis.known.length, 1);
  assert.equal(context.basis.assumed.length, 1);
});

test('unreadable, malformed, duplicate and non-text Roadmap states remain generic', async () => {
  const cases = [
    null,
    {},
    {t:42},
    {t:'title: Ordinary roadmap\nNOW\nCore: Work'},
    {t:'basis: paths "A"; assumed x=yes@2026-08-12\nbasis: paths "B"; answered y=no@2026-08-11\nNOW\nWork'},
    {t:'basis: paths "A"; assumed x=maybe@2026-08-12\nNOW\nWork'},
    {t:'basis: paths "A"; assumed x=yes@2026-02-30\nNOW\nWork'},
    {t:'x'.repeat(100001)},
  ];
  for(const state of cases){
    const context = await inspectPlanningContext('/roadmap/#state', {decode: async () => state});
    assert.deepEqual(context, {
      kind:'roadmap', role:'Delivery roadmap', scope:'Commitment and shaped work', basis:null,
    });
  }
  const thrown = await inspectPlanningContext('/roadmap/#state', {decode: async () => { throw new Error('bad stream'); }});
  assert.equal(thrown.role, 'Delivery roadmap');
});

test('hostile and oversized hashes are rejected before decode', async () => {
  let calls = 0;
  const decode = async () => { calls++; return {t:'basis: paths "X"; assumed x=yes@2026-08-12'}; };
  assert.equal(await inspectPlanningContext('/roadmap/#', {decode}), null);
  const huge = '/roadmap/#' + 'a'.repeat(24001);
  assert.equal((await inspectPlanningContext(huge, {decode})).role, 'Delivery roadmap');
  assert.equal(calls, 0);
});

test('projection preserves order and nulls for non-planning exhibits', async () => {
  const exhibits = [
    {url:'/paths/#x'}, {url:'/fermi/#x'}, {url:'/timeline/#x'},
  ];
  assert.deepEqual(await projectPlanningContexts(exhibits, {decode:async () => null}), [
    planningRole('/paths/#x'), null, planningRole('/timeline/#x'),
  ]);
});
