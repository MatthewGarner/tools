/* The reader-facing side of an off-thread simulation: the page's own pending/final signal, the 100ms rule for dimming, the one polite
   announcement, and the hold on anything that would leave the page with pending figures. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimPending, holdWhilePending} from '../assets/sim-pending.js';

function rig(){
  const attrs = new Map();
  const host = {dataset: {}, setAttribute: (k, v) => attrs.set(k, v), removeAttribute: k => attrs.delete(k)};
  const live = {textContent: ''};
  const timers = [];
  const pending = createSimPending({host, live, delay: 100,
    setTimer: (fn, ms) => { timers.push({fn, ms}); return timers.length; }, clearTimer: n => { if(n) timers[n - 1].cleared = true; }});
  return {host, live, attrs, timers, pending};
}

test('final until a run is asked for; pending and busy together; final again with the run', () => {
  const {host, attrs, pending} = rig();
  assert.equal(host.dataset.sim, 'final');
  pending.begin();
  assert.equal(host.dataset.sim, 'pending');
  assert.equal(attrs.get('aria-busy'), 'true');
  assert.equal(pending.isFinal(), false);
  pending.end();
  assert.equal(host.dataset.sim, 'final');
  assert.equal(attrs.has('aria-busy'), false);
});

test('the figures dim only if the run is still going after 100ms', () => {
  const quick = rig();
  quick.pending.begin();
  assert.equal(quick.timers[0].ms, 100);
  assert.equal('simDim' in quick.host.dataset, false, 'not dimmed at once');
  quick.pending.end();
  assert.ok(quick.timers[0].cleared);
  quick.timers[0].fn();   // even a timer that fires late finds nothing pending
  assert.equal('simDim' in quick.host.dataset, false);
  const slow = rig();
  slow.pending.begin();
  slow.timers[0].fn();
  assert.equal('simDim' in slow.host.dataset, true);
  slow.pending.end();
  assert.equal('simDim' in slow.host.dataset, false);
});

test('the verdict is announced once, when a run that was waited for returns with a new line', () => {
  const {live, pending} = rig();
  pending.end('First verdict');   // no run was asked for: nothing to announce (the page has just drawn it)
  assert.equal(live.textContent, '');
  pending.begin(); pending.end('First verdict');
  assert.equal(live.textContent, '', 'the same line is not announced again');
  pending.begin(); pending.end('Second verdict');
  assert.equal(live.textContent, 'Second verdict');
});

test('whenFinal runs at once when final, and after the run when pending, in order', () => {
  const {pending} = rig();
  const order = [];
  pending.whenFinal(() => order.push('now'));
  pending.begin();
  pending.whenFinal(() => order.push('a'));
  pending.whenFinal(() => order.push('b'));
  assert.deepEqual(order, ['now']);
  pending.end();
  assert.deepEqual(order, ['now', 'a', 'b']);
});

function fakeButton(){
  const listeners = [], attrs = new Map();
  const btn = {dataset: {}, clicks: 0,
    addEventListener: (type, fn) => listeners.push(fn),
    setAttribute: (k, v) => attrs.set(k, v), removeAttribute: k => attrs.delete(k), attrs,
    click(){ const event = {stopped: false, stopImmediatePropagation(){ this.stopped = true; }, preventDefault(){}}; for(const fn of listeners){ fn(event); if(event.stopped) return; } btn.clicks++; }};
  return btn;
}

test('a press while pending does nothing yet, shows it is working, and acts on the final figures', () => {
  const {pending} = rig();
  const btn = fakeButton(), said = [];
  holdWhilePending([btn, null], pending, {say: t => said.push(t)});
  btn.click();
  assert.equal(btn.clicks, 1, 'final: the press goes straight through');
  pending.begin();
  btn.click();
  assert.equal(btn.clicks, 1, 'pending: nothing leaves');
  assert.equal(btn.dataset.working, '');
  assert.equal(btn.attrs.get('aria-busy'), 'true');
  btn.click();                                   // a second press while waiting does not queue another
  pending.end();
  assert.equal(btn.clicks, 2, 'exactly one action, after the final figures');
  assert.equal(btn.dataset.working, undefined);
  assert.equal(btn.attrs.has('aria-busy'), false);
  assert.deepEqual(said.filter(Boolean).length, 1);
});
