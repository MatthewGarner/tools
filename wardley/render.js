/* model + layout → map SVG string. Pure; colours from ctx only.
   Single-quoted font stacks (XML: no double quotes inside attributes). */
import {esc, tint} from '../assets/svg.js';
import {diffItems} from '../assets/snapshots.js';
import {STAGES, stageOf} from './parse.js';
import {layoutMap} from './layout.js';

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const SERIF = 'Charter,Georgia,serif';
export const GEOM = {w: 1200, h: 720, pad: 56};
const PILL_H = 26;
const EPSILON = 0.02;

const px = x => GEOM.pad + x * (GEOM.w - 2 * GEOM.pad);

function pill(n, c, measure, opts = {}){
  const w = measure(n.name, '600 12.5px ' + SANS) + 24;
  const x = n.px - w / 2, y = n.y - PILL_H / 2;
  const cls = opts.cls || '';
  const dash = n.ghost || opts.ghost ? ' stroke-dasharray="5 4"' : '';
  const fill = opts.ghost ? 'none' : n.ghost ? 'none' : opts.fill;
  const stroke = opts.ghost ? c.muted : n.ghost ? c.muted : opts.stroke;
  const textFill = opts.ghost || n.ghost ? c.muted : opts.text;
  const parts = [];
  parts.push('<g' + (cls ? ' class="' + cls + '"' : '') +
    (opts.drag ? ' data-drag="evo" data-name="' + esc(n.name) + '" data-line="' + n.srcLine + '"' : '') + '>');
  parts.push('<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + PILL_H +
    '" rx="' + PILL_H / 2 + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.5"' + dash +
    (opts.stageEdit ? ' data-edit="stage" data-line="' + n.srcLine + '" data-raw="' + esc(opts.stageRaw) + '"' : '') +
    '/>');
  parts.push('<text x="' + n.px + '" y="' + (n.y + 4.5) + '" text-anchor="middle" font-size="12.5"' +
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
  for(const mv of moved){
    const cur = layout.nodes.find(n => n.name === mv.item.name);
    const old = prevNode(mv.item.name);
    if(!cur || !old) continue;
    const dir = +mv.to > +mv.from ? 1 : -1;
    parts.push('<g class="drift-arrow"><line x1="' + old.px + '" y1="' + old.y + '" x2="' + cur.px +
      '" y2="' + cur.y + '" stroke="' + c.accent + '" stroke-width="1.5" stroke-dasharray="3 3"/>' +
      '<path d="M ' + cur.px + ' ' + cur.y + ' l ' + (-8 * dir) + ' -4 l 0 8 z" fill="' + c.accent + '"/></g>');
    parts.push(pill({...old, ghost: false}, c, compare.measure, {ghost: true, cls: 'ghost moved-ghost', fill: 'none'}));
  }
  for(const it of diff.dropped){
    const old = prevNode(it.name);
    if(old) parts.push(pill(old, c, compare.measure, {ghost: true, cls: 'ghost dropped-ghost', fill: 'none'}));
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
  return {parts, headline, added};
}

export function toMarkdown(model, layout, href){
  const out = ['# ' + (model.title || 'Wardley map'), ''];
  for(const s of STAGES){
    const names = layout.nodes
      .filter(n => !n.anchor && !n.ghost && n.x !== null && stageOf(n.x).name === s.name)
      .sort((a, b) => a.y - b.y || a.px - b.px)
      .map(n => n.name);
    if(names.length) out.push('- **' + s.name + '**: ' + names.join(' · '));
  }
  const ghosts = layout.nodes.filter(n => n.ghost).map(n => n.name);
  if(ghosts.length) out.push('- unplaced: ' + ghosts.join(' · '));
  out.push('', model.edges.length + ' dependencies · anchor' +
    (model.anchors.length === 1 ? '' : 's') + ': ' + model.anchors.map(a => a.name).join(', '));
  out.push('', '[live map](' + href + ')');
  return out.join('\n') + '\n';
}

export function renderMap(model, layout, ctx, opts = {}){
  const c = ctx.colors, measure = ctx.measure;
  const {w, h, pad} = GEOM;
  const parts = [];
  parts.push('<rect width="' + w + '" height="' + h + '" fill="' + c.bg + '"/>');

  /* title + optional compare headline */
  parts.push('<text x="' + pad + '" y="34" font-family="' + SERIF + '" font-size="22" font-weight="700" fill="' +
    c.ink + '">' + esc(model.title || 'Wardley map') + '</text>');

  let compareInfo = null;
  if(opts.compare){
    compareInfo = compareParts(model, layout, {...opts.compare, measure}, c);
    parts.push('<text x="' + pad + '" y="56" font-size="13" font-weight="600" fill="' + c.accent + '">' +
      esc(compareInfo.headline) + '</text>');
  }

  /* stage columns */
  const axisY = h - pad;
  for(const s of STAGES.slice(1)){
    parts.push('<line x1="' + px(s.lo) + '" y1="' + (pad + 14) + '" x2="' + px(s.lo) + '" y2="' + axisY +
      '" stroke="' + c.border + '" stroke-dasharray="2 4"/>');
  }
  parts.push('<line x1="' + pad + '" y1="' + axisY + '" x2="' + (w - pad) + '" y2="' + axisY +
    '" stroke="' + c.border + '"/>');
  STAGES.forEach((s, i) => {
    parts.push('<text x="' + px((s.lo + s.hi) / 2) + '" y="' + (axisY + 22) + '" text-anchor="middle"' +
      ' font-size="12" font-weight="600" letter-spacing=".04em" fill="' + (ctx.palette ? ctx.palette[i % ctx.palette.length] : c.muted) + '">' + s.name + '</text>');
  });
  parts.push('<text x="' + (w - pad) + '" y="' + (axisY + 40) + '" text-anchor="end" font-size="11" fill="' +
    c.muted + '">evolution →</text>');
  parts.push('<text x="' + pad + '" y="' + (axisY + 40) + '" font-size="11" fill="' + c.muted +
    '">↑ closer to the user need</text>');

  /* compare underlay (ghosts + arrows sit under live pills, over the grid) */
  if(compareInfo) parts.push(...compareInfo.parts);

  /* edges behind pills */
  for(const k of layout.links){
    parts.push('<line class="edge' + (k.dropped ? ' dropped' : '') + '" x1="' + k.x1 + '" y1="' + k.y1 +
      '" x2="' + k.x2 + '" y2="' + k.y2 + '" stroke="' + c.border + '" stroke-width="1.2"' +
      (k.dropped ? ' stroke-dasharray="3 4"' : '') + '/>');
  }

  /* pills: anchors outlined in ink; components stage-tinted capsules */
  for(const n of layout.nodes){
    if(n.anchor){
      parts.push(pill(n, c, measure, {fill: c.card, stroke: c.ink, text: c.ink,
        nameEdit: n.srcLine >= 0 ? 'anchor' : null, cls: 'anchor'}));
      continue;
    }
    const stage = n.x === null ? null : stageOf(n.x);
    const si = stage ? STAGES.indexOf(stage) : 0;
    const col = ctx.palette ? ctx.palette[si % ctx.palette.length] : c.accent;
    const stageRaw = n.stage || (n.x === null ? '' : String(n.x));
    parts.push(pill(n, c, measure, {fill: tint(col), stroke: col, text: col,
      drag: true, nameEdit: 'name', stageEdit: !n.ghost, stageRaw,
      newRing: compareInfo ? compareInfo.added.has(n.name) : false}));
  }

  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h +
    '" viewBox="0 0 ' + w + ' ' + h + '" font-family="' + SANS + '">' + parts.join('') + '</svg>';
}
