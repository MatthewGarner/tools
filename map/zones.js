/* Preset resolution, rule evaluation, point-in-zone, zone geometry. Pure. */

const ALWAYS = [{expr:'x', op:'>', val:-1}];   // internal catch-all

export const PRESETS = {
  assumptions: {
    axes: {x:{label:'Evidence', low:'none', high:'strong'}, y:{label:'Importance', low:'low', high:'high'}},
    grid: null, cellNames: [],
    ruleZones: [
      {name:'test first',     tone:'bad',  rules:[{expr:'x', op:'<', val:50}, {expr:'y', op:'>', val:50}]},
      {name:'keep an eye on', tone:'warn', rules:[{expr:'x+y', op:'>', val:100}]},
      {name:'safe enough',    tone:'good', rules: ALWAYS},
    ],
    fields: ['test'],
    advice: {
      'test first': 'High importance, weak evidence — design a cheap test before building on these.',
      'keep an eye on': 'Important or thinly evidenced — recheck as evidence lands.',
      'safe enough': 'Well-evidenced or low-stakes — spend discovery effort elsewhere.',
    },
    flag: (item, zone) => zone === 'test first' && !item.fields.some(f => f.key === 'test')
      ? 'no test designed — pick a method: interview, prototype, or data pull' : null,
    verdict(st){
      if(!st.placed) return 'Nothing placed yet — drag assumptions onto the map.';
      const tf = (st.byZone.get('test first') || []).length;
      const nt = st.flagged.length;
      return tf + ' of ' + st.placed + ' assumption' + (st.placed === 1 ? '' : 's') +
        ' sit in test first' + (nt ? '; ' + nt + (nt === 1 ? ' has' : ' have') + ' no test designed.' : '.');
    },
  },
  stakeholders: {
    axes: {x:{label:'Interest', low:'low', high:'high'}, y:{label:'Power', low:'low', high:'high'}},
    grid: {cols:2, rows:2},
    cellNames: [
      {col:1, row:2, name:'keep satisfied'}, {col:2, row:2, name:'manage closely'},
      {col:1, row:1, name:'monitor'},        {col:2, row:1, name:'keep informed'},
    ],
    ruleZones: [], fields: ['attitude'],
    advice: {
      'manage closely': 'High power, high interest — engage directly and often.',
      'keep satisfied': 'High power, low interest — keep content without noise; watch for interest shifts.',
      'keep informed': 'High interest, low power — honest updates; they amplify your story.',
      'monitor': 'Low power, low interest — check occasionally; don’t over-invest.',
    },
    flag: item => item.y != null && item.y > 50 && !item.fields.some(f => f.key === 'attitude')
      ? 'high power with no attitude: read' : null,
    verdict(st){
      if(!st.placed) return 'Nothing placed yet — drag stakeholders onto the grid.';
      const mc = (st.byZone.get('manage closely') || []).length;
      return mc + ' stakeholder' + (mc === 1 ? '' : 's') + ' to manage closely' +
        (st.flagged.length ? '; ' + st.flagged.length + ' high-power without an attitude read.' : '.');
    },
  },
  futures: {
    axes: {x:{label:'Uncertainty A', low:'one pole', high:'other pole'},
           y:{label:'Uncertainty B', low:'one pole', high:'other pole'}},
    grid: {cols:2, rows:2},
    cellNames: [
      {col:1, row:2, name:'Scenario A'}, {col:2, row:2, name:'Scenario B'},
      {col:1, row:1, name:'Scenario C'}, {col:2, row:1, name:'Scenario D'},
    ],
    ruleZones: [], fields: [],
    advice: {},
    axisHint: 'the futures preset wants your two critical uncertainties as x:/y: labels',
    flag: () => null,
    verdict(st){
      if(!st.placed) return 'Nothing placed yet — drag signals into the worlds.';
      const occupied = [...st.byZone.values()].filter(v => v.length).length;
      return st.placed + ' signal' + (st.placed === 1 ? '' : 's') + ' across ' + occupied + ' of 4 worlds.';
    },
  },
  risk: {
    axes: {x:{label:'Probability', low:'rare', high:'likely'}, y:{label:'Impact', low:'minor', high:'severe'}},
    grid: {cols:3, rows:3}, cellNames: [],
    ruleZones: [
      {name:'severe',   tone:'bad',  rules:[{expr:'x+y', op:'>', val:140}]},
      {name:'moderate', tone:'warn', rules:[{expr:'x+y', op:'>', val:90}]},
      {name:'low',      tone:'good', rules: ALWAYS},
    ],
    fields: ['owner', 'mitigation'],
    advice: {
      severe: 'Act now — mitigate, transfer, or stop; name an owner.',
      moderate: 'Plan a response and a trigger for review.',
      low: 'Accept and revisit on cadence.',
    },
    flag: (item, zone) => zone === 'severe' && !item.fields.some(f => f.key === 'owner')
      ? 'severe with no owner:' : null,
    sortItems: (a, b) => (b.x + b.y) - (a.x + a.y),
    verdict(st){
      if(!st.placed) return 'Nothing placed yet — drag risks onto the grid.';
      const sev = st.byZone.get('severe') || [];
      return sev.length + ' of ' + st.placed + ' risk' + (st.placed === 1 ? '' : 's') +
        ' sit in severe' + (sev.length ? '; worst: “' + sev[0].label + '”.' : '.');
    },
  },
};
export const PRESET_NAMES = Object.keys(PRESETS);

const EVAL = {x: p => p[0], y: p => p[1], 'x+y': p => p[0] + p[1], 'x-y': p => p[0] - p[1]};

export function ruleHolds(rule, x, y){
  const v = EVAL[rule.expr]([x, y]);
  return rule.op === '<' ? v < rule.val : v > rule.val;
}

export function resolve(model){
  const def = model.preset ? PRESETS[model.preset] : null;
  const warnings = [];
  const x = model.axes.x || (def ? def.axes.x : {label:'X', low:'low', high:'high'});
  const y = model.axes.y || (def ? def.axes.y : {label:'Y', low:'low', high:'high'});
  if(!def && !model.axes.x) warnings.push('no x: axis label — using "X"');
  if(!def && !model.axes.y) warnings.push('no y: axis label — using "Y"');
  if(def && def.axisHint && !model.axes.x && !model.axes.y) warnings.push(def.axisHint);

  const grid = model.grid || (def ? def.grid : null);

  /* cell names: preset applies only to its own (un-overridden) grid; user lines merge per-cell */
  const cells = new Map();
  if(def && def.grid && !model.grid)
    for(const c of def.cellNames) cells.set(c.col + ',' + c.row, {name: c.name, srcLine: null});
  for(const c of model.cellNames){
    if(!grid){ warnings.push('line ' + (c.srcLine + 1) + ': zone ' + c.col + ',' + c.row +
      ' — no grid declared (add zones: grid NxM)'); continue; }
    if(c.col < 1 || c.col > grid.cols || c.row < 1 || c.row > grid.rows){
      warnings.push('line ' + (c.srcLine + 1) + ': zone ' + c.col + ',' + c.row +
        ' is outside the ' + grid.cols + 'x' + grid.rows + ' grid'); continue; }
    cells.set(c.col + ',' + c.row, {name: c.name, srcLine: c.srcLine});
  }

  /* rule zones: any user rule zone replaces the preset's set wholesale */
  const presetTone = name => {
    const z = def && def.ruleZones.find(z => z.name === name);
    return z ? z.tone : 'accent';
  };
  const rz = model.ruleZones.length
    ? model.ruleZones.map(z => ({name: z.name, rules: z.rules, tone: presetTone(z.name), srcLine: z.srcLine}))
    : (def ? def.ruleZones.map(z => ({...z, srcLine: null})) : []);
  const seen = new Set();
  for(const z of rz){
    if(seen.has(z.name)) warnings.push('zone "' + z.name + '" declared twice — the first wins');
    seen.add(z.name);
  }

  const zones = [];
  for(const z of rz) zones.push({id: 'r:' + z.name, kind: 'rule', name: z.name,
    tone: z.tone || 'accent', rules: z.rules, srcLine: z.srcLine ?? null});
  if(grid)
    for(let r = grid.rows; r >= 1; r--) for(let c = 1; c <= grid.cols; c++){
      const nm = cells.get(c + ',' + r);
      zones.push({id: 'c:' + c + ',' + r, kind: 'cell', col: c, row: r,
        name: nm ? nm.name : c + ',' + r, anonymous: !nm,
        tone: nm ? 'accent' : 'none', srcLine: nm ? nm.srcLine : null});
    }
  zones.push({id: 'unzoned', kind: 'unzoned', name: 'unzoned', tone: 'none', srcLine: null});
  return {preset: model.preset, def, x, y, grid, zones, warnings};
}

export function zoneFor(resolved, x, y){
  for(const z of resolved.zones){
    if(z.kind === 'rule' && z.rules.every(r => ruleHolds(r, x, y))) return z;
    if(z.kind === 'cell'){
      const {cols, rows} = resolved.grid;
      const c = Math.min(Math.floor(x / (100 / cols)), cols - 1) + 1;
      const r = Math.min(Math.floor(y / (100 / rows)), rows - 1) + 1;
      if(c === z.col && r === z.row) return z;
    }
    if(z.kind === 'unzoned') return z;
  }
}

/* Sutherland–Hodgman: clip pts against half-plane f(p) >= 0 */
function clipHalfPlane(pts, f){
  const out = [];
  for(let i = 0; i < pts.length; i++){
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const fa = f(a), fb = f(b);
    if(fa >= 0) out.push(a);
    if((fa >= 0) !== (fb >= 0)){
      const t = fa / (fa - fb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

export function zonePolygon(resolved, zone){
  if(zone.kind === 'cell'){
    const {cols, rows} = resolved.grid;
    const w = 100 / cols, h = 100 / rows;
    const x0 = (zone.col - 1) * w, y0 = (zone.row - 1) * h;
    return [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]];
  }
  if(zone.kind !== 'rule') return null;
  let pts = [[0, 0], [100, 0], [100, 100], [0, 100]];
  for(const r of zone.rules){
    const f = r.op === '<' ? p => r.val - EVAL[r.expr](p) : p => EVAL[r.expr](p) - r.val;
    pts = clipHalfPlane(pts, f);
    if(pts.length < 3) return null;
  }
  return pts;
}

export function centroid(pts){
  let a = 0, cx = 0, cy = 0;
  for(let i = 0; i < pts.length; i++){
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    const f = x1 * y2 - x2 * y1;
    a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f;
  }
  if(Math.abs(a) < 1e-9) return pts[0];
  return [cx / (3 * a), cy / (3 * a)];
}

/* paint order: cells first (base layer), then rule zones lowest-precedence-first,
   so overpainting with OPAQUE fills makes the topmost paint = the winning zone */
export function paintOrder(resolved){
  const cells = resolved.zones.filter(z => z.kind === 'cell');
  const rules = resolved.zones.filter(z => z.kind === 'rule').slice().reverse();
  return [...cells, ...rules]
    .map(z => ({zone: z, pts: zonePolygon(resolved, z)}))
    .filter(e => e.pts && e.pts.length >= 3);
}

/* label anchor per zone: mean of the lattice samples the zone actually wins,
   snapped to the nearest winning sample if the mean falls in another zone */
export function labelAnchors(resolved, step = 4){
  const samples = new Map();
  for(let x = step / 2; x < 100; x += step) for(let y = step / 2; y < 100; y += step){
    const z = zoneFor(resolved, x, y);
    if(z.kind === 'unzoned') continue;
    if(!samples.has(z.id)) samples.set(z.id, []);
    samples.get(z.id).push([x, y]);
  }
  const out = new Map();
  for(const [id, pts] of samples){
    let ax = 0, ay = 0;
    for(const [x, y] of pts){ ax += x; ay += y; }
    ax /= pts.length; ay /= pts.length;
    if(zoneFor(resolved, ax, ay).id !== id){
      let best = pts[0], bd = Infinity;
      for(const p of pts){
        const d = (p[0] - ax) ** 2 + (p[1] - ay) ** 2;
        if(d < bd){ bd = d; best = p; }
      }
      [ax, ay] = best;
    }
    out.set(id, [ax, ay]);
  }
  return out;
}
