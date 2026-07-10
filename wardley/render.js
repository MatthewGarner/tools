/* model + layout → map SVG string. Pure; colours from ctx only.
   Single-quoted font stacks (XML: no double quotes inside attributes).
   Anatomy: Charter header + metrics · stage terrain washes with in-plane
   labels · curved edge-to-edge dependency links · capsule pills · axis strip ·
   verdict-led readout band. Height follows content. */
import {esc, tint, wrapText} from '../assets/svg.js';
import {diffItems} from '../assets/snapshots.js';
import {STAGES, stageOf} from './parse.js';
import {layoutMap} from './layout.js';

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const SERIF = 'Charter,Georgia,serif';
export const GEOM = {w: 1200, pad: 56};
const PILL_H = 28;
const EPSILON = 0.02;

const px = x => GEOM.pad + x * (GEOM.w - 2 * GEOM.pad);

function pill(n, c, measure, opts = {}){
  const w = measure(n.name, '600 13px ' + SANS) + 26;
  const x = n.px - w / 2, y = n.y - PILL_H / 2;
  const ghost = opts.ghost || n.ghost;
  const dash = ghost ? ' stroke-dasharray="5 4"' : '';
  const fill = ghost ? 'none' : opts.fill;
  const stroke = ghost ? c.muted : opts.stroke;
  const textFill = ghost ? c.muted : opts.text;
  const parts = [];
  parts.push('<g' + (opts.cls ? ' class="' + opts.cls + '"' : '') +
    (opts.drag ? ' data-drag="evo" data-name="' + esc(n.name) + '" data-line="' + n.srcLine + '"' : '') + '>');
  parts.push('<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + PILL_H +
    '" rx="' + PILL_H / 2 + '" fill="' + fill + '" stroke="' + stroke +
    '" stroke-width="' + (opts.strokeW || 1.4) + '"' + dash +
    (opts.stageEdit ? ' data-edit="stage" data-line="' + n.srcLine + '" data-raw="' + esc(opts.stageRaw) + '"' : '') +
    '/>');
  parts.push('<text x="' + n.px + '" y="' + (n.y + 4.5) + '" text-anchor="middle" font-size="13"' +
    ' font-weight="600" fill="' + textFill + '"' +
    (opts.nameEdit ? ' data-edit="' + opts.nameEdit + '" data-line="' + n.srcLine + '" data-raw="' + esc(n.name) + '"' : '') +
    '>' + esc(n.name) + '</text>');
  if(opts.newRing){
    parts.push('<rect x="' + (x - 4) + '" y="' + (y - 4) + '" width="' + (w + 8) + '" height="' + (PILL_H + 8) +
      '" rx="' + (PILL_H / 2 + 4) + '" fill="none" stroke="' + c.accent + '" stroke-width="1.5"/>');
    parts.push('<text x="' + (x - 4) + '" y="' + (y - 9) + '" font-size="9" font-weight="600"' +
      ' letter-spacing=".08em" fill="' + c.accent + '">NEW</text>');
  }
  parts.push('</g>');
  return parts.join('');
}

/* dependency link: leaves the parent's bottom edge, lands on the child's top
   edge, as a quiet vertical curve — never through a pill, never through text */
function link(k, c){
  const y1 = k.y1 + PILL_H / 2, y2 = k.y2 - PILL_H / 2;
  if(y2 <= y1 + 6){    // same row after a nudge — fall back to a straight line
    return '<line class="edge' + (k.dropped ? ' dropped' : '') + '" x1="' + k.x1 + '" y1="' + k.y1 +
      '" x2="' + k.x2 + '" y2="' + k.y2 + '" stroke="' + c.muted + '" stroke-opacity=".45"' +
      ' stroke-width="1.4"' + (k.dropped ? ' stroke-dasharray="3 4"' : '') + '/>';
  }
  const bend = Math.min(44, (y2 - y1) / 2);
  return '<path class="edge' + (k.dropped ? ' dropped' : '') + '" d="M ' + k.x1 + ' ' + y1 +
    ' C ' + k.x1 + ' ' + (y1 + bend) + ', ' + k.x2 + ' ' + (y2 - bend) + ', ' + k.x2 + ' ' + y2 +
    '" fill="none" stroke="' + c.muted + '" stroke-opacity=".45" stroke-width="1.4"' +
    (k.dropped ? ' stroke-dasharray="3 4"' : '') + '/>';
}

/* ---- readout: the quotable verdict + honest flags (pure, tested) ---- */
export function mapReadout(model, layout){
  const comps = layout.nodes.filter(n => !n.anchor);
  const placed = comps.filter(n => n.x !== null);
  /* biggest bet: the most-needed component still left of product */
  let bet = null;
  for(const n of placed){
    if(n.x >= 0.5) continue;
    const needed = layout.needs.get(n.name.toLowerCase()) || 0;
    if(needed >= 2 && (!bet || needed > bet.needed)) bet = {n, needed};
  }
  let verdict;
  if(bet){
    const stage = stageOf(bet.n.x).name;
    verdict = bet.n.name + ' is load-bearing (' + bet.needed + ' things need it) and still ' +
      (stage === 'genesis' ? 'in genesis' : 'custom-built') + ' — the map’s biggest bet.';
  } else {
    const left = placed.filter(n => n.x < 0.5).length;
    verdict = left > placed.length / 2
      ? 'Mostly genesis and custom — a discovery map; expect it to redraw.'
      : 'Mostly product and commodity — an execution map; the argument is sequencing, not invention.';
  }
  const flags = [];
  const ghosts = comps.filter(n => n.ghost);
  if(ghosts.length) flags.push(ghosts.length + ' unplaced — drag ' +
    (ghosts.length === 1 ? 'it' : 'them') + ' onto the map.');
  for(const d of layout.droppedEdges)
    flags.push('⚠ dependency loop — the edge ' + d.from + ' → ' + d.to + ' was dropped from the layout.');
  return {verdict, flags};
}

function compareParts(model, layout, compare, c){
  const prevLayout = layoutMap(compare.prev, GEOM);
  const prevNode = name => prevLayout.nodes.find(n => n.name.toLowerCase() === name.toLowerCase());
  const comps = m => [...m.components.values()].filter(x => x.x !== null);
  const diff = diffItems(comps(compare.prev), comps(model), {
    key: x => x.name,
    state: x => x.x.toFixed(2),
  });
  const moved = [...diff.moved.values()].filter(mv => Math.abs(+mv.to - +mv.from) > EPSILON);
  const parts = [];
  let maxY = 0;
  for(const mv of moved){
    const cur = layout.nodes.find(n => n.name === mv.item.name);
    const old = prevNode(mv.item.name);
    if(!cur || !old) continue;
    maxY = Math.max(maxY, old.y);
    const dir = +mv.to > +mv.from ? 1 : -1;
    parts.push('<g class="drift-arrow"><line x1="' + old.px + '" y1="' + old.y + '" x2="' + cur.px +
      '" y2="' + cur.y + '" stroke="' + c.accent + '" stroke-width="1.5" stroke-dasharray="3 3"/>' +
      '<path d="M ' + cur.px + ' ' + cur.y + ' l ' + (-9 * dir) + ' -4.5 l 0 9 z" fill="' + c.accent + '"/></g>');
    parts.push(pill({...old, ghost: false}, c, compare.measure, {ghost: true, cls: 'ghost moved-ghost'}));
  }
  for(const it of diff.dropped){
    const old = prevNode(it.name);
    if(old){
      maxY = Math.max(maxY, old.y);
      parts.push(pill(old, c, compare.measure, {ghost: true, cls: 'ghost dropped-ghost'}));
    }
  }
  const rights = moved.filter(mv => +mv.to > +mv.from).length;
  const lefts = moved.length - rights;
  const bits = [];
  if(rights) bits.push(rights + ' drifted right');
  if(lefts) bits.push(lefts + ' drifted left');
  if(diff.added.length) bits.push(diff.added.length + ' new');
  if(diff.dropped.length) bits.push(diff.dropped.length + ' dropped');
  const headline = 'Since ' + compare.label + ': ' + (bits.length ? bits.join(' · ') : 'no changes');
  const added = new Set(diff.added.map(x => x.name));
  return {parts, headline, added, maxY};
}

export function toMarkdown(model, layout, href){
  const out = ['# ' + (model.title || 'Wardley map'), ''];
  const r = mapReadout(model, layout);
  out.push('**' + r.verdict + '**', '');
  for(const s of STAGES){
    const names = layout.nodes
      .filter(n => !n.anchor && !n.ghost && n.x !== null && stageOf(n.x).name === s.name)
      .sort((a, b) => a.y - b.y || a.px - b.px)
      .map(n => n.name);
    if(names.length) out.push('- **' + s.name + '**: ' + names.join(' · '));
  }
  const ghosts = layout.nodes.filter(n => n.ghost).map(n => n.name);
  if(ghosts.length) out.push('- unplaced: ' + ghosts.join(' · '));
  for(const f of r.flags) out.push('- ' + f.replace('⚠ ', ''));
  out.push('', model.edges.length + ' dependencies · anchor' +
    (model.anchors.length === 1 ? '' : 's') + ': ' + model.anchors.map(a => a.name).join(', '));
  out.push('', '[live map](' + href + ')');
  return out.join('\n') + '\n';
}

/* ---- narrow relayout: depth-grouped cards, each wearing the terrain as a
   draggable evolution strip. Same data, same verdict; built for thumbs.
   Exports stay pinned to the wide form (callers omit ctx.width). ---- */
export const NARROW = 520;

function renderNarrow(model, layout, ctx, opts){
  const c = ctx.colors, measure = ctx.measure;
  const W = Math.max(240, Math.round(ctx.width)), pad = 16;
  const ramp = ctx.palette || [c.accent, c.accent, c.accent, c.accent];
  const inner = W - 2 * pad;
  const names = new Map();
  for(const n of layout.nodes) names.set(n.name.toLowerCase(), n.name);
  const needsOf = key => model.edges.filter(e => e.from === key).map(e => names.get(e.to) || e.to);

  const parts = [];
  let y = 30;
  parts.push('<text x="' + pad + '" y="' + y + '" font-family="' + SERIF +
    '" font-size="18" font-weight="700" fill="' + c.ink + '">' + esc(model.title || 'Wardley map') + '</text>');
  y += 18;
  const comps = layout.nodes.filter(n => !n.anchor);
  const ghostN = comps.filter(n => n.ghost).length;
  parts.push('<text x="' + pad + '" y="' + y + '" font-size="11" fill="' + c.muted + '">' +
    comps.length + ' components · ' + model.edges.length + ' dependencies' +
    (ghostN ? ' · ' + ghostN + ' unplaced' : '') + '</text>');
  y += 10;

  let added = new Set(), oldX = new Map();
  if(opts.compare){
    const cmp = compareParts(model, layout, {...opts.compare, measure}, c);
    added = cmp.added;
    for(const [k, mv] of diffItems(
      [...opts.compare.prev.components.values()].filter(x => x.x !== null),
      [...model.components.values()].filter(x => x.x !== null),
      {key: x => x.name, state: x => x.x.toFixed(2)}).moved)
      if(Math.abs(+mv.to - +mv.from) > EPSILON) oldX.set(k, +mv.from);
    y += 8;
    parts.push('<text x="' + pad + '" y="' + y + '" font-size="12" font-weight="600" fill="' +
      c.accent + '">' + esc(cmp.headline) + '</text>');
    y += 4;
  }

  const rows = new Map();
  for(const n of layout.nodes){
    const list = rows.get(n.row) || [];
    list.push(n);
    rows.set(n.row, list);
  }
  const trackX0 = pad + 14, trackW = inner - 28;

  for(const r of [...rows.keys()].sort((a, b) => a - b)){
    y += 14;
    for(const n of rows.get(r).sort((a, b) => a.px - b.px)){
      if(n.anchor){
        parts.push('<rect x="' + pad + '" y="' + y + '" width="' + inner + '" height="34" rx="17"' +
          ' fill="' + c.card + '" stroke="' + c.ink + '" stroke-width="1.5"/>');
        parts.push('<text x="' + (W / 2) + '" y="' + (y + 21.5) + '" text-anchor="middle" font-size="13.5"' +
          ' font-weight="600" fill="' + c.ink + '"' +
          (n.srcLine >= 0 ? ' data-edit="anchor" data-line="' + n.srcLine + '" data-raw="' + esc(n.name) + '"' : '') +
          '>' + esc(n.name) + '</text>');
        y += 42;
        const aNeeds = needsOf(n.name.toLowerCase());
        for(const nl of aNeeds.length
            ? wrapText('needs ' + aNeeds.join(' · '), '11px ' + SANS, inner, measure) : []){
          parts.push('<text x="' + (W / 2) + '" y="' + (y + 2) + '" text-anchor="middle" font-size="11"' +
            ' fill="' + c.muted + '">' + esc(nl) + '</text>');
          y += 18;
        }
        continue;
      }
      const stage = n.x === null ? null : stageOf(n.x);
      const col = ramp[(stage ? STAGES.indexOf(stage) : 0) % ramp.length];
      const needs = needsOf(n.name.toLowerCase());
      const needsLines = needs.length
        ? wrapText('needs ' + needs.join(' · '), '11px ' + SANS, inner - 28, measure) : [];
      const cardH = 58 + needsLines.length * 16 + (n.ghost ? 16 : 0);
      parts.push('<rect x="' + pad + '" y="' + y + '" width="' + inner + '" height="' + cardH +
        '" rx="12" fill="' + (n.ghost ? 'none' : tint(col)) + '" stroke="' + (n.ghost ? c.muted : col) +
        '" stroke-width="1.4"' + (n.ghost ? ' stroke-dasharray="5 4"' : '') + '/>');
      parts.push('<text x="' + (pad + 14) + '" y="' + (y + 23) + '" font-size="14" font-weight="600"' +
        ' fill="' + (n.ghost ? c.muted : col) + '" data-edit="name" data-line="' + n.srcLine +
        '" data-raw="' + esc(n.name) + '">' + esc(n.name) + '</text>');
      parts.push('<text x="' + (pad + inner - 14) + '" y="' + (y + 23) + '" text-anchor="end" font-size="10.5"' +
        ' font-weight="600" letter-spacing=".07em" fill="' + (n.ghost ? c.muted : col) + '">' +
        (n.ghost ? 'UNPLACED' : stage.name.toUpperCase()) + '</text>');
      if(added.has(n.name)){
        parts.push('<text x="' + (pad + 14) + '" y="' + (y - 4) + '" font-size="9" font-weight="600"' +
          ' letter-spacing=".08em" fill="' + c.accent + '">NEW</text>');
      }
      /* the terrain, compressed: four wash segments + the draggable dot */
      const sy = y + 34;
      parts.push('<g data-drag="evo" data-name="' + esc(n.name) + '" data-line="' + n.srcLine + '" data-strip="">');
      STAGES.forEach((s, i) => {
        parts.push('<rect x="' + (trackX0 + s.lo * trackW) + '" y="' + sy + '" width="' + (trackW * 0.25) +
          '" height="8" fill="' + ramp[i % ramp.length] + '2E"/>');
      });
      parts.push('<rect data-track="" data-x0="' + trackX0 + '" data-w="' + trackW + '" x="' + trackX0 +
        '" y="' + sy + '" width="' + trackW + '" height="8" rx="4" fill="' + c.bg + '" fill-opacity="0"/>');
      if(oldX.has(n.name.toLowerCase())){
        parts.push('<circle cx="' + (trackX0 + oldX.get(n.name.toLowerCase()) * trackW) + '" cy="' + (sy + 4) +
          '" r="5" fill="none" stroke="' + c.muted + '" stroke-width="1.5" stroke-dasharray="2 2"/>');
      }
      parts.push('<circle data-dot="" cx="' + (trackX0 + (n.x === null ? 0 : n.x) * trackW) + '" cy="' + (sy + 4) +
        '" r="7" fill="' + (n.ghost ? c.card : col) + '" stroke="' + (n.ghost ? c.muted : c.card) +
        '" stroke-width="1.5"' + (n.ghost ? ' stroke-dasharray="2 2"' : '') + '/>');
      /* thumb-sized invisible hit surface over the strip */
      parts.push('<rect x="' + pad + '" y="' + (sy - 18) + '" width="' + inner + '" height="44" fill="' +
        c.bg + '" fill-opacity="0"/>');
      parts.push('</g>');
      let ty = y + 56;
      if(n.ghost){
        parts.push('<text x="' + (pad + 14) + '" y="' + ty + '" font-size="11" fill="' + c.muted +
          '">unplaced — drag the dot onto the strip</text>');
        ty += 16;
      }
      for(const nl of needsLines){
        parts.push('<text x="' + (pad + 14) + '" y="' + ty + '" font-size="11" fill="' + c.muted +
          '">' + esc(nl) + '</text>');
        ty += 16;
      }
      y += cardH + 8;
    }
  }

  /* readout */
  const r = mapReadout(model, layout);
  y += 12;
  parts.push('<line x1="' + pad + '" y1="' + y + '" x2="' + (W - pad) + '" y2="' + y +
    '" stroke="' + c.border + '"/>');
  y += 8;
  for(const lnText of wrapText(r.verdict, '600 13px ' + SANS, inner, measure)){
    y += 18;
    parts.push('<text x="' + pad + '" y="' + y + '" font-size="13" font-weight="600" fill="' +
      c.ink + '">' + esc(lnText) + '</text>');
  }
  for(const f of r.flags){
    for(const lnText of wrapText(f, '11.5px ' + SANS, inner, measure)){
      y += 17;
      parts.push('<text x="' + pad + '" y="' + y + '" font-size="11.5" fill="' + c.muted + '">' +
        esc(lnText) + '</text>');
    }
  }
  const H = Math.round(y + 20);
  /* data-narrow lets CSS scope touch-action to the ROOT svg — Chromium only
     honours touch-action on the svg root, never on child elements */
  return '<svg xmlns="http://www.w3.org/2000/svg" data-narrow="" width="' + W + '" height="' + H +
    '" viewBox="0 0 ' + W + ' ' + H + '" font-family="' + SANS + '">' +
    '<rect width="' + W + '" height="' + H + '" fill="' + c.bg + '"/>' + parts.join('') + '</svg>';
}

export function renderMap(model, layout, ctx, opts = {}){
  if(ctx.width && ctx.width < NARROW) return renderNarrow(model, layout, ctx, opts);
  const c = ctx.colors, measure = ctx.measure;
  const {w, pad} = GEOM;
  const ramp = ctx.palette || [c.accent, c.accent, c.accent, c.accent];

  /* ---- header ---- */
  const head = [];
  let headerH = 58;
  head.push('<text x="' + pad + '" y="38" font-family="' + SERIF + '" font-size="24" font-weight="700" fill="' +
    c.ink + '">' + esc(model.title || 'Wardley map') + '</text>');
  /* date label wants an ISO string; other tools' ctx carries today as a day
     number — accept strings only, so a shared ctx can never crash the header */
  if(typeof ctx.today === 'string') head.push('<text x="' + (w - pad) +
    '" y="26" text-anchor="end" font-size="12" fill="' + c.muted + '">' + esc(ctx.today) + '</text>');
  const comps = layout.nodes.filter(n => !n.anchor);
  const ghostN = comps.filter(n => n.ghost).length;
  head.push('<text x="' + pad + '" y="56" font-size="12.5" fill="' + c.muted + '">' +
    comps.length + ' component' + (comps.length === 1 ? '' : 's') + ' · ' +
    model.edges.length + ' dependenc' + (model.edges.length === 1 ? 'y' : 'ies') +
    (ghostN ? ' · ' + ghostN + ' unplaced' : '') + '</text>');

  let compareInfo = null;
  if(opts.compare){
    compareInfo = compareParts(model, layout, {...opts.compare, measure}, c);
    head.push('<text x="' + pad + '" y="76" font-size="13" font-weight="600" fill="' + c.accent + '">' +
      esc(compareInfo.headline) + '</text>');
    headerH = 84;
  }

  /* ---- plane (translated below the header; layout coords are plane-local) ---- */
  const planeH = Math.max(layout.h, compareInfo ? compareInfo.maxY + 64 : 0);
  const plane = [];
  const axisY = planeH - 16;
  /* stage terrain: progressively calmer washes, labels worn like zone names */
  STAGES.forEach((s, i) => {
    const x0 = px(s.lo), x1 = px(s.hi);
    plane.push('<rect x="' + x0 + '" y="0" width="' + (x1 - x0) + '" height="' + axisY +
      '" fill="' + ramp[i % ramp.length] + '14"/>');
    plane.push('<text x="' + (x0 + 14) + '" y="18" font-size="11" font-weight="600"' +
      ' letter-spacing=".08em" fill="' + ramp[i % ramp.length] + '">' + s.name.toUpperCase() + '</text>');
    if(i) plane.push('<line x1="' + x0 + '" y1="0" x2="' + x0 + '" y2="' + axisY +
      '" stroke="' + c.border + '" stroke-opacity=".6"/>');
  });
  plane.push('<line x1="' + pad + '" y1="' + axisY + '" x2="' + (w - pad) + '" y2="' + axisY +
    '" stroke="' + c.border + '"/>');
  plane.push('<text x="' + (w - pad) + '" y="' + (axisY + 18) + '" text-anchor="end" font-size="11" fill="' +
    c.muted + '">evolution →</text>');
  plane.push('<text x="' + pad + '" y="' + (axisY + 18) + '" font-size="11" fill="' + c.muted +
    '">↑ closer to the user need</text>');

  if(compareInfo) plane.push(...compareInfo.parts);

  for(const k of layout.links) plane.push(link(k, c));

  for(const n of layout.nodes){
    if(n.anchor){
      plane.push(pill(n, c, measure, {fill: c.card, stroke: c.ink, text: c.ink, strokeW: 1.5,
        nameEdit: n.srcLine >= 0 ? 'anchor' : null, cls: 'anchor'}));
      continue;
    }
    const stage = n.x === null ? null : stageOf(n.x);
    const si = stage ? STAGES.indexOf(stage) : 0;
    const col = ramp[si % ramp.length];
    const stageRaw = n.stage || (n.x === null ? '' : String(n.x));
    plane.push(pill(n, c, measure, {fill: n.ghost ? 'none' : tint(col), stroke: col, text: col,
      drag: true, nameEdit: 'name', stageEdit: !n.ghost, stageRaw,
      newRing: compareInfo ? compareInfo.added.has(n.name) : false}));
  }

  /* ---- readout band ---- */
  const r = mapReadout(model, layout);
  const read = [];
  const readTop = headerH + planeH + 10;
  read.push('<line x1="' + pad + '" y1="' + readTop + '" x2="' + (w - pad) + '" y2="' + readTop +
    '" stroke="' + c.border + '"/>');
  read.push('<text x="' + pad + '" y="' + (readTop + 26) + '" font-size="14" font-weight="600" fill="' +
    c.ink + '">' + esc(r.verdict) + '</text>');
  r.flags.forEach((f, i) => {
    read.push('<text x="' + pad + '" y="' + (readTop + 48 + i * 19) + '" font-size="12.5" fill="' +
      c.muted + '">' + esc(f) + '</text>');
  });
  const H = Math.round(readTop + 40 + r.flags.length * 19 + 14);

  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + H +
    '" viewBox="0 0 ' + w + ' ' + H + '" font-family="' + SANS + '">' +
    '<rect width="' + w + '" height="' + H + '" fill="' + c.bg + '"/>' +
    head.join('') +
    '<g transform="translate(0 ' + headerH + ')">' + plane.join('') + '</g>' +
    read.join('') + '</svg>';
}
