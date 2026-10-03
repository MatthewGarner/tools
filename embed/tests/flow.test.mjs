import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseState, DEFAULT_PARAMS, fullToolUrl, fullFlowState} from '../v1/flow/state.js';
import {simulate, SEED} from '../v1/flow/model/engine.js';
import {decodeHash} from '../../assets/series.js';
import {parentOrigin, validThemeMessage} from '../v1/bridge.js';
import {moduleGraph} from '../../dev/module-graph.mjs';

const encode = state => '#' + encodeURIComponent(JSON.stringify(state));
const root = new URL('../../', import.meta.url);

test('article examples default predictably and can lock the controls', () => {
  assert.deepEqual(parseState(''), {params:DEFAULT_PARAMS, seed:SEED, controls:['demand']});
  assert.deepEqual(parseState(encode({controls:[]})).controls, []);
  assert.equal(parseState(encode({params:{demandPerWeek:5, wipLimit:40}})).params.wipLimit, 40);
});

test('malformed or unsupported state fails instead of displaying a different example', () => {
  for(const hash of ['#%E0%A4%A', '#broken', encode(null), encode([]), encode({params:null}), encode({view:'other'}),
    encode({seed:123}), encode({controls:['team']}), encode({controls:['demand','demand']}), encode({params:{team:0}}),
    encode({params:{demandPerWeek:10.5}}), encode({params:{demandPerWeek:1.1}}), encode({params:{itemDays:'2'}}),
    encode({params:{wipLimit:21}}), encode({params:{itemDays:16}}), encode({params:{cov:0.5}}), encode({params:{unexpected:true}})])
    assert.throws(() => parseState(hash), undefined, hash);
});

test('snapshot preserves the recorded model bytes and has no live computational dependencies', () => {
  const dir = new URL('../v1/flow/model/', import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('provenance.json', dir), 'utf8'));
  for(const entry of manifest.files) assert.equal(createHash('sha256').update(readFileSync(new URL(entry.file, dir))).digest('hex'), entry.sha256);
  assert.deepEqual([...moduleGraph(root, 'embed/v1/flow/model/engine.js')].sort(),
    ['embed/v1/flow/model/engine.js', 'embed/v1/flow/model/series.js']);
  const first = simulate(DEFAULT_PARAMS);
  assert.deepEqual(first, simulate(DEFAULT_PARAMS));
  assert.equal(first.stable, true);
  assert.ok(first.waitDays > 0 && first.waitDays < 2);
  assert.equal(simulate({...DEFAULT_PARAMS, demandPerWeek:10}).stable, false);
});

test('full Flow opens the current model through its existing decoder', async () => {
  const params = {...DEFAULT_PARAMS, demandPerWeek:5, wipLimit:40};
  const url = new URL(await fullToolUrl(params, 'https://preview.vercel.app'));
  assert.equal(url.origin, 'https://tools.matthewgarner.me');
  assert.equal(url.pathname, '/flow/');
  assert.deepEqual(await decodeHash(url.hash.slice(1)), fullFlowState(params));
  assert.equal(fullFlowState(params).w, 21);
  assert.match(await fullToolUrl(params, 'http://127.0.0.1:8087'), /^http:\/\/127\.0\.0\.1:8087\/flow\/#/);
});

test('only approved exact parent origins can provide a theme', () => {
  const origin = 'https://tools.matthewgarner.me';
  assert.equal(parentOrigin({origin, referrer:'https://www.matthewgarner.me/writing/test/'}), 'https://www.matthewgarner.me');
  for(const parent of ['https://www.matthewgarner.me.evil.test', 'https://www.matthewgarner.me/path', 'http://localhost:4321', 'null', '*'])
    assert.equal(parentOrigin({origin, search:'?parent=' + encodeURIComponent(parent)}), null);
  assert.equal(parentOrigin({origin:'http://127.0.0.1:8087', search:'?parent=http://127.0.0.1:4321'}), 'http://127.0.0.1:4321');
  const parent = {}, allowed = 'https://www.matthewgarner.me';
  const event = {source:parent, origin:allowed, data:{type:'mg-tool:theme', version:1, theme:'dark'}};
  assert.equal(validThemeMessage(event, parent, allowed), true);
  for(const bad of [{source:{}}, {origin:'https://evil.test'}, {data:{...event.data, version:2}}, {data:{...event.data, theme:'wrong'}}])
    assert.equal(validThemeMessage({...event, ...bad}, parent, allowed), false);
});

test('the embed dependency graph owns no saved work, worker registration or telemetry', () => {
  const graph = [...moduleGraph(root, 'embed/v1/flow/app.js')];
  for(const path of graph){
    const source = readFileSync(new URL(path, root), 'utf8');
    assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|serviceWorker|sendBeacon|fetch\(/, path);
    assert.ok(path.startsWith('embed/v1/'), path);
  }
  const html = readFileSync(new URL('embed/v1/flow/index.html', root), 'utf8');
  // Event attributes need a whitespace boundary: bare on\w+= also matches content=.
  assert.doesNotMatch(html, /pwa\.js|identity\.js|\son\w+=|<script[^>]*>[^<]+/);
});
