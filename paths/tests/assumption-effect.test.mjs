/* Two owner decisions on assumptions.
   1. An assumption is in force once BOTH dates have passed: today is later than `answer-by` and today is
      on or after the assumption's own date.
   2. An item an assumption rules out is "set aside", not "following" it: each item's condition is
      re-read as if every assumption in force were the answer.
   The reference evaluator below is written from that rule alone and shares no code with the engine. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {project} from '../project.js';
import {evaluate} from '../evaluate.js';
import {verdict} from '../verdict.js';
import {treeProjection} from '../tree.js';
import {treeLayout} from '../layout-tree.js';
import {renderTree, renderOutline} from '../render-tree.js';
import {renderPlans, renderPlansNarrow, planCellDisplay} from '../render-plans.js';
import {renderOverview} from '../render-overview.js';
import {renderConditions} from '../render-conditions.js';
import {renderQuestionLens} from '../render-question-lens.js';
import {renderDependencies} from '../render-dependencies.js';
import {renderLearningAgenda} from '../render-learning-agenda.js';
import {overviewProjection, decisionImpactProjection} from '../overview.js';
import {learningAgendaProjection} from '../learning-agenda.js';
import {decisionInspectorData} from '../inspector.js';
import {roadmapProjectionChoices, buildRoadmapProjection, projectionAcceptance} from '../handoff-roadmap.js';

const measure = t => String(t).length * 7;
const colors = {bg:'#FBFBFA', card:'#F4F4F1', ink:'#111111', muted:'#6B6B68', border:'#D9D9D5', accent:'#1F4FD8',
  accentInk:'#1A44C2', err:'#B3403A', track:'#EDF0EE',
  status:{done:'#1D7A3E', doing:'#1F4FD8', risk:'#9A6A00', blocked:'#B3403A'},
  statusInk:{done:'#1C753C', doing:'#1A44C2', risk:'#8E6200', blocked:'#B3403A'}};
const dec = s => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
const texts = svg => [...String(svg).matchAll(/>([^<>]+)</g)].map(x => dec(x[1])).join(' | ');
const D = (n, extra = '', due = '2026-10-01') => `decision ${n}:\n  question: Does ${n} hold?\n  signal: s ${n}\n  owner: o\n  answer-by: ${due}\n${extra}`;
const TODAY = '2026-11-13';
const proj = (src, today = TODAY) => project(parse(src), today);
const ctxFor = (p, width = 1160) => ({colors, measure, dark:false, today:p.today, projection:p, width});

/* ---------- 1. when an assumption takes effect ---------- */
const inForce = (src, today = TODAY) => proj(src, today).decisions[0].assumption.inForce;
const A = (assumeDate, due) => D('a', `  assume: yes ${assumeDate}\n`, due) + 'NOW\n  X: x [if a]';

test('an assumption dated after today is not in force, even once the answer is overdue', () => {
  const p = proj(A('2026-12-31', '2026-10-01'));            // overdue since 1 October, starts 31 December
  assert.equal(p.decisions[0].overdue, true);
  assert.equal(p.decisions[0].assumption.inForce, false);
  assert.equal(p.items[0].itemState, 'waiting');
  assert.deepEqual([...p.decisions[0].provenance], ['unknown']);
});

test('an assumption is in force once today is after answer-by AND on or after its own date', () => {
  assert.equal(inForce(A('2026-11-01', '2026-10-01')), true, 'both dates passed');
  assert.equal(inForce(A('2026-11-13', '2026-10-01')), true, 'its own date is today: starts that day (on or after)');
  assert.equal(inForce(A('2026-11-14', '2026-10-01')), false, 'its own date is tomorrow');
  assert.equal(inForce(A('2026-11-01', '2026-11-13')), false, 'today is answer-by: not yet overdue (after, not on)');
  assert.equal(inForce(A('2026-11-01', '2026-11-12')), true, 'the day after answer-by');
  assert.equal(inForce(A('2026-10-01', '2026-12-01')), false, 'dated before the due date: waits for the due date');
});

test('an assumption with no date of its own is gated by answer-by alone, as before', () => {
  const m = parse(D('a', '  assume: yes 2026-10-01\n') + 'NOW\n  X: x [if a]');
  m.decisions[0].assumption.date = null;               // the parser always supplies a date; a hand-built model may not
  assert.equal(evaluate(m, TODAY).decisionByName.a.assumption.inForce, true);
  assert.equal(evaluate(m, '2026-10-01').decisionByName.a.assumption.inForce, false);
});

test('an overdue question with an assumption not yet in force is plainly overdue and unanswered, and says when it starts', () => {
  const p = proj(A('2026-12-22', '2026-10-01'));
  const o = overviewProjection(p);
  assert.equal(o.decisions[0].currentState.kind, 'overdue');
  assert.equal(o.decisions[0].currentState.sentence, 'Unanswered — overdue since 2026-10-01; assumed yes from 22 December');
  assert.equal(o.items[0].displayState.kind, 'waiting');
  assert.equal(verdict(p).line, 'The a answer is 43 days overdue; assumed yes from 22 December.');
  assert.equal(p.shares.assumed, 0);
  assert.equal(o.groups.workingToAssumption.length, 0);
  assert.equal(learningAgendaProjection(parse(A('2026-12-22', '2026-10-01')), p).assumptions.length, 0);
});

test('the warning says what is true and which change would put the assumption to use now', () => {
  const warn = (src, today = TODAY) => proj(src, today).warnings.find(w => /^assumption-(before-due|not-started)$/.test(w.code));
  const waitingOnDue = warn(A('2026-11-01', '2026-12-01'));
  assert.equal(waitingOnDue.code, 'assumption-before-due');
  assert.equal(waitingOnDue.message, 'line 6: the assumption for "a" is not in force yet — it takes effect after the answer is due (1 December); to use it now, move "answer-by:" to a date before today');
  const both = warn(A('2026-12-31', '2026-12-01'));
  assert.equal(both.message, 'line 6: the assumption for "a" is not in force yet — it takes effect after the answer is due (1 December) and on its own date (31 December); to use it now, move "answer-by:" to a date before today and set the assumption date to today or earlier');
  const notStarted = warn(A('2026-12-31', '2026-10-01'));
  assert.equal(notStarted.code, 'assumption-not-started');
  assert.equal(notStarted.message, 'line 6: the assumption for "a" is not in force yet — it takes effect on its own date (31 December); to use it now, set the assumption date to today or earlier');
  // following the advice clears the warning
  assert.equal(warn(A('2026-11-13', '2026-10-01')), undefined);
  assert.equal(warn(A('2026-11-01', '2026-11-12')), undefined);
  assert.equal(proj(A('2026-11-13', '2026-11-12')).decisions[0].assumption.inForce, true);
});

/* ---------- 2. the two directions ---------- */
const doc = (assume, items, extra = '') => D('pricing', `  assume: ${assume} 2026-11-01\n`, '2026-10-01') + extra + 'NOW\n' + items;
const ITEMS = '  A: Premium tier [if pricing]\n  B: Free fallback [unless pricing]';
const CASES = [
  // assume, item, state, Brief sentence, tree/inspector label, label in the plan that matches the assumption, label in the other plan
  ['yes', 'Premium tier [if pricing]', 'limbo', 'Working to the assumption Pricing = yes', 'Following an assumed yes', 'Following an assumed yes', 'Not needed'],
  ['yes', 'Free fallback [unless pricing]', 'set-aside', 'Set aside on the assumption Pricing = yes', 'Set aside on an assumed yes', 'Set aside on an assumed yes', 'Included'],
  ['no', 'Premium tier [if pricing]', 'set-aside', 'Set aside on the assumption Pricing = no', 'Set aside on an assumed no', 'Set aside on an assumed no', 'Included'],
  ['no', 'Free fallback [unless pricing]', 'limbo', 'Working to the assumption Pricing = no', 'Following an assumed no', 'Following an assumed no', 'Not needed'],
];

test('an [if x] and an [unless x] item go opposite ways under assume: yes and assume: no', () => {
  for(const [assume, line, state, sentence] of CASES){
    const p = proj(doc(assume, '  Lane: ' + line));
    const item = p.items[0], o = overviewProjection(p).items[0];
    assert.equal(item.itemState, state, assume + ' ' + line);
    assert.equal(o.displayState.sentence, sentence);
    assert.equal(o.displayState.kind, state === 'limbo' ? 'assumption' : 'set-aside');
    assert.equal(item.displayEvidence.kind, state === 'limbo' ? 'assumption' : 'set-aside');
    assert.equal(item.displayEvidence.direction, assume);
    assert.equal(item.conditionResult.value, 'unknown', 'the evaluator\'s three-valued logic is untouched');
  }
});

test('every surface names the state: tree, outline, inspector, Plans cells wide and narrow, hand-off', () => {
  for(const [assume, line, , , label, matching, other] of CASES){
    const src = doc(assume, '  Lane: ' + line), p = proj(src), tp = treeProjection(p);
    const tree = texts(renderTree(tp, treeLayout(tp, {width:1160, measure}), ctxFor(p)));
    assert.ok(tree.includes(label), label + ' in tree: ' + tree);
    assert.ok(texts(renderOutline(tp, ctxFor(p))).includes(label));
    const data = decisionInspectorData(tp.questions[0]);
    assert.equal([...data.arms.yes, ...data.arms.no][0].treatment, label);
    const planFor = pred => p.worlds.plans.find(pl => pl.assignments.every(a => pred(a.answers.pricing)));
    assert.equal(planCellDisplay(p, planFor(a => a === assume), p.items[0].identity).label, matching);
    assert.equal(planCellDisplay(p, planFor(a => a !== assume), p.items[0].identity).label, other);
    for(const svg of [renderPlans(p, ctxFor(p)), renderPlansNarrow(p, ctxFor(p, 390))]) assert.ok(texts(svg).includes(matching), matching + ' in Plans');
    assert.equal(roadmapProjectionChoices(parse(src + '\nLATER\n  Lane: Later work'), TODAY).ok, true);
  }
});

test('the verdict counts the two kinds apart and keeps its present form when only one kind exists', () => {
  const line = src => verdict(proj(src)).line;
  assert.equal(line(doc('yes', ITEMS)), 'The pricing answer is 43 days overdue; 1 item is following an assumed yes; 1 is set aside by it.');
  assert.equal(line(doc('no', ITEMS)), 'The pricing answer is 43 days overdue; 1 item is following an assumed no; 1 is set aside by it.');
  assert.equal(line(doc('yes', '  A: One [if pricing]\n  B: Two [if pricing]')), 'The pricing answer is 43 days overdue; 2 items are following an assumed yes.');
  assert.equal(line(doc('yes', '  A: One [if pricing]')), 'The pricing answer is 43 days overdue; 1 item is following an assumed yes.');
  assert.equal(line(doc('yes', '  A: One [unless pricing]\n  B: Two [unless pricing]')), 'The pricing answer is 43 days overdue; 2 items are set aside by an assumed yes.');
  assert.equal(line(doc('no', '  A: One [if pricing]')), 'The pricing answer is 43 days overdue; 1 item is set aside by an assumed no.');
  assert.equal(line(doc('yes', '  A: One [if pricing]\n  B: Two [unless pricing]\n  C: Three [unless pricing]')), 'The pricing answer is 43 days overdue; 1 item is following an assumed yes; 2 are set aside by it.');
  assert.equal(line(doc('yes', '  A: One [if pricing]\n  B: Two [if pricing]\n  C: Three [unless pricing]')), 'The pricing answer is 43 days overdue; 2 items are following an assumed yes; 1 is set aside by it.');
});

test('a set-aside item is not counted as following, and every share part adds up to the denominator', () => {
  const src = doc('yes', '  Core: Always\n' + ITEMS + '\n  C: Needs more [if pricing and other]', D('other'));
  const p = proj(src);
  assert.deepEqual(p.items.map(i => i.itemState), ['in-plan', 'limbo', 'set-aside', 'waiting']);
  const s = p.shares;
  assert.deepEqual([s.shared, s.assumed, s.setAside, s.dependent, s.denominator], [1, 1, 1, 1, 4]);
  assert.ok(Math.abs(s.sharedShare + s.assumedShare + s.setAsideShare + s.dependentShare - 1) < 1e-9);
  for(const t of [texts(renderPlans(p, ctxFor(p))), texts(renderPlansNarrow(p, ctxFor(p, 390)))]){
    assert.ok(t.includes('Following an assumed answer | 1 of 4'), t);
    assert.ok(t.includes('Set aside by an assumed answer | 1 of 4'), t);
    assert.ok(t.includes('In every possible plan | 1 of 4') && t.includes('Depends on an answer | 1 of 4'), t);
  }
  const tp = treeProjection(p);
  assert.match(texts(renderTree(tp, treeLayout(tp, {width:1160, measure}), ctxFor(p))), /1 included, 1 waiting, 1 following assumptions, 1 set aside by assumptions/);
  const plainProj = proj(doc('yes', '  A: One [if pricing]'));
  assert.ok(!texts(renderPlans(plainProj, ctxFor(plainProj))).includes('Set aside by an assumed answer'), 'three parts when nothing is set aside');
});

test('an item that still waits on something else unknown is waiting; one another answer already rules out is not needed', () => {
  const no = D('pricing', '  assume: no 2026-11-01\n', '2026-10-01') + D('groups') + D('reminders', '  answer: no 2026-09-01\n') +
    'NOW\n  A: Both [if pricing and groups]\n  B: Either [if pricing or groups]\n  C: Dead [if pricing and reminders]\n  D: Neither [if not pricing and not groups]';
  // pricing assumed no: A is false under it (set aside); B still depends on groups (waiting); C: reminders = no, so not needed; D depends on groups
  assert.deepEqual(proj(no).items.map(i => i.itemState), ['set-aside', 'waiting', 'not-needed', 'waiting']);
  const yes = D('pricing', '  assume: yes 2026-11-01\n', '2026-10-01') + D('groups') + 'NOW\n  A: Both [if pricing and groups]\n  B: Either [if pricing or groups]\n  C: Neither [if not pricing and not groups]\n  D: Not both [if not pricing or not groups]';
  const q = proj(yes);
  // pricing assumed yes: A depends on groups (waiting); B is true (working to it); C is false (set aside); D depends on groups
  assert.deepEqual(q.items.map(i => i.itemState), ['waiting', 'limbo', 'set-aside', 'waiting']);
  assert.equal(overviewProjection(q).items[1].displayState.sentence, 'Working to the assumption Pricing = yes');
  assert.equal(overviewProjection(q).items[2].displayState.sentence, 'Set aside on the assumption Pricing = yes');
});

test('with two assumptions in force the sentence names only the ones that settled the item', () => {
  const src = D('a', '  assume: yes 2026-11-01\n', '2026-10-01') + D('b', '  assume: no 2026-11-01\n', '2026-10-02') + 'NOW\n  X: x [if a and b]\n  Y: y [if a or not b]\n  Z: z [if a and not b]';
  const p = proj(src), o = overviewProjection(p).items;
  assert.deepEqual(p.items.map(i => i.itemState), ['set-aside', 'limbo', 'limbo']);
  assert.equal(o[0].displayState.sentence, 'Set aside on the assumption B = no');
  assert.equal(o[1].displayState.sentence, 'Working to the assumption A = yes and B = no');
  assert.equal(o[2].displayState.sentence, 'Working to the assumption A = yes and B = no');
});

test('a done item is history: neither following nor set aside', () => {
  const p = proj(doc('no', '  A: Shipped [if pricing] [done]\n  B: Other [if pricing]'));
  assert.deepEqual(p.items.map(i => i.itemState), ['in-plan', 'set-aside']);
  assert.equal(verdict(p).line, 'The pricing answer is 43 days overdue; 1 item is set aside by an assumed no.');
});

test('the impact narrative and Question lens say "set aside" for a branch an assumption rules out', () => {
  const src = D('a', '  assume: no 2026-11-01\n', '2026-10-01') + D('b') + 'NOW\n  X: x [if a and b]';
  const m = parse(src), p = project(m, TODAY);
  const impact = decisionImpactProjection(m, p, 'b');
  assert.equal(impact.narrative.branches.yes.work[0].sentence, 'Would be set aside by an assumption');
  assert.equal(impact.narrative.branches.no.work[0].sentence, 'Would not be pursued');
  const ov = overviewProjection(p);
  assert.equal(ov.items[0].displayState.sentence, 'Set aside on the assumption A = no');
});

test('a question whose assumption has not started is not listed as working on one in the Learning agenda', () => {
  const withContract = (assumeDate) => D('a', `  learn: ask ten people\n  enough: eight say yes\n  assume: yes ${assumeDate}\n`) + 'NOW\n  X: x [if a]';
  const m = parse(withContract('2026-12-22')), p = project(m, TODAY), ag = learningAgendaProjection(m, p);
  assert.equal(ag.assumptions.length, 0);
  assert.equal(ag.entries[0].currentState.sentence, 'Unanswered — overdue since 2026-10-01; assumed yes from 22 December');
  assert.equal(learningAgendaProjection(parse(withContract('2026-11-01')), proj(withContract('2026-11-01'))).assumptions.length, 1);
});

test('the Roadmap hand-off basis line is the accepted world, whether or not the assumption has started', () => {
  for(const date of ['2026-11-01', '2026-12-31']){
    const m = parse(D('pricing', `  assume: no ${date}\n`, '2026-10-01') + 'NOW\n  A: Always\n  B: Premium [if pricing]\n  C: Fallback [unless pricing]\nLATER\n  D: Later work');
    const choices = roadmapProjectionChoices(m, TODAY);
    assert.equal(choices.ok, true);
    const lines = choices.choices.map(c => buildRoadmapProjection(m, TODAY, c.answers, projectionAcceptance(c.inspected)).text.split('\n').find(l => l.startsWith('basis:')));
    assert.equal(lines.length, 2);
    for(const line of lines) assert.match(line, /^basis: paths "[^"]*"; assumed pricing=(yes|no)@2026-11-13$/);
    assert.deepEqual(lines.map(l => l.match(/pricing=(yes|no)/)[1]).sort(), ['no', 'yes']);
  }
});

/* ---------- 3. a reference evaluator written from the rule, and surfaces that must add up ---------- */
function refStates(model, today, assignment = {}){
  const byKey = new Map(model.decisions.map(d => [d.key, d]));
  const onCycle = new Set();
  for(const d of model.decisions){
    const seen = new Set(), stack = [d.key];
    while(stack.length){
      const x = byKey.get(stack.pop());
      for(const t of x?.when?.valid ? x.when.terms : []){
        if(t.key === d.key){ onCycle.add(d.key); stack.length = 0; break; }
        if(!seen.has(t.key) && byKey.has(t.key)){ seen.add(t.key); stack.push(t.key); }
      }
    }
  }
  const startsOn = d => d.assumption && d.answerBy && today > d.answerBy && today >= d.assumption.date;
  const kleene = (op, vals) => {
    if(op === 'single') return vals[0];
    const has = v => vals.some(x => x === v);
    if(op === 'and') return has('F') ? 'F' : has('U') ? 'U' : 'T';
    return has('T') ? 'T' : has('U') ? 'U' : 'F';
  };
  const world = forced => {
    const memo = new Map();
    const look = key => {
      if(memo.has(key)) return memo.get(key);
      const d = byKey.get(key);
      let r;
      if(onCycle.has(key)) r = {avail:'dormant', v:'U', assumed:false};
      else {
        let avail = 'active';
        if(d.when){
          const w = condition(d.when);
          avail = w.v === 'T' ? 'active' : w.v === 'F' ? 'moot' : 'dormant';
        }
        const hyp = forced[key] ?? assignment[key];
        if(avail === 'moot') r = {avail, v:'F', assumed:false};
        else if(avail === 'active' && d.answer?.direction) r = {avail, v:d.answer.direction === 'yes' ? 'T' : 'F', assumed:false};
        else if(avail === 'active' && (hyp === 'yes' || hyp === 'no')) r = {avail, v:hyp === 'yes' ? 'T' : 'F', assumed:false};
        else if(avail === 'active' && startsOn(d)) r = {avail, v:'U', assumed:true, direction:d.assumption.direction};
        else r = {avail, v:'U', assumed:false};
      }
      memo.set(key, r);
      return r;
    };
    function condition(c){
      if(!c || !c.valid || c.terms.some(t => !byKey.has(t.key))) return {v:'I', assumed:false};
      const parts = c.terms.map(t => { const x = look(t.key); return {v:t.negated ? {T:'F', F:'T', U:'U'}[x.v] : x.v, assumed:x.assumed}; });
      const v = kleene(c.operator, parts.map(p => p.v));
      /* the operands that decide the value: for an unknown, the unknown ones */
      const deciding = parts.filter(p => c.operator === 'and' ? (v === 'F' ? p.v === 'F' : p.v === v) : (v === 'T' ? p.v === 'T' : v === 'U' ? p.v === 'U' : true));
      return {v, assumed:deciding.some(p => p.assumed)};
    }
    return {condition, look};
  };
  const real = world({});
  const forced = {};
  for(const d of model.decisions) if(real.look(d.key).assumed) forced[d.key] = real.look(d.key).direction;
  const under = world(forced);
  return model.items.map(it => {
    if(!it.condition) return 'in-plan';
    const c = real.condition(it.condition);
    if(it.status === 'done' && c.v !== 'I') return 'in-plan';
    if(c.v === 'T') return 'in-plan';
    if(c.v === 'F') return 'not-needed';
    if(c.v === 'U' && c.assumed){
      const h = under.condition(it.condition).v;
      return h === 'T' ? 'limbo' : h === 'F' ? 'set-aside' : 'waiting';
    }
    return 'waiting';
  });
}

function rng(seed){
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const NAMES = ['groups', 'pricing', 'reminders', 'pilot', 'supply'];
function randDoc(r){
  const k = 2 + Math.floor(r() * 4), items = 3 + Math.floor(r() * 7), names = NAMES.slice(0, k);
  const pick = () => names[Math.floor(r() * names.length)];
  const cond = () => {
    const n = 1 + Math.floor(r() * Math.min(3, names.length)), op = r() < 0.5 ? ' and ' : ' or ';
    return [...new Set(Array.from({length:n}, pick))].map(t => (r() < 0.3 ? 'not ' : '') + t).join(op);
  };
  const date = () => '2026-' + String(8 + Math.floor(r() * 6)).padStart(2, '0') + '-' + String(1 + Math.floor(r() * 28)).padStart(2, '0');
  let s = 'title: Fuzz\n';
  for(const n of names){
    s += `decision ${n}:\n  question: Does ${n} hold?\n  signal: s\n  owner: o\n`;
    if(r() < 0.9) s += `  answer-by: ${date()}\n`;
    if(r() < 0.2) s += `  answer: ${r() < 0.5 ? 'yes' : 'no'} ${date()}\n`;
    if(r() < 0.55) s += `  assume: ${r() < 0.5 ? 'yes' : 'no'} ${date()}\n`;
    if(r() < 0.2) s += `  when: ${cond()}\n`;
  }
  s += 'NOW\n';
  for(let i = 0; i < items; i++){
    if(i === Math.floor(items / 2)) s += 'LATER\n';
    const st = r(), status = st < 0.12 ? ' [done]' : st < 0.2 ? ' [doing]' : '';
    const c = r() < 0.85 ? (r() < 0.25 ? ` [unless ${pick()}]` : ` [if ${cond()}]`) : '';
    s += `  Lane${i % 3}: Item ${i}${c}${status}\n`;
  }
  return s;
}
const todayFor = r => '2026-' + String(8 + Math.floor(r() * 6)).padStart(2, '0') + '-' + String(1 + Math.floor(r() * 28)).padStart(2, '0');
const LABEL = {'in-plan':'Included', 'waiting':'Waiting', 'limbo':'Following', 'set-aside':'Set aside', 'not-needed':'Not needed'};

test('random documents: item states equal the reference, and every count on every surface adds up', () => {
  const r = rng(20261113);
  let withSetAside = 0, withFollowing = 0, verdictChecked = 0, sharesChecked = 0;
  for(let t = 0; t < 700; t++){
    const src = randDoc(r), today = todayFor(r), m = parse(src), p = project(m, today);
    const ref = refStates(m, today);
    p.items.forEach((it, i) => { if(!it.condition || it.condition.valid) assert.equal(it.itemState, ref[i], `${src}\n@${today} item ${i}`); });
    const count = state => p.items.filter(it => it.itemState === state).length;
    const [nIn, nWait, nFollow, nAside, nNot] = ['in-plan', 'waiting', 'limbo', 'set-aside', 'not-needed'].map(count);
    assert.equal(nIn + nWait + nFollow + nAside + nNot, p.items.length, 'five states cover every item');
    if(nAside) withSetAside++;
    if(nFollow) withFollowing++;

    // tree alt text: the work summary adds up to the item count
    const tp = treeProjection(p);
    const summary = /Work: ([^.]*)\./.exec(dec(renderTree(tp, treeLayout(tp, {width:1160, measure}), ctxFor(p))))?.[1] || '';
    const summed = summary.split(', ').filter(Boolean).reduce((n, part) => n + Number(part.split(' ')[0]), 0);
    assert.equal(summed, p.items.length, `${summary} vs ${p.items.length} items\n${src}`);
    const pick = label => Number((new RegExp('(\\d+) ' + label).exec(summary) || [0, 0])[1]);
    assert.deepEqual([pick('included'), pick('waiting'), pick('following assumptions'), pick('set aside by assumptions'), pick('not needed')], [nIn, nWait, nFollow, nAside, nNot]);

    // Brief: item sentences by kind
    const o = overviewProjection(p);
    const kinds = kind => o.items.filter(i => i.displayState.kind === kind).length;
    assert.equal(kinds('assumption'), nFollow);
    assert.equal(kinds('set-aside'), nAside);
    for(const it of o.items.filter(i => i.displayState.kind === 'set-aside'))
      assert.match(it.displayState.sentence, /^Set aside on the assumption .+ = (yes|no)$/);
    for(const it of o.items.filter(i => i.displayState.kind === 'assumption'))
      assert.match(it.displayState.sentence, /^Working to the assumption .+ = (yes|no)/);

    // inspector: each listed item's words match its state
    for(const q of tp.questions){
      const data = decisionInspectorData(q);
      for(const entry of [...data.arms.yes, ...data.arms.no]){
        const it = p.items.find(i => i.title === entry.title);
        if(it.displayEvidence.kind === 'condition-error' || it.displayEvidence.kind === 'completed') continue;
        assert.ok(entry.treatment.startsWith(LABEL[it.itemState]), `${entry.treatment} for ${it.itemState}`);
      }
    }

    // verdict: counts name items and never exceed the reference; exact when one assumption is in force and it leads
    const v = verdict(p).line;
    const mFollow = /(\d+) items? (?:is|are) following an assumed/.exec(v), mAside = /(\d+) (?:items? )?(?:is|are) set aside/.exec(v);
    const forcedNow = p.decisions.filter(d => d.assumption?.inForce);
    if(mFollow) assert.ok(Number(mFollow[1]) <= nFollow, v);
    if(mAside) assert.ok(Number(mAside[1]) <= nAside, v);
    if(forcedNow.length === 1){
      const overdue = p.decisions.filter(d => d.overdue).sort((a, b) => a.answerBy.localeCompare(b.answerBy) || a.srcLine - b.srcLine)[0];
      if(overdue?.key === forcedNow[0].key){
        assert.equal(mFollow ? Number(mFollow[1]) : 0, nFollow, v + '\n' + src + '@' + today);
        assert.equal(mAside ? Number(mAside[1]) : 0, nAside, v + '\n' + src + '@' + today);
        verdictChecked++;
      }
    }

    // Plans: the shares add up and match the reference's own partition
    if(p.shares){
      const s = p.shares;
      assert.equal(s.shared + s.assumed + s.setAside + s.dependent, s.denominator, JSON.stringify(s));
      assert.ok(Math.abs(s.sharedShare + s.assumedShare + s.setAsideShare + s.dependentShare - 1) < 1e-9);
      const states = it => p.matrix.find(row => row.identity === it.identity).states;
      const eligible = p.items.filter(it => it.status !== 'done' && states(it).includes('in-plan'));
      const notEvery = eligible.filter(it => !states(it).every(st => st === 'in-plan'));
      assert.equal(s.denominator, eligible.length);
      assert.equal(s.assumed, notEvery.filter(it => ref[p.items.indexOf(it)] === 'limbo').length);
      assert.equal(s.setAside, notEvery.filter(it => ref[p.items.indexOf(it)] === 'set-aside').length);
      sharesChecked++;
      for(const svg of [texts(renderPlans(p, ctxFor(p))), texts(renderPlansNarrow(p, ctxFor(p, 390)))]){
        assert.ok(svg.includes(`In every possible plan | ${s.shared} of ${s.denominator}`));
        assert.ok(svg.includes(`Following an assumed answer | ${s.assumed} of ${s.denominator}`));
        assert.ok(svg.includes(`Depends on an answer | ${s.dependent} of ${s.denominator}`));
        assert.equal(svg.includes('Set aside by an assumed answer'), s.setAside > 0);
        if(s.setAside) assert.ok(svg.includes(`Set aside by an assumed answer | ${s.setAside} of ${s.denominator}`));
      }
    }

    // the other surfaces still draw
    const c = ctxFor(p);
    for(const svg of [renderOverview(o, c), renderConditions(o, c), renderQuestionLens(o, c), renderDependencies(o, c), renderLearningAgenda(learningAgendaProjection(m, p), c)])
      assert.ok(svg.length > 0);
  }
  assert.ok(withSetAside > 60 && withFollowing > 60, `${withSetAside} documents with set-aside items, ${withFollowing} following`);
  assert.ok(verdictChecked > 30 && sharesChecked > 300, `${verdictChecked} verdicts, ${sharesChecked} share figures checked exactly`);
});

test('random documents: the in-force rule against the reference, decision by decision', () => {
  const r = rng(77);
  let started = 0, waitingOnOwnDate = 0;
  for(let t = 0; t < 600; t++){
    const m = parse(randDoc(r)), today = todayFor(r), e = evaluate(m, today);
    for(const d of e.decisions){
      if(!d.assumption || d.availability !== 'active' || d.answer?.direction) continue;
      const want = !!d.answerBy && today > d.answerBy && today >= d.assumption.date;
      assert.equal(d.assumption.inForce, want, `${d.key} due ${d.answerBy} assume ${d.assumption.date} @${today}`);
      if(want) started++;
      if(d.answerBy && today > d.answerBy && today < d.assumption.date) waitingOnOwnDate++;
    }
  }
  assert.ok(started > 100 && waitingOnOwnDate > 20, `${started} in force, ${waitingOnOwnDate} past due but not started`);
});
