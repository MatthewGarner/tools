import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSliderCommit} from '../slider-commit.js';

function clock(){
  let t = 0; const timers = [];
  return {
    setTimeout: (fn, ms) => { timers.push({fn, at: t + ms, live: true}); return timers.length; },
    clearTimeout: id => { if(timers[id - 1]) timers[id - 1].live = false; },
    advance(ms){ t += ms; for(const tm of timers) if(tm.live && tm.at <= t){ tm.live = false; tm.fn(); } },
  };
}

test('ten arrow presses 40ms apart commit once, 250ms after the last', () => {
  const c = clock(); let commits = 0;
  const s = createSliderCommit(() => commits++, {delay: 250, ...c});
  for(let i = 0; i < 10; i++){ s.key(); c.advance(40); }
  assert.equal(commits, 0, 'nothing committed while the keys keep coming');
  c.advance(209); assert.equal(commits, 0);
  c.advance(1); assert.equal(commits, 1);
  c.advance(1000); assert.equal(commits, 1);
});

test('blur commits what is pending at once, and only once', () => {
  const c = clock(); let commits = 0;
  const s = createSliderCommit(() => commits++, {delay: 250, ...c});
  s.key(); s.flush(); assert.equal(commits, 1);
  c.advance(500); assert.equal(commits, 1);
  s.flush(); assert.equal(commits, 1, 'nothing pending, nothing committed');
});

test('a pointer release commits at once and supersedes a pending key commit', () => {
  const c = clock(); let commits = 0;
  const s = createSliderCommit(() => commits++, {delay: 250, ...c});
  s.key(); s.now(); assert.equal(commits, 1);
  c.advance(500); assert.equal(commits, 1);
});

test('cancel drops a pending commit (an undo while a key adjustment is uncommitted)', () => {
  const c = clock(); let commits = 0;
  const s = createSliderCommit(() => commits++, {delay: 250, ...c});
  s.key(); assert.equal(s.pending(), true);
  s.cancel(); c.advance(500);
  assert.equal(commits, 0); assert.equal(s.pending(), false);
});
