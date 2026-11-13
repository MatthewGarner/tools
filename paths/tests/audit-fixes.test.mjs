/* Engine-audit fixes for Paths: names, the inspector, the verdict. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {project} from '../project.js';
import {evaluate} from '../evaluate.js';
import {treeProjection} from '../tree.js';
import {verdict} from '../verdict.js';
import {overviewProjection} from '../overview.js';
import {decisionInspectorData} from '../inspector.js';
import {learningAgendaProjection} from '../learning-agenda.js';
import {roadmapProjectionChoices, inspectRoadmapProjection} from '../handoff-roadmap.js';
import {treeLayout} from '../layout-tree.js';
import {renderTree} from '../render-tree.js';
import {renderPlans} from '../render-plans.js';

const TODAY = '2026-11-13';
const colors = {bg: '#FBFBFA', card: '#F4F4F1', ink: '#111111', muted: '#6B6B68', border: '#D9D9D5', accent: '#1F4FD8', accentInk: '#1A44C2', err: '#B3403A', track: '#EDF0EE',
  status: {done: '#1D7A3E', doing: '#1F4FD8', risk: '#9A6A00', blocked: '#B3403A'}, statusInk: {done: '#1C753C', doing: '#1A44C2', risk: '#8E6200', blocked: '#B3403A'}};
const measure = t => String(t).length * 7;
const texts = svg => [...String(svg).matchAll(/>([^<>]+)</g)].map(x => x[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')).join(' | ');
const D = (n, extra = '', due = '2026-10-01') => `decision ${n}:\n  question: Does ${n} hold?\n  signal: s ${n}\n  owner: o\n  answer-by: ${due}\n${extra}`;
const proj = (src, today = TODAY) => project(parse(src), today);

/* ---------- PA-1 / PA-2: a name the author typed is only a name ---------- */
test('PA-1: an item condition naming "constructor" parses and projects (and says the decision is unknown)', () => {
  const m = parse('NOW\n  A: x [if constructor]');
  assert.ok(m.warnings.some(w => w.code === 'unknown-item-decision'), JSON.stringify(m.warnings.map(w => w.code)));
  assert.doesNotThrow(() => project(m, TODAY));
  assert.doesNotThrow(() => proj('decision constructor:\n  question: q\nNOW\n  A: x [if constructor]'));
});

test('PA-2: a decision named "constructor" is kept, answered, enumerated and handed on like any other name', () => {
  const answered = proj(D('constructor', '  answer: yes 2026-09-01\n') + 'NOW\n  A: x [if constructor]\n  B: y [unless constructor]');
  assert.equal(answered.decisions.length, 1);
  assert.ok(!answered.warnings.some(w => w.code === 'duplicate-decision'));
  assert.deepEqual(answered.items.map(i => i.itemState), ['in-plan', 'not-needed']);
  assert.equal(Object.getPrototypeOf(answered.decisionByName), null);
  assert.equal(answered.decisionByName.constructor.key, 'constructor');

  const open = proj(D('constructor') + 'NOW\n  A: x [if constructor]');
  assert.equal(open.worlds.plans.length, 2, 'the open question splits the plan in two');
  assert.deepEqual(Object.keys(open.worlds.plans[0].assignments[0].answers), ['constructor']);
  const walk = evaluate(parse(D('constructor') + 'NOW\n  A: x [if constructor]'), TODAY, {constructor: 'yes'});
  assert.equal(walk.items[0].itemState, 'in-plan', 'a hypothetical answer under that name is read');
  assert.equal(evaluate(parse(D('constructor') + 'NOW\n  A: x [if constructor]'), TODAY, {}).items[0].itemState, 'waiting');

  const dup = parse(D('constructor') + D('constructor') + 'NOW\n  A: x [if constructor]');
  assert.ok(dup.warnings.some(w => w.code === 'duplicate-decision'), 'a genuine duplicate is still reported');
});

test('PA-1/2: every surface survives the name, including lanes, periods and the Roadmap hand-off', () => {
  const src = D('constructor') + D('other', '  when: constructor\n') + 'constructor\n  constructor: A [if constructor]\n  Lane: B [if other]\nLATER\n  Lane: C [unless constructor]';
  const p = proj(src), m = parse(src);
  assert.doesNotThrow(() => { overviewProjection(p); treeProjection(p); learningAgendaProjection(m, p); roadmapProjectionChoices(m, TODAY); });
  const tp = treeProjection(p);
  for(const q of tp.questions) assert.doesNotThrow(() => decisionInspectorData(q));
  assert.equal(roadmapProjectionChoices(m, TODAY).ok, true);
});

/* ---------- PA-3 / PA-4 / PA-13: the inspector and the sentences say what the evaluator says ---------- */
const MOOT = D('host', '  answer: no 2026-09-01\n') + D('child', '  when: host\n') + 'NOW\n  A: fallback [unless child]\n  B: main [if child]\n';

test('PA-4: an item included because its question never arose is not described as answered no', () => {
  const p = proj(MOOT), a = overviewProjection(p).items.find(i => i.title === 'fallback');
  assert.ok(!/Child = no/i.test(a.displayState.sentence), a.displayState.sentence);
  assert.match(a.displayState.sentence, /never arose/);
  const b = overviewProjection(p).items.find(i => i.title === 'main');
  assert.match(b.displayState.sentence, /^Not pursuing/);
});

test('PA-3: the inspector lists that included item as Included, and says why', () => {
  const p = proj(MOOT), tp = treeProjection(p);
  const arms = decisionInspectorData(tp.questions.find(q => q.key === 'child')).arms;
  const all = [...arms.yes, ...arms.no];
  const fallback = all.find(x => x.title === 'fallback'), main = all.find(x => x.title === 'main');
  assert.equal(fallback.treatment, 'Included');
  assert.match(fallback.reason, /never arose/);
  assert.equal(main.treatment, 'Not needed');
});

/* random documents: a port of the audit harness generator */
function rng(seed){ let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const NAMES = ['groups', 'pricing', 'reminders', 'pilot', 'supply', 'coach-fee', 'beta2'];
function randDoc(r){
  const k = 1 + Math.floor(r() * 5), items = 3 + Math.floor(r() * 7), names = NAMES.slice(0, k), pick = () => names[Math.floor(r() * names.length)];
  const condTxt = () => { const n = 1 + Math.floor(r() * Math.min(3, names.length)), op = r() < 0.5 ? ' and ' : ' or ';
    return [...new Set(Array.from({length: n}, pick))].map(t => (r() < 0.3 ? 'not ' : '') + t).join(op); };
  const date = () => '2026-' + String(8 + Math.floor(r() * 6)).padStart(2, '0') + '-' + String(1 + Math.floor(r() * 28)).padStart(2, '0');
  let s = 'title: Fuzz\n';
  for(const n of names){
    s += `decision ${n}:\n  question: Does ${n} hold?\n  signal: s\n  owner: o\n`;
    if(r() < 0.85) s += `  answer-by: ${date()}\n`;
    if(r() < 0.3) s += `  answer: ${r() < 0.5 ? 'yes' : 'no'} ${date()}\n`;
    if(r() < 0.3) s += `  assume: ${r() < 0.5 ? 'yes' : 'no'} ${date()}\n`;
    if(r() < 0.35) s += `  when: ${condTxt()}\n`;
  }
  s += 'NOW\n';
  for(let i = 0; i < items; i++){
    if(i === Math.floor(items / 2)) s += 'LATER\n';
    const st = r(), status = st < 0.15 ? ' [done]' : st < 0.25 ? ' [doing]' : st < 0.3 ? ' [risk]' : '';
    const c = r() < 0.8 ? (r() < 0.2 ? ` [unless ${pick()}]` : ` [if ${condTxt()}]`) : '';
    s += `  Lane${i % 3}: Item ${i}${c}${status}\n`;
  }
  return s;
}
const todayFor = r => '2026-' + String(8 + Math.floor(r() * 6)).padStart(2, '0') + '-' + String(1 + Math.floor(r() * 28)).padStart(2, '0');

test('PA-3: across random documents the inspector listing equals the evaluator\'s state for every item it lists', () => {
  const r = rng(31);
  let listings = 0, bad = null;
  const expected = it => it.condition && (!it.condition.valid || it.conditionResult.value === 'invalid') ? 'Condition needs fixing'
    : it.status === 'done' && it.conditionResult.value === 'false' ? 'Completed'
    : it.itemState === 'in-plan' ? 'Included' : it.itemState === 'not-needed' ? 'Not needed' : it.itemState === 'limbo' ? 'Following' : 'Waiting';
  for(let t = 0; t < 400; t++){
    const p = proj(randDoc(r), todayFor(r)), tp = treeProjection(p);
    for(const q of tp.questions){
      const data = decisionInspectorData(q);
      for(const entry of [...data.arms.yes, ...data.arms.no]){
        const it = p.items.find(i => i.title === entry.title); listings++;
        if(!entry.treatment.startsWith(expected(it))) bad = bad || {item: it.raw, state: it.itemState, kind: it.displayEvidence.kind, shown: entry.treatment};
      }
    }
  }
  assert.ok(listings > 500, listings + ' listings checked');
  assert.equal(bad, null, JSON.stringify(bad));
});

test('PA-4: across random documents no "Proceeding after X = no" is printed for an X that never arose', () => {
  const r = rng(32);
  for(let t = 0; t < 300; t++){
    const p = proj(randDoc(r), todayFor(r));
    for(const it of overviewProjection(p).items){
      const src = p.items.find(i => i.identity === it.identity);
      if(it.displayState.kind === 'proceeding' && src.condition?.terms.some(term => p.decisionByName[term.key]?.availability === 'moot'))
        assert.ok(!/ = no/.test(it.displayState.sentence) || /never arose/.test(it.displayState.sentence), it.displayState.sentence);
    }
  }
});

test('PA-13: the moot-answer notice states the answer that was actually given', () => {
  const p = proj(D('h', '  answer: yes 2026-09-01\n') + D('c', '  when: not h\n  answer: yes 2026-09-02\n') + 'NOW\n  X: x [if c]\n  Y: y [if h]');
  const notice = decisionInspectorData(treeProjection(p).questions.find(q => q.key === 'c')).answerNotice;
  assert.match(notice, /because h was yes/);
  assert.ok(!/resolved no/.test(notice), notice);
  const q = proj(D('h', '  answer: no 2026-09-01\n') + D('c', '  when: h\n  answer: yes 2026-09-02\n') + 'NOW\n  X: x [if c]');
  assert.match(decisionInspectorData(treeProjection(q).questions.find(x => x.key === 'c')).answerNotice, /because h was no/);
});

/* ---------- PA-5 / PA-11: the verdict ---------- */
test('PA-5: "Every item is included" is said only when it is true; otherwise it counts both groups', () => {
  assert.equal(verdict(proj(MOOT)).line, 'One of two items is included in every plan; one is not needed.');
  assert.equal(verdict(proj(D('host', '  answer: yes 2026-09-01\n') + 'NOW\n  A: x [if host]\n  B: y')).line, 'Every item is included in every remaining plan.');
  const three = verdict(proj(D('host', '  answer: no 2026-09-01\n') + 'NOW\n  A: x [if host]\n  B: y [if host]\n  C: z\n  D: w [unless host]\n  E: v')).line;
  assert.equal(three, 'Three of five items are included in every plan; two are not needed.');
});

test('PA-5: across random documents the sentence is never printed while an item is not included', () => {
  const r = rng(33);
  let said = 0;
  for(let t = 0; t < 400; t++){
    const p = proj(randDoc(r), todayFor(r)), v = verdict(p);
    if(v?.line?.startsWith('Every item')){ said++; assert.ok(p.items.every(i => i.itemState === 'in-plan'), JSON.stringify(p.items.map(i => i.itemState))); }
  }
  assert.ok(said > 0);
});

test('PA-11: only a question that is open and active counts as having no signal or owner', () => {
  const answered = 'decision a:\n  question: q\n  answer-by: 2026-10-01\n  answer: yes 2026-09-01\n' + D('b') + 'NOW\n  X: x [if a]\n  Y: y [if b]';
  const moot = 'decision a:\n  question: q\n  when: b\n' + D('b', '  answer: no 2026-09-01\n') + 'NOW\n  X: x [if a]\n  Y: y [if b]';
  for(const src of [answered, moot]){
    const line = verdict(proj(src, '2026-09-15')).line;
    assert.ok(!/cannot be answered/.test(line), line);
  }
  assert.match(verdict(proj(answered, '2026-09-15')).line, /depends on the b answer/, 'the open question speaks');
  const open = 'decision a:\n  question: q\n  answer-by: 2026-10-01\n' + D('b') + 'NOW\n  X: x [if a]\n  Y: y [if b]';
  assert.equal(verdict(proj(open, '2026-09-15')).line, '1 question has no signal or owner — it cannot be answered as written.');
  const dormant = 'decision a:\n  question: q\n  when: b\n  answer-by: 2026-10-01\n' + D('b') + 'NOW\n  X: x [if a]\n  Y: y [if b]';
  assert.ok(!/cannot be answered/.test(verdict(proj(dormant, '2026-09-15')).line), 'not open yet is not open and active');
});

