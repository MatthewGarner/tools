/* Roadmap projection renderer: a thin adapter onto roadmap/render.js.
   Outcome bands contain opportunity lanes (laneGroups); audits ride the
   badge mechanism; uncommitted first-level opportunities show ghost chips.
   Gate B: a committed solution (now/next/no-why) whose top audit badge is
   BROKEN ASSUMPTION gets `atRisk: true` — roadmap/render.js reuses its cond
   dashed-border mechanic for this (cond-parts.js's stateOpacity/dasharray),
   but this flag is why-only: roadmap's own parser never sets it, so a plain
   roadmap doc is untouched, and `it.ghost`/`it.worldState` are never touched
   here (the item stays fully editable — "at-risk", not "dropped"). */
import {render as renderRoadmap} from '../roadmap/render.js';
import {renderDeck as renderRoadmapDeck} from '../roadmap/render-deck.js';
import {layoutRoadmap} from '../roadmap/layout.js';

export function renderMap(model, projection, ctx){
  const items = [];
  const laneGroups = [];
  const badgeByNode = new Map();
  for(const [node, badges] of projection.audits) badgeByNode.set(node, badges[0]);

  /* lane names must be unique across bands; hair-space suffixes disambiguate
     duplicates without visible change */
  const seen = new Set();
  const uniqueLane = label => {
    let name = label;
    while(seen.has(name)) name += ' ';
    seen.add(name);
    return name;
  };

  const indexedOutcomes = model.outcomes.length > 3 || model.outcomes.some(o => o.label.length > 44);
  for(const [outcomeIndex, outcome] of model.outcomes.entries()){
    const lanes = [];
    const laneByOpp = new Map();
    for(const opp of outcome.children.filter(c => c.kind === 'opportunity')){
      const lane = uniqueLane(opp.label);
      laneByOpp.set(opp, lane);
      lanes.push(lane);
    }
    /* map every descendant node to its first-level opportunity's lane */
    const nodeToLane = new Map();
    (function index(node, lane){
      for(const child of node.children){
        const childLane = (node === outcome && laneByOpp.has(child)) ? laneByOpp.get(child) : lane;
        nodeToLane.set(child, childLane);
        index(child, childLane);
      }
    })(outcome, null);
    const inThisOutcome = e => nodeToLane.has(e.node);

    for(const e of [...projection.now, ...projection.next].filter(inThisOutcome)){
      const lane = nodeToLane.get(e.node);
      items.push({lane, h: e.column === 'now' ? 0 : 1, title: e.node.label,
        note: e.breadcrumb && e.breadcrumb !== lane.trim() ? e.breadcrumb : '',
        status: null, url: null, srcLine: e.node.srcLine, _node: e.node,
        edit: {note: false}, atRisk: badgeByNode.get(e.node) === 'BROKEN ASSUMPTION'});
    }
    for(const e of projection.later.filter(inThisOutcome)){
      const lane = nodeToLane.get(e.node);
      if(lane && lane.trim() === e.node.label){
        /* the lane itself is uncommitted: quiet ghost chip, not a repeated title */
        items.push({lane, h: 2, title: 'no committed solution yet', note: '',
          status: null, url: null, srcLine: e.node.srcLine, _node: e.node, ghost: true});
      } else if(lane){
        items.push({lane, h: 2, title: e.node.label, note: '',
          status: null, url: null, srcLine: e.node.srcLine, _node: e.node, _opportunity: true});
      }
    }
    const orphans = projection.noWhy.filter(inThisOutcome);
    if(orphans.length){
      const lane = uniqueLane('⚠ no why');
      lanes.push(lane);
      for(const e of orphans){
        items.push({lane, h: e.column === 'now' ? 0 : 1, title: e.node.label,
          note: '', status: null, url: null, srcLine: e.node.srcLine, _node: e.node,
          atRisk: badgeByNode.get(e.node) === 'BROKEN ASSUMPTION'});
      }
    }
    if(lanes.length) laneGroups.push({
      label: (indexedOutcomes ? 'O' + String(outcomeIndex + 1).padStart(2, '0') + ' · ' : '') + outcome.label,
      rawLabel: outcome.label,
      displayId: 'O' + String(outcomeIndex + 1).padStart(2, '0'),
      lanes,
    });
  }

  const roadmapModel = {
    title: model.title, dateStr: null,
    horizons: ['Now', 'Next', 'Later'],
    lanes: laneGroups.flatMap(g => g.lanes), laneGroups, items,
    warnings: [], wip: 0, fade: true,
    palette: model.palette, accent: model.accent,
    headline: '', story: '', focus: undefined, timeAxis: false,
  };
  const diff = {
    badge: it => {
      if(it._opportunity) return {kind: 'moved', label: 'Opportunity'};
      if(it.ghost) return null;
      const b = badgeByNode.get(it._node);
      if(!b) return null;
      return {kind: b === 'UNTESTED BET' ? 'moved' : 'alert', label: b};
    },
    dropped: [], since: '', any: false,
  };
  if(ctx.intent === 'presentation'){
    return renderRoadmapDeck({...roadmapModel, style: 'grid'}, {...ctx, diff});
  }
  const roadmapLayout = layoutRoadmap(roadmapModel, {
    kind: 'native', measure: ctx.measure, width: ctx.width,
  });
  return renderRoadmap(roadmapModel, {...ctx, diff, roadmapLayout});
}
