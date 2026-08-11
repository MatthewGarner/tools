import assert from 'node:assert/strict';
import test from 'node:test';

import {TREE_GEOMETRY, treeLayout} from '../layout-tree.js';
import {parse} from '../parse.js';
import {project} from '../project.js';
import {treeProjection} from '../tree.js';

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

test('unequal arms offset the short stream to a shared outer horizon with clear labels', () => {
  const layout = treeLayout(projection({questions:[
    question('Short yes', {yes:[item('Yes')], no:[item('No 1'), item('No 2'), item('No 3')]}),
    question('Short no', {yes:[item('Yes 1'), item('Yes 2')], no:[item('No')]}),
  ]}), {width:1200, measure});

  for(const fork of layout.questions){
    const yesOuter = Math.min(...fork.arms.yes.map(box => box.y));
    const noOuter = Math.max(...fork.arms.no.map(box => box.y + box.h));
    assert.equal(fork.diamond.y - yesOuter, noOuter - (fork.diamond.y + fork.diamond.h));
    assert.equal(fork.connectors.yes.y1, yesOuter);
    assert.equal(fork.connectors.yes.y2, fork.diamond.y);
    assert.equal(fork.connectors.no.y1, fork.diamond.y + fork.diamond.h);
    assert.equal(fork.connectors.no.y2, noOuter);
    for(const label of fork.armLabels){
      const connector = fork.connectors[label.side];
      assert.ok(label.x > connector.x, `${label.text} sits beside, not over, its connector`);
      if(label.side === 'yes') assert.ok(connector.nearY < label.y && label.y < fork.diamond.y);
      else assert.ok(fork.diamond.y + fork.diamond.h < label.y && label.y < connector.nearY);
    }
  }

  const first = layout.questions[0];
  assert.ok(first.diamond.y - (first.arms.yes[0].y + first.arms.yes[0].h) > TREE_GEOMETRY.branchGap);
  const second = layout.questions[1];
  assert.ok(second.arms.no[0].y - (second.diamond.y + second.diamond.h) > TREE_GEOMETRY.branchGap);
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

test('520–899px wide layouts keep the real requested width and compress before collapsing answers', () => {
  const questions = [question('Answered', {answered:'yes'}), question('Open')];
  const breadcrumbs = [{key:'Answered', decision:questions[0].decision, direction:'yes'}];
  const compressed = treeLayout(projection({questions, breadcrumbs}), {width:700, measure});

  assert.equal(compressed.width, 700);
  assert.equal(compressed.contentWidth, 700);
  assert.deepEqual(compressed.collapsedKeys, [], 'the answer stays a diamond while the minimum gap fits');
  assert.equal(compressed.compressed, true);
  assert.ok(compressed.questionGap >= compressed.minQuestionGap);

  for(const width of [520, 640, 799, 899]){
    const layout = treeLayout(projection({questions:[question('One'), question('Two'), question('Three')]}),
      {width, measure});
    assert.equal(layout.width, width, `${width}px is not inflated to a desktop minimum`);
  }
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

test('real answered documents place chosen work on the horizontal spine after the diamond', () => {
  const doc = `decision fork:\n  question: fork?\n  signal: signal\n  owner: owner\n` +
    `  answer-by: 2026-12-15\n  answer: yes\nNOW\n  Core: Chosen [if fork]\n` +
    `  Core: Rejected [unless fork]`;
  const topology = treeProjection(project(parse(doc), '2026-12-20'));
  const layout = treeLayout(topology, {width:1000, measure});
  const fork = layout.questions[0];
  assert.equal(fork.continuation.length, 1);
  assert.ok(fork.continuation[0].x > fork.diamond.x + fork.diamond.w);
  assert.equal(fork.continuation[0].y + fork.continuation[0].h / 2, layout.axisY);
  assert.deepEqual(fork.arms, {yes:[], no:[]});
  assert.equal(fork.stump.side, 'no');
});

function realLayout(document, width){
  return treeLayout(treeProjection(project(parse(document), '2026-12-20')), {width, measure});
}

function assertFiniteNumbers(value, path = 'layout', seen = new Set()){
  if(!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  for(const [key, member] of Object.entries(value)){
    const memberPath = `${path}.${key}`;
    if(typeof member === 'number')
      assert.ok(Number.isFinite(member), `${memberPath} must be finite, got ${member}`);
    else assertFiniteNumbers(member, memberPath, seen);
  }
}

test('empty and fully-collapsed real documents return only finite geometry', () => {
  const empty = realLayout('', 320);
  assertFiniteNumbers(empty);
  assert.equal(empty.spineRun.x1, 124);
  assert.equal(empty.spineRun.x2, 124);
  assert.equal(empty.terminal, null);
  assert.deepEqual(empty.spineRun.items, []);
  assertFiniteNumbers(realLayout('', Infinity));

  const collapsed = realLayout(`decision settled:\n  question: Settled?\n  signal: signal\n` +
    `  owner: owner\n  answer-by: 2026-12-01\n  answer: no`, 1);
  assert.deepEqual(collapsed.collapsedKeys, ['settled']);
  assert.equal(collapsed.questions.length, 0);
  assertFiniteNumbers(collapsed);
});

test('the terminal is an in-plane endpoint connected after the final decision', () => {
  const layout = realLayout(`decision fork:\n  question: fork?\n  signal: signal\n` +
    `  owner: owner\n  answer-by: 2026-12-15\nNOW\n  Core: Yes [if fork]`, 1160);
  const fork = layout.questions.at(-1);
  assert.ok(layout.terminal.x > fork.x + fork.w);
  assert.equal(layout.terminal.cy, layout.axisY);
  assert.equal(layout.spineRun.x2, layout.terminal.x);
  assert.equal(layout.terminal.source.possibleCount, 2);
});

test('a fully collapsed real question lays out every selected and rejected semantic output', () => {
  const layout = realLayout(`decision fork:\n  question: fork?\n  signal: signal\n  owner: owner\n` +
    `  answer-by: 2026-12-15\n  answer: yes\nNOW\n  Core: Chosen [if fork]\n` +
    `  Core: Done fallback [unless fork] [done]\n  Core: Unbuilt fallback [unless fork]`, 1);
  const crumb = layout.breadcrumbs[0];
  assert.deepEqual(layout.continuations.map(box => box.item.title), ['Chosen']);
  assert.deepEqual(crumb.arms.no.map(box => box.item.title), ['Done fallback']);
  assert.deepEqual(crumb.stump.items.map(item => item.title), ['Unbuilt fallback']);
  assert.equal(crumb.stump.side, 'no');
  assertFiniteNumbers(layout);
});

test('real compound cards reserve disjoint rows for metadata, copy and every dependency', () => {
  const doc = `decision launch-window:\n  question: window?\n  signal: signal\n  owner: owner\n  answer-by: 2026-12-11\n` +
    `decision coach-pricing:\n  question: pricing?\n  signal: signal\n  owner: owner\n  answer-by: 2026-12-12\n` +
    `decision group-moderation:\n  question: moderation?\n  signal: signal\n  owner: owner\n  answer-by: 2026-12-13\n` +
    `LATER\n  Marketplace: A deliberately long launch title [blocked] ` +
    `[if launch-window and coach-pricing and group-moderation] -- preserve this decision note`;
  const layout = realLayout(doc, 1160);
  const boxes = layout.questions.flatMap(entry => [...entry.arms.yes, ...entry.arms.no]);
  const box = boxes.find(candidate => candidate.item.title.includes('deliberately long'));
  assert.ok(box, 'real projected card is present');

  const rows = [box.card.rows.meta, box.card.rows.title, box.card.rows.state,
    box.card.rows.note, box.card.rows.primary, ...box.card.rows.secondary].filter(Boolean)
    .sort((left, right) => left.y - right.y);
  for(let index = 1; index < rows.length; index++)
    assert.ok(rows[index - 1].y + rows[index - 1].h <= rows[index].y,
      `row ${index - 1} does not overlap row ${index}`);
  assert.ok(rows.at(-1).y + rows.at(-1).h < box.h, 'last dependency stays inside the card');
  assert.ok(box.card.rows.meta.lane.x + box.card.rows.meta.lane.w <= box.card.rows.meta.status.x,
    'lane label cannot run under the status tag');
  assert.equal(box.card.rows.secondary.length, 2, 'each required secondary dependency owns a row');
});
