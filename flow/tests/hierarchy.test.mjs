import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const page = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');

test('Flow keeps one open queue diagnosis before a single active optional lens', () => {
  assert.match(page, /<section class="core-lesson"[^>]*data-flow-lesson="core"/);
  assert.doesNotMatch(page, /<details[^>]*class="core-lesson"/);
  assert.match(page, /id="core-lesson-heading">Read the queue first</);
  assert.match(page, /<section class="supporting-lessons"/);
  assert.equal((page.match(/data-flow-lesson="optional"/g) || []).length, 4);
  assert.match(page, /id="lens-chooser" role="tablist"/);
  assert.equal((page.match(/role="tab" aria-selected="true"/g) || []).length, 1);
  assert.equal((page.match(/data-flow-lesson="optional"[^>]*hidden/g) || []).length, 3);
  for(const id of ['batchcard', 'triagecard', 'expeditecard', 'dicecard'])
    assert.match(page, new RegExp('id="' + id + '"'));
  assert.match(app, /function selectLens\(next, focus = false\)/);
});

test('Flow gives the live queue a distinct, accessible next experiment', () => {
  assert.match(page, /id="core-transfer" class="core-transfer" aria-live="polite"/);
  assert.match(app, /function coreTransfer\(result, p, knee\)/);
  assert.match(app, /\$\('core-transfer'\)\.textContent = coreTransfer\(result, p, lastKnee\)/);
  assert.doesNotMatch(app, /core-receipt/);
});

test('Flow treats routine PNG copies as secondary actions', () => {
  for(const id of ['copypng', 'copybatchpng', 'copytriagepng', 'copyexpeditepng', 'copydicepng'])
    assert.match(page, new RegExp('<button class="btn" id="' + id + '"'));
});
