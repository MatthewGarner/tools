/* Driver-tree view (#73): a Fermi formula IS a driver tree, so render the AST as
   one — leaves (your ranged inputs) on the left, the outcome on the right, and the
   value-of-information share printed on every leaf edge. Pure: SVG string out,
   colours and text measure from ctx only. */
import {esc, tint} from '../assets/svg.js';
import {fmt, sig} from './engine.js';

const MONO = 'ui-monospace,"SF Mono",Menlo,Consolas,monospace';
const SANS = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
const OP = {'*': '×', '/': '÷', '+': '+', '-': '−', '^': '^', neg: '−'};
const PAD = 28, ROW_H = 54, COL_W = 128, CAP_H = 40, OP_R = 13, OUT_W = 236, OUT_H = 96, HEAD_H = 64;

const f1 = n => (Math.round(n * 100) / 100).toString();

export function renderDriverTree(model, ctx){
  const c = ctx.colors, measure = ctx.measure;
  const {ast, ranges, sens = [], p10, p50, p90, fullRatio, scenLabel} = model;
  const shares = Object.fromEntries(sens.map(s => [s.name, s.share]));
  const top = sens.length ? sens[0] : null;

  /* positions: leaves stacked by in-order row; internal nodes at the mean of
     their children; columns by depth from the root (root rightmost) */
  const nodes = [];
  const depthOf = n => n.t === 'bin' ? 1 + Math.max(depthOf(n.l), depthOf(n.r))
    : n.t === 'neg' ? 1 + depthOf(n.e) : 0;
  const maxD = depthOf(ast);
  let li = 0;
  function place(n, d){
    let node;
    if(n.t === 'bin'){
      const L = place(n.l, d + 1), R = place(n.r, d + 1);
      node = {n, d, y: (L.y + R.y) / 2, kids: [L, R]};
    } else if(n.t === 'neg'){
      const C = place(n.e, d + 1);
      node = {n, d, y: C.y, kids: [C]};
    } else {
      node = {n, d, y: HEAD_H + li * ROW_H + ROW_H / 2, leaf: true};
      li++;
    }
    nodes.push(node);
    return node;
  }
  const root = place(ast, 0);

  const leafTexts = nodes.filter(nd => nd.leaf).map(nd => nd.n.t === 'var'
    ? Math.max(measure(nd.n.name, '600 12px ' + MONO),
        measure(rangeText(ranges[nd.n.name]), '11px ' + SANS))
    : measure(fmt(nd.n.v), '600 12px ' + MONO));
  const capW = Math.min(260, Math.max(110, ...leafTexts) + 26);
  const rootCx = PAD + capW + maxD * COL_W + (maxD ? 0 : 30);
  const W = Math.round(rootCx + 30 + OUT_W + PAD);
  const H = Math.round(Math.max(HEAD_H + li * ROW_H, root.y + OUT_H / 2 + 8) + PAD);
  const cx = nd => nd.leaf ? null : PAD + capW + (maxD - nd.d) * COL_W;

  const shareOf = n => n.t === 'var' ? (shares[n.name] || 0)
    : n.t === 'num' ? 0 : n.t === 'neg' ? shareOf(n.e) : shareOf(n.l) + shareOf(n.r);
  const widthFor = s => 1.25 + Math.min(1, s) * 3.25;

  const s = [];
  /* header */
  s.push(txt(PAD, PAD + 4, 'WHAT DRIVES THE ANSWER' + (scenLabel ? ' — SCENARIO ' + scenLabel : ''),
    10, c.muted, {weight: 600, tracking: 1}));
  const fullLabel = isFinite(fullRatio) ? '×' + sig(fullRatio, 2) : fmt(p10) + ' – ' + fmt(p90);
  s.push(txt(PAD, PAD + 24, !top ? 'Give the inputs ranges to see what drives the spread.'
    : top.share > 0.35
      ? 'Research ' + top.name.replace(/_/g, ' ') + ' first — pinning it cuts the spread from ' +
        fullLabel + ' to ' + top.label + '.'
      : 'No single input dominates — the spread is shared across the drivers.', 13, c.ink));

  /* edges (drawn beneath nodes) */
  function edgeAnchors(child){
    const x1 = child.leaf ? PAD + capW : cx(child) + OP_R;
    return {x1, y1: child.y};
  }
  function drawEdge(child, parent, px){
    const {x1, y1} = edgeAnchors(child);
    const x2 = px, y2 = parent.y;
    const mx = (x1 + x2) / 2;
    const sh = shareOf(child.n);
    const isVar = child.leaf && child.n.t === 'var';
    const isTop = isVar && top && child.n.name === top.name;
    s.push('<path' + (isVar ? ' data-edge="' + esc(child.n.name) + '"' : '') +
      ' d="M' + f1(x1) + ',' + f1(y1) + ' C' + f1(mx) + ',' + f1(y1) + ' ' + f1(mx) + ',' + f1(y2) +
      ' ' + f1(x2) + ',' + f1(y2) + '" fill="none" stroke="' +
      (isTop ? c.accent : child.leaf ? c.muted : c.border) + '" stroke-width="' + f1(widthFor(sh)) +
      '"' + (isVar ? '' : ' stroke-opacity="0.9"') + '/>');
    if(isVar && sh >= 0.005){
      s.push(txt((x1 + x2) / 2, (y1 + y2) / 2 - 6, Math.round(sh * 100) + '%', 10.5,
        isTop ? c.accent : c.muted, {weight: isTop ? 700 : 600, anchor: 'middle'}));
    }
  }
  for(const nd of nodes){
    if(nd.kids) for(const k of nd.kids) drawEdge(k, nd, cx(nd) - OP_R);
  }
  /* root → outcome */
  const rootRight = root.leaf ? PAD + capW : cx(root) + OP_R;
  s.push('<path d="M' + f1(rootRight) + ',' + f1(root.y) + ' L' + f1(rootCx + 30) + ',' + f1(root.y) +
    '" stroke="' + c.muted + '" stroke-width="3" fill="none"/>');

  /* nodes */
  for(const nd of nodes){
    if(nd.leaf){
      const y0 = nd.y - CAP_H / 2;
      if(nd.n.t === 'var'){
        const isTop = top && nd.n.name === top.name;
        s.push('<rect data-node="var" data-name="' + esc(nd.n.name) + '" x="' + PAD + '" y="' + f1(y0) +
          '" width="' + f1(capW) + '" height="' + CAP_H + '" rx="' + (CAP_H / 2) + '" fill="' +
          (isTop ? tint(c.accent) : c.card) + '" stroke="' + (isTop ? c.accent : c.border) + '"/>');
        s.push(txt(PAD + 13, nd.y - 3, nd.n.name, 12, c.ink, {weight: 600, mono: true}));
        s.push(txt(PAD + 13, nd.y + 12, rangeText(ranges[nd.n.name]), 11, c.muted));
      } else {
        s.push('<rect data-node="num" x="' + PAD + '" y="' + f1(nd.y - 12) + '" width="' + f1(capW) +
          '" height="24" rx="6" fill="none" stroke="' + c.border + '" stroke-dasharray="3 3"/>');
        s.push(txt(PAD + 13, nd.y + 4, fmt(nd.n.v), 12, c.muted, {mono: true}));
      }
    } else {
      const x = cx(nd);
      s.push('<circle data-node="op" cx="' + f1(x) + '" cy="' + f1(nd.y) + '" r="' + OP_R +
        '" fill="' + c.card + '" stroke="' + c.border + '" stroke-width="1.5"/>');
      s.push(txt(x, nd.y + 5, OP[nd.n.t === 'neg' ? 'neg' : nd.n.op], 14, c.ink,
        {weight: 600, anchor: 'middle'}));
    }
  }

  /* outcome card */
  const oy = Math.max(HEAD_H + OUT_H / 2, Math.min(root.y, H - PAD - OUT_H / 2));
  const ox = rootCx + 30;
  s.push('<rect data-node="out" x="' + f1(ox) + '" y="' + f1(oy - OUT_H / 2) + '" width="' + OUT_W +
    '" height="' + OUT_H + '" rx="10" fill="' + tint(c.accent) + '" stroke="' + c.accent + '"/>');
  s.push(txt(ox + 16, oy - OUT_H / 2 + 22, 'THE ANSWER', 9.5, c.muted, {weight: 600, tracking: 1}));
  s.push(txt(ox + 16, oy - OUT_H / 2 + 46, fmt(p50), 21, c.ink, {weight: 700}));
  s.push(txt(ox + 16, oy - OUT_H / 2 + 64, 'P10 ' + fmt(p10) + '  ·  P90 ' + fmt(p90), 11.5, c.ink));
  s.push(txt(ox + 16, oy - OUT_H / 2 + 82, 'spread ' + fullLabel +
    (isFinite(fullRatio) ? ' (P90 ÷ P10)' : ''), 11, c.muted));

  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H +
    '" viewBox="0 0 ' + W + ' ' + H + '" font-family="' + SANS + '">' +
    '<rect width="' + W + '" height="' + H + '" fill="' + c.card + '"/>' + s.join('') + '</svg>';
}

function rangeText(r){
  return r ? fmt(r[0]) + ' – ' + fmt(r[1]) : '';
}

function txt(x, y, str, size, fill, {weight, tracking, anchor, mono} = {}){
  return '<text x="' + f1(x) + '" y="' + f1(y) + '" font-size="' + size + '"' +
    (weight ? ' font-weight="' + weight + '"' : '') +
    (tracking ? ' letter-spacing="' + tracking + '"' : '') +
    (anchor ? ' text-anchor="' + anchor + '"' : '') +
    (mono ? ' font-family="' + MONO + '"' : '') +
    ' fill="' + fill + '">' + esc(str) + '</text>';
}
