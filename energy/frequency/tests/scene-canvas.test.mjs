import {test} from 'node:test';
import assert from 'node:assert/strict';
import {simulate} from '../engine.js';
import {buildTraceScene} from '../scene.js';
import {paintTraceScene} from '../canvas.js';
import {projectTraceScene, renderTraceScene} from '../render.js';

const params = {trip: 1.8, eSync: 90, load: 30, drMw: 0, dmMw: 0, dcMw: 1, battMW: 1, eGfm: 15};
const result = simulate(params);
const colors = {bg:'#f7f8f6', ink:'#111', muted:'#666', accent:'#C05621', err:'#b00'};

function recorder(){
  const calls = [];
  const g = {calls, globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1,
    font: '', textAlign: '', textBaseline: ''};
  let path = [];
  for(const name of ['clearRect','fillRect','setLineDash','fillText','arc','fill'])
    g[name] = (...args) => calls.push([name, ...args]);
  g.beginPath = () => { path = []; calls.push(['beginPath']); };
  for(const name of ['moveTo', 'lineTo']) g[name] = (...args) => { path.push([name, ...args]); calls.push([name, ...args]); };
  g.stroke = () => calls.push(['stroke', {style: g.strokeStyle, width: g.lineWidth, path: [...path]}]);
  return g;
}

test('buildTraceScene preserves the display domain and adds one counterfactual only when useful', () => {
  const scene = buildTraceScene(result, params);
  assert.deepEqual(scene.time, {start: 0, end: 30});
  assert.deepEqual(scene.frequency.nominalBand, {low: 49.8, high: 50.2, frequency: 50, label: '50 Hz', visibility: 'static'});
  assert.deepEqual(scene.frequency.threshold, {frequency: 48.8, label: '48.8 Hz — load shed', visibility: 'static'});
  assert.deepEqual(scene.frequency.gridTicks, [{frequency: 50, visibility: 'static'}, {frequency: 49, visibility: 'static'}]);
  assert.strictEqual(scene.domain.time, scene.time, 'domain is an alias, never a duplicated source');
  assert.strictEqual(scene.domain.frequency, scene.frequency, 'domain is an alias, never a duplicated source');
  assert.equal(scene.axes.visibility, 'static');
  assert.equal(scene.trace.points.length, result.t.length);
  assert.deepEqual(scene.trace.points[0], {time: 0, frequency: 50});
  assert.ok(scene.ghost, 'active battery gets a no-battery comparison');
  assert.equal(scene.ghost.points.length, result.t.length);
  assert.equal(scene.ghost.visibility, 'static');
  assert.equal(scene.rocof.from.time, 0);
  assert.equal(scene.rocof.visibility, 'static');
  assert.equal(scene.trace.visibility, 'progressive');
  assert.equal(scene.nadir.visibility, 'after-trace');
  assert.match(scene.nadir.label, /^nadir \d+\.\d{2} Hz$/);
  const plain = simulate({...params, dcMw: 0, battMW: 0, eGfm: 0});
  const unassisted = buildTraceScene(plain, {...params, dcMw: 0, battMW: 0, eGfm: 0});
  assert.equal(unassisted.ghost, undefined);
  assert.deepEqual(unassisted.frequency.gridTicks, [{frequency: 50, visibility: 'static'}, {frequency: 49, visibility: 'static'}]);
});

test('paintTraceScene draws static guides, gates trace/nadir by cursor, and labels RoCoF', () => {
  const scene = buildTraceScene(result, params);
  const before = recorder();
  paintTraceScene(scene, before, 640, 320, 0);
  assert.ok(before.calls.some(c => c[0] === 'fillText' && c[1] === '48.8 Hz — load shed'));
  assert.ok(before.calls.some(c => c[0] === 'fillText' && c[1] === scene.ghost.label));
  assert.ok(before.calls.some(c => c[0] === 'fillText' && c[1] === scene.rocof.label));
  assert.equal(before.calls.filter(c => c[0] === 'arc').length, 0, 'nadir is hidden before cursor reaches it');

  const after = recorder();
  paintTraceScene(scene, after, 640, 320, Infinity);
  assert.equal(after.calls.filter(c => c[0] === 'arc').length, 1);
  assert.ok(after.calls.some(c => c[0] === 'fillText' && c[1] === scene.nadir.label));
  assert.ok(after.calls.some(c => c[0] === 'clearRect'));
});

test('Canvas and SVG map the same semantic threshold and sampled trace points', () => {
  const scene = buildTraceScene(result, params);
  const svg = projectTraceScene(scene);
  const trace = renderTraceScene(scene, {colors});
  const painted = recorder();
  paintTraceScene(scene, painted, 640, 320, Infinity, colors);
  const match = trace.match(/<polyline points='([^']+)' fill='none' stroke='#C05621'/);
  assert.ok(match, 'finds the main SVG trace rather than the muted ghost');
  const rendered = match[1].split(' ').map(pair => pair.split(',').map(Number));
  const canvasPath = painted.calls.find(call => call[0] === 'stroke' && call[1].style === colors.accent && call[1].width === 2.5)?.[1].path;
  assert.equal(canvasPath?.length, scene.trace.points.length, 'Canvas receives one mapped point per scene trace point');
  for(const index of [0, Math.floor(scene.trace.points.length / 2), scene.trace.points.length - 1]){
    const point = scene.trace.points[index];
    assert.ok(Math.abs(rendered[index][0] - svg.x(point.time)) <= 0.01, 'SVG x rounds only to 0.01px');
    assert.ok(Math.abs(rendered[index][1] - svg.y(point.frequency)) <= 0.01, 'SVG y rounds only to 0.01px');
    const [, canvasX, canvasY] = canvasPath[index];
    assert.ok(Math.abs((canvasX - 48) / (640 - 64) - (point.time / scene.time.end)) < 1e-9, 'Canvas call uses scene time');
    assert.ok(Math.abs((canvasY - 14) / (320 - 38) -
      (1 - (point.frequency - scene.frequency.min) / (scene.frequency.max - scene.frequency.min))) < 1e-9);
  }
  const thresholdY = svg.y(scene.frequency.threshold.frequency).toFixed(2);
  assert.match(trace, new RegExp(`y1='${thresholdY}'[^>]*stroke='#b00'`), 'SVG threshold comes from the scene caption/value');
  const canvasThreshold = painted.calls.find(call => call[0] === 'stroke' && call[1].style === colors.err)?.[1].path?.[0]?.[2];
  assert.ok(Math.abs((canvasThreshold - 14) / (320 - 38) - (svg.y(scene.frequency.threshold.frequency) - 56) / (424 - 56)) < 1e-9,
    'actual Canvas threshold and SVG threshold encode the same scene frequency');
});

test('paintTraceScene fails closed while a responsive canvas has no usable frame', () => {
  const g = recorder();
  assert.equal(paintTraceScene(buildTraceScene(result, params), g, 0, 0), false);
  assert.deepEqual(g.calls[0], ['clearRect', 0, 0, 0, 0]);
});
