/* Pure layout: dependency-depth y (anchors on top, longest path wins),
   deterministic collision spread within a row. No DOM. */

const MIN_GAP = 120;    // px between pill centres in one row before nudging
const NUDGE = 32;       // px vertical step per collision (clears a 26px pill)
const AXIS_CLEAR = 44;  // the bottom row must not sit on the stage-axis labels

export function layoutMap(model, geom = {w: 1200, h: 720, pad: 56}){
  const {w, h, pad} = geom;
  const px = x => pad + x * (w - 2 * pad);
  const names = new Map();   // key → display name
  for(const a of model.anchors) names.set(a.name.toLowerCase(), a.name);
  for(const [k, c] of model.components) names.set(k, c.name);
  const anchorKeys = new Set(model.anchors.map(a => a.name.toLowerCase()));

  /* --- cycle removal: DFS from every node, back edges dropped --- */
  const out = new Map();     // key → [{to, edge}]
  for(const k of names.keys()) out.set(k, []);
  for(const e of model.edges) out.get(e.from).push(e);
  const colour = new Map();  // 0 white, 1 grey, 2 black
  const dropped = new Set(); // edge objects
  const dfs = k => {
    colour.set(k, 1);
    for(const e of out.get(k)){
      const c = colour.get(e.to) || 0;
      if(c === 1) dropped.add(e);
      else if(c === 0) dfs(e.to);
    }
    colour.set(k, 2);
  };
  for(const k of names.keys()) if(!colour.get(k)) dfs(k);
  const activeEdges = model.edges.filter(e => !dropped.has(e));

  /* --- longest-path depth: anchors 0, chain heads 1 --- */
  const inDeg = new Map();
  for(const k of names.keys()) inDeg.set(k, 0);
  for(const e of activeEdges) inDeg.set(e.to, inDeg.get(e.to) + 1);
  const depth = new Map();
  const depthOf = k => {
    if(depth.has(k)) return depth.get(k);
    if(anchorKeys.has(k)){ depth.set(k, 0); return 0; }
    const parents = activeEdges.filter(e => e.to === k);
    const d = parents.length === 0 ? 1
      : 1 + Math.max(...parents.map(e => anchorKeys.has(e.from) ? 0 : depthOf(e.from)));
    depth.set(k, d);
    return d;
  };
  for(const k of names.keys()) depthOf(k);

  /* --- rows: orphans (no edges at all) get their own bottom row --- */
  const touched = new Set();
  for(const e of model.edges){ touched.add(e.from); touched.add(e.to); }
  const orphanKeys = [...model.components.keys()].filter(k => !touched.has(k));
  const maxDepth = Math.max(0, ...depth.values());
  const orphanRow = orphanKeys.length ? maxDepth + 1 : null;
  for(const k of orphanKeys) depth.set(k, orphanRow);
  const totalRows = orphanRow ?? maxDepth;
  const rowY = r => pad + 20 + (totalRows === 0 ? 0
    : r * ((h - 2 * pad - 20 - AXIS_CLEAR) / totalRows));

  /* --- nodes with pixel positions --- */
  const nodes = new Map();
  for(const [k, c] of model.components){
    nodes.set(k, {name: c.name, x: c.x, stage: c.stage, ghost: c.ghost,
      anchor: false, srcLine: c.srcLine,
      px: c.x === null ? pad : px(c.x), y: rowY(depth.get(k))});
  }
  for(const a of model.anchors){
    const k = a.name.toLowerCase();
    const kids = activeEdges.filter(e => e.from === k)
      .map(e => nodes.get(e.to)).filter(Boolean);
    const ax = kids.length ? kids.reduce((s, n) => s + n.px, 0) / kids.length : w / 2;
    nodes.set(k, {name: a.name, x: null, stage: null, ghost: false,
      anchor: true, srcLine: a.srcLine, px: ax, y: rowY(0)});
  }

  /* --- deterministic collision spread within a row --- */
  const byRow = new Map();
  for(const n of nodes.values()){
    const list = byRow.get(n.y) || [];
    list.push(n);
    byRow.set(n.y, list);
  }
  for(const list of byRow.values()){
    list.sort((a, b) => a.px - b.px || (a.name < b.name ? -1 : 1));
    let bumps = 0;
    for(let i = 1; i < list.length; i++){
      if(list[i].px - list[i - 1].px < MIN_GAP){
        bumps++;
        list[i].y += (bumps % 2 ? 1 : -1) * NUDGE * Math.ceil(bumps / 2);
      } else bumps = 0;
    }
  }

  /* --- links --- */
  const links = model.edges.map(e => {
    const a = nodes.get(e.from), b = nodes.get(e.to);
    return {x1: a.px, y1: a.y, x2: b.px, y2: b.y,
      from: e.from, to: e.to, dropped: dropped.has(e)};
  });

  return {
    nodes: [...nodes.values()],
    links,
    rows: totalRows + 1,
    droppedEdges: [...dropped].map(e => ({from: e.from, to: e.to})),
    orphans: orphanKeys.map(k => names.get(k)),
  };
}
