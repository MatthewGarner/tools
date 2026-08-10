/* /paths wide Tree SVG. Pure: consumes treeProjection + treeLayout output. */

import {esc, txt, wash} from '../assets/svg.js';
import {line, rect} from '../roadmap/deck-parts.js';

const SANS = "system-ui,-apple-system,'Segoe UI',sans-serif";
const TITLE_FONT = '600 14px ' + SANS;
const SMALL_FONT = '600 10px ' + SANS;

const r2 = value => (Math.round(Number(value) * 100) / 100).toString();

function at(source, path){
  let value = source;
  for(const part of path.split('.')) value = value?.[part];
  return typeof value === 'string' && value ? value : null;
}

function palette(colors){
  const pick = (fallback, ...paths) => paths.map(path => at(colors, path)).find(Boolean) || fallback;
  const ink = pick('currentColor', 'ink', 'text', 'fg');
  const muted = pick(ink, 'muted', 'secondary', 'subtle', 'ink');
  const bg = pick('none', 'bg', 'paper', 'canvas');
  const surface = pick(bg, 'panel', 'surface', 'card', 'paper', 'bg');
  const border = pick(muted, 'line', 'border', 'rule', 'muted', 'ink');
  const accent = pick(ink, 'accent', 'brand', 'ink');
  return {
    ink, muted, bg, surface, border, accent,
    yes:pick(accent, 'yes', 'positive', 'success', 'accent', 'brand', 'ink'),
    no:pick(accent, 'no', 'negative', 'danger', 'accent', 'brand', 'ink'),
    conditional:pick(accent, 'conditional', 'warning', 'accent', 'brand', 'ink'),
    risk:pick(accent, 'status.risk', 'risk', 'warning', 'accent', 'brand', 'ink'),
    blocked:pick(accent, 'status.blocked', 'blocked', 'danger', 'accent', 'brand', 'ink'),
  };
}

function safeMeasure(measure, value, font){
  const width = Number(measure(String(value ?? ''), font));
  return Number.isFinite(width) && width >= 0 ? width : String(value ?? '').length * 7;
}

function clipped(value, maxWidth, measure, font = SMALL_FONT){
  const source = String(value ?? '');
  if(safeMeasure(measure, source, font) <= maxWidth) return source;
  let out = source;
  while(out && safeMeasure(measure, out + '…', font) > maxWidth) out = out.slice(0, -1);
  return out ? out + '…' : '';
}

function wrapped(value, maxWidth, maxLines, measure){
  const words = String(value ?? '').trim().split(/\s+/).filter(Boolean);
  if(!words.length) return [];
  const lines = [];
  let current = '';
  for(const word of words){
    const trial = current ? current + ' ' + word : word;
    if(!current || safeMeasure(measure, trial, TITLE_FONT) <= maxWidth) current = trial;
    else {
      lines.push(current);
      current = word;
      if(lines.length === maxLines - 1) break;
    }
  }
  if(current && lines.length < maxLines) lines.push(current);
  const consumed = lines.join(' ').split(/\s+/).filter(Boolean).length;
  if(consumed < words.length && lines.length){
    lines[lines.length - 1] = clipped(lines.at(-1) + ' ' + words.slice(consumed).join(' '),
      maxWidth, measure, TITLE_FONT);
  }
  return lines;
}

/* The NAME, never the question. Preferring `question` made every diamond and
   every "Waiting for …" chip carry a whole sentence — the tree became a wall of
   wrapped prose. The question belongs in the inspector; the label is the short
   name the author chose. */
function decisionName(decision){
  return String(decision?.name ?? decision?.key ?? '');
}

/* Dates read as "15 Dec" in capsules and metadata (display dictionary); the raw
   ISO value is for the text, not the artefact. */
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function shortDate(iso){
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
  if(!match) return String(iso ?? '');
  return String(Number(match[3])) + ' ' + (MONTHS[Number(match[2]) - 1] || '');
}

function answerLabel(direction){
  return direction === 'no' ? 'Answer: no' : 'Answer: yes';
}

/* An overdue question said "Open" — the single most important thing this view
   has to tell you, silently absent. The engine already carries `overdue` and
   the day count on the decision; the label reads it rather than flattening
   every unanswered question to the same word. */
function questionState(question){
  const state = question?.displayState || {};
  if(state.kind === 'not-applicable') return 'No longer applies';
  if(state.kind === 'not-open') return 'Not open yet';
  if(state.kind === 'answered') return answerLabel(state.direction);
  if(state.kind === 'overdue'){
    const days = Number(state.days);
    return Number.isFinite(days) && days > 0
      ? days + (days === 1 ? ' day overdue' : ' days overdue')
      : 'Overdue';
  }
  return 'Open';
}

function decisionMap(projection){
  return new Map((projection.questions || []).map(question => [question.key, question.decision]));
}

function dependencyKey(value){
  if(typeof value === 'string') return value;
  return value?.key ?? value?.decisionKey ?? value?.decision?.key ?? null;
}

function dependencyName(value, decisions){
  if(value && typeof value === 'object'){
    const direct = decisionName(value.decision || value);
    if(direct) return direct;
  }
  return decisionName(decisions.get(dependencyKey(value)));
}




/* The engine already decided this. `itemState` plus `displayEvidence` ARE the
   contract (Stage 1 added the evidence reduction precisely so no renderer
   re-derives semantic precedence); this function is a lookup, not a judgement.
   It previously sniffed strings and walked the condition terms itself, which
   returned "conditional" for every limbo item — the assumed branch sat below a
   `pending` check that always won — so "Following an assumed yes" never
   rendered, and a not-needed stump never said "Not needed". */
function itemTreatment(item, decisions){
  const evidence = item?.displayEvidence || null;
  const named = key => decisionName(decisions.get(dependencyKey(key))) || String(key ?? '');
  switch(item?.itemState){
    case 'not-needed': return {kind:'ghost'};
    case 'limbo': return {kind:'assumed', direction:evidence?.direction === 'no' ? 'no' : 'yes'};
    case 'waiting': return {kind:'conditional',
      decision:named(evidence?.decision ?? item?.condition?.terms?.[0])};
    case 'in-plan': return {kind:'normal'};
    default: return {kind:'normal'};
  }
}

function treatmentLabel(treatment){
  if(treatment.kind === 'ghost') return 'Not needed';
  if(treatment.kind === 'conditional') return treatment.decision
    ? 'Waiting for ' + treatment.decision : 'Not open yet';
  if(treatment.kind === 'assumed') return treatment.direction === 'no'
    ? 'Following an assumed no' : 'Following an assumed yes';
  return 'Included';
}

function chip(x, y, label, maxWidth, colour, ink, measure){
  const text = clipped(label, Math.max(0, maxWidth - 14), measure);
  const width = Math.min(maxWidth, Math.max(38, safeMeasure(measure, text, SMALL_FONT) + 14));
  return {
    svg:rect(x, y, width, 16, wash(colour, '1F'), {stroke:colour, sw:1}) +
      txt(x + 7, y + 11.5, text, 9, ink, {weight:600}),
    w:width,
  };
}

function itemStatus(item){
  const status = String(item?.status ?? '').toLowerCase();
  if(status === 'risk') return {label:'RISK', key:'risk'};
  if(status === 'blocked') return {label:'BLOCKED', key:'blocked'};
  return null;
}

function renderItem(box, decisions, C, measure){
  const item = box.item || {};
  const treatment = itemTreatment(item, decisions);
  const stateText = treatmentLabel(treatment);
  const fill = treatment.kind === 'conditional' ? wash(C.conditional, '14')
    : treatment.kind === 'ghost' ? wash(C.muted, '0D')
    : treatment.kind === 'assumed' ? 'url(#tree-assumed-' + treatment.direction + ')'
    : C.surface;
  const stroke = treatment.kind === 'conditional' ? C.conditional
    : treatment.kind === 'ghost' ? C.muted : C.border;
  const dash = treatment.kind === 'conditional' ? '5 3' : treatment.kind === 'ghost' ? '2 3' : null;
  const opacity = treatment.kind === 'ghost' ? '0.68' : '1';
  let svg = '<g data-treatment="' + (treatment.kind === 'assumed' ? 'assumed-' + treatment.direction : treatment.kind) +
    '" opacity="' + opacity + '"><title>' + esc(String(item.title ?? '')) + '</title>';
  svg += rect(box.x, box.y, box.w, box.h, fill, {stroke, sw:treatment.kind === 'normal' ? 1 : 1.5, dash});

  const status = itemStatus(item);
  const titleWidth = box.w - 20 - (status ? 52 : 0);
  const titleLines = wrapped(item.title, titleWidth, 3, measure);
  titleLines.forEach((text, index) => {
    svg += txt(box.x + 10, box.y + 18 + index * 16, text, 13, C.ink, {weight:600});
  });

  if(status){
    const colour = C[status.key];
    const width = Math.min(48, safeMeasure(measure, status.label, SMALL_FONT) + 12);
    svg += rect(box.x + box.w - width - 7, box.y + 6, width, 14, wash(colour, '1F'),
      {stroke:colour, sw:1});
    svg += txt(box.x + box.w - width - 1, box.y + 16, status.label, 8, C.ink, {weight:700});
  }

  const stateY = Math.min(box.y + box.h - 9, box.y + 34 + Math.max(0, titleLines.length - 1) * 16);
  svg += txt(box.x + 10, stateY, stateText, 9,
    treatment.kind === 'conditional' ? C.conditional : C.muted, {weight:600});

  const lane = String(item.lane ?? '');
  if(lane) svg += txt(box.x + 10, box.y + box.h - 7, clipped(lane, box.w - 20, measure), 9, C.muted);

  const primary = item.parentDecision || item.condition?.terms?.[0];
  if(item.condition && primary){
    const name = dependencyName(primary, decisions);
    const label = name ? 'Depends on · ' + name : 'Depends on';
    const max = Math.min(box.w - 14, 112);
    const made = chip(box.x + box.w - max - 7, box.y + box.h - 19, label, max,
      C.conditional, C.ink, measure);
    svg += made.svg;
  }

  let secondary = item.secondaryDependencies || [];
  if(!secondary.length && item.condition?.terms?.length > 1){
    const primaryKey = dependencyKey(primary);
    secondary = item.condition.terms.filter(term => dependencyKey(term) !== primaryKey);
  }
  if(secondary.length){
    let x = box.x + 7;
    const y = box.y + box.h - (item.status ? 39 : 21);
    for(const dependency of secondary){
      const name = dependencyName(dependency, decisions);
      const label = name ? 'Also needs · ' + name : 'Also needs';
      const remaining = box.x + box.w - 7 - x;
      if(remaining < 38) break;
      const made = chip(x, y, label, remaining, C.accent, C.ink, measure);
      svg += made.svg;
      x += made.w + 5;
    }
  }
  return svg + '</g>';
}

function renderQuestion(entry, C, measure){
  const {diamond, question} = entry;
  const points = [
    [diamond.cx, diamond.y],
    [diamond.x + diamond.w, diamond.cy],
    [diamond.cx, diamond.y + diamond.h],
    [diamond.x, diamond.cy],
  ].map(point => point.map(r2).join(',')).join(' ');
  let svg = '<g data-kind="question"><title>' + esc(decisionName(question.decision)) +
    '</title><polygon points="' + points + '" fill="' + C.surface +
    '" stroke="' + C.ink + '" stroke-width="2"/>';
  const nameLines = wrapped(decisionName(question.decision), diamond.w - 38, 2, measure);
  const start = diamond.cy - (nameLines.length > 1 ? 20 : 12);
  nameLines.forEach((text, index) => {
    svg += txt(diamond.cx, start + index * 15, text, 11, C.ink, {weight:700, anchor:'middle'});
  });
  svg += txt(diamond.cx, diamond.cy + 23, questionState(question), 9, C.muted,
    {weight:600, anchor:'middle'});
  if(question.decision?.answerBy){
    svg += txt(diamond.cx, diamond.cy + 37, 'Due · ' + shortDate(question.decision.answerBy), 8,
      C.muted, {anchor:'middle'});
  }
  return svg + '</g>';
}

function armExtents(entry){
  const yes = [...entry.arms.yes, ...(entry.stump?.side === 'yes' ? [entry.stump] : [])];
  const no = [...entry.arms.no, ...(entry.stump?.side === 'no' ? [entry.stump] : [])];
  return {
    yes:yes.length ? Math.min(...yes.map(box => box.y)) : null,
    no:no.length ? Math.max(...no.map(box => box.y + box.h)) : null,
  };
}

function renderStump(box, C, measure){
  if(!box) return '';
  /* The stump must SAY what it is. A bare "+1" in a dashed box reads as a
     collapsed list, not as work this answer ruled out — and "Not needed" is the
     display word for it. Falls back to the count alone only when the box is too
     narrow to carry the phrase. */
  const count = Number(box.count ?? 0);
  const phrase = 'Not needed · ' + count;
  const fits = typeof measure === 'function' && measure(phrase, '700 12px ' + SANS) <= box.w - 12;
  return '<g data-kind="stump">' +
    rect(box.x, box.y, box.w, box.h, wash(C.muted, '12'), {stroke:C.muted, sw:1, dash:'4 3'}) +
    txt(box.x + box.w / 2, box.y + box.h / 2 + 4, fits ? phrase : '+' + count, 12, C.muted,
      {weight:700, anchor:'middle'}) + '</g>';
}

function renderBreadcrumb(box, C, measure){
  const label = clipped(decisionName(box.crumb?.decision), box.w - 16, measure);
  return '<g data-kind="breadcrumb">' +
    rect(box.x, box.y, box.w, box.h, wash(C.accent, '12'), {stroke:C.accent, sw:1}) +
    txt(box.x + 8, box.y + 11, label, 9, C.ink, {weight:600}) +
    txt(box.x + 8, box.y + 23, answerLabel(box.crumb?.direction), 8, C.muted, {weight:600}) +
    '</g>';
}

export function renderTree(projection, layout, ctx){
  const C = palette(ctx.colors || {});
  const measure = typeof ctx.measure === 'function' ? ctx.measure : value => String(value ?? '').length * 7;
  const width = Math.max(1, Math.ceil(layout.contentWidth || layout.width || 1));
  const height = Math.max(1, Math.ceil(layout.totalHeight || layout.height || 1));
  const decisions = decisionMap(projection);
  let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height +
    '" viewBox="0 0 ' + width + ' ' + height + '" data-theme="' + (ctx.dark ? 'dark' : 'light') + '">';
  svg += '<defs>' +
    '<pattern id="tree-assumed-yes" width="8" height="8" patternUnits="userSpaceOnUse">' +
      rect(0, 0, 8, 8, C.surface) +
      '<path d="M-2 8L8-2M2 10L10 2" fill="none" stroke="' + C.yes + '" stroke-width="1" opacity="0.35"/>' +
    '</pattern>' +
    '<pattern id="tree-assumed-no" width="8" height="8" patternUnits="userSpaceOnUse">' +
      rect(0, 0, 8, 8, C.surface) +
      '<path d="M-2 0L8 10M2-2L10 6" fill="none" stroke="' + C.no + '" stroke-width="1" opacity="0.35"/>' +
    '</pattern>' +
    '</defs>';
  svg += rect(0, 0, width, height, C.bg);

  if(layout.unplaced?.length){
    const top = Math.max(0, (layout.unplacedY || layout.unplaced[0].y) - 28);
    svg += '<g data-kind="unplaced">' + rect(0, top, width, height - top, wash(C.muted, '0A')) +
      line(0, top, width, top, C.border, 1) +
      txt(36, top + 18, 'Unplaced', 10, C.muted, {weight:700, tracking:1}) + '</g>';
  }

  svg += line(layout.spineRun.x1, layout.spineRun.y, layout.spineRun.x2, layout.spineRun.y, C.ink, 2);
  for(const entry of layout.questions || []){
    const extents = armExtents(entry);
    if(extents.yes != null) svg += line(entry.centerX, extents.yes, entry.centerX,
      entry.diamond.y, C.border, 1.5);
    if(extents.no != null) svg += line(entry.centerX, entry.diamond.y + entry.diamond.h,
      entry.centerX, extents.no, C.border, 1.5);
  }

  svg += '<g data-kind="today">' + rect(layout.today.x, layout.today.y, layout.today.w, layout.today.h,
    C.ink) + txt(layout.today.x + layout.today.w / 2, layout.today.y + 12, 'TODAY', 9, C.bg,
    {weight:700, tracking:1, anchor:'middle'});
  const today = String(ctx.today ?? projection.today ?? '');
  if(today) svg += txt(layout.today.x + layout.today.w / 2, layout.today.y + 24, today, 8, C.bg,
    {anchor:'middle'});
  svg += '</g>';

  for(const box of layout.spine || []) svg += renderItem(box, decisions, C, measure);
  for(const box of layout.breadcrumbs || []) svg += renderBreadcrumb(box, C, measure);
  for(const entry of layout.questions || []){
    for(const box of entry.arms.yes || []) svg += renderItem(box, decisions, C, measure);
    for(const box of entry.arms.no || []) svg += renderItem(box, decisions, C, measure);
    svg += renderStump(entry.stump, C, measure);
    svg += renderQuestion(entry, C, measure);
  }
  for(const box of layout.unplaced || []) svg += renderItem(box, decisions, C, measure);
  return svg + '</svg>';
}

/* NARROW OUTLINE (below a 520px container). Not a scaled tree — a genuine
   relayout, because panning a fork diagram on a phone hides the one thing the
   view exists to show. Same projection, same display words, stacked vertically:
   shared work, then each question as a heading with its state, its arms
   indented beneath it. Exports stay pinned to the wide artefact (house rule),
   so this never becomes a second artefact of its own. */
export function renderOutline(projection, ctx){
  const {measure, colors} = ctx;
  const C = palette(colors);
  const W = Math.max(280, Math.min(520, ctx.width || 360));
  const PAD = 14, ROW = 34, HEAD = 30;
  const decisions = decisionMap(projection);
  const rows = [];

  const push = (kind, text, note, indent) => rows.push({kind, text, note, indent});
  if(projection.breadcrumbs?.length)
    push('crumbs', projection.breadcrumbs.map(crumb =>
      decisionName(crumb.decision) + ' · ' + answerLabel(crumb.decision?.effectiveAnswer)).join('  ·  '), '', 0);
  if(projection.spine?.length){
    push('head', 'Shared work', '', 0);
    for(const item of projection.spine) push('item', item.title, 'Included', 1);
  }
  for(const question of projection.questions || []){
    push('head', decisionName(question.decision), questionState(question) +
      (question.decision?.answerBy ? ' · Due ' + shortDate(question.decision.answerBy) : ''), 0);
    const arm = (list, label) => {
      if(!list?.length) return;
      push('arm', label, '', 1);
      for(const item of list) push('item', item.title, treatmentLabel(itemTreatment(item, decisions)), 2);
    };
    arm(question.arms?.yes, 'If so');
    arm(question.arms?.no, 'If not');
    if(question.stump) push('item', 'Not needed · ' + (question.stump.count ?? 0), '', 1);
  }
  if(projection.unplaced?.length){
    push('head', 'Unplaced', '', 0);
    for(const item of projection.unplaced) push('item', item.title, 'Condition needs fixing', 1);
  }

  const height = PAD * 2 + rows.reduce((sum, row) => sum + (row.kind === 'head' ? HEAD : ROW), 0);
  let y = PAD, svg = '';
  for(const row of rows){
    const x = PAD + row.indent * 12;
    if(row.kind === 'head'){
      svg += txt(x, y + 18, clipped(row.text, W - x - PAD - 100, measure, TITLE_FONT), 13, C.ink, {weight:700});
      if(row.note) svg += txt(W - PAD, y + 18, clipped(row.note, 130, measure), 9, C.muted,
        {weight:600, anchor:'end'});
      y += HEAD;
      continue;
    }
    if(row.kind === 'crumbs' || row.kind === 'arm'){
      svg += txt(x, y + 16, clipped(row.text, W - x - PAD, measure), 9, C.muted, {weight:600});
      y += ROW - 8;
      continue;
    }
    svg += rect(x, y, W - x - PAD, ROW - 6, C.surface, {stroke:C.border, sw:1});
    svg += txt(x + 8, y + 14, clipped(row.text, W - x - PAD - 16, measure, TITLE_FONT), 12, C.ink, {weight:600});
    if(row.note) svg += txt(x + 8, y + 25, clipped(row.note, W - x - PAD - 16, measure), 9, C.muted, {weight:600});
    y += ROW;
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + r2(W) + '" height="' + r2(height) +
    '" viewBox="0 0 ' + r2(W) + ' ' + r2(height) + '" data-theme="' + (ctx.dark ? 'dark' : 'light') +
    '">' + rect(0, 0, W, height, C.bg) + svg + '</svg>';
}
