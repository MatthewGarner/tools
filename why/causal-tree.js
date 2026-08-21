/* Causal Tree: a rooted, measured continuation of the production OST geometry. */
import {esc, btnAttrs} from '../assets/svg.js';
import {causalColours, wrapCausal} from './causal-shared.js';

const STATE = {
  candidate:'CANDIDATE', testing:'TESTING', delivering:'DELIVERING', shipped:'SHIPPED', parked:'PARKED',
  untested:'UNTESTED', holds:'HOLDS', broken:'BROKEN',
};
const PAD = 44, STEP = 238, GAP = 14;
const measureFallback = text => String(text || '').length * 7;
const state = node => (node.kind === 'solution' || node.kind === 'assumption') ? (STATE[node.status] || 'UNTESTED') : '';
const broken = node => node.kind === 'assumption' && node.status === 'broken';
const kind = node => ['outcome', 'opportunity', 'solution', 'assumption'].includes(node.kind) ? node.kind : 'opportunity';
const type = entry => entry.kind === 'outcome' ? {size:18, leading:22, weight:700, width:220} : entry.kind === 'opportunity' ? {size:15, leading:19, weight:650, width:208} : entry.kind === 'solution' ? {size:14, leading:18, weight:650, width:196} : {size:12, leading:15, weight:650, width:174};
const nodeWarning = (model, node) => ((model.warnings || []).find(w => w.startsWith('line ' + (node.srcLine + 1) + ':')) || '').replace(/^line \d+:\s*/, '');
const nodeTrail = entry => entry.trail.slice(0, -1).map(node => node.label).join(' › ');
const semanticName = entry => entry.kind + ' · ' + entry.trail.map(node => node.label).join(' › ') + (state(entry.node) ? ' · ' + state(entry.node) : '');
const menu = entry => ' data-edit="cardmenu-' + entry.kind + '" data-line="' + entry.node.srcLine + '" data-raw="" data-menu=""' + btnAttrs('More options: ' + semanticName(entry));
const rename = entry => ' data-edit="label" data-line="' + entry.node.srcLine + '" data-raw="' + esc(entry.node.label) + '"' + btnAttrs('Rename: ' + semanticName(entry));
const stateEdit = entry => ' data-edit="' + (entry.kind === 'solution' ? 'status' : 'astatus') + '" data-line="' + entry.node.srcLine + '" data-raw="' + esc(entry.node.status) + '"' + btnAttrs('Set ' + entry.kind + ' state: ' + semanticName(entry));
const badge = (entry, diff) => diff?.badge?.(entry.node)?.label?.toUpperCase() || '';

function makeEntry(node, parent, outcome, trail, depth){
  const entry = {node, parent, outcome:outcome || node, trail:[...trail, node], depth, kind:kind(node), children:[], assumptions:[]};
  for(const child of node.children || []){
    /* A normal terminal assumption is evidence inside its solution. If source
       nesting continues beneath it, preserve that malformed structure as real
       tree cards; a ruled band cannot silently swallow its descendants. */
    if(node.kind === 'solution' && child.kind === 'assumption' && !(child.children || []).length) entry.assumptions.push(makeEntry(child, entry, outcome || node, entry.trail, depth + 1));
    else entry.children.push(makeEntry(child, entry, outcome || node, entry.trail, depth + 1));
  }
  return entry;
}
function roots(model){ return (model.outcomes || []).map(node => makeEntry(node, null, node, [], 0)); }

function measureEntry(entry, model, diff, measure, widthOverride = null){
  entry.w = widthOverride || type(entry).width;
  const width = entry.w;
  const spec = type(entry);
  const stateReserve = state(entry.node) ? 94 : 20;
  entry.lines = wrapCausal(entry.node.label, spec.weight + ' ' + spec.size + 'px sans-serif', width - stateReserve, measure);
  entry.note = state(entry.node); entry.badge = badge(entry, diff);
  entry.warning = nodeWarning(model, entry.node);
  entry.warningLines = entry.warning ? wrapCausal('SOURCE WARNING · ' + entry.warning, '400 10px sans-serif', width - 20, measure) : [];
  entry.menuH = Math.max(44, 12 + entry.lines.length * spec.leading + (entry.badge ? 13 : 0));
  entry.assumptions.forEach(assumption => {
    assumption.w = width - 20;
    assumption.lines = wrapCausal(assumption.node.label, '600 11px sans-serif', assumption.w - 72, measure);
    assumption.note = state(assumption.node); assumption.badge = badge(assumption, diff);
    assumption.warning = nodeWarning(model, assumption.node);
    assumption.warningLines = assumption.warning ? wrapCausal('SOURCE WARNING · ' + assumption.warning, '400 10px sans-serif', assumption.w - 12, measure) : [];
    assumption.h = Math.max(44, 13 + assumption.lines.length * 13 + (assumption.badge ? 12 : 0) + assumption.warningLines.length * 11 + 8);
  });
  const assumptions = entry.assumptions.length ? 19 + entry.assumptions.reduce((sum, assumption) => sum + assumption.h, 0) + 8 : 0;
  entry.h = entry.menuH + assumptions + entry.warningLines.length * 12 + 10;
}

/* The layout model is immutable: connectors only ever cross their reserved gutter,
   while a deeply or malformed nested source receives new physical tree depth. */
export function layoutCausalTree(model, ctx, diff = null){
  const measure = ctx.measure || measureFallback, tree = roots(model), cards = [], links = [];
  let cursor = 0, maxDepth = 0;
  const prep = entry => { maxDepth = Math.max(maxDepth, entry.depth); measureEntry(entry, model, diff, measure); entry.children.forEach(prep); };
  const place = entry => {
    if(entry.children.length){
      entry.children.forEach(place);
      const first = entry.children[0], last = entry.children.at(-1);
      entry.y = (first.y + last.y + last.h) / 2 - entry.h / 2;
    } else { entry.y = cursor; cursor += entry.h + GAP; }
    entry.x = PAD + entry.depth * STEP;
    cards.push(entry);
    entry.children.forEach(child => links.push({parent:entry, child}));
  };
  tree.forEach(root => { prep(root); place(root); cursor += 12; });
  /* Median placement preserves the production tree silhouette, but a tall
     non-leaf can overlap its next sibling at the same physical depth. Move the
     later branch as a unit so every card keeps a measured vertical interval and
     every connector still terminates on its true parent/child boundary. */
  const shiftBranch = (entry, delta) => {
    entry.y += delta;
    entry.children.forEach(child => shiftBranch(child, delta));
  };
  for(let depth = 0; depth <= maxDepth; depth++){
    const level = cards.filter(entry => entry.depth === depth).sort((a, b) => a.y - b.y || a.node.srcLine - b.node.srcLine);
    let bottom = -Infinity;
    for(const entry of level){
      const delta = Math.max(0, bottom + GAP - entry.y);
      if(delta) shiftBranch(entry, delta);
      bottom = Math.max(bottom, entry.y + entry.h);
    }
  }
  /* A tall parent is median-centred on its children; it can therefore start
     above the first leaf. Shift the immutable layout, never the source model,
     so no root title is clipped by the native SVG's viewBox. */
  const topInset = Math.max(0, -Math.min(0, ...cards.map(entry => entry.y)));
  if(topInset) cards.forEach(entry => { entry.y += topInset; });
  const last = cards.filter(entry => entry.depth === maxDepth).reduce((max, entry) => Math.max(max, entry.x + entry.w), PAD);
  const bottom = Math.max(cursor + topInset, ...cards.map(entry => entry.y + entry.h + GAP));
  return {tree, cards, links, width:last + PAD, height:bottom};
}

function attrs(entry){
  return ' data-causal-node="' + entry.node.srcLine + '" data-line="' + entry.node.srcLine + '" data-causal-card="" data-causal-stage="' + entry.kind + '" data-causal-context="' + esc(nodeTrail(entry)) + '" data-causal-x="' + entry.x + '" data-causal-y="' + entry.y + '" data-causal-w="' + entry.w + '" data-causal-h="' + entry.h + '"' + (entry.parent ? ' data-causal-parent="' + entry.parent.node.srcLine + '"' : '') + (broken(entry.node) ? ' data-causal-claim="broken"' : '');
}
function drawAssumptions(out, entry, c, edit, y){
  if(!entry.assumptions.length) return y;
  out.push('<line x1="' + (entry.x + 10) + '" y1="' + y + '" x2="' + (entry.x + entry.w - 10) + '" y2="' + y + '" stroke="' + c.border + '"/><text data-causal-assumption-band="' + entry.node.srcLine + '" x="' + (entry.x + 10) + '" y="' + (y + 13) + '" font-size="10" font-weight="700" letter-spacing="1" fill="' + c.muted + '">ASSUMPTION CLAIMS</text>');
  y += 19;
  for(const assumption of entry.assumptions){
    const menuW = assumption.w - 72, stateX = entry.x + 10 + menuW + 8, alert = broken(assumption.node);
    out.push('<g data-causal-node="' + assumption.node.srcLine + '" data-line="' + assumption.node.srcLine + '" data-causal-stage="assumption" data-causal-context="' + esc(nodeTrail(assumption)) + '" data-causal-parent="' + entry.node.srcLine + '"' + (alert ? ' data-causal-claim="broken"' : '') + '>');
    if(edit) out.push('<rect' + menu(assumption) + ' data-hit="" x="' + (entry.x + 10) + '" y="' + y + '" width="' + menuW + '" height="' + assumption.h + '" fill="transparent" pointer-events="all"/><rect' + stateEdit(assumption) + ' data-hit="" x="' + stateX + '" y="' + y + '" width="64" height="44" fill="transparent" pointer-events="all"/>');
    let ay = y + 14;
    assumption.lines.forEach((line, index) => { out.push('<text' + (edit && index === 0 ? rename(assumption) : ' pointer-events="none"') + ' x="' + (entry.x + 10) + '" y="' + ay + '" font-size="11" font-weight="600" fill="' + c.ink + '">' + esc(line) + '</text>'); ay += 13; });
    out.push('<text data-causal-state="' + esc(assumption.node.status) + '" pointer-events="none" x="' + (stateX + 64) + '" y="' + (y + 27) + '" text-anchor="end" font-size="10" font-weight="700" letter-spacing=".45" fill="' + (alert ? c.err : c.muted) + '">' + esc(assumption.note) + '</text>');
    if(assumption.badge) out.push('<text data-causal-diff="' + esc(assumption.badge.toLowerCase()) + '" pointer-events="none" x="' + (entry.x + 10) + '" y="' + (y + assumption.h - 7) + '" font-size="10" font-weight="700" letter-spacing=".7" fill="' + c.muted + '">' + esc(assumption.badge) + '</text>');
    assumption.warningLines.forEach((line, index) => out.push('<text data-causal-diagnostic-line="' + assumption.node.srcLine + '" pointer-events="none" x="' + (entry.x + 10) + '" y="' + (y + assumption.h - assumption.warningLines.length * 11 + index * 11 - 5) + '" font-size="10" fill="' + c.muted + '">' + esc(line) + '</text>'));
    out.push('</g>'); y += assumption.h;
  }
  return y + 8;
}
function drawCard(out, entry, c, edit){
  const spec = type(entry), alert = broken(entry.node), border = entry.kind === 'outcome' ? c.ink : c.border;
  const menuW = entry.note ? entry.w - 88 : entry.w;
  out.push('<g' + attrs(entry) + '><rect x="' + entry.x + '" y="' + entry.y + '" width="' + entry.w + '" height="' + entry.h + '" fill="' + c.card + '" stroke="' + border + '" stroke-width="' + (entry.kind === 'outcome' ? 2 : 1) + '"/>');
  if(edit) out.push('<rect' + menu(entry) + ' data-hit="" x="' + entry.x + '" y="' + entry.y + '" width="' + menuW + '" height="' + entry.menuH + '" fill="transparent" pointer-events="all"/>');
  if(entry.kind === 'outcome') out.push('<text x="' + (entry.x + 10) + '" y="' + (entry.y + 14) + '" font-size="10" font-weight="700" letter-spacing="1" fill="' + c.muted + '">OUTCOME</text>');
  let ty = entry.y + (entry.kind === 'outcome' ? 18 : 10) + spec.size;
  entry.lines.forEach((line, index) => { out.push('<text' + (edit && index === 0 ? rename(entry) : ' pointer-events="none"') + ' x="' + (entry.x + 10) + '" y="' + ty + '" font-size="' + spec.size + '" font-weight="' + spec.weight + '" fill="' + c.ink + '">' + esc(line) + '</text>'); ty += spec.leading; });
  if(entry.badge) out.push('<text data-causal-diff="' + esc(entry.badge.toLowerCase()) + '" pointer-events="none" x="' + (entry.x + 10) + '" y="' + (entry.y + entry.menuH - 7) + '" font-size="10" font-weight="700" letter-spacing=".7" fill="' + c.muted + '">' + esc(entry.badge) + '</text>');
  let y = entry.y + entry.menuH;
  if(entry.note){
    const stateX = entry.x + menuW;
    if(edit) out.push('<rect' + stateEdit(entry) + ' data-hit="" x="' + stateX + '" y="' + entry.y + '" width="88" height="44" fill="transparent" pointer-events="all"/>');
    out.push('<text data-causal-state="' + esc(entry.node.status) + '" pointer-events="none" x="' + (stateX + 78) + '" y="' + (entry.y + 27) + '" text-anchor="end" font-size="10" font-weight="700" letter-spacing=".45" fill="' + (alert ? c.err : c.muted) + '">' + esc(entry.note) + '</text>');
  }
  y = drawAssumptions(out, entry, c, edit, y);
  entry.warningLines.forEach((line, index) => out.push('<text data-causal-diagnostic-line="' + entry.node.srcLine + '" pointer-events="none" x="' + (entry.x + 10) + '" y="' + (entry.y + entry.h - entry.warningLines.length * 12 + index * 12 - 5) + '" font-size="10" fill="' + c.muted + '">' + esc(line) + '</text>'));
  out.push('</g>');
}
function wide(model, ctx, diff, c){
  const layout = layoutCausalTree(model, ctx, diff), measure = ctx.measure || measureFallback;
  const title = ctx.bare ? [] : wrapCausal(model.title || 'Untitled discovery', '700 27px sans-serif', Math.max(360, layout.width - 150), measure);
  const narrative = !ctx.bare && diff ? wrapCausal(diff.narrative, '600 11px sans-serif', Math.max(360, layout.width - 88), measure) : [];
  const header = ctx.bare ? 16 : 74 + title.length * 31 + narrative.length * 15;
  const dropped = diff?.dropped?.length ? wrapCausal('DROPPED · ' + diff.dropped.join(' · '), '600 10px sans-serif', Math.max(360, layout.width - 88), measure) : [];
  const W = Math.ceil(layout.width), H = Math.ceil(header + layout.height + (dropped.length ? 14 + dropped.length * 14 : 0) + 18);
  const out = ['<svg xmlns="http://www.w3.org/2000/svg" data-causal-tree="why" data-causal-field="why" data-causal-layout="tree" role="' + (ctx.edit ? 'group' : 'img') + '" aria-label="Causal Tree" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"><rect width="' + W + '" height="' + H + '" fill="' + c.bg + '"/>'];
  if(!ctx.bare){ let y = 48; title.forEach(line => { out.push('<text x="44" y="' + y + '" font-size="27" font-weight="700" fill="' + c.ink + '">' + esc(line) + '</text>'); y += 31; }); out.push('<text x="' + (W - 44) + '" y="48" text-anchor="end" font-size="11" letter-spacing="1" fill="' + c.muted + '">' + esc(String(ctx.today || '')) + '</text><text x="44" y="' + (y + 4) + '" font-size="10" font-weight="700" letter-spacing="1.35" fill="' + c.muted + '">CAUSAL TREE · DISCOVERY CLAIMS</text>'); narrative.forEach((line, index) => out.push('<text data-causal-narrative-line="' + index + '" x="44" y="' + (y + 25 + index * 15) + '" font-size="11" font-weight="600" fill="' + c.muted + '">' + esc(line) + '</text>')); }
  layout.links.forEach(({parent, child}) => { const x1 = parent.x + parent.w, y1 = header + parent.y + parent.h / 2, x2 = child.x, y2 = header + child.y + child.h / 2, mid = (x1 + x2) / 2; out.push('<path data-causal-link="' + parent.node.srcLine + ':' + child.node.srcLine + '" d="M' + x1 + ' ' + y1 + ' C' + mid + ' ' + y1 + ' ' + mid + ' ' + y2 + ' ' + x2 + ' ' + y2 + '" fill="none" stroke="' + c.border + '" stroke-width="1.25" aria-hidden="true"/>'); });
  layout.cards.sort((a, b) => a.depth - b.depth || a.y - b.y || a.node.srcLine - b.node.srcLine).forEach(entry => drawCard(out, {...entry, y:entry.y + header}, c, ctx.edit));
  if(dropped.length){ let y = H - 18 - (dropped.length - 1) * 14; dropped.forEach(line => { out.push('<text data-causal-dropped="" x="44" y="' + y + '" font-size="10" font-weight="600" fill="' + c.muted + '" text-decoration="line-through">' + esc(line) + '</text>'); y += 14; }); }
  return out.join('') + '</svg>';
}
function narrow(model, ctx, diff, c){
  const W = ctx.width || 390, pad = 22, measure = ctx.measure || measureFallback, tree = roots(model), rows = [];
  const prep = entry => {
    entry.x = pad + Math.min(entry.depth, 3) * 10;
    measureEntry(entry, model, diff, measure, W - entry.x - pad);
    /* The root needs an equally quiet but explicit causal identity on phone:
       there is no ancestry before an outcome, so its minimal context is just
       the stage rather than a repeated or empty breadcrumb. */
    entry.path = entry.parent ? entry.kind.toUpperCase() + ' · ' + nodeTrail(entry) : entry.kind.toUpperCase();
    entry.pathLines = entry.path ? wrapCausal(entry.path, '600 9px sans-serif', entry.w - 20, measure) : [];
    /* One measured context line carries both stage and full ancestry. It keeps
       the direct state plane below—not under—a wrapped context or label on a
       coarse phone without repeating a PATH label and a separate stage label. */
    entry.menuH += entry.pathLines.length * 12;
    entry.h += entry.pathLines.length * 12;
    rows.push(entry); entry.children.forEach(prep);
  };
  tree.forEach(prep); let y = 30;
  const out = ['<svg xmlns="http://www.w3.org/2000/svg" data-causal-tree="why" data-causal-field="why" data-causal-layout="outline" role="' + (ctx.edit ? 'group' : 'img') + '" aria-label="Causal Tree, source-order outline" width="' + W + '" height="HEIGHT" viewBox="0 0 ' + W + ' HEIGHT" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"><rect width="' + W + '" height="HEIGHT" fill="' + c.bg + '"/>'];
  wrapCausal(model.title || 'Untitled discovery', '700 22px sans-serif', W - pad * 2, measure).forEach(line => { out.push('<text x="' + pad + '" y="' + y + '" font-size="22" font-weight="700" fill="' + c.ink + '">' + esc(line) + '</text>'); y += 27; });
  out.push('<text x="' + pad + '" y="' + y + '" font-size="10" font-weight="700" letter-spacing="1.25" fill="' + c.muted + '">CAUSAL TREE · SOURCE ORDER</text>'); y += 30;
  for(const entry of rows){
    entry.y = y; const spec = type(entry), alert = broken(entry.node), menuW = entry.note ? entry.w - 96 : entry.w;
    out.push('<g' + attrs(entry) + '><rect x="' + entry.x + '" y="' + entry.y + '" width="' + entry.w + '" height="' + entry.h + '" fill="' + c.card + '" stroke="' + (entry.kind === 'outcome' ? c.ink : c.border) + '" stroke-width="' + (entry.kind === 'outcome' ? 2 : 1) + '"/>');
    if(ctx.edit) out.push('<rect' + menu(entry) + ' data-hit="" x="' + entry.x + '" y="' + entry.y + '" width="' + menuW + '" height="' + entry.menuH + '" fill="transparent" pointer-events="all"/>');
    let ty = entry.y + (entry.pathLines.length ? 14 : 18 + spec.size); const path = entry.pathLines;
    if(path.length){ out.push('<g data-causal-breadcrumb="' + esc(entry.path) + '" pointer-events="none">'); path.forEach(line => { out.push('<text x="' + (entry.x + 10) + '" y="' + ty + '" font-size="9" font-weight="600" letter-spacing=".25" fill="' + c.muted + '">' + esc(line) + '</text>'); ty += 12; }); out.push('</g>'); }
    entry.lines.forEach((line, index) => { out.push('<text' + (ctx.edit && index === 0 ? rename(entry) : ' pointer-events="none"') + ' x="' + (entry.x + 10) + '" y="' + ty + '" font-size="' + spec.size + '" font-weight="' + spec.weight + '" fill="' + c.ink + '">' + esc(line) + '</text>'); ty += spec.leading; });
    let cy = entry.y + entry.menuH;
    if(entry.note){ if(ctx.edit) out.push('<rect' + stateEdit(entry) + ' data-hit="" x="' + (entry.x + 10) + '" y="' + (cy + 2) + '" width="96" height="44" fill="transparent" pointer-events="all"/>'); out.push('<text data-causal-state="' + esc(entry.node.status) + '" pointer-events="none" x="' + (entry.x + 10) + '" y="' + (cy + 29) + '" font-size="10" font-weight="700" letter-spacing="1" fill="' + (alert ? c.err : c.muted) + '">' + esc(entry.note) + '</text>'); cy += 48; }
    cy = drawAssumptions(out, entry, c, ctx.edit, cy);
    out.push('</g>'); y += entry.h + 13;
  }
  const dropped = diff?.dropped?.length ? wrapCausal('DROPPED · ' + diff.dropped.join(' · '), '600 10px sans-serif', W - pad * 2, measure) : [];
  if(dropped.length){ y += 6; dropped.forEach(line => { out.push('<text data-causal-dropped="" x="' + pad + '" y="' + y + '" font-size="10" font-weight="600" fill="' + c.muted + '" text-decoration="line-through">' + esc(line) + '</text>'); y += 14; }); }
  return out.join('').replaceAll('HEIGHT', String(Math.ceil(y + 18))) + '</svg>';
}

export function renderCausalTree(model, projection, ctx, diff = null){
  const colours = causalColours(model, ctx);
  return ctx.width && ctx.width < 520 ? narrow(model, ctx, diff, colours) : wide(model, ctx, diff, colours);
}
