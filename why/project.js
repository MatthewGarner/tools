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
