/* Pure decision-tree layout. No DOM and no model mutation.
   The renderer adds theme and edit chrome after these rectangles are fixed. */
import {wrapText} from '../assets/svg.js';

export const TREE_GEOM = {
  pad: 32,
  cardW: 216,
  cardPad: 14,
  colGap: 58,
  rowGap: 20,
  labelSize: 13,
  labelLeading: 17,
  detailSize: 10.5,
  detailLeading: 14,
  registerW: 1180,
  registerGap: 34,
  registerHeadH: 46,
  registerPad: 18,
  registerRowGap: 12,
  narrowPad: 18,
  narrowGap: 12,
};

const font = size => '600 ' + size + 'px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';

function allNodes(root){
  const out = [];
  (function walk(node, depth, path){
    const next = [...path, node.label];
    out.push({node, depth, path: next});
    node.children.forEach(child => walk(child, depth + 1, next));
  })(root, 0, []);
  return out;
}

function leafCount(node){
  return node.children.length ? node.children.reduce((n, c) => n + leafCount(c), 0) : 1;
}

function maxDepth(node, depth = 0){
  return node.children.length
    ? Math.max(...node.children.map(c => maxDepth(c, depth + 1)))
    : depth;
}

function policySelection(root, results){
  const chosen = new Set([root]);
  (function walk(node){
    if(!node.children.length) return;
    if(node.kind === 'decision'){
      const pick = results.policy.get(node) || node.children[0];
      if(pick){ chosen.add(pick); walk(pick); }
      return;
    }
    /* A chance is not a choice: every authored outcome remains visible. */
    for(const child of node.children){ chosen.add(child); walk(child); }
  })(root);
  return chosen;
}

function onPolicySet(root, results){
  const set = new Set([root]);
  (function walk(node, active){
    for(const child of node.children){
      const childActive = active && (node.kind !== 'decision' || results.policy.get(node) === child);
      if(childActive) set.add(child);
      walk(child, childActive);
    }
  })(root, true);
  return set;
}

function rawProbability(node){
  if(node.p === null || node.p === undefined) return '—';
  if(node.p === 'rest') return 'rest';
  return node.p.lo === node.p.hi ? String(node.p.lo) : node.p.lo + '–' + node.p.hi;
}

function rawRange(node){
  if(!node.value) return '—';
  return node.value.lo === node.value.hi ? String(node.value.lo) : node.value.lo + ' … ' + node.value.hi;
}

function cardFor(node, measure, {maxLines = 2} = {}){
  const g = TREE_GEOM;
  const full = wrapText(node.label, font(g.labelSize), g.cardW - g.cardPad * 2, measure);
  const clipped = full.length > maxLines;
  const lines = full.slice(0, maxLines);
  if(clipped){
    const last = lines.length - 1;
    let s = lines[last];
    while(s.length > 1 && measure(s + '…', font(g.labelSize)) > g.cardW - g.cardPad * 2) s = s.slice(0, -1);
    lines[last] = s.replace(/[\s,.;:]+$/, '') + '…';
  }
  const detailRows = (node.p !== null && node.p !== undefined ? 1 : 0) + (node.value ? 1 : 0) + 1;
  return {
    lines,
    clipped,
    fullLines: full,
    w: g.cardW,
    h: g.cardPad * 2 + lines.length * g.labelLeading + detailRows * g.detailLeading + 2,
  };
}

function layoutBranch(root, included, measure){
  const g = TREE_GEOM;
  const items = [];
  const edges = [];
  let deepest = 0;

  function place(node, depth, top){
    deepest = Math.max(deepest, depth);
    const card = cardFor(node, measure);
    const children = node.children.filter(c => included.has(c));
    if(!children.length){
      const item = {node, depth, x: depth * (g.cardW + g.colGap), y: top, ...card};
      items.push(item);
      return {h: card.h, centre: top + card.h / 2, item};
    }
    const childBoxes = [];
    let cursor = top;
    for(const child of children){
      const box = place(child, depth + 1, cursor);
      childBoxes.push(box);
      cursor += box.h + g.rowGap;
    }
    const childH = cursor - top - g.rowGap;
    const h = Math.max(card.h, childH);
    const centre = top + h / 2;
    const item = {node, depth, x: depth * (g.cardW + g.colGap), y: centre - card.h / 2, ...card};
    items.push(item);
    for(const childBox of childBoxes) edges.push({from: item, to: childBox.item});
    return {h, centre, item};
  }

  const rootBox = place(root, 0, 0);
  items.sort((a, b) => a.depth - b.depth || a.y - b.y || a.node.srcLine - b.node.srcLine);
  return {
    items,
    edges,
    width: (deepest + 1) * g.cardW + deepest * g.colGap,
    height: rootBox.h,
    deepest,
  };
}

function registerRows(entries, measure, width){
  const g = TREE_GEOM;
  const pathW = Math.max(360, width * .46);
  let y = g.registerHeadH;
  return entries.map((entry, index) => {
    const path = entry.path.join('  ›  ');
    const lines = wrapText(path, font(11.5), pathW - g.registerPad * 2, measure);
    const h = Math.max(48, 21 + lines.length * 15);
    const row = {...entry, id: 'T' + String(index + 1).padStart(2, '0'), path, pathLines: lines, y, h};
    y += h + g.registerRowGap;
    return row;
  });
}

function narrowRows(entries, measure, width, policy){
  const g = TREE_GEOM;
  let y = 0;
  return entries.map((entry, index) => {
    const indent = Math.min(entry.depth, 3) * 16;
    const rowW = width - indent;
    const lines = wrapText(entry.node.label, font(14), rowW - 32, measure);
    const h = 54 + lines.length * 19 +
      ((entry.node.p !== null && entry.node.p !== undefined) ? 16 : 0) + (entry.node.value ? 16 : 0);
    const row = {...entry, id: 'T' + String(index + 1).padStart(2, '0'), x: indent, y, w: rowW, h,
      labelLines: lines, onPolicy: policy.has(entry.node)};
    y += h + g.narrowGap;
    return row;
  });
}

/* Returns renderer-neutral rectangles and deterministic composition metadata.
   intent: live-wide | native | live-narrow | presentation. */
export function layoutTree(model, results, {measure, intent = 'native', width = 480} = {}){
  if(!model || !model.root) return null;
  const entries = allNodes(model.root);
  const policy = onPolicySet(model.root, results);
  const selected = policySelection(model.root, results);
  const depth = maxDepth(model.root);
  const leaves = leafCount(model.root);
  const hasLong = entries.some(({node}) => cardFor(node, measure).clipped);
  const dense = depth > 3 || leaves > 8 || hasLong;

  if(intent === 'live-narrow'){
    const innerW = Math.max(284, Math.min(480, width || 480) - TREE_GEOM.narrowPad * 2);
    const rows = narrowRows(entries, measure, innerW, policy);
    return {
      intent, mode: 'memo', entries, rows, policy,
      width: innerW + TREE_GEOM.narrowPad * 2,
      height: rows.length ? rows[rows.length - 1].y + rows[rows.length - 1].h : 0,
      total: entries.length, shown: entries.length, continuation: 0,
    };
  }

  const included = intent === 'presentation' || dense ? selected : new Set(entries.map(e => e.node));
  const branch = layoutBranch(model.root, included, measure);
  const shownSourceLines = new Set(branch.items.filter(i => !i.node.implicit).map(i => i.node.srcLine));
  const continuation = entries.filter(e => !e.node.implicit && !shownSourceLines.has(e.node.srcLine)).length;
  const registerNeeded = dense && intent !== 'presentation';
  const widthOut = Math.max(branch.width, registerNeeded ? TREE_GEOM.registerW : 0);
  const rows = registerNeeded ? registerRows(entries.filter(e => !e.node.implicit), measure, widthOut) : [];
  const registerHeight = rows.length ? rows[rows.length - 1].y + rows[rows.length - 1].h : 0;

  return {
    intent,
    mode: intent === 'presentation' ? 'presentation' : (registerNeeded ? 'continuation' : 'hero'),
    entries,
    branch,
    rows,
    policy,
    selected,
    width: widthOut,
    height: branch.height + (registerNeeded ? TREE_GEOM.registerGap + registerHeight : 0),
    total: entries.filter(e => !e.node.implicit).length,
    shown: shownSourceLines.size,
    continuation,
    depth,
    leaves,
    dense,
    rawProbability,
    rawRange,
  };
}

