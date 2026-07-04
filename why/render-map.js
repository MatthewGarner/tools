/* Roadmap projection renderer: a thin adapter onto roadmap/render.js.
   Outcome bands contain opportunity lanes (laneGroups); audits ride the
   badge mechanism; uncommitted first-level opportunities show ghost chips. */
import {render as renderRoadmap} from '../roadmap/render.js';

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

  for(const outcome of model.outcomes){
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
        status: null, url: null, srcLine: e.node.srcLine, _node: e.node});
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
          note: '', status: null, url: null, srcLine: e.node.srcLine, _node: e.node});
      }
    }
    if(lanes.length) laneGroups.push({label: outcome.label, lanes});
  }

  const roadmapModel = {
    title: model.title, dateStr: null,
    horizons: ['Now', 'Next', 'Later'],
    lanes: laneGroups.flatMap(g => g.lanes), laneGroups, items,
    warnings: [], wip: 0, fade: true,
    palette: model.palette, accent: model.accent,
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
  return renderRoadmap(roadmapModel, {...ctx, diff});
}
