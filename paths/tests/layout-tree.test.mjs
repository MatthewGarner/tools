import assert from 'node:assert/strict';
import test from 'node:test';

import {TREE_GEOMETRY, treeLayout} from '../layout-tree.js';

const measure = text => String(text).length * 7;
const item = (title, extra = {}) => ({title, ...extra});
const question = (key, {yes = [], no = [], answered = null} = {}) => ({
  key,
  decision:{key, name:key, question:key, effectiveAnswer:answered},
  arms:{yes, no},
  stump:null,
});
const projection = ({spine = [], questions = [], unplaced = [], breadcrumbs = []} = {}) => ({
  spine, questions, unplaced, breadcrumbs,
});

function overlaps(a, b){
  return a.x < b.x + b.w && b.x < a.x + a.w &&
    a.y < b.y + b.h && b.y < a.y + a.h;
}

test('spine and questions preserve projection order after TODAY', () => {
  const input = projection({
    spine:[item('First'), item('Second'), item('Third')],
    questions:[question('Q3'), question('Q1'), question('Q2')],
  });
  const layout = treeLayout(input, {width:1800, measure});

  assert.ok(layout.spine[0].x > layout.today.x + layout.today.w);
  assert.deepEqual(layout.spine.map(box => box.item.title), ['First', 'Second', 'Third']);
  assert.ok(layout.spine.every((box, index, boxes) => !index || boxes[index - 1].x < box.x));
  assert.deepEqual(layout.questions.map(box => box.question.key), ['Q3', 'Q1', 'Q2']);
  assert.ok(layout.questions[0].x > layout.spine.at(-1).x + layout.spine.at(-1).w);
});

test('yes and no arms sit symmetrically above and below the axis', () => {
  const layout = treeLayout(projection({questions:[question('Fork', {
    yes:[item('Yes item')], no:[item('No item')],
  })]}), {width:900, measure});
  const fork = layout.questions[0];
  const yes = fork.arms.yes[0];
  const no = fork.arms.no[0];

  assert.ok(yes.y + yes.h < layout.axisY);
  assert.ok(no.y > layout.axisY);
  assert.equal(fork.diamond.y - (yes.y + yes.h), no.y - (fork.diamond.y + fork.diamond.h));
  assert.equal(fork.diamond.y - (yes.y + yes.h), TREE_GEOMETRY.branchGap);
});

test('laid-out boxes do not overlap', () => {
  const layout = treeLayout(projection({
    spine:[item('Spine A'), item('Spine B with a longer title')],
    questions:[
      question('One', {yes:[item('One yes'), item('One yes two')], no:[item('One no')]}),
      question('Two', {yes:[item('Two yes')], no:[item('Two no'), item('Two no two')]}),
    ],
    unplaced:[item('Loose A'), item('Loose B')],
  }), {width:1500, measure});
  const boxes = [layout.today, ...layout.spine, ...layout.questions.map(entry => entry.diamond),
    ...layout.questions.flatMap(entry => [...entry.arms.yes, ...entry.arms.no]), ...layout.unplaced];

  for(let left = 0; left < boxes.length; left++){
    for(let right = left + 1; right < boxes.length; right++){
      assert.equal(overlaps(boxes[left], boxes[right]), false, `boxes ${left} and ${right} overlap`);
    }
  }
});

test('content height grows to its measured bottom instead of using a fixed canvas', () => {
  const short = treeLayout(projection({questions:[question('Fork', {
    yes:[item('Short')], no:[item('Short')],
  })]}), {width:900, measure});
  const tall = treeLayout(projection({questions:[question('Fork', {
    yes:[item('A'), item('B'), item('C'), item('D')],
    no:[item('A'), item('B'), item('C'), item('D')],
  })], unplaced:[item('A loose item with enough words to occupy more space')]}), {width:900, measure});
  const lastLoose = tall.unplaced.at(-1);

  assert.ok(tall.height > short.height);
  assert.equal(tall.height, Math.ceil(lastLoose.y + lastLoose.h + TREE_GEOMETRY.marginY));
  assert.equal(tall.totalHeight, tall.height);
});

test('width pressure collapses oldest answered questions in breadcrumb order until it fits', () => {
  const questions = [question('Old', {answered:'yes'}), question('Middle', {answered:'no'}), question('New')];
  const breadcrumbs = questions.slice(0, 2).map(entry => ({
    key:entry.key, decision:entry.decision, direction:entry.decision.effectiveAnswer,
  }));
  const layout = treeLayout(projection({questions, breadcrumbs}), {width:850, measure});

  assert.deepEqual(layout.collapsedKeys, ['Old']);
  assert.deepEqual(layout.breadcrumbs.map(box => box.crumb.key), ['Old']);
  assert.deepEqual(layout.questions.map(box => box.question.key), ['Middle', 'New']);
  assert.equal(layout.overflow, false);
  assert.equal(layout.compressed, false);
});

test('question gaps compress before unavoidable overflow and flags report both states', () => {
  const input = projection({questions:[question('One'), question('Two'), question('Three')]});
  const fitsCompressed = treeLayout(input, {width:950, measure});
  const overflowsCompressed = treeLayout(input, {width:850, measure});

  assert.equal(fitsCompressed.compressed, true);
  assert.equal(fitsCompressed.overflow, false);
  assert.ok(fitsCompressed.questionGap >= fitsCompressed.minQuestionGap);
  assert.equal(overflowsCompressed.compressed, true);
  assert.equal(overflowsCompressed.questionGap, overflowsCompressed.minQuestionGap);
  assert.equal(overflowsCompressed.overflow, true);
  assert.ok(overflowsCompressed.contentWidth > overflowsCompressed.width);
});

test('a question with empty arms still places its diamond', () => {
  const layout = treeLayout(projection({questions:[question('Empty')]}), {width:600, measure});

  assert.equal(layout.questions.length, 1);
  assert.equal(layout.questions[0].diamond.cy, layout.axisY);
  assert.deepEqual(layout.questions[0].arms, {yes:[], no:[]});
});

test('unplaced items wrap into boxes and none are dropped', () => {
  const loose = [item('First loose'), item('Second loose'), item('Third loose')];
  const layout = treeLayout(projection({unplaced:loose}), {width:440, measure});

  assert.equal(layout.unplaced.length, loose.length);
  assert.deepEqual(layout.unplaced.map(box => box.item), loose);
  assert.ok(layout.unplaced.every(box => Number.isFinite(box.x) && Number.isFinite(box.y)));
  assert.ok(layout.unplaced[2].y > layout.unplaced[0].y);
});
