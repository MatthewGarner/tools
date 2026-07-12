import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {solutionMenu} from '../app-menu.js';

/* small test helper: first node (by label) found in the outcome tree */
function findSrcLine(model, label){
  for(const o of model.outcomes){
    const hit = (function walk(n){
      if(n.label === label) return n;
      for(const c of n.children){ const h = walk(c); if(h) return h; }
      return null;
    })(o);
    if(hit) return hit.srcLine;
  }
  throw new Error('label not found: ' + label);
}

test('solutionMenu: base rows + one submenu row per assumption, in order, current status marked', () => {
  const src = 'Grow retention\n  Reminders\n    Push notifications\n      ? Users allow push [testing]\n      ? Copy lands [untested]';
  const model = parse(src);
  const sol = findSrcLine(model, 'Push notifications');
  const rows = solutionMenu(model, sol);
  const labels = rows.map(r => r.label);
  assert.ok(labels.includes('＋ Add assumption'));
  assert.ok(labels.some(l => l.startsWith('? Users allow push')));
  const assumpRow = rows.find(r => r.submenu && r.label.startsWith('? Users allow push'));
  assert.ok(assumpRow, 'assumption is a submenu row');
  const on = assumpRow.submenu.find(r => r.on);
  assert.equal(on.commit.value, 'testing', 'current status marked');
  assert.ok(assumpRow.submenu.some(r => r.commit && r.commit.kind === 'removeassump' && r.danger));
  // Remove branch stays last
  assert.equal(labels[labels.length - 1], 'Remove branch');
  // assumption rows sit strictly between ＋ Add assumption and Remove branch, in source order
  const iAdd = labels.indexOf('＋ Add assumption');
  const iCopy = labels.findIndex(l => l.startsWith('? Copy lands'));
  const iUsers = labels.findIndex(l => l.startsWith('? Users allow push'));
  const iRemove = labels.length - 1;
  assert.ok(iAdd < iUsers && iUsers < iCopy && iCopy < iRemove, 'assumption rows ordered between ＋ Add and Remove branch');
});

test('solutionMenu: every ASSUMPTION_CYCLE state is offered as a submenu commit row', () => {
  const src = 'Grow\n  Opp\n    Sol\n      ? A [broken]';
  const model = parse(src);
  const rows = solutionMenu(model, findSrcLine(model, 'Sol'));
  const assumpRow = rows.find(r => r.submenu);
  const stateLabels = assumpRow.submenu.filter(r => r.commit && r.commit.kind === 'astatus').map(r => r.label);
  assert.deepEqual(stateLabels, ['untested', 'testing', 'holds', 'broken']);
  const on = assumpRow.submenu.filter(r => r.on);
  assert.equal(on.length, 1);
  assert.equal(on[0].label, 'broken');
});

test('solutionMenu: a solution with no assumptions returns exactly the base rows', () => {
  const model = parse('Grow\n  Opp\n    Sol');
  const rows = solutionMenu(model, findSrcLine(model, 'Sol'));
  assert.deepEqual(rows.map(r => r.label), ['Rename…', 'Status…', '＋ Add assumption', 'Remove branch']);
});

test('solutionMenu: an unknown srcLine (e.g. -1) returns the base rows, no throw', () => {
  const model = parse('Grow\n  Opp\n    Sol\n      ? A');
  const rows = solutionMenu(model, 999);
  assert.deepEqual(rows.map(r => r.label), ['Rename…', 'Status…', '＋ Add assumption', 'Remove branch']);
});
