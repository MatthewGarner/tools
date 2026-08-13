/* model + layout → map SVG string. Pure; colours from ctx only.
   Single-quoted font stacks (XML: no double quotes inside attributes).
   Anatomy: Charter header + metrics · stage terrain washes with in-plane
   labels · curved edge-to-edge dependency links · capsule pills · axis strip ·
   verdict-led readout band. Height follows content. */
import {esc, tint, wrapText} from '../assets/svg.js';
import {svgVerdict} from '../assets/verdict-svg.js';
import {resolveVerdict} from '../assets/verdict.js';
import {diffItems} from '../assets/snapshots.js';
import {STAGES, stageOf} from './parse.js';
import {layoutMap} from './layout.js';

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const SERIF = "'Helvetica Neue',Helvetica,'Segoe UI',Roboto,sans-serif";   // Swiss 3b (double-quoted attr context: single-quoted names)
/* Same stack as SANS, quoted the other way round: svgVerdict emits SINGLE-quoted
   attribute values, so the font name inside one must not itself be single-quoted.
   Identical typeface resolution; only the XML quoting differs. */
const SANS_SQATTR = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
export const GEOM = {w: 1200, pad: 56};
const PILL_H = 28;
const EPSILON = 0.02;

const px = x => GEOM.pad + x * (GEOM.w - 2 * GEOM.pad);

function pillWidth(node, measure){
  return typeof node === 'string' ? measure(node, '600 13px ' + SANS) + 26 :
    (node.cardW || measure(node.name, '600 13px ' + SANS) + 26);
}

function pill(n, c, measure, opts = {}){
  const w = pillWidth(n, measure), h = n.cardH || PILL_H;
  const x = n.cardX ?? (n.px - w / 2), y = n.y - h / 2;
  const ghost = opts.ghost || n.ghost;
  const dash = ghost ? ' stroke-dasharray="5 4"' : '';
  const fill = ghost ? 'none' : opts.fill;
  const stroke = ghost ? c.muted : opts.stroke;
  const textFill = ghost ? c.muted : opts.text;
  const parts = [];
  parts.push('<g' + (opts.cls ? ' class="' + opts.cls + '"' : '') +
    (opts.drag ? ' data-drag="evo" data-name="' + esc(n.name) + '" data-line="' + n.srcLine + '"' : '') + '>');
  parts.push('<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h +
    '" rx="0" fill="' + fill + '" stroke="' + stroke +
    '" stroke-width="' + (opts.strokeW || 1.4) + '"' + dash +
    (opts.stageEdit ? ' data-edit="stage" data-line="' + n.srcLine + '" data-raw="' + esc(opts.stageRaw) +
      '" tabindex="0" role="button" aria-label="Cycle evolution stage: ' + esc(n.name) + '"' : '') +
    '/>');
  const lines = n.lines || [n.name], cx = x + w / 2;
  lines.forEach((line, i) => parts.push('<text x="' + cx + '" y="' +
    (n.y + (i - (lines.length - 1) / 2) * 15 + 4.5) + '" text-anchor="middle" font-size="13"' +
    ' font-weight="600" fill="' + textFill + '"' +
    (opts.nameEdit && i === 0 ? ' data-edit="' + opts.nameEdit + '" data-line="' + n.srcLine + '" data-raw="' + esc(n.name) +
      '" tabindex="0" role="button" aria-label="Rename ' + (opts.nameEdit === 'anchor' ? 'anchor' : 'component') +
      ': ' + esc(n.name) + '"' : '') + '>' + esc(line) + '</text>'));
  if(!n.anchor && n.x !== null){
    parts.push('<line data-evolution-pin="" x1="' + n.px + '" y1="' + (y - 5) + '" x2="' + n.px +
      '" y2="' + (y + 5) + '" stroke="' + stroke + '" stroke-width="1.6"/>');
    if(Math.abs(cx - n.px) > 1) parts.push('<line data-card-leader="" x1="' + n.px + '" y1="' + y +
      '" x2="' + cx + '" y2="' + y + '" stroke="' + stroke + '" stroke-width="1"/>');
  }
  if(opts.newRing){
    parts.push('<rect x="' + (x - 4) + '" y="' + (y - 4) + '" width="' + (w + 8) + '" height="' + (h + 8) +
      '" rx="0" fill="none" stroke="' + c.accent + '" stroke-width="1.5"/>');
    parts.push('<text x="' + (x - 4) + '" y="' + (y - 9) + '" font-size="9" font-weight="600"' +
      ' letter-spacing=".08em" fill="' + c.accent + '">NEW</text>');
  }
  parts.push('</g>');
  return parts.join('');
}

/* edit chrome (only ever built when opts.edit): a quiet "⋯" component menu —
   a small ghost marker (≥24px) for the eye, wrapped with a bigger invisible
   hit rect (≥44px) for the thumb. Both live under one data-edit group so a
   tap anywhere in the hit area opens the menu. */
function menuMarker(mx, my, n, c){
  return '<g data-edit="componentmenu" data-line="' + n.srcLine + '" data-raw="' + esc(n.name) +
    '" tabindex="0" role="button" aria-label="More options: ' + esc(n.name) + '">' +
    '<rect x="' + (mx - 12) + '" y="' + (my - 12) + '" width="24" height="24" rx="0" fill="none"' +
    ' stroke="' + c.muted + '" stroke-dasharray="3 3" stroke-opacity=".7"/>' +
    '<text x="' + mx + '" y="' + (my + 4) + '" text-anchor="middle" font-size="13" font-weight="700"' +
    ' fill="' + c.muted + '">⋯</text>' +
    '<rect x="' + (mx - 22) + '" y="' + (my - 22) + '" width="44" height="44" fill="' + c.bg +
    '" fill-opacity="0"/></g>';
}

/* wide: the marker rides just past the pill's right edge — offset ≥ half the
   44px hit rect (22) so the hit rect clears the pill and a right-edge tap
   cycles the stage rather than opening the remove menu */
function componentMenu(n, c, measure){
  return menuMarker((n.cardX ?? (n.px - pillWidth(n, measure) / 2)) + pillWidth(n, measure) + 24, n.y, n, c);
}

/* wide: one ghost "＋" add-zone low in each stage band, above the axis —
   a real pill (no drag) plus a thumb-sized invisible hit rect carrying the
   additem hook, so the visual stays tiny while the tap target doesn't */
function addZonePill(s, c, measure, zy){
  const zx = px(s.mid);
  const visual = pill({name: '＋', px: zx, y: zy, srcLine: -1}, c, measure, {ghost: true, cls: 'ghost add-ghost'});
  return '<g data-edit="additem" data-stage="' + s.name + '" data-line="-1" data-raw=""' +
    ' tabindex="0" role="button" aria-label="Add component in the ' + esc(s.name) + ' stage">' + visual +
    '<rect x="' + (zx - 60) + '" y="' + (zy - 22) + '" width="120" height="44" fill="' + c.bg +
    '" fill-opacity="0"/></g>';
}

/* dependency link: leaves the parent's bottom edge, lands on the child's top
   edge, as a quiet vertical curve — never through a pill, never through text */
function link(k, c){
  if(k.path) return '<path class="edge' + (k.dropped ? ' dropped' : '') + '" d="' + k.path +
    '" fill="none" stroke="' + c.muted + '" stroke-opacity=".45" stroke-width="1.4"' +
    (k.dropped ? ' stroke-dasharray="3 4"' : '') + '/>';
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
export function mapReadout(model, layout, opts = {}){
  const comps = layout.nodes.filter(n => !n.anchor);
  const placed = comps.filter(n => n.x !== null);
  /* biggest bet: the most-needed component still left of product */
  let bet = null;
  for(const n of placed){
    if(n.x >= 0.5) continue;
    const needed = layout.needs.get(n.name.toLowerCase()) || 0;
    if(needed >= 2 && (!bet || needed > bet.needed)) bet = {n, needed};
  }
  let verdict, fig = '';
  if(bet){
    const stage = stageOf(bet.n.x).name;
    fig = bet.needed + ' things need it';
    verdict = bet.n.name + ' is load-bearing (' + fig + ') and still ' +
      (stage === 'genesis' ? 'in genesis' : 'custom-built') + ' — the map’s biggest bet.';
  } else {
    const left = placed.filter(n => n.x < 0.5).length;
    verdict = left > placed.length / 2
      ? 'Mostly genesis and custom — a discovery landscape; revisit these position claims often.'
      : 'Mostly product and commodity — an execution landscape; the argument is sequencing, not a delivery forecast.';
  }
  const flags = [];
  const ghosts = comps.filter(n => n.ghost);
  if(ghosts.length) flags.push(opts.narrow
    ? ghosts.length + ' unplaced — tap ' + (ghosts.length === 1 ? 'its strip' : 'their strips') + ' to place ' + (ghosts.length === 1 ? 'it' : 'them') + '.'
    : ghosts.length + ' unplaced — drag ' + (ghosts.length === 1 ? 'it' : 'them') + ' onto the map.');
  for(const d of layout.droppedEdges)
    flags.push('⚠ dependency loop — the edge ' + d.from + ' → ' + d.to + ' was dropped from the layout.');
  /* `fig` is the ONE load-bearing figure inside the verdict, verbatim, for the
     surface to mark. The composition verdict ("a discovery map") turns on no
     single number, so it carries no figure. */
  /* `verdict:` (2026-07-31): the author's override wins over the derived line. */
  const av = resolveVerdict(model.verdict, {line: verdict, fig});
  return {verdict: av.line, fig: av.fig, flags};
}

function compareParts(model, layout, compare, c){
  const prevLayout = layoutMap(compare.prev, {measure: compare.measure, intent: layout.intent, geom: GEOM});
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
  const out = [
    '# ' + (model.title || 'Wardley map'),
    '',
    '> Evolution positions are current strategic claims — not dates, forecasts, or delivery commitments.',
    '',
  ];
  const r = mapReadout(model, layout);
  /* guarded since `verdict: off` can empty this — an unguarded push emitted a
     bare '****' into the doc (found in review, 2026-07-31) */
  if(r.verdict) out.push('**' + r.verdict + '**', '');
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
    (ghostN ? ' · ' + ghostN + ' unplaced' : '') + ' · positions are working claims</text>');
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
        parts.push('<rect x="' + pad + '" y="' + y + '" width="' + inner + '" height="34" rx="0"' +
          ' fill="' + c.card + '" stroke="' + c.ink + '" stroke-width="1.5"/>');
        parts.push('<text x="' + (W / 2) + '" y="' + (y + 21.5) + '" text-anchor="middle" font-size="13.5"' +
          ' font-weight="600" fill="' + c.ink + '"' +
          (n.srcLine >= 0 ? ' data-edit="anchor" data-line="' + n.srcLine + '" data-raw="' + esc(n.name) +
            '" tabindex="0" role="button" aria-label="Rename anchor: ' + esc(n.name) + '"' : '') +
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
      const nameLines = wrapText(n.name, '600 14px ' + SANS, inner - 28, measure);
      const needsLines = needs.length
        ? wrapText('needs ' + needs.join(' · '), '11px ' + SANS, inner - 28, measure) : [];
      const cardH = 60 + nameLines.length * 18 + needsLines.length * 16 + (n.ghost ? 16 : 0);
      parts.push('<rect x="' + pad + '" y="' + y + '" width="' + inner + '" height="' + cardH +
        '" rx="0" fill="' + (n.ghost ? 'none' : tint(col)) + '" stroke="' + (n.ghost ? c.muted : col) +
        '" stroke-width="1.4"' + (n.ghost ? ' stroke-dasharray="5 4"' : '') + '/>');
      parts.push('<text x="' + (pad + 14) + '" y="' + (y + 17) + '" font-size="9.5" font-weight="700"' +
        ' letter-spacing="1" fill="' + c.muted + '">' + esc(n.id) + '</text>');
      parts.push('<text x="' + (pad + inner - 14) + '" y="' + (y + 17) + '" text-anchor="end" font-size="10.5"' +
        ' font-weight="600" letter-spacing=".07em" fill="' + (n.ghost ? c.muted : col) + '">' +
        (n.ghost ? 'UNPLACED' : stage.name.toUpperCase()) + '</text>');
      nameLines.forEach((line, i) => parts.push('<text x="' + (pad + 14) + '" y="' + (y + 39 + i * 18) +
        '" font-size="14" font-weight="600" fill="' + (n.ghost ? c.muted : col) + '"' +
        (i === 0 ? ' data-edit="name" data-line="' + n.srcLine + '" data-raw="' + esc(n.name) +
          '" tabindex="0" role="button" aria-label="Rename component: ' + esc(n.name) + '"' : '') +
        '>' + esc(line) + '</text>'));
      if(added.has(n.name)){
        parts.push('<text x="' + (pad + 14) + '" y="' + (y - 4) + '" font-size="9" font-weight="600"' +
          ' letter-spacing=".08em" fill="' + c.accent + '">NEW</text>');
      }
      /* the terrain, compressed: four wash segments + the draggable dot */
      const sy = y + 34 + nameLines.length * 18;
      parts.push('<g data-drag="evo" data-name="' + esc(n.name) + '" data-line="' + n.srcLine + '" data-strip="">');
      STAGES.forEach((s, i) => {
        parts.push('<rect x="' + (trackX0 + s.lo * trackW) + '" y="' + sy + '" width="' + (trackW * 0.25) +
          '" height="8" fill="' + ramp[i % ramp.length] + '2E"/>');
      });
      parts.push('<rect data-track="" data-x0="' + trackX0 + '" data-w="' + trackW + '" x="' + trackX0 +
        '" y="' + sy + '" width="' + trackW + '" height="8" rx="0" fill="' + c.bg + '" fill-opacity="0"/>');
      if(oldX.has(n.name.toLowerCase())){
        parts.push('<circle cx="' + (trackX0 + oldX.get(n.name.toLowerCase()) * trackW) + '" cy="' + (sy + 4) +
          '" r="5" fill="none" stroke="' + c.muted + '" stroke-width="1.5" stroke-dasharray="2 2"/>');
      }
      parts.push('<circle data-dot="" cx="' + (trackX0 + (n.x === null ? 0 : n.x) * trackW) + '" cy="' + (sy + 4) +
        '" r="7" fill="' + (n.ghost ? c.card : col) + '" stroke="' + (n.ghost ? c.muted : c.card) +
        '" stroke-width="1.5"' + (n.ghost ? ' stroke-dasharray="2 2"' : '') + '/>');
      /* thumb-sized invisible hit surface over the strip — top sits at sy-8
         (not sy-18) so it clears the card title above it; still 44 tall */
      parts.push('<rect x="' + pad + '" y="' + (sy - 8) + '" width="' + inner + '" height="44" fill="' +
        c.bg + '" fill-opacity="0"/>');
      parts.push('</g>');
      /* edit chrome: "⋯" menu at the strip's right end, painted AFTER the
         strip group closes so paint order gives it the tap over the strip's
         own hit rect in that corner */
      if(opts.edit) parts.push(menuMarker(pad + inner - 14, sy + 4, n, c));
      let ty = sy + 22;
      if(n.ghost){
        parts.push('<text x="' + (pad + 14) + '" y="' + ty + '" font-size="11" fill="' + c.muted +
          '">unplaced — tap the strip to place it</text>');
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

  /* edit chrome: ghost "add component" card, mirrors the unplaced-card look */
  if(opts.edit){
    const addH = 44;
    parts.push('<g data-edit="additem" data-line="-1" data-raw="" tabindex="0" role="button"' +
      ' aria-label="Add component">' +
      '<rect x="' + pad + '" y="' + y + '" width="' + inner + '" height="' + addH +
      '" rx="0" fill="none" stroke="' + c.muted + '" stroke-width="1.4" stroke-dasharray="5 4"/>' +
      '<text x="' + (W / 2) + '" y="' + (y + addH / 2 + 5) + '" text-anchor="middle" font-size="13.5"' +
      ' fill="' + c.muted + '">＋ Add component</text></g>');
    y += addH + 8;
  }

  /* readout: the same VERDICT anatomy as the wide artefact, re-wrapped at 17px
     (the narrow display size — it never degrades to body copy). Exports always
     render the wide 1200px map, so this size is preview-only. */
  const r = mapReadout(model, layout, {narrow: true});
  y += 12;
  parts.push('<line x1="' + pad + '" y1="' + y + '" x2="' + (W - pad) + '" y2="' + y +
    '" stroke="' + c.border + '"/>');
  const vTop = y + 22;                       // baseline of the 10px VERDICT kicker
  const V = svgVerdict({x: pad, y: vTop, width: inner, line: r.verdict, fig: r.fig,
    ink: c.ink, muted: c.muted, brandText: c.brandText || c.ink,
    font: SANS_SQATTR, measure, size: 17,
    edit: opts.edit ? {raw: model.verdict ?? ''} : undefined});
  parts.push(V.svg);
  y = vTop + V.height - 23 + 4;              // last verdict baseline, plus a gap
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

function renderPresentation(model, layout, ctx){
  const c = ctx.colors, measure = ctx.measure, W = 1920, H = 1080, pad = 72;
  const ramp = ctx.palette || [c.accent, c.accent, c.accent, c.accent];
  const fieldTop = 300, fieldBottom = 900, fieldW = W - pad * 2;
  const xOf = node => node.x === null
    ? pad + ((node.px - layout.pad) / (layout.w - 2 * layout.pad)) * fieldW
    : pad + node.x * fieldW;
  const readout = mapReadout(model, layout);
  const V = svgVerdict({x:pad, y:118, width:W-pad*2, line:readout.verdict, fig:readout.fig,
    ink:c.ink, muted:c.muted, brandText:c.brandText || c.ink, font:SANS_SQATTR,
    measure, size:28, scale:1.3});
  const parts = ['<rect width="1920" height="1080" fill="' + c.bg + '"/>',
    '<text x="72" y="58" font-family="' + SERIF + '" font-size="38" font-weight="700" fill="' + c.ink + '">' +
      esc(model.title || 'Wardley map') + '</text>',
    '<text x="1848" y="50" text-anchor="end" font-size="18" fill="' + c.muted + '">' +
      esc(typeof ctx.today === 'string' ? ctx.today : '') + '</text>', V.svg,
    '<text x="72" y="274" font-size="14" font-weight="700" letter-spacing="2" fill="' + c.muted +
      '">DEPENDENCY SPINE · DEEPEST PATH, THEN IN-DEGREE · POSITIONS ARE WORKING CLAIMS</text>'];
  STAGES.forEach((stage, i) => {
    const x0 = pad + stage.lo * fieldW, x1 = pad + stage.hi * fieldW;
    if(i) parts.push('<line x1="' + x0 + '" y1="' + fieldTop + '" x2="' + x0 + '" y2="' + fieldBottom +
      '" stroke="' + c.border + '"/>');
    parts.push('<text x="' + ((x0+x1)/2) + '" y="' + (fieldBottom+24) + '" text-anchor="middle" font-size="12"' +
      ' font-weight="700" letter-spacing="1.8" fill="' + c.muted + '">' + stage.name.toUpperCase() + '</text>');
  });
  parts.push('<line x1="72" y1="' + fieldBottom + '" x2="1848" y2="' + fieldBottom + '" stroke="' + c.border + '"/>');
  const spine = layout.spine.filter(Boolean), shown = spine.slice(0, 7);
  const rowGap = shown.length > 1 ? Math.min(88, (fieldBottom-fieldTop-90)/(shown.length-1)) : 0;
  const positions = shown.map((node,i)=>({node,x:xOf(node),y:fieldTop+46+i*rowGap}));
  for(let i=1;i<positions.length;i++){
    const a=positions[i-1],b=positions[i],bend=Math.min(60,(b.y-a.y)/2);
    parts.push('<path d="M '+a.x+' '+(a.y+35)+' C '+a.x+' '+(a.y+35+bend)+', '+b.x+' '+(b.y-35-bend)+', '+b.x+' '+(b.y-35)+
      '" fill="none" stroke="'+c.accent+'" stroke-width="2.5"/>');
  }
  positions.forEach(({node,x,y})=>{
    const cardW=260,cardX=Math.max(pad,Math.min(W-pad-cardW,x-cardW/2));
    const lines=wrapText(node.name,'650 19px '+SANS,cardW-32,measure).slice(0,2);
    const col=node.anchor?c.ink:ramp[Math.max(0,STAGES.findIndex(stage=>node.x>=stage.lo&&node.x<=stage.hi))%ramp.length];
    parts.push('<g data-spine-node="'+esc(node.id)+'"><rect x="'+cardX+'" y="'+(y-35)+'" width="'+cardW+
      '" height="70" fill="'+c.card+'" stroke="'+col+'" stroke-width="1.6"/><line data-authored-x="'+
      (node.x===null?'anchor':node.x)+'" x1="'+x+'" y1="'+(y-42)+'" x2="'+x+'" y2="'+(y-28)+
      '" stroke="'+col+'" stroke-width="2"/><text x="'+(cardX+14)+'" y="'+(y-14)+
      '" font-size="10" font-weight="700" fill="'+col+'">'+esc(node.id)+'</text>');
    lines.forEach((line,j)=>parts.push('<text x="'+(cardX+14)+'" y="'+(y+9+j*20)+'" font-size="19" font-weight="650" fill="'+c.ink+'">'+esc(line)+'</text>'));
    parts.push('</g>');
  });
  const componentSpine = shown.filter(node=>!node.anchor).length;
  const remainder = layout.allKeyEntries.length - componentSpine;
  parts.push('<line x1="72" y1="996" x2="1848" y2="996" stroke="'+c.border+'"/><text x="72" y="1034" font-size="16"' +
    ' font-weight="700" letter-spacing="1.4" fill="'+c.muted+'">SELECTION: DEEPEST DEPENDENCY SPINE, THEN IN-DEGREE · '+
    (remainder>0?remainder+' FURTHER COMPONENT'+(remainder===1?'':'S')+' IN FULL SVG':'COMPLETE MAP SHOWN')+'</text>');
  return '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080" font-family="'+SANS+'">'+parts.join('')+'</svg>';
}

export function renderMap(model, layout, ctx, opts = {}){
  const renderIntent = opts.intent || ctx.intent || (ctx.width && ctx.width < NARROW ? 'live-narrow' : 'native');
  if(renderIntent === 'presentation') return renderPresentation(model, layout, ctx);
  if(ctx.width && ctx.width < NARROW) return renderNarrow(model, layout, ctx, opts);
  const c = ctx.colors, measure = ctx.measure;
  const {w, pad} = layout;
  const pxLocal = x => pad + x * (w - 2 * pad);
  const ramp = ctx.palette || [c.accent, c.accent, c.accent, c.accent];
  /* ---- header ---- */
  const head = [];
  let headerH = 58;
  const comps = layout.nodes.filter(n => !n.anchor);
  const ghostN = comps.filter(n => n.ghost).length;
  head.push('<text x="' + pad + '" y="38" font-family="' + SERIF + '" font-size="24" font-weight="700" fill="' +
    c.ink + '">' + esc(model.title || 'Wardley map') + '</text>');
  /* date label wants an ISO string; other tools' ctx carries today as a day
     number — accept strings only, so a shared ctx can never crash the header */
  if(typeof ctx.today === 'string') head.push('<text x="' + (w - pad) +
    '" y="26" text-anchor="end" font-size="12" fill="' + c.muted + '">' + esc(ctx.today) + '</text>');
  head.push('<text x="' + pad + '" y="56" font-size="12.5" fill="' + c.muted + '">' +
    comps.length + ' component' + (comps.length === 1 ? '' : 's') + ' · ' +
    model.edges.length + ' dependenc' + (model.edges.length === 1 ? 'y' : 'ies') +
    (ghostN ? ' · ' + ghostN + ' unplaced' : '') + ' · evolution positions are working claims</text>');

  let compareInfo = null;
  if(opts.compare){
    compareInfo = compareParts(model, layout, {...opts.compare, measure}, c);
    head.push('<text x="' + pad + '" y="76" font-size="13" font-weight="600" fill="' + c.accent + '">' +
      esc(compareInfo.headline) + '</text>');
    headerH = 84;
  }

  /* ---- plane (translated below the header; layout coords are plane-local) ---- */
  const keyCols = 2;
  const keyRows = Math.ceil(layout.keyEntries.length / keyCols);
  const keyTop = layout.axisY + 44;
  const keyColumns = Array.from({length:keyCols}, (_, col) => layout.keyEntries.slice(col*keyRows,(col+1)*keyRows));
  const keyColumnH = column => column.reduce((sum, entry) => sum + Math.max(34, 16 + entry.lines.length * 15), 0);
  const keyH = keyRows ? 32 + Math.max(...keyColumns.map(keyColumnH)) : 0;
  let planeH = Math.max(layout.h + keyH, compareInfo ? compareInfo.maxY + 64 : 0);
  /* edit chrome only: the add-zones form one row below the LOWEST pill in the
     whole plane (collision nudges push bottom-row pills down, so a fixed
     y collides — User DB in the default example). Grow the plane to fit, only
     under edit → the no-edit goldens/exports stay byte-identical. */
  let zoneY = 0;
  if(opts.edit){
    let maxBottom = 40;
    for(const n of layout.nodes){
      if(n.anchor || n.x === null) continue;
      maxBottom = Math.max(maxBottom, n.y + PILL_H / 2);
    }
    /* edit+compare co-occur (editing with a snapshot selected): compare ghost
       pills sit at old positions, so the zone row must clear them too */
    if(compareInfo) maxBottom = Math.max(maxBottom, compareInfo.maxY + PILL_H / 2);
    zoneY = maxBottom + 26;
    planeH = Math.max(planeH, zoneY + 38);
  }
  const plane = [];
  const axisY = layout.axisY;
  /* The plane (Swiss 6c, Claude Design 37). The per-stage tinted washes are
     gone: four bands of colour behind coloured pills was the loudest treated
     surface left in the suite, and the mockup's plane is flat with hairline
     stage boundaries only. The stage names move from a top strip to BELOW the
     axis, centred under their own band, where they read as the evolution axis's
     own tick labels rather than as four zone headings. The value-chain axis is
     then named in-plane by VISIBLE ↑ / INVISIBLE at its two ends, which is what
     the old "↑ closer to the user need" caption was doing in sentence case.
     Letterspacing is ABSOLUTE px — an exported SVG has no CSS to resolve em. */
  const MICRO = 10, MICRO_TRACK = 1.8;
  const micro = (x, y, str, anchor) => '<text x="' + x + '" y="' + y + '" font-size="' + MICRO +
    '"' + (anchor ? ' text-anchor="' + anchor + '"' : '') + ' font-weight="700" letter-spacing="' +
    MICRO_TRACK + '" fill="' + c.muted + '">' + str + '</text>';
  STAGES.forEach((s, i) => {
    const x0 = pxLocal(s.lo), x1 = pxLocal(s.hi);
    if(i) plane.push('<line x1="' + x0 + '" y1="0" x2="' + x0 + '" y2="' + axisY +
      '" stroke="' + c.border + '" stroke-opacity=".6"/>');
    plane.push(micro((x0 + x1) / 2, axisY + 18, s.name.toUpperCase(), 'middle'));
  });
  plane.push('<line x1="' + pad + '" y1="' + axisY + '" x2="' + (w - pad) + '" y2="' + axisY +
    '" stroke="' + c.border + '"/>');
  plane.push(micro(pad, 14, 'VISIBLE ↑'));
  plane.push(micro(pad, axisY - 8, 'INVISIBLE'));

  /* edit chrome: one ghost add-zone per stage, in the row below every pill */
  if(opts.edit) STAGES.forEach(s => plane.push(addZonePill(s, c, measure, zoneY)));

  if(compareInfo) plane.push(...compareInfo.parts);

  for(const k of layout.links) plane.push(link(k, c));

  /* A loop is a local map condition, not merely a footer warning. */
  for(const loop of layout.loopCallouts){
    plane.push('<g data-loop-callout="' + loop.id + '"><circle cx="' + loop.x + '" cy="' + loop.y +
      '" r="11" fill="' + c.bg + '" stroke="' + c.err + '" stroke-width="1.5" stroke-dasharray="3 2"/>' +
      '<text x="' + loop.x + '" y="' + (loop.y + 3.5) + '" text-anchor="middle" font-size="8" font-weight="700" fill="' +
      c.err + '">' + loop.id + '</text><text x="' + (loop.x + 17) + '" y="' + (loop.y + 4) +
      '" font-size="9.5" font-weight="700" letter-spacing="1" fill="' + c.err + '">DEPENDENCY LOOP</text></g>');
  }

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
    if(opts.edit) plane.push(componentMenu(n, c, measure));
  }

  if(layout.keyEntries.length){
    const colW = (w - pad * 2 - 28) / keyCols;
    plane.push('<line x1="' + pad + '" y1="' + (keyTop - 20) + '" x2="' + (w - pad) + '" y2="' +
      (keyTop - 20) + '" stroke="' + c.border + '"/><text x="' + pad + '" y="' + keyTop +
      '" font-size="10" font-weight="700" letter-spacing="1.6" fill="' + c.muted + '">COMPONENT KEY · SOURCE ORDER</text>');
    keyColumns.forEach((column, col) => {
      const x = pad + col * (colW + 28); let y = keyTop + 30;
      column.forEach(entry => {
        plane.push('<text x="' + x + '" y="' + y + '" font-size="10" font-weight="700" fill="' + c.accent + '">' + esc(entry.id) + '</text>');
        entry.lines.forEach((line, i) => plane.push('<text x="' + (x + 42) + '" y="' + (y + i * 15) +
          '" font-size="12" font-weight="600" fill="' + c.ink + '">' + esc(line) + '</text>'));
        plane.push('<text x="' + (x + colW) + '" y="' + y + '" text-anchor="end" font-size="9.5" fill="' + c.muted + '">' +
          esc(entry.ghost ? 'UNPLACED' : stageOf(entry.x).name.toUpperCase()) + '</text>');
        y += Math.max(34, 16 + entry.lines.length * 15);
      });
    });
  }

  /* ---- readout band ---- */
  /* The map's verdict lives HERE, in the exported artefact — there is no second
     copy on the page. VERDICT kicker + one 24px display line with the single
     load-bearing figure in brand ink; the band's height follows the block, so a
     verdict that wraps pushes the flags down instead of colliding with them. */
  const r = mapReadout(model, layout);
  const read = [];
  const readTop = headerH + planeH + 10;
  read.push('<line x1="' + pad + '" y1="' + readTop + '" x2="' + (w - pad) + '" y2="' + readTop +
    '" stroke="' + c.border + '"/>');
  const vTop = readTop + 24;                 // baseline of the 10px VERDICT kicker
  const V = svgVerdict({x: pad, y: vTop, width: w - 2 * pad,
    line: r.verdict, fig: r.fig, ink: c.ink, muted: c.muted,
    brandText: c.brandText || c.ink, font: SANS_SQATTR, measure,
    edit: opts.edit ? {raw: model.verdict ?? ''} : undefined});
  read.push(V.svg);
  const flagsY0 = vTop + V.height - 6;
  r.flags.forEach((f, i) => {
    read.push('<text x="' + pad + '" y="' + (flagsY0 + i * 19) + '" font-size="12.5" fill="' +
      c.muted + '">' + esc(f) + '</text>');
  });
  const H = Math.round(vTop + V.height + r.flags.length * 19);

  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + H +
    '" viewBox="0 0 ' + w + ' ' + H + '" font-family="' + SANS + '">' +
    '<rect width="' + w + '" height="' + H + '" fill="' + c.bg + '"/>' +
    head.join('') +
    '<g transform="translate(0 ' + headerH + ')">' + plane.join('') + '</g>' +
    read.join('') + '</svg>';
}
