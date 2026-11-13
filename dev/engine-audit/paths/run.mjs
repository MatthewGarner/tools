// Audit harness: paths (conditional plans: decisions, conditions, assumptions, possible plans, Roadmap hand-off).
// Run: node dev/engine-audit/paths/run.mjs   (about 10-30 s). Plain node, no dependencies.
// A check tagged [DEFECT] proves a confirmed defect and FAILS today; everything else is a covered-and-correct PASS.
import {readFileSync} from 'node:fs';
import {check, done, rng} from './lib.mjs';
import {parse} from '../../../paths/parse.js';
import {project} from '../../../paths/project.js';
import {evaluate} from '../../../paths/evaluate.js';
import {PLAN_CAP} from '../../../paths/plans.js';
import {verdict} from '../../../paths/verdict.js';
import {treeProjection} from '../../../paths/tree.js';
import {treeLayout} from '../../../paths/layout-tree.js';
import {renderTree, renderOutline} from '../../../paths/render-tree.js';
import {renderPlans} from '../../../paths/render-plans.js';
import {renderOverview} from '../../../paths/render-overview.js';
import {renderConditions} from '../../../paths/render-conditions.js';
import {renderQuestionLens} from '../../../paths/render-question-lens.js';
import {renderDependencies} from '../../../paths/render-dependencies.js';
import {renderLearningAgenda} from '../../../paths/render-learning-agenda.js';
import {overviewProjection, decisionImpactProjection, itemDisplayState} from '../../../paths/overview.js';
import {learningAgendaProjection} from '../../../paths/learning-agenda.js';
import {projectLearningCloseOut} from '../../../paths/learning-closeout.js';
import {decisionInspectorData} from '../../../paths/inspector.js';
import {roadmapProjectionChoices, buildRoadmapProjection, projectionAcceptance} from '../../../paths/handoff-roadmap.js';
import {parse as parseRoadmap} from '../../../roadmap/parse.js';
import {STARTER} from '../../../paths/starter.js';

const ROOT = new URL('../../../', import.meta.url);
const read = p => readFileSync(new URL(p, ROOT), 'utf8');
const LANTERN = read('paths/app.js').match(/const LANTERN = `([^`]+)`/)[1];
const DSL_EX = (() => { const s = read('DSL.md'), b = s.slice(s.indexOf('```dsl tool=paths') + 17); return b.slice(0, b.indexOf('```')).trim(); })();
const measure = t => String(t).length * 7;
const colors = {bg: '#FBFBFA', card: '#F4F4F1', ink: '#111111', muted: '#6B6B68', border: '#D9D9D5', accent: '#1F4FD8', accentInk: '#1A44C2', err: '#B3403A', track: '#EDF0EE',
  status: {done: '#1D7A3E', doing: '#1F4FD8', risk: '#9A6A00', blocked: '#B3403A'}, statusInk: {done: '#1C753C', doing: '#1A44C2', risk: '#8E6200', blocked: '#B3403A'}};
const texts = svg => [...String(svg).matchAll(/>([^<>]+)</g)].map(x => x[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')).join(' | ');
const D = (n, extra = '', due = '2026-10-01') => `decision ${n}:\n  question: Does ${n} hold?\n  signal: s ${n}\n  owner: o\n  answer-by: ${due}\n${extra}`;
const TODAY = '2026-11-13';

// ---------- independent reference semantics (written from DSL.md, paths/CONTEXT.md and the stage-1 semantics spec) ----------
// Kleene logic with provenance; decision ladder: moot (when false) > written answer > hypothetical > assumption in force
// (unanswered, active, today > answer-by AND today >= the assumption's own date) > unknown. dormant = when unknown/invalid/cycle.
// Items: true in-plan, false not-needed, invalid waiting; unknown with an assumed-* provenance member: re-read the condition with every
// assumption in force taken as the answer; true limbo (working to it), false set-aside, still unknown waiting; other unknown waiting;
// [done] outranks a valid condition. The reference reads the parsed fields but re-derives every value; it detects cycles itself.
function refWorld(model, today, assignment = {}, second = false){
  const byKey = new Map(model.decisions.map(d => [d.key, d]));
  const memo = new Map();
  // own cycle detection over the when graph
  const onCycle = new Set();
  for(const d of model.decisions){
    const seen = new Set(); const stack = [[d.key, [d.key]]];
    while(stack.length){ const [k, path] = stack.pop(); const x = byKey.get(k); if(!x?.when?.valid) continue;
      for(const t of x.when.terms){ if(t.key === d.key){ onCycle.add(d.key); stack.length = 0; break; } if(!seen.has(t.key) && byKey.has(t.key)){ seen.add(t.key); stack.push([t.key, [...path, t.key]]); } } }
  }
  const kleene = (op, vals) => {           // vals: [{v, prov:Set}]
    if(op === 'single') return vals[0];
    const pick = (want) => vals.filter(x => x.v === want);
    const uni = xs => ({prov: new Set(xs.flatMap(x => [...x.prov]))});
    if(op === 'and'){ if(pick('F').length) return {v: 'F', ...uni(pick('F'))}; if(pick('U').length) return {v: 'U', ...uni(pick('U'))}; return {v: 'T', ...uni(vals)}; }
    if(pick('T').length) return {v: 'T', ...uni(pick('T'))}; if(pick('U').length) return {v: 'U', ...uni(pick('U'))}; return {v: 'F', ...uni(vals)};
  };
  const cond = (c, look) => {
    if(!c || !c.valid || c.terms.some(t => !byKey.has(t.key))) return {v: 'I', prov: new Set()};
    return kleene(c.operator, c.terms.map(t => { const x = look(t.key); const v = t.negated ? ({T: 'F', F: 'T', U: 'U'})[x.v] : x.v; return {v, prov: new Set(x.prov)}; }));
  };
  function dec(key){
    if(memo.has(key)) return memo.get(key);
    const d = byKey.get(key);
    if(onCycle.has(key)){ const r = {avail: 'dormant', v: 'U', prov: new Set(['unknown'])}; memo.set(key, r); return r; }
    let avail = 'active';
    if(d.when){ const w = cond(d.when, dec); avail = w.v === 'T' ? 'active' : w.v === 'F' ? 'moot' : 'dormant'; }
    let r;
    if(avail === 'moot') r = {avail, v: 'F', prov: new Set(['never-arose'])};
    else if(avail === 'active' && d.answer?.direction) r = {avail, v: d.answer.direction === 'yes' ? 'T' : 'F', prov: new Set(['answered'])};
    else if(avail === 'active' && (assignment[key] === 'yes' || assignment[key] === 'no')) r = {avail, v: assignment[key] === 'yes' ? 'T' : 'F', prov: new Set(['answered'])};
    else if(avail === 'active' && d.assumption && d.answerBy && today && today > d.answerBy && (!d.assumption.date || today >= d.assumption.date)) r = {avail, v: 'U', prov: new Set(['assumed-' + d.assumption.direction])};
    else r = {avail, v: 'U', prov: new Set(['unknown'])};
    memo.set(key, r); return r;
  }
  const decisions = Object.fromEntries(model.decisions.map(d => [d.key, dec(d.key)]));
  const items = model.items.map(it => {
    if(!it.condition) return {state: 'in-plan', v: 'T', prov: new Set()};
    const c = cond(it.condition, dec);
    let state = c.v === 'T' ? 'in-plan' : c.v === 'F' ? 'not-needed' : c.v === 'U' && [...c.prov].some(p => p.startsWith('assumed-')) ? 'limbo' : 'waiting';
    if(it.status === 'done' && c.v !== 'I') state = 'in-plan';
    return {state, v: c.v, prov: c.prov};
  });
  if(!second){
    const forced = {};
    for(const d of model.decisions){ const x = decisions[d.key]; if(x.avail === 'active' && [...x.prov].some(q => q.startsWith('assumed-'))) forced[d.key] = d.assumption.direction; }
    if(Object.keys(forced).length){
      const h = refWorld(model, today, {...assignment, ...forced}, true);
      items.forEach((x, i) => { if(x.state === 'limbo') x.state = h.items[i].v === 'T' ? 'limbo' : h.items[i].v === 'F' ? 'set-aside' : 'waiting'; });
    }
  }
  return {decisions, items};
}
const refSig = (model, w) => JSON.stringify(model.items.map((it, i) => [i, w.items[i].state]).filter((_, i) => !model.items[i].condition || model.items[i].condition.valid));

// random document generator
const NAMES = ['groups', 'pricing', 'reminders', 'pilot', 'supply', 'coach-fee', 'beta2'];
function randDoc(r, {k = 1 + Math.floor(r() * 5), items = 3 + Math.floor(r() * 7)} = {}){
  const names = NAMES.slice(0, k), pick = () => names[Math.floor(r() * names.length)];
  const condTxt = (allowUnknown = true) => {
    const n = 1 + Math.floor(r() * Math.min(3, names.length)), op = r() < 0.5 ? ' and ' : ' or ';
    const terms = [...new Set(Array.from({length: n}, pick))].map(t => (r() < 0.3 ? 'not ' : '') + t);
    if(allowUnknown && r() < 0.04) terms[0] = 'grops';
    return terms.join(op);
  };
  const date = () => '2026-' + String(8 + Math.floor(r() * 6)).padStart(2, '0') + '-' + String(1 + Math.floor(r() * 28)).padStart(2, '0');
  let s = 'title: Fuzz\n';
  for(const n of names){
    s += `decision ${n}:\n  question: Does ${n} hold?\n  signal: s\n  owner: o\n`;
    if(r() < 0.85) s += `  answer-by: ${date()}\n`;
    const a = r(); if(a < 0.3) s += `  answer: ${r() < 0.5 ? 'yes' : 'no'} ${date()}\n`;
    if(r() < 0.3) s += `  assume: ${r() < 0.5 ? 'yes' : 'no'} ${date()}\n`;
    if(r() < 0.35) s += `  when: ${condTxt()}\n`;
  }
  s += 'NOW\n';
  for(let i = 0; i < items; i++){
    if(i === Math.floor(items / 2)) s += 'LATER\n';
    const st = r(); const status = st < 0.15 ? ' [done]' : st < 0.25 ? ' [doing]' : st < 0.3 ? ' [risk]' : '';
    const c = r() < 0.8 ? (r() < 0.2 ? ` [unless ${pick()}]` : ` [if ${condTxt()}]`) : '';
    s += `  Lane${i % 3}: Item ${i}${c}${status}\n`;
  }
  return s;
}
const todayFor = r => '2026-' + String(8 + Math.floor(r() * 6)).padStart(2, '0') + '-' + String(1 + Math.floor(r() * 28)).padStart(2, '0');

console.log('== Paths engine audit ==  today pinned to ' + TODAY + ' unless stated');

// =============================================================================================
// 1. PARSER: robustness and the warning catalogue
// =============================================================================================
{
  let threw = null;
  for(const src of ['decision constructor:\n  question: q\nNOW\n  A: x [if constructor]', 'NOW\n  A: x [if constructor]']){
    try{ project(parse(src), TODAY); }catch(e){ threw = threw || (JSON.stringify(src.slice(-28)) + ' -> ' + e.message); }
  }
  check('P1 parsers never throw (DSL.md): an item condition naming "constructor" (a legal decision name) parses and projects', threw === null, threw || '');
  const ctor = parse('decision constructor:\n  question: q?\n  signal: s\n  owner: o\n  answer-by: 2026-10-01\n  answer: yes 2026-09-01\nNOW\n  A: x');
  check('P2 a decision named "constructor" is kept (not reported as a duplicate of an inherited object property)', ctor.decisions.length === 1 && !ctor.warnings.some(w => w.code === 'duplicate-decision'), JSON.stringify(ctor.warnings.map(w => w.code)));

  // hostile documents: never throw (excluding the "constructor" class above, filtered out of the soup)
  const r = rng(4242); const soup = ['decision a:', 'decision b-2:', '  when: a', '  when: a and not b-2', '  when: a or', '  answer: yes', '  answer: no 2026-02-30', '  answer: maybe', '  assume: yes 2026-01-01',
    '  assume: no', '  answer-by: 2026-13-01', '  close-out:', '    claim: x', '    review:', '      relation: inside-scope', '\tA: tabbed [if a]', 'NOW', 'LATER', 'decision', 'decision x y:', 'title: t', 'style: plans',
    '  A: x [if a] [if b-2]', '  B: y [unless a] [done] [risk]', '  C: z [if a and b-2 or a]', '  D: [if not not a]', '   E: odd', '  F: f -- note -> https://x', '  G: g [mystery]', 'Lane: item before period [if a]', '', '// comment', '  owner: x', '  question:'];
  let fuzzThrow = null, n = 0;
  for(let t = 0; t < 400; t++){
    const src = Array.from({length: 4 + Math.floor(r() * 18)}, () => soup[Math.floor(r() * soup.length)]).join('\n');
    try{ const m = parse(src), p = project(m, TODAY); n++; const o = overviewProjection(p); learningAgendaProjection(m, p); const tp = treeProjection(p); verdict(p);
      if(m.decisions[0]) decisionImpactProjection(m, p, m.decisions[0].key); roadmapProjectionChoices(m, TODAY);
      for(const q of tp.questions) decisionInspectorData(q);
      for(const d of p.decisions) projectLearningCloseOut(d, TODAY);
      if(t % 20 === 0){ const ctx = {colors, measure, dark: false, today: TODAY, projection: p, width: 1160};
        renderPlans(p, ctx); renderTree(tp, treeLayout(tp, {width: 1160, measure}), ctx); renderOutline(tp, ctx); renderOverview(o, ctx); renderConditions(o, ctx); renderQuestionLens(o, ctx); renderDependencies(o, ctx); renderLearningAgenda(learningAgendaProjection(m, p), ctx); }
    }catch(e){ fuzzThrow = fuzzThrow || {src, e: e.stack.split('\n').slice(0, 2).join(' ')}; }
  }
  check('P3 400 random hostile documents (bad dates, tabs, odd indents, mixed operators, double conditions, close-out fragments) parse, project, render and hand off without throwing', fuzzThrow === null, fuzzThrow ? JSON.stringify(fuzzThrow).slice(0, 400) : n + ' documents');

  // warning catalogue: both sides of each boundary
  const codes = (src, today = TODAY) => project(parse(src), today).warnings.map(w => w.code);
  const has = (src, code, today) => codes(src, today).includes(code);
  const pairs = [
    ['mixed-condition', D('a') + D('b') + 'NOW\n  X: x [if a and b or a]', D('a') + D('b') + 'NOW\n  X: x [if a and b]'],
    ['malformed-condition', D('a') + 'NOW\n  X: x [if a and]', D('a') + 'NOW\n  X: x [if a]'],
    ['unknown-item-decision', D('a') + 'NOW\n  X: x [if aa]', D('a') + 'NOW\n  X: x [if a]'],
    ['unknown-when-decision', D('a', '  when: zz\n') + 'NOW\n  X: x [if a]', D('a') + 'NOW\n  X: x [if a]'],
    ['when-cycle', D('a', '  when: b\n') + D('b', '  when: a\n') + 'NOW\n  X: x [if a]', D('a') + D('b', '  when: a\n') + 'NOW\n  X: x [if a and b]'],
    ['decision-after-use', 'NOW\n  X: x [if a]\n' + D('a'), D('a') + 'NOW\n  X: x [if a]'],
    ['unused-decision', D('a') + D('b') + 'NOW\n  X: x [if a]', D('a') + 'NOW\n  X: x [if a]'],
    ['duplicate-decision', D('a') + D('a') + 'NOW\n  X: x [if a]', D('a') + 'NOW\n  X: x [if a]'],
    ['conflicting-answers', D('a', '  answer: yes\n  answer: no\n') + 'NOW\n  X: x [if a]', D('a', '  answer: yes\n') + 'NOW\n  X: x [if a]'],
    ['repeated-answer', D('a', '  answer: yes\n  answer: yes\n') + 'NOW\n  X: x [if a]', D('a', '  answer: yes\n') + 'NOW\n  X: x [if a]'],
    ['invalid-answer-date', D('a', '  answer: yes 2026-02-30\n') + 'NOW\n  X: x [if a]', D('a', '  answer: yes 2026-02-28\n') + 'NOW\n  X: x [if a]'],
    ['invalid-due-date', D('a', '', '2025-02-29') + 'NOW\n  X: x [if a]', D('a', '', '2024-02-29') + 'NOW\n  X: x [if a]'],
    ['answer-moot', D('h', '  answer: no 2026-09-01\n') + D('c', '  when: h\n  answer: yes 2026-09-02\n') + 'NOW\n  X: x [if c]', D('h', '  answer: yes 2026-09-01\n') + D('c', '  when: h\n  answer: yes 2026-09-02\n') + 'NOW\n  X: x [if c]'],
    ['answer-dormant', D('h') + D('c', '  when: h\n  answer: yes 2026-09-02\n') + 'NOW\n  X: x [if c]', D('h', '  answer: yes 2026-09-01\n') + D('c', '  when: h\n  answer: yes 2026-09-02\n') + 'NOW\n  X: x [if c]'],
    ['assumption-before-due', D('a', '  assume: yes 2026-10-01\n', '2026-11-13') + 'NOW\n  X: x [if a]', D('a', '  assume: yes 2026-10-01\n', '2026-11-12') + 'NOW\n  X: x [if a]'],
    ['assumption-answered', D('a', '  answer: no\n  assume: yes 2026-10-01\n') + 'NOW\n  X: x [if a]', D('a', '  assume: yes 2026-10-01\n') + 'NOW\n  X: x [if a]'],
    ['done-false-condition', D('a', '  answer: no\n') + 'NOW\n  X: x [if a] [done]', D('a', '  answer: yes\n') + 'NOW\n  X: x [if a] [done]'],
    ['missing-signal', 'decision a:\n  question: q\n  owner: o\n  answer-by: 2026-10-01\nNOW\n  X: x [if a]', D('a') + 'NOW\n  X: x [if a]'],
  ];
  const badPairs = pairs.filter(([code, on, off]) => !has(on, code) || has(off, code)).map(([c]) => c);
  check('P4 warning catalogue: ' + pairs.length + ' warnings each fire on the triggering document and stay silent on the minimally corrected one (incl. the today == answer-by assumption boundary)', badPairs.length === 0, badPairs.join(', '));
  // the assumption's own date is never read; the before-due warning tells the reader to change it
  const early = D('a', '  assume: yes 2026-12-31\n', '2026-10-01') + 'NOW\n  X: x [if a]';
  const pe = project(parse(early), TODAY);
  check('P5 an assumption dated in the future ("assume: yes 2026-12-31", today ' + TODAY + ', answer-by 2026-10-01) is not yet in force: it starts once both dates have passed', pe.decisions[0].assumption.inForce === false && pe.items[0].itemState === 'waiting',
    'in force: ' + pe.decisions[0].assumption.inForce + '; item X is "' + pe.items[0].itemState + '"');
  const before = project(parse(D('a', '  assume: yes 2026-12-31\n', '2026-12-01') + 'NOW\n  X: x [if a]'), TODAY).warnings.find(w => w.code === 'assumption-before-due');
  const fixedBoth = project(parse(D('a', '  assume: yes 2026-11-13\n', '2026-11-12') + 'NOW\n  X: x [if a]'), TODAY);
  const notStarted = project(parse(D('a', '  assume: yes 2026-12-31\n', '2026-10-01') + 'NOW\n  X: x [if a]'), TODAY).warnings.find(w => w.code === 'assumption-not-started');
  check('P6 the "assumption is not in force yet" advice names the changes that clear it (answer-by before today, assumption date today or earlier), and making them clears it', /"answer-by:" to a date before today/.test(before.message) && /assumption date to today or earlier/.test(before.message) && /to a date before today/.test(before.message) && !!notStarted && /its own date/.test(notStarted.message) && !fixedBoth.warnings.some(w => /^assumption-/.test(w.code)) && fixedBoth.items[0].itemState === 'limbo', '"' + before.message + '"');
  // late answers and overdue boundary
  const ov = d => project(parse(D('a', '', '2026-11-12') + 'NOW\n  X: x [if a]'), d).decisions[0].overdue;
  check('P7 overdue boundary: due 2026-11-12 is not overdue on 2026-11-12 and is on 2026-11-13', ov('2026-11-12') === false && ov('2026-11-13') === true);
  const vline = verdict(project(parse(D('a', '', '2026-02-27') + 'NOW\n  X: x [if a]'), '2028-03-01'))?.line;
  const days = Math.round((Date.UTC(2028, 2, 1) - Date.UTC(2026, 1, 27)) / 864e5);
  check('P8 the overdue day count crosses a leap year correctly (2026-02-27 -> 2028-03-01 = ' + days + ' days)', vline.includes(days + ' days overdue'), vline);
  const sp = parse(STARTER), spp = project(sp, '2026-09-01');
  check('P9 starter parses with no warnings', sp.warnings.length === 0 && spp.warnings.length === 0, JSON.stringify(spp.warnings.map(w => w.code)));
  const dm = parse(DSL_EX), dp = project(dm, TODAY);
  check('P10 the DSL.md paths example parses with no warnings (it pins today: 2026-12-22)', dm.warnings.length === 0 && dp.warnings.length === 0, JSON.stringify(dp.warnings.map(w => w.code + ': ' + w.message)));
}

// =============================================================================================
// 2. EVALUATOR == independent reference (random documents, random today, random assignments)
// =============================================================================================
{
  const r = rng(20261113); let bad = null, docs = 0, decs = 0, its = 0;
  for(let t = 0; t < 600; t++){
    const src = randDoc(r), m = parse(src), today = todayFor(r);
    const assignment = {}; for(const d of m.decisions) if(r() < 0.3) assignment[d.key] = r() < 0.5 ? 'yes' : 'no';
    const e = evaluate(m, today, assignment), ref = refWorld(m, today, assignment); docs++;
    for(const d of e.decisions){ decs++; const x = ref.decisions[d.key];
      const v = ({true: 'T', false: 'F', unknown: 'U'})[d.value];
      if(d.availability !== x.avail || v !== x.v || [...d.provenance].sort().join() !== [...x.prov].sort().join()) bad = bad || {src, today, assignment, decision: d.key, eng: [d.availability, d.value, [...d.provenance]], ref: [x.avail, x.v, [...x.prov]]}; }
    e.items.forEach((it, i) => { its++; if(it.itemState !== ref.items[i].state) bad = bad || {src, today, assignment, item: it.title, eng: it.itemState, ref: ref.items[i].state}; });
  }
  check('E1 ' + docs + ' random documents x random today x random hypothetical answers: every decision availability/value/provenance (' + decs + ') and item state (' + its + ') equals the independent reference', bad === null, bad ? JSON.stringify(bad).slice(0, 600) : '');

  // invariants: an answer on a moot or dormant decision never changes any item state; renaming is invariant
  let mootBad = null, renameBad = null, orderBad = null;
  for(let t = 0; t < 400; t++){
    const src = randDoc(r), m = parse(src), today = todayFor(r), e = evaluate(m, today);
    for(const d of e.decisions.filter(x => x.availability !== 'active' && !x.answer)){
      const injected = src.replace(new RegExp('(decision ' + d.name + ':\\n)'), '$1  answer: yes 2026-08-01\n');
      const e2 = evaluate(parse(injected), today);
      if(e2.items.some((it, i) => it.itemState !== e.items[i].itemState)) mootBad = mootBad || {src, d: d.key};
    }
    const renamed = src.replace(/\bpricing\b/g, 'tariff'); const e3 = evaluate(parse(renamed), today);
    if(e3.items.some((it, i) => it.itemState !== e.items[i].itemState)) renameBad = renameBad || {src};
    // reversing the decision blocks does not change any state (declaration order only affects warnings)
    const head = src.slice(0, src.indexOf('NOW\n')), tail = src.slice(src.indexOf('NOW\n'));
    const blocks = head.split(/(?=^decision )/m); const title = blocks.shift();
    const e4 = evaluate(parse(title + blocks.reverse().join('') + tail), today);
    if(e4.items.some((it, i) => it.itemState !== e.items[i].itemState)) orderBad = orderBad || {src};
  }
  check('E2 adding an answer to a moot or dormant decision never changes any item state (400 documents)', mootBad === null, JSON.stringify(mootBad));
  check('E3 renaming a decision everywhere changes no item state', renameBad === null, JSON.stringify(renameBad));
  check('E4 reversing the order of the decision blocks changes no item state', orderBad === null, JSON.stringify(orderBad));
}

// =============================================================================================
// 3. POSSIBLE PLANS: completeness against brute force, counts, shares, reach
// =============================================================================================
{
  const r = rng(99); let missBad = null, countBad = null, shareBad = null, reachBad = null, docs = 0, refusals = 0;
  for(let t = 0; t < 400; t++){
    const src = randDoc(r), m = parse(src), today = todayFor(r), p = project(m, today);
    // brute force over every unanswered, non-cycle, valid-when decision
    const cur = refWorld(m, today);
    const U = m.decisions.filter(d => !d.answer?.direction && !(d.when && !d.when.valid) && !(d.when && d.when.terms.some(x => !m.decisionByName[x.key])));
    const sigs = new Set(), activeSomewhere = new Set(), worlds = [];
    for(let mask = 0; mask < (1 << U.length); mask++){
      const a = {}; U.forEach((d, i) => a[d.key] = mask & (1 << i) ? 'yes' : 'no');
      const w = refWorld(m, today, a); sigs.add(refSig(m, w)); worlds.push(w);
      for(const d of U) if(w.decisions[d.key].avail === 'active' && w.decisions[d.key].prov.has('answered') && a[d.key]) activeSomewhere.add(d.key);
    }
    const enumerable = U.filter(d => activeSomewhere.has(d.key) && cur.decisions[d.key].avail !== 'moot' || (activeSomewhere.has(d.key)));
    if(p.worlds.refused){ refusals++; if(!(enumerable.length > PLAN_CAP)) countBad = countBad || {src, today, why: 'refused at ' + p.worlds.enumerableCount + ' but reference enumerable ' + enumerable.length}; continue; }
    docs++;
    const engSigs = new Set(p.worlds.plans.map(pl => JSON.stringify(pl.items.map((it, i) => [i, it.itemState]).filter((_, i) => !m.items[i].condition || m.items[i].condition.valid))));
    if(engSigs.size !== sigs.size || [...sigs].some(s => !engSigs.has(s))) missBad = missBad || {src, today, eng: engSigs.size, ref: sigs.size};
    if(p.worlds.enumerableCount !== enumerable.length || p.worlds.possibleCount !== 2 ** enumerable.length) countBad = countBad || {src, today, eng: [p.worlds.enumerableCount, p.worlds.possibleCount], ref: enumerable.length};
    // shares from the reference worlds
    const eligible = m.items.map((it, i) => i).filter(i => m.items[i].status !== 'done' && worlds.some(w => w.items[i].state === 'in-plan'));
    if(eligible.length){
      const shared = eligible.filter(i => worlds.every(w => w.items[i].state === 'in-plan')).length;
      const notEvery = eligible.filter(i => !worlds.every(w => w.items[i].state === 'in-plan'));
      const assumed = notEvery.filter(i => cur.items[i].state === 'limbo').length, setAside = notEvery.filter(i => cur.items[i].state === 'set-aside').length;
      if(!p.shares || p.shares.denominator !== eligible.length || p.shares.shared !== shared || p.shares.assumed !== assumed || p.shares.setAside !== setAside || p.shares.shared + p.shares.assumed + p.shares.setAside + p.shares.dependent !== p.shares.denominator)
        shareBad = shareBad || {src, today, eng: p.shares, ref: {den: eligible.length, shared, assumed, setAside}};
    } else if(p.shares) shareBad = shareBad || {src, today, eng: p.shares, ref: null};
    // reach: items whose reference state differs between yes and no, with the decision's own answer removed
    for(const d of m.decisions){
      const strip = {...m, decisions: m.decisions.map(x => x.key === d.key ? {...x, answer: null} : x)};
      const y = refWorld(strip, today, {[d.key]: 'yes'}), n = refWorld(strip, today, {[d.key]: 'no'});
      const want = m.items.filter((_, i) => y.items[i].state !== n.items[i].state).length;
      const got = p.decisionByName[d.key].reach;
      if(got !== want) reachBad = reachBad || {src, today, d: d.key, got, want};
    }
  }
  check('L1 possible plans are complete and exact: for ' + docs + ' enumerable documents the set of distinct plans equals the brute-force set over every unanswered decision', missBad === null, missBad ? JSON.stringify(missBad).slice(0, 500) : '');
  check('L2 enumerable count, possibleCount = 2^count and the refusal (> ' + PLAN_CAP + ' questions; ' + refusals + ' refusals seen) agree with the brute force', countBad === null, countBad ? JSON.stringify(countBad).slice(0, 500) : '');
  check('L3 the share figure (in every plan / following an assumed answer / set aside by one / depends on an answer) matches the brute force and exhausts its denominator', shareBad === null, shareBad ? JSON.stringify(shareBad).slice(0, 500) : '');
  check('L4 every decision\'s reach (items whose state differs between yes and no) matches the brute force', reachBad === null, reachBad ? JSON.stringify(reachBad).slice(0, 500) : '');

  // Tree view says "N possible plans" where N counts assignments, while Plans view says "N assignments, M distinct plans"
  const src = D('a') + D('b') + D('c') + 'NOW\n  X: x [if a]\n  Y: y [if b]\n  Z: z';
  const p = project(parse(src), TODAY), tp = treeProjection(p);
  const treeTxt = texts(renderTree(tp, treeLayout(tp, {width: 1160, measure}), {colors, measure, dark: false, today: TODAY, projection: p}));
  const plansTxt = texts(renderPlans(p, {colors, measure, dark: false, today: TODAY, projection: p, width: 1160}));
  const treeCount = (treeTxt.match(/(\d+) possible plans/) || [])[1], distinct = p.worlds.plans.length;
  console.log('   info: 3 open questions, c unused: Tree view "' + (treeTxt.match(/\d+ possible plans[^|]*/) || [''])[0] + '"; Plans view "' + (plansTxt.match(/\d+ assignments[^|]*/) || [''])[0] + '" / "' + (plansTxt.match(/\d+ distinct plans?/) || [''])[0] + '"');
  check('L5 the Tree view\'s "N possible plans" equals the Plans view\'s distinct-plan count for the same document', +treeCount === distinct, 'Tree prints ' + treeCount + ' possible plans; Plans prints ' + p.worlds.possibleCount + ' assignments, ' + distinct + ' distinct plans');
  // refusal sentence
  const seven = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(n => D(n)).join('') + 'NOW\n  X: x [if a]\n  Y: y [if b or c or d or e or f or g]';
  const ps = project(parse(seven), TODAY);
  let distinct7 = new Set(); for(let mask = 0; mask < 128; mask++){ const a = {}; ['a', 'b', 'c', 'd', 'e', 'f', 'g'].forEach((k, i) => a[k] = mask & (1 << i) ? 'yes' : 'no'); distinct7.add(refSig(parse(seven), refWorld(parse(seven), TODAY, a))); }
  check('L6 the refusal calls 128 what it is: combinations of answers (only ' + distinct7.size + ' distinct plans exist)', ps.worlds.refused && ps.worlds.reason.includes('128 combinations of answers') && !/possible plans/.test(ps.worlds.reason), '"' + ps.worlds.reason + '"');
}

// =============================================================================================
// 4. WORDS ON EVERY SURFACE
// =============================================================================================
{
  // moot fallback: overview says "after Child = no"; inspector says "Not needed" for an included item
  const src = D('host', '  answer: no 2026-09-01\n') + D('child', '  when: host\n') + 'NOW\n  A: fallback [unless child]\n  B: main [if child]\n';
  const m = parse(src), p = project(m, TODAY), o = overviewProjection(p), tp = treeProjection(p);
  const a = o.items.find(i => i.title === 'fallback'), arms = decisionInspectorData(tp.questions.find(q => q.key === 'child')).arms;
  const treat = [...arms.yes, ...arms.no].find(x => x.title === 'fallback');
  check('W1 an item included because its question never arose ([unless child], child moot after host = no) is not described as answered ("Moot is not answered-no", semantics spec)', !/Child = no/.test(a.displayState.sentence),
    'overview/receipt says "' + a.displayState.sentence + '"');
  check('W2 the inspector arm lists that included item as Included', p.items[0].itemState === 'in-plan' && treat.treatment === 'Included', 'item state ' + p.items[0].itemState + ', inspector treatment "' + treat.treatment + '" (displayEvidence host-exclusion)');
  const v = verdict(p).line;
  check('W3 the verdict "Every item is included in every remaining plan." is only printed when every item is included', !(v.startsWith('Every item') && p.items.some(i => i.itemState !== 'in-plan')), 'prints "' + v + '" while "main" is ' + p.items[1].itemState);

  // random sweep: verdict truth, inspector treatment vs state, overview kind vs value
  const r = rng(31); let every = 0, everyBad = null, treatBad = 0, treatEx = null, total = 0, proceedBad = null;
  const expectTreat = it => it.condition && (!it.condition.valid || it.conditionResult.value === 'invalid') ? 'Condition needs fixing' : it.status === 'done' && it.conditionResult.value === 'false' ? 'Completed'
    : it.itemState === 'in-plan' ? 'Included' : it.itemState === 'not-needed' ? 'Not needed' : it.itemState === 'limbo' ? 'Following' : it.itemState === 'set-aside' ? 'Set aside' : 'Waiting';
  for(let t = 0; t < 400; t++){
    const m = parse(randDoc(r)), today = todayFor(r), p = project(m, today), vv = verdict(p);
    if(vv?.line?.startsWith('Every item')){ every++; if(p.items.some(i => i.itemState !== 'in-plan')) everyBad = everyBad || {src: m.items.map(i => i.raw), states: p.items.map(i => i.itemState)}; }
    const tp = treeProjection(p);
    for(const q of tp.questions){ const d = decisionInspectorData(q); const listed = [...d.arms.yes, ...d.arms.no];
      for(const entry of listed){ const it = p.items.find(i => i.title === entry.title); total++; const want = expectTreat(it);
        if(!entry.treatment.startsWith(want)){ treatBad++; treatEx = treatEx || {item: it.raw, state: it.itemState, evidence: it.displayEvidence.kind, treatment: entry.treatment}; } } }
    for(const it of overviewProjection(p).items){ const src = p.items.find(i => i.identity === it.identity);
      if(it.displayState.kind === 'proceeding' && src.condition?.terms.some(term => p.decisionByName[term.key]?.availability === 'moot') && / = no/.test(it.displayState.sentence)) proceedBad = proceedBad || it.displayState.sentence; }
  }
  check('W4 random sweep: "Every item is included in every remaining plan." (' + every + ' times) is never printed while some item is not included', everyBad === null, everyBad ? JSON.stringify(everyBad).slice(0, 400) : '');
  check('W5 random sweep: every inspector arm treatment agrees with the item\'s state (' + total + ' listings)', treatBad === 0, treatBad + ' disagree, e.g. ' + JSON.stringify(treatEx));
  check('W6 random sweep: no "Proceeding after X = no" sentence for an X that never arose', proceedBad === null, proceedBad || '');

  // an item the assumption EXCLUDES is labelled as following it
  const as = D('pricing', '  assume: yes 2026-09-02\n', '2026-09-01') + 'NOW\n  A: Premium tier [if pricing]\n  B: Free fallback [unless pricing]';
  const ap = project(parse(as), TODAY), ao = overviewProjection(ap), av = verdict(ap).line;
  const fb = ao.items.find(i => i.title === 'Free fallback');
  console.log('   info: assume pricing = yes; "Free fallback [unless pricing]" state ' + ap.items[1].itemState + ', sentence "' + fb.displayState.sentence + '"; verdict "' + av + '"');
  check('W7 under "assume: yes", an item the assumption excludes ([unless pricing]) is set aside, not reported as following the assumption, and the verdict and share figure count it apart', ap.items[1].itemState === 'set-aside' && ap.items[0].itemState === 'limbo'
    && fb.displayState.sentence === 'Set aside on the assumption Pricing = yes' && av === 'The pricing answer is 73 days overdue; 1 item is following an assumed yes; 1 is set aside by it.' && ap.shares.assumed === 1 && ap.shares.setAside === 1,
    '"' + fb.displayState.sentence + '"; verdict "' + av + '"; shares ' + JSON.stringify([ap.shares.shared, ap.shares.assumed, ap.shares.setAside, ap.shares.dependent]));

  // reach counts in the verdict denominator
  const lp = project(parse(LANTERN), '2026-08-01'), lv = verdict(lp);
  const nonDone = lp.items.filter(i => i.status !== 'done').length;
  check('W8 Lantern on 2026-08-01: "' + lv.line + '" (groups reach 3 of ' + nonDone + ' non-done items, checked by brute force in L4)', lv.line === 'Three of six items depend on the groups answer, due 15 September.' && nonDone === 6);
  // agenda counts equal overview group counts
  const am = parse(LANTERN), ap2 = project(am, TODAY), ag = learningAgendaProjection(am, ap2);
  const agTxt = texts(renderLearningAgenda(ag, {colors, measure, dark: false, today: TODAY, projection: ap2, width: 1160}));
  check('W9 Learning Agenda counts on Lantern add up to the number of decisions (' + am.decisions.length + ')', ag.assumptions.length + ag.active.length + ag.blocked.length + ag.notReady.length + ag.settled.length === am.decisions.length,
    [ag.assumptions.length, ag.active.length, ag.blocked.length, ag.notReady.length, ag.settled.length].join('/'));
  console.log('   info: Lantern agenda header: ' + ((agTxt.match(/\d+ ASSUMED[^|]*/) || [''])[0]));
  // a decision both overdue and assumed: agenda puts it in "assumed", overview attention omits it, verdict leads with it
  const lo = overviewProjection(ap2);
  // untestable verdict counts questions that are already answered or no longer apply
  const ans = 'decision a:\n  question: q\n  answer-by: 2026-10-01\n  answer: yes 2026-09-01\n' + D('b') + 'NOW\n  X: x [if a]\n  Y: y [if b]';
  const mo = 'decision a:\n  question: q\n  when: b\n' + D('b', '  answer: no 2026-09-01\n') + 'NOW\n  X: x [if a]\n  Y: y [if b]';
  const va = verdict(project(parse(ans), '2026-09-15')).line, vm = verdict(project(parse(mo), '2026-09-15')).line;
  check('W11 "N questions have no signal or owner — they cannot be answered as written" does not count a question that is already answered (a: answer yes) or no longer applies', !/cannot be answered/.test(va) && !/cannot be answered/.test(vm),
    'answered: "' + va + '"; moot: "' + vm + '" (and this outranks the reach verdict about the genuinely open question b)');
  const nh = project(parse(D('h', '  answer: yes 2026-09-01\n') + D('c', '  when: not h\n  answer: yes 2026-09-02\n') + 'NOW\n  X: x [if c]\n  Y: y [if h]'), TODAY);
  const notice = decisionInspectorData(treeProjection(nh).questions.find(q => q.key === 'c')).answerNotice;
  check('W13 the inspector\'s moot-answer notice names the host answer that excluded the question (h = yes for "when: not h")', /h (was|=) yes/i.test(notice), '"' + notice + '"');
  // close-out currency boundary
  const lc = project(parse(LANTERN), TODAY).decisions[0];
  check('W12 Lantern close-out: review-by 2026-10-31 reads "review-due" from 2026-10-31 (inclusive) and "current" on 2026-10-30', projectLearningCloseOut(lc, '2026-10-31').currency === 'review-due' && projectLearningCloseOut(lc, '2026-10-30').currency === 'current' && projectLearningCloseOut(lc, TODAY).currency === 'review-due');
  check('W10 recorded: Lantern today: pricing is overdue AND working to an assumption; the verdict leads with "The pricing answer is 104 days overdue" while Brief\'s attention list omits it (assumption group)', /pricing answer is 104 days overdue/.test(verdict(ap2).line) && !lo.attention.some(d => d.key === 'pricing'));
}

// =============================================================================================
// 5. ROADMAP HAND-OFF: every exact world round-trips through Roadmap's parser
// =============================================================================================
{
  const check1 = (name, src, today) => {
    const m = parse(src), choices = roadmapProjectionChoices(m, today);
    if(!choices.ok) return {name, refused: choices.code};
    const out = [];
    for(const c of choices.choices){
      if(!c.inspected.ok){ out.push({answers: c.answers, refused: c.inspected.code}); continue; }
      const built = buildRoadmapProjection(m, today, c.answers, projectionAcceptance(c.inspected));
      if(!built.ok){ out.push({answers: c.answers, buildRefused: built.code}); continue; }
      const rm = parseRoadmap(built.text);
      const ref = refWorld(m, today, c.answers);
      const want = m.items.filter((_, i) => ref.items[i].state === 'in-plan').map(i => i.title).sort();
      const got = (rm.items || []).map(i => i.title || i.label || i.name).sort();
      out.push({answers: c.answers, ok: JSON.stringify(want) === JSON.stringify(got), want, got, warnings: (rm.warnings || []).length, basis: built.text.split('\n').find(l => l.startsWith('basis:'))});
    }
    return {name, out};
  };
  const lan = check1('Lantern', LANTERN, TODAY);
  const okWorlds = lan.out.filter(x => x.ok !== undefined);
  console.log('   info: Lantern hand-off on ' + TODAY + ': ' + lan.out.map(x => JSON.stringify(x.answers) + (x.refused ? ' refused ' + x.refused : x.buildRefused ? ' build refused ' + x.buildRefused : ' -> ' + x.got.length + ' items, ' + x.warnings + ' roadmap warnings; ' + x.basis)).join(' || '));
  check('H1 Lantern: every exact delivery world builds a Roadmap whose items are exactly the reference in-plan items, and Roadmap parses it without warnings', okWorlds.length > 0 && okWorlds.every(x => x.ok && x.warnings === 0), JSON.stringify(okWorlds.filter(x => !x.ok || x.warnings)).slice(0, 400));
  const r = rng(808); let bad = null, worlds = 0, refused = {};
  for(let t = 0; t < 200; t++){
    const src = randDoc(r).replace('LATER\n', 'NEXT\n'), today = todayFor(r); const res = check1('fuzz', src, today);
    if(res.refused){ refused[res.refused] = (refused[res.refused] || 0) + 1; continue; }
    for(const x of res.out){ if(x.ok === undefined){ refused[x.refused || x.buildRefused] = (refused[x.refused || x.buildRefused] || 0) + 1; continue; } worlds++; if(!x.ok || x.warnings) bad = bad || {src, today, x}; }
  }
  console.log('   info: hand-off fuzz refusals by code: ' + JSON.stringify(refused));
  const typo = roadmapProjectionChoices(parse(D('a') + 'NOW\n  X: x [if aa]\nLATER\n  Y: y [if a]'), TODAY);
  const cyc = roadmapProjectionChoices(parse(D('a', '  when: b\n') + D('b', '  when: a\n') + 'NOW\n  X: x [if a]\nLATER\n  Y: y'), TODAY);
  check('H3 a misspelt item condition refuses the Roadmap hand-off with its own reason ("refers to a decision that does not exist"), not as a corrupt model', typo.code === 'invalid-item-condition',
    'typo -> ' + typo.code + ' "' + typo.reason + '"; when-cycle -> ' + cyc.code + ' "' + cyc.reason + '"');
  check('H3b a when: cycle refuses with its own reason, not "not a complete parsed model" (PA-12)', cyc.code === 'when-cycle' && /when:/.test(cyc.reason) && !/complete parsed model/.test(cyc.reason), cyc.code + ' "' + cyc.reason + '"');
  // PA-1/PA-2 sweep: a decision called constructor works end to end
  const ct = project(parse(D('constructor', '  answer: yes 2026-09-01\n') + 'NOW\n  A: x [if constructor]'), TODAY);
  check('H3c a decision named constructor is answered and read like any other (PA-1/PA-2)', ct.decisions.length === 1 && ct.items[0].itemState === 'in-plan', ct.items[0].itemState);
  const lanBlocked = lan.out.filter(x => x.refused === 'in-flight-item-dropped').length;
  check('H4 recorded: Lantern hands off only 1 of its 4 worlds; ' + lanBlocked + ' refuse because the [blocked] "Group moderation" would be dropped ([blocked] is treated as in-flight work, like [doing])', lanBlocked === 3);
  check('H2 200 random documents: every exact world that builds round-trips into Roadmap with exactly the reference in-plan items (' + worlds + ' worlds)', bad === null, bad ? JSON.stringify(bad).slice(0, 500) : '');
}

// =============================================================================================
// 6. BEFORE-VALUES of the built-in example, starter and DSL.md example
// =============================================================================================
for(const [name, src, today] of [['Lantern', LANTERN, TODAY], ['Lantern', LANTERN, '2026-08-01'], ['Starter', STARTER, TODAY], ['DSL.md example', DSL_EX, TODAY]]){
  const m = parse(src), p = project(m, today), v = verdict(p), tp = treeProjection(p);
  console.log('   before: ' + name + ' @' + (p.today) + ' :: verdict "' + (v?.line || '') + '" :: decisions ' + p.decisions.map(d => d.key + '=' + d.availability + '/' + d.value + '/' + [...d.provenance].join('+') + (d.overdue ? '/overdue' : '') + '/reach ' + d.reach).join(', ')
    + ' :: items ' + p.items.map(i => i.title + '=' + i.itemState).join(', ') + ' :: worlds ' + (p.worlds.refused ? 'refused' : p.worlds.possibleCount + ' assignments, ' + p.worlds.plans.length + ' distinct') + ' :: shares ' + (p.shares ? p.shares.shared + '/' + p.shares.assumed + '/' + p.shares.dependent + ' of ' + p.shares.denominator : 'none')
    + ' :: tree terminal ' + JSON.stringify(tp.terminal) + ' :: warnings ' + p.warnings.length);
}
check('B1 before-values recorded (see "before:" lines)', true);
done();
