/* The projection layer: one tree → roadmap columns + audits + OST annotations.
   Pure — no DOM. Spec §2. */

const COMMITTED = new Set(['delivering', 'testing']);

export function project(model){
  const now = [], next = [], later = [], noWhy = [];
  const audits = new Map();
  const ost = {dimmed: new Set(), broken: new Set(), unaddressed: new Set()};
  const multiOutcome = model.outcomes.length > 1;

  /* an opportunity is addressed when any solution beneath it is committed */
  function addressed(node){
    if(node.kind === 'solution') return COMMITTED.has(node.status);
    return node.children.some(addressed);
  }
  /* an opportunity is bare when no solution of any status exists beneath it */
  function hasAnySolution(node){
    return node.children.some(c => c.kind === 'solution' || hasAnySolution(c));
  }

  function laneFor(outcome, ancestry){
    const firstOpp = ancestry.find(a => a.kind === 'opportunity');
    const oppLabel = firstOpp ? firstOpp.label : '—';
    return multiOutcome ? outcome.label + ' — ' + oppLabel : oppLabel;
  }

  for(const outcome of model.outcomes){
    (function walk(node, ancestry){
      for(const child of node.children){
        const nextAncestry = [...ancestry, node];
        if(child.kind === 'solution'){
          const assumptions = child.children.filter(c => c.kind === 'assumption');
          if(COMMITTED.has(child.status)){
            const badges = [];
            if(assumptions.some(a => a.status === 'broken')){
              badges.push('BROKEN ASSUMPTION');
            } else if(assumptions.length === 0 || assumptions.every(a => a.status === 'untested')){
              badges.push('UNTESTED BET');
            }
            const hasOpp = nextAncestry.some(a => a.kind === 'opportunity');
            const entry = {
              node: child,
              lane: laneFor(outcome, nextAncestry),
              breadcrumb: node.kind === 'opportunity' ? node.label : '',
              column: child.status === 'delivering' ? 'now' : 'next',
            };
            if(!hasOpp){
              badges.push('NO WHY');
              noWhy.push(entry);
            } else {
              (child.status === 'delivering' ? now : next).push(entry);
            }
            if(badges.length) audits.set(child, badges);
          } else if(child.status === 'shipped' || child.status === 'parked'){
            ost.dimmed.add(child);
          }
          for(const a of assumptions) if(a.status === 'broken') ost.broken.add(a);
        } else if(child.kind === 'opportunity'){
          if(!hasAnySolution(child)) ost.unaddressed.add(child);
          if(!addressed(child)){
            /* LATER only for the shallowest unaddressed subtree root */
            const parentIsUnaddressedOpp = node.kind === 'opportunity' && !addressed(node);
            if(!parentIsUnaddressedOpp){
              later.push({node: child,
                lane: laneFor(outcome, [...nextAncestry, child]),
                breadcrumb: node.kind === 'opportunity' ? node.label : '', column: 'later'});
            }
          }
          walk(child, nextAncestry);
        } else {
          walk(child, nextAncestry);
        }
      }
    })(outcome, []);
  }

  return {now, next, later, noWhy, audits, ost};
}

/* ---------- the verdict (Swiss 6b) ----------
   A third projection of the same tree: one quotable line + the ONE figure it
   turns on. It reads only states the DSL can express (solution status,
   assumption status, whether an opportunity sits above the work) — the audits
   the OST already draws, said in a sentence.
   Tier order follows the tool's own hierarchy (about copy): a broken assumption
   under something you're delivering is the loudest flag, then committed work
   with no why, then untested commitments. Bare opportunities rank BELOW those
   three deliberately — an OST is MEANT to be wider than its plan (they are the
   LATER column by design), so leading with them would drown the real defects.
   Grammar: "n of t things" — noun agrees with t, verb with n. */

const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));
const nOfT = (n, t, one, many) => n + ' of ' + t + ' ' + (t === 1 ? one : (many || one + 's'));

/* Every node counted by kind — metrics row and coverage tiers both read this. */
export function treeCounts(model){
  const c = {outcomes: 0, opportunities: 0, solutions: 0, assumptions: 0};
  if(!model || !model.outcomes) return c;
  const KEY = {outcome: 'outcomes', opportunity: 'opportunities', solution: 'solutions', assumption: 'assumptions'};
  (function walk(nodes){
    for(const n of nodes){
      const k = KEY[n.kind];
      if(k) c[k]++;
      walk(n.children);
    }
  })(model.outcomes);
  return c;
}

export function whyMetrics(model){
  if(!model || !model.outcomes || !model.outcomes.length) return [];
  const c = treeCounts(model);
  return [
    plural(c.outcomes, 'outcome'),
    c.opportunities ? plural(c.opportunities, 'opportunity', 'opportunities') : null,
    c.solutions ? plural(c.solutions, 'solution') : null,
    c.assumptions ? plural(c.assumptions, 'assumption') : null,
  ].filter(Boolean);
}

export function whyVerdict(model, projection){
  if(!model || !model.outcomes || !model.outcomes.length) return null;
  const p = projection || project(model);
  const counts = treeCounts(model);

  /* one denominator for all three flag tiers: the solutions you have COMMITTED
     to (delivering/testing), wherever they sit — no-why ones included */
  const committed = p.now.length + p.next.length + p.noWhy.length;
  let broken = 0, untested = 0;
  for(const badges of p.audits.values()){
    if(badges.includes('BROKEN ASSUMPTION')) broken++;
    else if(badges.includes('UNTESTED BET')) untested++;
  }

  if(broken){
    const fig = broken + ' of ' + committed;
    return {fig, line: nOfT(broken, committed, 'committed solution') + ' ' +
      (broken === 1 ? 'rests' : 'rest') +
      ' on a broken assumption — the tree already says this will not work.'};
  }
  if(p.noWhy.length){
    const fig = p.noWhy.length + ' of ' + committed;
    return {fig, line: nOfT(p.noWhy.length, committed, 'committed solution') + ' ' +
      (p.noWhy.length === 1 ? 'sits' : 'sit') +
      ' under no opportunity — that work answers a need nobody wrote down.'};
  }
  if(untested){
    const fig = untested + ' of ' + committed;
    return {fig, line: nOfT(untested, committed, 'committed solution') + ' ' +
      (untested === 1 ? 'is an untested bet' : 'are untested bets') +
      ' — the commitment ran ahead of the discovery.'};
  }

  const opps = counts.opportunities;
  if(opps){
    const bare = p.ost.unaddressed.size;
    if(bare){
      const fig = bare + ' of ' + opps;
      return {fig, line: nOfT(bare, opps, 'opportunity', 'opportunities') + ' ' +
        (bare === 1 ? 'carries' : 'carry') +
        ' no solution — the tree is wider than the plan.'};
    }
    const fig = opps + ' of ' + opps;
    return {fig, line: nOfT(opps, opps, 'opportunity', 'opportunities') + ' ' +
      (opps === 1 ? 'carries' : 'carry') +
      ' a solution and nothing is flagged — discovery has covered the plan.'};
  }

  /* no opportunities at all: the work skipped the why, or it's still an ambition */
  if(counts.solutions){
    const fig = plural(counts.solutions, 'solution');
    return {fig, line: fig + ' ' + (counts.solutions === 1 ? 'hangs' : 'hang') +
      " straight off an outcome — the tree records what you'll build, never why."};
  }
  const fig = plural(counts.outcomes, 'outcome');
  return {fig, line: fig + ' with nothing beneath ' +
    (counts.outcomes === 1 ? 'it' : 'them') +
    ' — the tree names an ambition and no needs.'};
}
