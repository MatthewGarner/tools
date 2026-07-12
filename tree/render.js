/* (model, results, ctx) → SVG string. ctx = {colors, measure, slide?, dark?}. No DOM. */
import {PALETTES, scheme, fmt} from '../assets/series.js';
import {esc, tint, wrapText, editTarget, btnAttrs} from '../assets/svg.js';

const F = {
  body: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  serif: 'Charter, Georgia, "Times New Roman", serif',
};

export const TOKENS = {
  pad: 26, rowPitch: 68, colW: 214, headerH: 56, headerHNoTitle: 20,
  verdictH: 64, nodeR: 7, squareHalf: 7, tickH: 12,
  labelSize: 12, subSize: 10, evSize: 11.5, statSize: 10,
  edgeW: 1.25, policyW: 2.5, fadeOp: 0.42,
  pillSize: 8.5, pillH: 15, pillPadX: 6, pillTracking: 0.6,
  flipSize: 11, flipRowH: 16, flipHeadSize: 10, flipHeadTracking: 1.2,
  titleSize: 22, titleY: 36, dateSize: 11,
  slideScale: 1.35, bottomPad: 16, annotW: 150,
};



/* shared with treeVerdict below: the muted evidence line under the recommended option */
function evidenceFor(rec, st, results, money){
  let evidence = 'EV ' + money(st.mean) + ' · P10 ' + money(st.p10) + ' · P90 ' + money(st.p90);
  const h = (results.headToHead || []).find(x => x.a === rec.label || x.b === rec.label);
  if(h){
    const share = h.a === rec.label ? h.aShare : 1 - h.aShare;
    const other = h.a === rec.label ? h.b : h.a;
    evidence += ' · beats ' + other + ' in ' + Math.round(share * 100) + '% of simulations';
  }
  return evidence;
}

/* plain-text mirror of the SVG's verdict block — the HTML readout app.js
   shows next to the diagram (sub-task: readable-result fix). Pure; same
   inputs render() itself uses for the verdict band. */
export function treeVerdict(model, results){
  if(!model.root || model.root.kind !== 'decision') return '';
  const rec = results.policy.get(model.root);
  const st = results.stats.get(model.root);
  if(!rec || !st) return '';
  const cur = model.currency || '£';
  const money = v => (v < 0 ? '−' : '') + cur + fmt(Math.abs(v));
  return 'Recommended: ' + rec.label + ' — ' + evidenceFor(rec, st, results, money);
}

export function render(model, results, ctx){
  const {measure, slide = false, dark = false, edit = false} = ctx;
  const paletteHex = model.accent ||
    (PALETTES[model.palette] ? PALETTES[model.palette][dark ? 'dark' : 'light'] : null);
  const C = paletteHex ? {...ctx.colors, ...scheme(paletteHex, dark)} : ctx.colors;
  const T = TOKENS;
  const S = slide ? T.slideScale : 1;
  const cur = model.currency || '£';
  const money = v => (v < 0 ? '−' : '') + cur + fmt(Math.abs(v));
  const rangeStr = r => r.lo === r.hi ? money(r.lo) : money(r.lo) + ' … ' + money(r.hi);
  const pStr = p => p === 'rest' ? 'rest' :
    (p.lo === p.hi ? 'p=' + p.lo : 'p=' + p.lo + '–' + p.hi);

  /* ---- layout: leaves get rows, parents centre on children ---- */
  let nextRow = 0, maxDepth = 0;
  (function place(node, depth){
    maxDepth = Math.max(maxDepth, depth);
    if(node.children.length === 0){
      node._row = nextRow++;
    } else {
      node.children.forEach(c => place(c, depth + 1));
      node._row = node.children.reduce((a, c) => a + c._row, 0) / node.children.length;
    }
    node._depth = depth;
  })(model.root, 0);

  const headerH = (model.title ? T.headerH : T.headerHNoTitle)*S;
  const verdictH = (model.root.kind === 'decision' ? T.verdictH : 0)*S;
  const treeTop = headerH + verdictH;
  const flips = results.flips || [];
  const flipsH = flips.length ? (14 + flips.length * T.flipRowH)*S : 0;
  const W = Math.round(T.pad*2*S + (maxDepth + 1) * T.colW*S + T.annotW*S);
  const H = Math.round(treeTop + (nextRow - 1 || 1) * T.rowPitch*S + 40*S + flipsH + T.bottomPad*S);
  const nx = node => T.pad*S + node._depth * T.colW*S + 40*S;
  const ny = node => treeTop + 20*S + node._row * T.rowPitch*S;

  const s = [];
  s.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H +
    '" viewBox="0 0 ' + W + ' ' + H + '" font-family=\'' + F.body + '\'>');
  s.push('<rect width="' + W + '" height="' + H + '" fill="' + C.bg + '"/>');

  /* title + date */
  if(model.title){
    s.push('<text x="' + T.pad*S + '" y="' + T.titleY*S + '" font-family=\'' + F.serif +
      '\' font-size="' + T.titleSize*S + '" font-weight="700" fill="' + C.ink + '">' + esc(model.title) + '</text>');
  }
  s.push('<text x="' + (W - T.pad*S) + '" y="' + (model.title ? T.titleY : 14)*S +
    '" text-anchor="end" font-size="' + T.dateSize*S + '" fill="' + C.muted + '">' +
    new Date().toISOString().slice(0, 10) + '</text>');

  /* capsule pill, shared visual language with the roadmap tool */
  const capsule = (px, py, label, col, inkCol = col) => {   // inkCol: contrast-boosted TEXT colour; fill still uses col
    const font = '600 ' + T.pillSize*S + 'px ' + F.body;
    const tw = measure(label, font) + label.length * T.pillTracking;
    const pw = tw + T.pillPadX*2*S, ph = T.pillH*S;
    return {
      svg: '<rect x="' + px + '" y="' + py + '" width="' + pw + '" height="' + ph +
        '" rx="' + ph/2 + '" fill="' + tint(col) + '"' +
        (tint(col) === 'none' ? ' stroke="' + col + '" stroke-width="1"' : '') + '/>' +
        '<text x="' + (px + T.pillPadX*S) + '" y="' + (py + ph - 4.5*S) + '" font-size="' + T.pillSize*S +
        '" font-weight="600" letter-spacing="' + T.pillTracking + '" fill="' + inkCol + '">' + esc(label) + '</text>',
      w: pw,
    };
  };

  /* verdict block: hero recommendation, muted evidence line */
  if(model.root.kind === 'decision'){
    const rec = results.policy.get(model.root);
    const st = results.stats.get(model.root);
    const vy = headerH + 14*S;
    const p = capsule(T.pad*S, vy - T.pillH*S + 3*S, 'RECOMMENDED', C.accent, C.accentInk);
    s.push(p.svg);
    s.push('<text x="' + (T.pad*S + p.w + 10*S) + '" y="' + vy + '" font-size="' + 15*S +
      '" font-weight="700" fill="' + C.ink + '">' + esc(rec.label) + '</text>');
    const evidence = evidenceFor(rec, st, results, money);
    s.push('<text x="' + T.pad*S + '" y="' + (vy + 19*S) + '" font-size="' + 11.5*S +
      '" fill="' + C.muted + '">' + esc(evidence) + '</text>');
  }

  /* edges + nodes, policy-aware opacity applied per subtree */
  function drawEdge(a, b, onPolicy){
    const x1 = nx(a) + T.squareHalf*S + 2, y1 = ny(a);
    const x2 = nx(b) - T.squareHalf*S - 2, y2 = ny(b);
    const mx = (x1 + x2) / 2;
    s.push('<path d="M' + x1 + ' ' + y1 + ' C' + mx + ' ' + y1 + ' ' + mx + ' ' + y2 +
      ' ' + x2 + ' ' + y2 + '" fill="none" stroke="' + (onPolicy ? C.accent : C.border) +
      '" stroke-width="' + (onPolicy ? T.policyW : T.edgeW)*S + '"/>');
    /* edge labels sit above the child end; components are edit-in-place targets */
    s.push('<text x="' + (x2 - 4) + '" y="' + (y2 - 17*S) + '" text-anchor="end" font-size="' + T.labelSize*S +
      '" font-weight="600" fill="' + C.ink + '"><tspan data-edit="label" data-line="' + b.srcLine +
      '" data-raw="' + esc(b.label) + '"' + btnAttrs('Edit label: ' + b.label) +
      '>' + esc(b.label) + '</tspan></text>');
    const parts = [];
    if(b.p !== null && b.p !== undefined && a.kind === 'chance'){
      parts.push('<tspan data-edit="prob" data-line="' + b.srcLine + '" data-raw="' +
        esc(b.pRaw || (b.p === 'rest' ? 'rest' : '')) + '"' + btnAttrs('Edit probability: ' + b.label) +
        '>' + esc(pStr(b.p)) + '</tspan>');
    }
    if(b.value && !(b.value.lo === 0 && b.value.hi === 0 && b.kind !== 'leaf')){
      parts.push('<tspan data-edit="value" data-line="' + b.srcLine + '" data-raw="' +
        esc(b.valueRaw || '') + '"' + btnAttrs('Edit payoff: ' + b.label) +
        '>' + esc(rangeStr(b.value)) + '</tspan>');
    }
    if(parts.length){
      s.push('<text x="' + (x2 - 4) + '" y="' + (y2 - 6*S) + '" text-anchor="end" font-size="' + T.subSize*S +
        '" fill="' + C.muted + '">' + parts.join('<tspan> · </tspan>') + '</text>');
    }
  }
  function drawNode(node, onPolicy){
    const x = nx(node), y = ny(node);
    const col = onPolicy ? C.accent : C.muted;
    if(node.kind === 'decision'){
      s.push('<rect x="' + (x - T.squareHalf*S) + '" y="' + (y - T.squareHalf*S) +
        '" width="' + T.squareHalf*2*S + '" height="' + T.squareHalf*2*S +
        '" rx="2" fill="' + C.card + '" stroke="' + col + '" stroke-width="1.5"/>');
    } else if(node.kind === 'chance'){
      s.push('<circle cx="' + x + '" cy="' + y + '" r="' + T.nodeR*S +
        '" fill="' + C.card + '" stroke="' + col + '" stroke-width="1.5"/>');
    } else {
      s.push('<line x1="' + x + '" y1="' + (y - T.tickH*S/2) + '" x2="' + x + '" y2="' + (y + T.tickH*S/2) +
        '" stroke="' + col + '" stroke-width="1.5"/>');
    }
    /* internal-node label above; EV annotation below/right */
    if(node.children.length && node !== model.root){
      /* label drawn by the incoming edge; nothing extra */
    }
    const st = results.stats.get(node);
    if(st){
      const tx = node.kind === 'leaf' ? x + 10*S : x;
      const anchor = node.kind === 'leaf' ? 'start' : 'middle';
      s.push('<text x="' + tx + '" y="' + (y + (node.kind === 'leaf' ? 4 : 22)*S) + '" text-anchor="' + anchor +
        '" font-size="' + T.evSize*S + '" font-weight="600" fill="' + (onPolicy ? C.ink : C.muted) + '">' +
        esc(money(st.mean)) + '</text>');
      if(st.p10 !== st.p90){
        s.push('<text x="' + tx + '" y="' + (y + (node.kind === 'leaf' ? 16 : 34)*S) + '" text-anchor="' + anchor +
          '" font-size="' + T.statSize*S + '" fill="' + C.muted + '">' +
          esc(money(st.p10) + ' … ' + money(st.p90)) + '</text>');
      }
    }
    /* edit-gated: the marker becomes a card-menu target (rename / edit value
       or probability / add child / remove branch) — supersedes the old
       node-<kind> add/remove-only popover. Invisible >=44px hit rect
       (fill=C.bg, opacity 0), painted last, so a phone-width tap lands
       cleanly; same data-line as the label/prob/value tspans drawEdge emits
       for this node (b.srcLine) — the data-line router in attachEditInPlace
       reaches them with no DOM regroup. The box is biased DOWN from the
       marker (top at y-2*S, not y-22*S): drawEdge places this node's own
       label/value/prob text just above-left of the marker (down to ~y-4*S),
       and a symmetric box swallowed those taps for short strings (a bare "0",
       a 3-char label) — the direct field editor never opened. Biasing below
       the marker clears the whole text band while keeping the tap on/under
       the marker; every marker shifts by the same vector, so the WIDENED
       hit-vs-hit non-overlap (row/column spacing >=44*S) is unchanged. */
    if(edit){
      s.push(editTarget('', {x: x - 22*S, y: y - 2*S, w: 44*S, h: 44*S, bg: C.bg},
        {kind: 'cardmenu-' + node.kind, line: node.implicit ? -1 : node.srcLine, raw: '',
          label: 'More options: ' + (node.label || 'node'), hit: true, extra: 'data-menu=""'}));
    }
  }
  function walk(node, onPolicy){
    for(const c of node.children){
      const childOnPolicy = onPolicy &&
        (node.kind !== 'decision' || results.policy.get(node) === c);
      if(!childOnPolicy) s.push('<g opacity="' + T.fadeOp + '">');
      drawEdge(node, c, childOnPolicy);
      walk(c, childOnPolicy);
      drawNode(c, childOnPolicy);
      if(!childOnPolicy) s.push('</g>');
    }
  }
  walk(model.root, true);
  drawNode(model.root, true);
  if(model.root.label && model.root.children.length){
    s.push('<text x="' + nx(model.root) + '" y="' + (ny(model.root) - 14*S) + '" text-anchor="middle" font-size="' +
      T.labelSize*S + '" font-weight="600" fill="' + C.ink + '">' + esc(model.root.label) + '</text>');
  }

  /* flip conditions */
  if(flips.length){
    let fy = H - flipsH - T.bottomPad*S + 12*S;
    s.push('<text x="' + T.pad*S + '" y="' + fy + '" font-size="' + T.flipHeadSize*S +
      '" font-weight="600" letter-spacing="' + T.flipHeadTracking + '" fill="' + C.muted + '">WHAT WOULD FLIP THIS</text>');
    for(const f of flips){
      fy += T.flipRowH*S;
      const msg = f.kind === 'prob'
        ? 'flips if p(' + f.label + ') ' + f.direction + ' ' + f.threshold.toFixed(2)
        : f.label + ' matters: the recommendation changes within its ' + rangeStr({lo: f.lo, hi: f.hi}) + ' range';
      s.push('<text x="' + (T.pad*S + 8*S) + '" y="' + fy + '" font-size="' + T.flipSize*S +
        '" fill="' + C.muted + '">– ' + esc(msg) + '</text>');
    }
  }
  s.push('</svg>');
  /* scrub layout scratch */
  (function clean(n){ delete n._row; delete n._depth; n.children.forEach(clean); })(model.root);
  return s.join('');
}
