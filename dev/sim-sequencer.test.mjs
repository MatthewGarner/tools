/* The request sequencing for the off-thread simulations (Bets, Tree): latest wins, a stale answer is dropped, a model error does
   not poison the worker, a failed worker falls back to running inline. Pure: the worker is a fake the test drives by hand. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimSequencer} from '../assets/sim-sequencer.js';

function rig({noWorker = false, throwOnSpawn = false, runSync = p => ({sync: p})} = {}){
  const workers = [], got = [], errs = [];
  const timers = [];
  const spawn = hooks => {
    if(throwOnSpawn) throw new Error('no Worker');
    if(noWorker) return null;
    const w = {posted: [], terminated: false, hooks,
      postMessage(m){ this.posted.push(m); }, terminate(){ this.terminated = true; }};
    workers.push(w);
    return w;
  };
  const seq = createSimSequencer({spawn, runSync,
    onResult: (key, result, id) => got.push({key, result, id}),
    onError: (key, message, id) => errs.push({key, message, id}),
    setTimer: (fn, ms) => { timers.push({fn, ms}); return timers.length; },
    clearTimer: n => { if(n) timers[n - 1].cleared = true; }});
  return {seq, workers, got, errs, timers, live: () => workers.at(-1)};
}

test('an answer for the current request is delivered under its key', () => {
  const r = rig();
  r.seq.request('a', {n: 1});
  const w = r.live();
  assert.deepEqual(w.posted, [{payload: {n: 1}, reqId: 1}]);
  assert.equal(r.seq.inFlight(), 'a');
  w.hooks.message({reqId: 1, result: 'A'});
  assert.deepEqual(r.got, [{key: 'a', result: 'A', id: 1}]);
  assert.equal(r.seq.inFlight(), null);
});

test('latest wins: a newer request abandons the old one, whose late answer is dropped', () => {
  const r = rig();
  r.seq.request('a', 1);
  const first = r.live();
  r.seq.request('b', 2);
  const second = r.live();
  assert.notEqual(first, second, 'the worker is replaced so the new run does not queue behind the old');
  assert.ok(first.terminated);
  first.hooks.message({reqId: 1, result: 'A'});         // even if terminate() let one more message through
  assert.deepEqual(r.got, []);
  second.hooks.message({reqId: 2, result: 'B'});
  assert.deepEqual(r.got.map(g => g.key), ['b']);
});

test('a late answer from the replaced worker never paints even when its number matches nothing now', () => {
  const r = rig();
  r.seq.request('a', 1);
  const first = r.live();
  r.seq.request('b', 2);
  r.live().hooks.message({reqId: 2, result: 'B'});
  first.hooks.message({reqId: 2, result: 'STALE-A'});   // wrong worker, right-looking number
  assert.deepEqual(r.got.map(g => g.result), ['B']);
});

test('asking again for the key already in flight does not run it again', () => {
  const r = rig();
  const id = r.seq.request('a', 1);
  assert.equal(r.seq.request('a', 1), id);
  assert.equal(r.workers.length, 1);
  assert.equal(r.live().posted.length, 1);
});

test('an input that changes and changes back still ends on the last one asked for', () => {
  const r = rig();
  r.seq.request('a', 1); r.seq.request('b', 2); r.seq.request('a', 1);
  r.live().hooks.message({reqId: 3, result: 'A2'});
  assert.deepEqual(r.got.map(g => [g.key, g.result]), [['a', 'A2']]);
});

test('a model error is reported and the worker stays usable', () => {
  const r = rig();
  r.seq.request('a', 1);
  const w = r.live();
  w.hooks.message({reqId: 1, error: 'could not solve'});
  assert.deepEqual(r.errs, [{key: 'a', message: 'could not solve', id: 1}]);
  assert.ok(r.seq.workerAlive());
  assert.ok(!w.terminated);
  r.seq.request('b', 2);
  assert.equal(r.live(), w, 'the same worker takes the next request: nothing was abandoned');
  r.live().hooks.message({reqId: 2, result: 'B'});
  assert.deepEqual(r.got.map(g => g.key), ['b']);
});

test('a worker that fails hands the request in flight, and every later one, to the inline path', () => {
  const r = rig();
  r.seq.request('a', {n: 1});
  const w = r.live();
  w.hooks.failure();
  assert.deepEqual(r.got, [{key: 'a', result: {sync: {n: 1}}, id: 1}]);
  assert.ok(w.terminated);
  assert.ok(!r.seq.workerAlive());
  r.seq.request('b', {n: 2});
  assert.deepEqual(r.got.at(-1), {key: 'b', result: {sync: {n: 2}}, id: 2});
  assert.equal(r.workers.length, 1, 'no respawn after a durable failure');
});

test('an abandoned worker failing later does not disable its healthy replacement', () => {
  const r = rig();
  r.seq.request('a', 1);
  const first = r.live();
  r.seq.request('b', 2);
  first.hooks.failure();
  assert.ok(r.seq.workerAlive());
  r.live().hooks.message({reqId: 2, result: 'B'});
  assert.deepEqual(r.got.map(g => g.key), ['b']);
});

test('silence past the timeout is a worker failure and the request still gets an answer', () => {
  const r = rig();
  r.seq.request('a', {n: 1});
  assert.equal(r.timers.length, 1);
  r.timers[0].fn();
  assert.deepEqual(r.got.map(g => g.key), ['a']);
  assert.ok(!r.seq.workerAlive());
});

test('an answer clears the timeout; a superseded request clears its own', () => {
  const r = rig();
  r.seq.request('a', 1);
  r.seq.request('b', 2);
  assert.ok(r.timers[0].cleared);
  r.live().hooks.message({reqId: 2, result: 'B'});
  assert.ok(r.timers[1].cleared);
});

test('no Worker at all: the request is answered inline, before request() returns', () => {
  for(const opts of [{noWorker: true}, {throwOnSpawn: true}]){
    const r = rig(opts);
    r.seq.request('a', {n: 1});
    assert.deepEqual(r.got, [{key: 'a', result: {sync: {n: 1}}, id: 1}]);
    assert.ok(!r.seq.workerAlive());
  }
});

test('the inline path reports a model error without throwing', () => {
  const r = rig({noWorker: true, runSync(){ throw new Error('bad numbers'); }});
  r.seq.request('a', 1);
  assert.deepEqual(r.errs, [{key: 'a', message: 'bad numbers', id: 1}]);
  r.seq.request('b', 2);
  assert.equal(r.errs.length, 2);
});

test('cancel retires the request in flight: its answer is dropped', () => {
  const r = rig();
  r.seq.request('a', 1);
  r.seq.cancel();
  assert.equal(r.seq.inFlight(), null);
  r.live().hooks.message({reqId: 1, result: 'A'});
  assert.deepEqual(r.got, []);
});
