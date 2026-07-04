/* Roadmap projection renderer: a thin adapter onto roadmap/render.js.
   The projection becomes a roadmap model; audits ride the badge mechanism. */
import {render as renderRoadmap} from '../roadmap/render.js';

const NO_WHY_LANE = '⚠ no why';

export function renderMap(model, projection, ctx){
  const items = [];
  const lanes = [];
  const laneSeen = new Set();
  const addLane = l => { if(!laneSeen.has(l)){ laneSeen.add(l); lanes.push(l); } };
  const badgeByNode = new Map();

  const push = (entry, h) => {
    addLane(entry.lane);
    items.push({lane: entry.lane, h, title: entry.node.label,
      note: entry.breadcrumb && entry.breadcrumb !== entry.lane.split(' — ').pop() ? entry.breadcrumb : '',
      status: null, url: null, srcLine: entry.node.srcLine, _node: entry.node});
  };
  for(const e of projection.now) push(e, 0);
  for(const e of projection.next) push(e, 1);
  for(const e of projection.later){
    addLane(e.lane);
    items.push({lane: e.lane, h: 2, title: e.node.label, note: '',
      status: null, url: null, srcLine: e.node.srcLine, _node: e.node, _opportunity: true});
  }
  for(const e of projection.noWhy){
    addLane(NO_WHY_LANE);
    items.push({lane: NO_WHY_LANE, h: e.column === 'now' ? 0 : 1, title: e.node.label,
      note: '', status: null, url: null, srcLine: e.node.srcLine, _node: e.node});
  }
  /* keep the audit lane last */
  if(laneSeen.has(NO_WHY_LANE)){
    lanes.splice(lanes.indexOf(NO_WHY_LANE), 1);
    lanes.push(NO_WHY_LANE);
  }

  for(const [node, badges] of projection.audits){
    badgeByNode.set(node, badges[0]);   // one badge per card; audits are pre-prioritised
  }

  const roadmapModel = {
    title: model.title, dateStr: null,
    horizons: ['Now', 'Next', 'Later'],
    lanes, items,
    warnings: [], wip: 0, fade: true,
    palette: model.palette, accent: model.accent,
  };
  const diff = {
    badge: it => {
      if(it._opportunity) return {kind: 'moved', label: 'Opportunity'};
      const b = badgeByNode.get(it._node);
      if(!b) return null;
      return {kind: b === 'BROKEN ASSUMPTION' ? 'alert' : b === 'NO WHY' ? 'alert' : 'moved', label: b};
    },
    dropped: [], since: '', any: false,
  };
  return renderRoadmap(roadmapModel, {...ctx, diff});
}
