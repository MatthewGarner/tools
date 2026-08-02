/* model → cover-page SVG string. Pure; colours from ctx only.
   Single-quoted font stacks (XML: no double quotes inside attributes).
   Anatomy: Charter header + date + metrics · status tag (label, never
   colour-alone) · the QUESTION as standfirst · lane-grouped exhibit index
   (numbered rows, tool capsule pills, ghost for dead links) · verdict-led
   readout (authored only — a case never computes). Height follows content. */
import {esc, tint, wrapText} from '../assets/svg.js';
import {svgVerdict} from '../assets/verdict-svg.js';
import {resolveVerdict} from '../assets/verdict.js';

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const SERIF = "'Helvetica Neue',Helvetica,'Segoe UI',Roboto,sans-serif";
const SANS_SQATTR = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
export const GEOM = {w: 1200, pad: 56};
export const NARROW = 520;
const MICRO = 10, MICRO_TRACK = 1.8;

const micro = (x, y, str, fill, anchor) => '<text x="' + x + '" y="' + y +
  '" font-size="' + MICRO + '" font-weight="600" letter-spacing="' + MICRO_TRACK +
  '" fill="' + fill + '"' + (anchor ? ' text-anchor="' + anchor + '"' : '') + '>' +
  esc(str) + '</text>';

/* the honest tool line when no verdict is authored: status + the state of the kit */
export function caseReadout(model){
  const n = model.exhibits.length;
  const auto = {line: model.status.toUpperCase() + ' — ' + n + ' exhibit' + (n === 1 ? '' : 's') +
    ', no verdict yet', fig: String(n)};
  return resolveVerdict(model.verdict, auto);
}

function statusTag(model, c, measure, x, y, anchorEnd){
  const label = model.status.toUpperCase();
  const w = measure(label, '600 ' + MICRO + 'px ' + SANS) + label.length * MICRO_TRACK + 18;
  const lx = anchorEnd ? x - w : x;
  const decided = model.status === 'decided';
  const stroke = decided ? c.accent : c.border;
  const fill = decided ? tint(c.accent, c.bg, 0.12) : 'none';
  const text = decided ? c.accent : c.muted;
  return '<rect x="' + lx + '" y="' + (y - 14) + '" width="' + w + '" height="20" rx="0" fill="' +
    fill + '" stroke="' + stroke + '" stroke-width="1.2"/>' +
    micro(lx + 9, y, label, text);
}

function pillW(name, measure){
  return measure(name.toUpperCase(), '600 11px ' + SANS) + name.length * 1.2 + 20;
}

function toolPill(ex, c, measure, x, yMid){
  const name = (ex.tool || 'link').toUpperCase();
  const w = pillW(ex.tool || 'link', measure);
  const dash = ex.live ? '' : ' stroke-dasharray="5 4"';
  const stroke = ex.live ? c.accent : c.muted;
  const fill = ex.live ? tint(c.accent, c.bg, 0.10) : 'none';
  const text = ex.live ? c.accent : c.muted;
  return {w, svg: '<rect x="' + x + '" y="' + (yMid - 11) + '" width="' + w +
    '" height="22" rx="0" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.2"' + dash + '/>' +
    '<text x="' + (x + w / 2) + '" y="' + (yMid + 3.5) + '" text-anchor="middle" font-size="11"' +
    ' font-weight="600" letter-spacing="1.2" fill="' + text + '">' + esc(name) + '</text>'};
}

/* one exhibit row; returns {svg, h}. Wide layout: NN · pill · label — note. */
function row(ex, i, c, measure, geom, opts){
  const {x, width, labelX} = geom;
  const parts = [];
  const yMid = 15;
  const num = String(i + 1).padStart(2, '0');
  parts.push('<text x="' + x + '" y="' + (yMid + 4) + '" font-size="12" fill="' + c.muted + '">' + num + '</text>');
  const p = toolPill(ex, c, measure, x + 30, yMid);
  parts.push(p.svg);
  const lx = labelX;   // one shared column: the index reads as a register, not a ragged list
  const labelFill = ex.live ? c.ink : c.muted;
  parts.push('<text x="' + lx + '" y="' + (yMid + 5) + '" font-size="15" font-weight="600" fill="' + labelFill + '"' +
    (opts.edit ? ' data-edit="label" data-line="' + ex.srcLine + '" data-raw="' + esc(ex.label) +
      '" tabindex="0" role="button" aria-label="Rename exhibit: ' + esc(ex.label) + '"' : '') +
    '>' + esc(ex.label) + '</text>');
  let h = 30;
  if(ex.note){
    const noteLines = wrapText(ex.note, '12.5px ' + SANS, width - (lx - x), measure);
    let ny = yMid + 5;
    for(const t of noteLines){
      ny += 18;
      parts.push('<text x="' + lx + '" y="' + ny + '" font-size="12.5" fill="' + c.muted + '"' +
        (opts.edit && t === noteLines[0] ? ' data-edit="note" data-line="' + ex.srcLine + '" data-raw="' + esc(ex.note) +
          '" tabindex="0" role="button" aria-label="Edit note: ' + esc(ex.note) + '"' : '') +
        '>' + esc(t) + '</text>');
    }
    h = ny + 13;
  }
  /* live rows navigate — a real link, the case URL stays in the history */
  const body = (opts.live && ex.live)
    ? '<a href="' + esc(ex.url) + '">' + parts.join('') + '</a>'
    : parts.join('');
  return {svg: body, h};
}

export function render(model, ctx, opts = {}){
  if(ctx.width && ctx.width < NARROW) return renderNarrow(model, ctx, opts);
  const c = ctx.colors, measure = ctx.measure;
  const {w, pad} = GEOM;
  const inner = w - 2 * pad;
  const parts = [];
  let y = 38;

  /* ---- header ---- */
  parts.push('<text x="' + pad + '" y="' + y + '" font-family="' + SERIF + '" font-size="24" font-weight="700" fill="' +
    c.ink + '">' + esc(model.title || 'Case file') + '</text>');
  if(typeof ctx.today === 'string')
    parts.push('<text x="' + (w - pad) + '" y="26" text-anchor="end" font-size="12" fill="' + c.muted + '">' +
      esc(ctx.today) + '</text>');
  parts.push(statusTag(model, c, measure, w - pad, 48, true));
  const n = model.exhibits.length, ln = model.lanes.length;
  parts.push('<text x="' + pad + '" y="58" font-size="12.5" fill="' + c.muted + '">' +
    n + ' exhibit' + (n === 1 ? '' : 's') + (ln ? ' · ' + ln + ' lane' + (ln === 1 ? '' : 's') : '') +
    (model.exhibits.some(e => !e.live) ? ' · ' + model.exhibits.filter(e => !e.live).length + ' dead' : '') +
    '</text>');
  y = 84;

  /* ---- the question, as standfirst ---- */
  if(model.question){
    for(const t of wrapText(model.question, '17px ' + SANS, inner - 180, measure)){
      parts.push('<text x="' + pad + '" y="' + y + '" font-size="17" fill="' + c.ink + '"' +
        (opts.edit ? ' data-edit="question" data-line="' + (model.srcLines.question ?? -1) +
          '" data-raw="' + esc(model.question) + '" tabindex="0" role="button" aria-label="Edit the question"' : '') +
        '>' + esc(t) + '</text>');
      y += 26;
    }
    y += 6;
  }

  /* ---- exhibit index, grouped by lane ---- */
  parts.push('<line x1="' + pad + '" y1="' + y + '" x2="' + (w - pad) + '" y2="' + y +
    '" stroke="' + c.border + '"/>');
  y += 8;
  const groups = model.lanes.length
    ? model.lanes.map(l => [l, model.exhibits.filter(e => e.lane === l)])
      .concat(model.exhibits.some(e => !e.lane) ? [['', model.exhibits.filter(e => !e.lane)]] : [])
    : [['', model.exhibits]];
  let idx = 0;
  const maxPillW = model.exhibits.reduce((a, e) => Math.max(a, pillW(e.tool || 'link', measure)), 0);
  const labelX = pad + 30 + maxPillW + 16;
  for(const [lane, list] of groups){
    if(!list.length) continue;
    if(lane){
      y += 24;
      parts.push(micro(pad, y, lane.toUpperCase(), c.muted));
      y += 6;
    } else { y += 14; }
    for(const ex of list){
      const r = row(ex, idx++, c, measure, {x: pad, width: inner, labelX}, opts);
      parts.push('<g transform="translate(0 ' + y + ')">' + r.svg + '</g>');
      y += r.h;
    }
  }
  if(!model.exhibits.length){
    y += 26;
    parts.push('<text x="' + pad + '" y="' + y + '" font-size="13" fill="' + c.muted +
      '">No exhibits yet — paste a tool URL as “Label -&gt; url”.</text>');
    y += 8;
  }
  y += 16;

  /* ---- verdict band ---- */
  parts.push('<line x1="' + pad + '" y1="' + y + '" x2="' + (w - pad) + '" y2="' + y +
    '" stroke="' + c.border + '"/>');
  const av = caseReadout(model);
  const vTop = y + 24;
  const V = svgVerdict({x: pad, y: vTop, width: inner, line: av.line, fig: av.fig,
    ink: c.ink, muted: c.muted, brandText: c.brandText || c.ink,
    font: SANS_SQATTR, measure, size: 17,
    edit: opts.edit ? {raw: model.verdict ?? ''} : undefined,
    copyTap: opts.copyTap});
  parts.push(V.svg);
  y = vTop + Math.max(V.height - 23, 0) + 20;

  const H = Math.round(y);
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + H +
    '" viewBox="0 0 ' + w + ' ' + H + '" font-family="' + SANS + '">' +
    '<rect width="' + w + '" height="' + H + '" fill="' + c.bg + '"/>' + parts.join('') + '</svg>';
}

/* <520px: rows stack — pill above label, single column, tighter pad. */
export function renderNarrow(model, ctx, opts = {}){
  const c = ctx.colors, measure = ctx.measure;
  const w = Math.max(280, ctx.width), pad = 16;
  const inner = w - 2 * pad;
  const parts = [];
  let y = 30;
  parts.push('<text x="' + pad + '" y="' + y + '" font-family="' + SERIF + '" font-size="20" font-weight="700" fill="' +
    c.ink + '">' + esc(model.title || 'Case file') + '</text>');
  y += 22;
  parts.push(statusTag(model, c, measure, pad, y, false));
  const n = model.exhibits.length;
  parts.push('<text x="' + (pad + 90) + '" y="' + y + '" font-size="12" fill="' + c.muted + '">' +
    n + ' exhibit' + (n === 1 ? '' : 's') + '</text>');
  y += 24;
  if(model.question){
    for(const t of wrapText(model.question, '15px ' + SANS, inner, measure)){
      parts.push('<text x="' + pad + '" y="' + y + '" font-size="15" fill="' + c.ink + '">' + esc(t) + '</text>');
      y += 22;
    }
  }
  y += 4;
  parts.push('<line x1="' + pad + '" y1="' + y + '" x2="' + (w - pad) + '" y2="' + y + '" stroke="' + c.border + '"/>');
  let lastLane = null;
  let idx = 0;
  for(const ex of model.exhibits){
    if(ex.lane !== lastLane && ex.lane){
      y += 26;
      parts.push(micro(pad, y, ex.lane.toUpperCase(), c.muted));
      lastLane = ex.lane;
    }
    y += 18;
    const p = toolPill(ex, c, measure, pad, y + 6);
    parts.push('<text x="' + (pad + p.w + 10) + '" y="' + (y + 9) + '" font-size="12" fill="' + c.muted + '">' +
      String(++idx).padStart(2, '0') + '</text>');
    parts.push(p.svg);
    y += 30;
    const body = [];
    body.push('<text x="' + pad + '" y="' + y + '" font-size="15" font-weight="600" fill="' +
      (ex.live ? c.ink : c.muted) + '">' + esc(ex.label) + '</text>');
    if(ex.note){
      for(const t of wrapText(ex.note, '12.5px ' + SANS, inner, measure)){
        y += 18;
        body.push('<text x="' + pad + '" y="' + y + '" font-size="12.5" fill="' + c.muted + '">' + esc(t) + '</text>');
      }
    }
    parts.push((opts.live && ex.live) ? '<a href="' + esc(ex.url) + '">' + body.join('') + '</a>' : body.join(''));
    y += 8;
  }
  y += 16;
  parts.push('<line x1="' + pad + '" y1="' + y + '" x2="' + (w - pad) + '" y2="' + y + '" stroke="' + c.border + '"/>');
  const av = caseReadout(model);
  const V = svgVerdict({x: pad, y: y + 22, width: inner, line: av.line, fig: av.fig,
    ink: c.ink, muted: c.muted, brandText: c.brandText || c.ink,
    font: SANS_SQATTR, measure, size: 16, scale: 0.94});
  parts.push(V.svg);
  y = y + 22 + Math.max(V.height - 23, 0) + 18;
  const H = Math.round(y);
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + H +
    '" viewBox="0 0 ' + w + ' ' + H + '" font-family="' + SANS + '">' +
    '<rect width="' + w + '" height="' + H + '" fill="' + c.bg + '"/>' + parts.join('') + '</svg>';
}

/* the markdown rung of the export ladder: the doc travels with its links */
export function toMarkdown(model, href){
  const av = caseReadout(model);
  const out = ['# ' + (model.title || 'Case file'), ''];
  if(model.question) out.push(model.question, '');
  out.push('Status: ' + model.status + (av.line ? ' — ' + av.line : ''), '');
  const groups = model.lanes.length
    ? model.lanes.map(l => [l, model.exhibits.filter(e => e.lane === l)])
      .concat(model.exhibits.some(e => !e.lane) ? [['', model.exhibits.filter(e => !e.lane)]] : [])
    : [['', model.exhibits]];
  for(const [lane, list] of groups){
    if(!list.length) continue;
    if(lane) out.push('## ' + lane, '');
    for(const ex of list)
      out.push('- [' + ex.label + '](' + ex.url + ')' + (ex.note ? ' — ' + ex.note : '') +
        (ex.live ? '' : ' *(not a suite link)*'));
    out.push('');
  }
  if(href) out.push('[Open the case](' + href + ')');
  return out.join('\n');
}
