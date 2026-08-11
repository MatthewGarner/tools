import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {project} from '../project.js';
import {renderPlans, renderPlansNarrow} from '../render-plans.js';

const measure = text => String(text).length * 7;
const colors = {
  bg:'#FBFBFA', card:'#F4F4F1', ink:'#111111', muted:'#6B6B68', border:'#D9D9D5',
  accent:'#1F4FD8', accentInk:'#1A44C2', err:'#B3403A', track:'#EDF0EE',
  status:{done:'#1D7A3E', doing:'#1F4FD8', risk:'#9A6A00', blocked:'#B3403A'},
  statusInk:{done:'#1C753C', doing:'#1A44C2', risk:'#8E6200', blocked:'#B3403A'},
};
const context = projection => ({colors, measure, dark:false, today:'2026-08-11', projection});
const decision = (name, extra = '') => `decision ${name}:\n  question: Does ${name} hold?\n` +
  `  signal: measurable ${name}\n  owner: ${name} owner\n  answer-by: 2026-09-01${extra}\n`;
const render = (doc, narrow = false) => {
  const projection = project(parse(doc), '2026-08-11');
  return (narrow ? renderPlansNarrow : renderPlans)(projection,
    {...context(projection), ...(narrow ? {width:390} : {width:1160})});
};

test('real matrix merges equivalent assignments and shows full mechanical assignment labels', () => {
  const svg = render('style: plans\ntitle: Launch paths\ndate: 2026-08-11\n' +
    decision('groups') + decision('pricing') +
    'NOW\n  Core: Foundation\n  Growth: Either route [if groups or pricing]');
  assert.match(svg, /Launch paths/);
  assert.match(svg, /4 ASSIGNMENTS · 2 DISTINCT PLANS/);
  assert.match(svg, /COVERS 3 ASSIGNMENTS/);
  assert.match(svg, /groups — Answer: yes/);
  assert.match(svg, /pricing — Answer: no/);
  assert.match(svg, /Foundation/);
  assert.match(svg, /Either route/);
  assert.match(svg, /Included/);
  assert.match(svg, /Not needed/);
});

test('conditional headers call every unreached question Not open yet while cells keep assumption and waiting copy', () => {
  const svg = render('style: plans\ntoday: 2026-10-01\n' + decision('groups', '\n  assume: yes 2026-08-01') +
    decision('pricing', '\n  when: groups') +
    decision('stalled', '\n  when: groups not') +
    'NOW\n  Growth: Group work [if groups]\n  Market: Price work [if pricing]\n' +
    '  Core: Stalled work [if stalled]');
  assert.match(svg, /pricing — Not open yet/);
  assert.match(svg, /stalled — Not open yet/);
  assert.match(svg, /Following an assumed yes/);
  assert.match(svg, /Waiting for stalled/);
});

test('condition errors keep their exact repair label in wide and narrow cells', () => {
  const doc = 'style: plans\nNOW\n  Core: Repair this [if missing]';
  for(const svg of [render(doc), render(doc, true)]){
    assert.match(svg, /Condition needs fixing/);
    assert.doesNotMatch(svg, /Waiting for missing|Waiting for an answer/);
  }
});

test('plan headers give contextual truth for relevant authored, held and conditional decisions', () => {
  const doc = 'style: plans\n' + decision('settled', '\n  answer: yes 2026-08-01') +
    decision('a') + decision('b', '\n  when: a') +
    decision('held', '\n  when: missing\n  answer: yes 2026-08-01') +
    'NOW\n  Core: A work [if a]\n  Core: B work [if b]\n  Core: Held work [if held]';
  const svg = render(doc);
  assert.doesNotMatch(svg, /settled — Answer: yes/,
    'a settled decision with no matrix dependency is not header context');
  assert.match(svg, /held — Not open yet/);
  assert.match(svg, /a — Answer: yes/);
  assert.match(svg, /b — Answer: yes/);
  assert.match(svg, /a — Answer: no/);
  assert.match(svg, /b — Not open yet/);
});

test('unbroken valid titles and decision names hard-wrap without narrow overflow or text loss', () => {
  const longDecision = 'decision-' + 'x'.repeat(90);
  const waitingDecision = 'waiting-' + 'y'.repeat(90);
  const longTitle = 'T'.repeat(120);
  const itemTitle = 'I'.repeat(130);
  const doc = `style: plans\ntitle: ${longTitle}\n${decision(longDecision)}` +
    decision(waitingDecision, '\n  when: missing') +
    `NOW\n  Core: ${itemTitle} [risk] [if ${longDecision}]\n` +
    `  Core: Waiting item [blocked] [if ${waitingDecision}]`;
  const projection = project(parse(doc), '2026-08-11');
  const svg = renderPlansNarrow(projection, {...context(projection), width:320});
  assert.match(svg, /width="320"/);
  assert.match(svg, new RegExp(`<title>[^<]*${longDecision} — Answer: yes`));
  assert.match(svg, new RegExp(`${waitingDecision} — Not open yet`));
  assert.match(svg, new RegExp(`<title>${itemTitle}<\/title>`));
  assert.match(svg, /Waiting for/);
  assert.doesNotMatch(svg, new RegExp(`<text[^>]*>${longTitle}<`),
    'long title is split rather than overflowing one visible text node');
  assert.doesNotMatch(svg, new RegExp(`<text[^>]*>${itemTitle}<`),
    'long item is split rather than overflowing one visible text node');
  assert.doesNotMatch(svg, new RegExp(`<text[^>]*>[^<]*${longDecision}`),
    'long decision names are split in headers and bounded in the verdict');
  assert.doesNotMatch(svg, new RegExp(`<text[^>]*>[^<]*${waitingDecision}`),
    'long waiting labels are split rather than overflowing a state row');
  for(const match of svg.matchAll(/<text ([^>]*)>([^<]*)<\/text>/g)){
    if(/text-anchor="(?:end|middle)"/.test(match[1])) continue;
    const x = Number(/\bx="([^"]+)"/.exec(match[1])?.[1]);
    assert.ok(Number.isFinite(x) && x + match[2].length * 7 <= 320.01,
      `visible text crosses the 320px root: ${match[2]}`);
  }
  assert.doesNotMatch(svg, /NaN|Infinity/);
});

test('the share figure has exactly the three specified labels and is absent for a zero denominator', () => {
  const svg = render('style: plans\n' + decision('open') +
    'NOW\n  Core: Shared\n  Core: Conditional [if open]');
  for(const label of ['In every possible plan', 'Following an assumed answer', 'Depends on an answer'])
    assert.match(svg, new RegExp(label));
  assert.equal((svg.match(/data-kind="share-part"/g) || []).length, 3);
  const doneOnly = render('style: plans\nNOW\n  Core: Finished [done]');
  assert.doesNotMatch(doneOnly, /data-kind="share-figure"/);
});

test('enumeration refusal replaces matrix and figure with the actual guidance wide and narrow', () => {
  const decisions = Array.from({length:7}, (_, index) => decision('q' + index)).join('');
  const doc = 'style: plans\ntitle: Too many paths\n' + decisions +
    'NOW\n  Core: Conditional [if q0]';
  for(const svg of [render(doc), render(doc, true)]){
    assert.match(svg, /Seven open questions would make 128 possible plans\. Answer one, or use the Tree view\./);
    assert.match(svg, /Use style: tree/);
    assert.doesNotMatch(svg, /data-kind="plans-matrix"/);
    assert.doesNotMatch(svg, /data-kind="share-figure"/);
  }
});

test('narrow plans relayout is plan-first and preserves status, dependencies and display copy', () => {
  const svg = render('style: plans\n' + decision('groups') +
    'NOW\n  Growth: Group work [risk] [if groups]\n  Core: Shared work [doing]', true);
  assert.match(svg, /data-kind="plans-narrow"/);
  assert.match(svg, /POSSIBLE PLAN 1/);
  assert.match(svg, /RISK · Included|RISK · Not needed/);
  assert.match(svg, /DOING · Included/);
  assert.match(svg, /groups — Answer: yes/);
});

test('wide and narrow plans are complete accessible artefacts and escape hostile real source', () => {
  const hostile = '<script>alert(1)</script> & "quoted"';
  const doc = 'style: plans\ntitle: ' + hostile + '\ndate: 2026-08-11\nverdict: ' + hostile + '\n' +
    decision('choice') + 'NOW\n  Core: ' + hostile + ' [if choice]';
  for(const svg of [render(doc), render(doc, true)]){
    assert.match(svg, /role="img" aria-labelledby="paths-plans-name paths-plans-description"/);
    assert.match(svg, /<title id="paths-plans-name">/);
    assert.match(svg, /<desc id="paths-plans-description">/);
    assert.match(svg, /data-kind="artifact-header"/);
    assert.match(svg, /data-kind="artifact-verdict"/);
    assert.doesNotMatch(svg, /<script>/i);
    assert.match(svg, /&lt;script&gt;/);
  }
});
