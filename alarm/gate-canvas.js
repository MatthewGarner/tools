/* The dots-through-a-gate picture. layoutFlow is pure (node-tested); makeDriver is
   the thin canvas animator (eyeballed + browser-suite covered). Built n-stage from
   day one so #105 (survivorship: many gates) rides it — v1 uses a single stage:
   pass = ALARM (top-right bin), fail = quiet (bottom-right). */

const PAD = 8, LABEL_H = 22;

/* pack `items` (already ordered) into a square-ish grid inside rect; returns each
   item with {x, y}. cols from the rect's aspect so dots stay roughly circular. */
function packGrid(items, rect){
  const c = items.length;
  if(!c) return [];
  const cols = Math.max(1, Math.round(Math.sqrt(c * rect.w / Math.max(1, rect.h))));
  const rows = Math.ceil(c / cols);
  const sx = rect.w / cols, sy = rect.h / rows;
  return items.map((it, k) => ({...it,
    x: rect.x + (k % cols + 0.5) * sx, y: rect.y + (Math.floor(k / cols) + 0.5) * sy}));
}

function binLabel(b, stages, opts){
  if(b === 0) return (opts && opts.passLabel) || 'passed';
  const st = stages[b - 1] || {};
  return st.fail || ('failed ' + b);
}

/* dots: [{real, score, ...}]; stages: [{split: dot => pass?, fail?: label}];
   geom: {w, h, dotR}; opts?: {passLabel}. n stages → n+1 terminal bins: bin 0 =
   passed every stage (top), bin k = first failed at stage k (stacked below). */
export function layoutFlow(dots, stages, geom, opts){
  const {w, h} = geom;
  const n = stages.length, nBins = n + 1;

  const assigned = dots.map((d, i) => {
    const pass = []; let bin = 0, failed = false;
    for(let s = 0; s < n; s++){
      const p = !!stages[s].split(d);
      pass.push(p);
      if(!p && !failed){ bin = s + 1; failed = true; }
    }
    return {i, real: !!d.real, pass, bin};
  });

  // start grid — left third, dots in index order
  const startRect = {x: PAD, y: PAD, w: w / 3 - 2 * PAD, h: h - 2 * PAD};
  const startById = new Map(packGrid(assigned.map(a => ({i: a.i})), startRect).map(p => [p.i, p]));

  // terminal bins — right third, stacked vertically; real dots first within each
  const binX = w * 2 / 3, binW = w / 3 - PAD, slot = h / nBins;
  const bins = [], positions = new Array(dots.length);
  for(let b = 0; b < nBins; b++){
    const members = assigned.filter(a => a.bin === b)
      .sort((x, y) => (x.real === y.real ? x.i - y.i : x.real ? -1 : 1));
    bins.push({x: binX, y: b * slot, w: binW, h: slot, label: binLabel(b, stages, opts), count: members.length});
    const rect = {x: binX, y: b * slot + LABEL_H, w: binW, h: slot - LABEL_H - PAD};
    for(const p of packGrid(members, rect)){
      const s0 = startById.get(p.i);
      positions[p.i] = {i: p.i, x0: s0.x, y0: s0.y, x1: p.x, y1: p.y, real: p.real, pass: assigned[p.i].pass, bin: b};
    }
  }
  return {positions, bins};
}

/* Thin canvas driver — node never touches this. draw() interpolates each dot from
   its start slot to its terminal slot with a left-to-right stagger wave; progress=1
   is the settled final frame (the reduced-motion path). Filled = real, ring = benign. */
export function makeDriver(canvas, {dpr = (globalThis.devicePixelRatio || 1)} = {}){
  const ctx = canvas.getContext('2d');
  const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  function draw(layout, colors, progress){
    const {width: W, height: H} = canvas;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W / dpr, H / dpr);
    // faint bin frames + labels
    ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
    ctx.textBaseline = 'top';
    for(const b of layout.bins){
      ctx.fillStyle = colors.binLabel;
      ctx.fillText(b.label + ' · ' + b.count, b.x + 2, b.y + 4);
    }
    const r = layout.dotR || 3;
    for(const p of layout.positions){
      if(!p) continue;
      // per-dot stagger keyed to horizontal target so the wave reads left→right
      const span = 0.55;
      const start = (1 - span) * (p.x1 / (canvas.width / dpr || 1));
      const local = ease(Math.max(0, Math.min(1, (progress - start) / span)));
      const x = p.x0 + (p.x1 - p.x0) * local;
      const y = p.y0 + (p.y1 - p.y0) * local;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      if(p.real){ ctx.fillStyle = colors.real; ctx.fill(); }
      else { ctx.lineWidth = 2; ctx.strokeStyle = colors.benign; ctx.stroke(); }
    }
  }
  return {draw};
}
