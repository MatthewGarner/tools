/* /paths wide Tree SVG. Pure: consumes treeProjection + treeLayout output. */

import {btnAttrs, esc, txt, wash, wrapText} from '../assets/svg.js';
import {svgVerdict} from '../assets/verdict-svg.js';
import {line, rect} from '../assets/svg-shapes.js';
import {SANS, SERIF, useFace} from './face.js';
import {legibleMuted} from '../assets/artefact-parts.js';
import {verdict} from './verdict.js';

/* fonts are read at call time (a face is chosen per render), so they are objects that stringify on use */
const TITLE_FONT = {toString: () => '600 13px ' + SANS};
const SMALL_FONT = {toString: () => '600 10px ' + SANS};
const NOTE_FONT = {toString: () => '10px ' + SANS};
const FRAME_PAD = 36;

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
    ink, muted: legibleMuted(muted, ink, bg, accent), bg, surface, border, accent,
    brandText:pick(accent, 'brandText', 'accentInk', 'accent', 'brand', 'ink'),
    yes:pick(accent, 'yes', 'positive', 'success', 'accent', 'brand', 'ink'),
    no:pick(accent, 'no', 'negative', 'danger', 'accent', 'brand', 'ink'),
    conditional:legibleMuted(pick(accent, 'conditional', 'warning', 'accent', 'brand', 'ink'), ink, bg, accent),
    done:pick(accent, 'status.done', 'done', 'success', 'accent', 'brand', 'ink'),
    doing:pick(accent, 'status.doing', 'doing', 'accent', 'brand', 'ink'),
    risk:legibleMuted(pick(accent, 'status.risk', 'risk', 'warning', 'accent', 'brand', 'ink'), ink, bg, accent),
    blocked:pick(accent, 'status.blocked', 'blocked', 'danger', 'accent', 'brand', 'ink'),
  };
}

/* One vocabulary (PA-6/PA-7): "plans" are distinct plans, as the Plans view counts them; the raw
   number of yes/no assignments is "combinations of answers". */
function planCountLabel(source){
  const count = Number(source.planCount ?? source.possibleCount);
  return Number.isFinite(count) ? count + ' possible ' + (count === 1 ? 'plan' : 'plans') : 'Possible plans are not counted';
}
function combinationsLabel(source){
  const count = Number(source.possibleCount);
  return Number.isFinite(count) ? count + ' combinations of answers' : 'Combinations of answers exceed the limit';
}

function artifactData(tree, ctx){
  const model = ctx.projection || {};
  const questions = Array.isArray(model.decisions) ? model.decisions.length : (tree.questions || []).length;
  const items = Array.isArray(model.items)
    ? model.items.length
    : (tree.spine || []).length + (tree.unplaced || []).length + (tree.questions || [])
      .reduce((sum, question) => sum + (question.arms?.yes?.length || 0) +
        (question.arms?.no?.length || 0) + (question.continuation?.length || 0) +
        (question.stump?.items?.length || 0), 0);
  /* distinct plans, as every other surface counts them (PA-6) */
  const possible = model.worlds?.refused ? null
    : Array.isArray(model.worlds?.plans) ? model.worlds.plans.length : model.worlds?.possibleCount;
  const counts = [
    questions + ' ' + (questions === 1 ? 'question' : 'questions'),
    items + ' ' + (items === 1 ? 'item' : 'items'),
    ...(Number.isFinite(possible)
      ? [possible + ' possible ' + (possible === 1 ? 'plan' : 'plans')] : []),
  ];
  const date = model.dateStr === 'off' ? '' : String(model.dateStr || model.today || ctx.today || '');
  const readout = verdict(model);
  const decisionSummary = (tree.questions || []).map(question =>
    decisionName(question.decision) + ': ' + questionState(question)).join('; ');
  const projectedItems = Array.isArray(model.items) ? model.items : [];
  const states = [
    ['included', projectedItems.filter(item => item.itemState === 'in-plan').length],
    ['waiting', projectedItems.filter(item => item.itemState === 'waiting').length],
    ['following assumptions', projectedItems.filter(item => item.itemState === 'limbo').length],
    ['set aside by assumptions', projectedItems.filter(item => item.itemState === 'set-aside').length],
    ['not needed', projectedItems.filter(item => item.itemState === 'not-needed').length],
  ].filter(([, count]) => count).map(([label, count]) => count + ' ' + label).join(', ');
  const terminal = tree.terminal ? tree.terminal.kind === 'limit'
    ? 'Tree boundary: enumeration limit reached; ' + combinationsLabel(tree.terminal)
    : 'Tree boundary: ' + planCountLabel(tree.terminal) + ' remain' : '';
  return {model, title:String(model.title || 'Untitled paths'), date, counts,
    decisionSummary, workSummary:states, terminal, readout:readout || {line:'', fig:''}};
}

function accessibleText(data){
  const segments = [data.date ? 'Dated ' + data.date : '', data.counts.join(', '),
    data.decisionSummary ? 'Questions: ' + data.decisionSummary : '',
    data.workSummary ? 'Work: ' + data.workSummary : '', data.terminal,
    data.terminal ? 'Tree does not enumerate every combined plan' : '',
    data.readout.line ? 'Verdict: ' + data.readout.line : ''].filter(Boolean)
    .map(segment => segment.replace(/\.+$/, ''));
  return segments.join('. ') + '.';
}

function accessibleHead(data, kind){
  const name = data.title + (kind === 'outline' ? ' — outline' : ' — decision tree');
  return '<title id="paths-tree-name">' + esc(name) + '</title>' +
    '<desc id="paths-tree-description">' + esc(accessibleText(data)) + '</desc>';
}

function wideFrame(data, width, C, measure){
  const sameLine = width >= 520;
  const titleWidth = Math.max(80, width - FRAME_PAD * 2 - (sameLine && data.date ? 180 : 0));
  const titleLines = wrapped(data.title, titleWidth, 4, measure, '700 24px ' + SERIF);
  let y = 38;
  const parts = ['<g data-kind="artifact-header">'];
  for(const titleLine of titleLines){
    parts.push('<text x="' + FRAME_PAD + '" y="' + y + '" font-family="' + SERIF +
      '" font-size="24" font-weight="700" fill="' + C.ink + '">' + esc(titleLine) + '</text>');
    y += 28;
  }
  if(data.date){
    const dateY = sameLine ? 38 : y;
    parts.push('<text data-kind="artifact-date" x="' + (width - FRAME_PAD) + '" y="' + dateY +
      '" text-anchor="end" font-size="11" fill="' + C.muted + '">' + esc(data.date) + '</text>');
    if(!sameLine) y += 18;
  }
  const height = y + 4;
  parts.push(line(FRAME_PAD, height - 1, width - FRAME_PAD, height - 1, C.border, 1), '</g>');
  return {svg:parts.join(''), height};
}

function wideRegions(layout, C){
  const out = [];
  if(layout.spine?.length){
    const x = Math.max(0, layout.spine[0].x - 10);
    const end = layout.spine.at(-1).x + layout.spine.at(-1).w + 10;
    out.push('<g data-kind="tree-region" data-region="shared-work">' +
      rect(x, 0, end - x, layout.totalHeight, wash(C.accent, '08')) +
      txt(x + 8, 17, 'SHARED WORK · IN EVERY PLAN', 8, C.muted, {weight:700, tracking:1}) + '</g>');
  }
  const pathEntries = [...(layout.breadcrumbs || []), ...(layout.questions || [])];
  if(pathEntries.length){
    const xs = pathEntries.flatMap(entry => [entry.x,
      ...(entry.arms?.yes || []).map(box => box.x), ...(entry.arms?.no || []).map(box => box.x)]);
    const x = Math.max(0, Math.min(...xs) - 10);
    const end = layout.terminal
      ? layout.terminal.x + layout.terminal.w
      : Math.max(...pathEntries.map(entry => entry.x + entry.w));
    out.push('<g data-kind="tree-region" data-region="question-paths">' +
      rect(x, 0, Math.max(1, Math.min(end + 10, layout.contentWidth - FRAME_PAD) - x), layout.totalHeight, wash(C.conditional, '08')) +
      txt(x + 8, 17, 'QUESTION PATHS · CHANGES WITH ANSWERS', 8, C.muted,
        {weight:700, tracking:1}) + '</g>');
  }
  return out.join('');
}

function safeMeasure(measure, value, font){
  const width = Number(measure(String(value ?? ''), font));
  return Number.isFinite(width) && width >= 0 ? width : String(value ?? '').length * 7;
}

function clipped(value, maxWidth, measure, font = SMALL_FONT){
  const source = String(value ?? '');
  if(safeMeasure(measure, source, font) <= maxWidth) return source;
  const words = source.split(' ');
  while(words.length > 1 && safeMeasure(measure, words.join(' ') + '…', font) > maxWidth) words.pop();
  let out = words.join(' ');
  while(out && safeMeasure(measure, out + '…', font) > maxWidth) out = out.slice(0, -1);
  return out ? out.replace(/[\s,.;:]+$/, '') + '…' : '';
}

function wrapped(value, maxWidth, maxLines, measure, font = TITLE_FONT){
  const words = String(value ?? '').trim().split(/\s+/).filter(Boolean);
  if(!words.length) return [];
  const lines = [];
  let current = '';
  for(const word of words){
    const trial = current ? current + ' ' + word : word;
    if(!current){
      current = safeMeasure(measure, word, font) <= maxWidth
        ? word : clipped(word, maxWidth, measure, font);
    } else if(safeMeasure(measure, trial, font) <= maxWidth) current = trial;
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
      maxWidth, measure, font);
  }
  return lines;
}

function boundedTokens(value, maxWidth, measure, font){
  return String(value ?? '').split(/(\s+)/).map(token => /^\s+$/.test(token) ||
    safeMeasure(measure, token, font) <= maxWidth ? token : clipped(token, maxWidth, measure, font)).join('');
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

function decisionTargetAttrs(decision, state, ctx){
  if(!ctx?.interactive || !decision) return '';
  const selected = ctx.selectedKey === decision.key;
  return ' data-select-decision="" data-decision-key="' + esc(decision.key) +
    '" data-line="' + decision.srcLine + '" data-selected="' + selected +
    '" aria-expanded="' + selected + '" aria-controls="decision-inspector"' +
    btnAttrs('Inspect question ' + decisionName(decision) + ' — ' + state);
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
  switch(evidence?.kind){
    case 'condition-error': return {kind:'invalid'};
    case 'completed': return {kind:'completed'};
    case 'assumption': return {kind:'assumed', direction:evidence.direction === 'no' ? 'no' : 'yes'};
    case 'set-aside': return {kind:'set-aside', direction:evidence.direction === 'no' ? 'no' : 'yes'};
    case 'pending-answer': return {kind:'conditional', decision:named(evidence.decision)};
    case 'host-exclusion': return {kind:'ghost'};
    case 'unconditional':
    case 'written-answer':
    case 'assigned-answer':
      return item?.itemState === 'not-needed' ? {kind:'ghost'} : {kind:'normal'};
    default:
      return item?.itemState === 'not-needed' ? {kind:'ghost'} : {kind:'normal'};
  }
}

function treatmentLabel(treatment){
  if(treatment.kind === 'invalid') return 'Condition needs fixing';
  if(treatment.kind === 'completed') return 'Completed';
  if(treatment.kind === 'ghost') return 'Not needed';
  if(treatment.kind === 'conditional') return treatment.decision
    ? 'Waiting for ' + treatment.decision : 'Not open yet';
  if(treatment.kind === 'assumed') return treatment.direction === 'no'
    ? 'Following an assumed no' : 'Following an assumed yes';
  if(treatment.kind === 'set-aside') return treatment.direction === 'no'
    ? 'Set aside on an assumed no' : 'Set aside on an assumed yes';
  return 'Included';
}

function chip(x, y, label, maxWidth, colour, ink, measure, kind = 'dependency'){
  const text = clipped(label, Math.max(0, maxWidth - 14), measure);
  const width = Math.min(maxWidth, Math.max(38, safeMeasure(measure, text, SMALL_FONT) + 14));
  return {
    svg:'<g data-kind="' + kind + '"><title>' + esc(label) + '</title>' +
      rect(x, y, width, 16, wash(colour, '1F'), {stroke:colour, sw:1}) +
      txt(x + 7, y + 11.5, text, 9, ink, {weight:600}) + '</g>',
    w:width,
  };
}

function itemStatus(item){
  const status = String(item?.status ?? '').toLowerCase();
  if(status === 'done') return {label:'DONE', key:'done'};
  if(status === 'doing') return {label:'DOING', key:'doing'};
  if(status === 'risk') return {label:'RISK', key:'risk'};
  if(status === 'blocked') return {label:'BLOCKED', key:'blocked'};
  return null;
}

function renderItem(box, decisions, C, measure){
  const item = box.item || {};
  const treatment = itemTreatment(item, decisions);
  const stateText = treatmentLabel(treatment);
  const fill = treatment.kind === 'conditional' ? wash(C.conditional, '14')
    : treatment.kind === 'invalid' ? wash(C.conditional, '14')
    : treatment.kind === 'ghost' || treatment.kind === 'set-aside' ? wash(C.muted, '0D')
    : treatment.kind === 'assumed' ? 'url(#tree-assumed-' + treatment.direction + ')'
    : C.surface;
  const stroke = treatment.kind === 'conditional' ? C.conditional
    : treatment.kind === 'invalid' ? C.conditional
    : treatment.kind === 'ghost' || treatment.kind === 'set-aside' ? C.muted : C.border;
  const dash = treatment.kind === 'conditional' ? '5 3'
    : treatment.kind === 'invalid' ? '2 2' : treatment.kind === 'ghost' || treatment.kind === 'set-aside' ? '2 3' : null;
  const opacity = treatment.kind === 'ghost' || treatment.kind === 'set-aside' ? '0.68' : '1';
  let svg = '<g data-kind="item" data-treatment="' + (treatment.kind === 'assumed' || treatment.kind === 'set-aside' ? treatment.kind + '-' + treatment.direction : treatment.kind) +
    '" opacity="' + opacity + '"><title>' + esc(String(item.title ?? '')) + '</title>';
  svg += rect(box.x, box.y, box.w, box.h, fill, {stroke, sw:treatment.kind === 'normal' ? 1 : 1.5, dash});

  const card = box.card || {inner:box.w - 24, rows:{title:{y:8, h:16, lines:1}, state:{y:30, h:12}}};
  const rows = card.rows;
  const left = box.x + 12;
  const status = itemStatus(item);
  if(rows.meta){
    if(rows.meta.lane){
      svg += txt(left + rows.meta.lane.x, box.y + rows.meta.y + 10,
        clipped(item.lane, rows.meta.lane.w, measure, SMALL_FONT), 9, C.muted,
        {weight:600, tracking:0.35});
    }
    if(status && rows.meta.status){
      const colour = C[status.key];
      const x = left + rows.meta.status.x;
      svg += rect(x, box.y + rows.meta.y, rows.meta.status.w, rows.meta.h,
        wash(colour, '1F'), {stroke:colour, sw:1});
      svg += txt(x + rows.meta.status.w / 2, box.y + rows.meta.y + 10, status.label, 8,
        C.ink, {weight:700, anchor:'middle'});
    }
  }

  const titleLines = wrapped(item.title, card.inner, rows.title?.lines || 3, measure);
  titleLines.forEach((text, index) => {
    svg += txt(left, box.y + rows.title.y + 12 + index * 16, text, 13, C.ink, {weight:600});
  });

  svg += txt(left, box.y + rows.state.y + 9, stateText, 9,
    treatment.kind === 'conditional' || treatment.kind === 'invalid' ? C.conditional : C.muted, {weight:600});

  if(rows.note){
    const noteLines = wrapped(item.note, card.inner, rows.note.lines || 2, measure, NOTE_FONT);
    svg += '<g><title>' + esc(String(item.note)) + '</title>';   // the whole note stays in the SVG when it is cut
    noteLines.forEach((text, index) => {
      svg += txt(left, box.y + rows.note.y + 10 + index * 14, text, 10, C.muted);
    });
    svg += '</g>';
  }

  const primary = item.parentDecision;
  if(primary && rows.primary){
    const name = dependencyName(primary, decisions);
    const label = name ? 'Needs · ' + name : 'Needs a decision';
    const made = chip(left, box.y + rows.primary.y, label, card.inner,
      C.conditional, C.ink, measure, 'primary-dependency');
    svg += made.svg;
  }

  const secondary = item.secondaryDependencyMode === 'required'
    ? item.secondaryDependencies || [] : [];
  if(secondary.length && rows.secondary){
    for(const [index, dependency] of secondary.entries()){
      const name = dependencyName(dependency, decisions);
      const label = name ? 'Also · ' + name : 'Also needs a decision';
      const row = rows.secondary[index];
      if(!row) break;
      const made = chip(left, box.y + row.y, label, card.inner, C.accent, C.ink,
        measure, 'secondary-dependency');
      svg += made.svg;
    }
  }
  return svg + '</g>';
}

function renderQuestion(entry, C, measure, ctx){
  const {diamond, question} = entry;
  const points = [
    [diamond.cx, diamond.y],
    [diamond.x + diamond.w, diamond.cy],
    [diamond.cx, diamond.y + diamond.h],
    [diamond.x, diamond.cy],
  ].map(point => point.map(r2).join(',')).join(' ');
  let svg = '<g data-kind="question"' + decisionTargetAttrs(question.decision,
    questionState(question), ctx) + '><title>' + esc(decisionName(question.decision)) +
    '</title><polygon points="' + points + '" fill="' + C.surface +
    '" stroke="' + C.ink + '" stroke-width="2"/>';
  /* A diamond is only as wide as its height allows: a line at distance d from the centre has w * (1 - d / (h / 2)) to live in.
     Lines are set top to bottom as one block centred on the diamond, each wrapped or clipped to the room at its own height. */
  const room = (baseline, size) => {
    const d = Math.max(Math.abs(baseline - size * 0.8), Math.abs(baseline + size * 0.25));
    return Math.max(24, diamond.w * (1 - d / (diamond.h / 2)) - 10);
  };
  const due = question.decision?.answerBy ? 'Due · ' + shortDate(question.decision.answerBy) : '';
  const state = questionState(question);
  const nameFull = decisionName(question.decision);
  const widest = size => room(0, size);
  const nameLines = wrapped(nameFull, widest(11) - 6, 2, measure, {toString: () => '700 11px ' + SANS});
  const block = nameLines.length * 14 + 14 + (due ? 12 : 0);
  let ty = diamond.cy - block / 2;
  const put = (text, size, weight, fill, lead) => {
    const base = ty + size;
    const fitted = clipped(text, room(base - diamond.cy, size), measure, {toString: () => weight + ' ' + size + 'px ' + SANS});
    svg += txt(diamond.cx, base, fitted, size, fill, {weight, anchor:'middle'});
    ty += lead;
  };
  for(const text of nameLines) put(text, 11, 700, C.ink, 14);
  put(state, 9, 600, C.muted, 14);
  if(due) put(due, 8, 400, C.muted, 12);
  return svg + '</g>';
}

function renderArmLabels(entry, C){
  return (entry.armLabels || []).map(label => txt(label.x, label.y, label.text, 8, C.muted,
    {weight:700, tracking:0.5, anchor:label.anchor || 'start'})).join('');
}

function renderTerminal(box, C){
  if(!box) return '';
  const source = box.source || {};
  const count = Number(source.planCount ?? source.possibleCount);
  const countLabel = source.kind === 'limit' ? combinationsLabel(source) : planCountLabel(source);
  const headline = source.kind === 'limit' ? 'Enumeration limit reached'
    : countLabel + (count === 1 ? ' remains' : ' remain');
  const detail = source.kind === 'limit' ? countLabel : 'After the open decisions';
  return '<g data-kind="tree-terminal" data-state="' + (source.kind === 'limit' ? 'limit' : 'count') + '">' +
    rect(box.x, box.y, box.w, box.h, wash(C.accent, '0D'), {stroke:C.border, sw:1}) +
    line(box.x, box.y, box.x, box.y + box.h, C.accent, 3) +
    '<circle cx="' + r2(box.x) + '" cy="' + r2(box.cy) + '" r="4" fill="' + C.accent + '"/>' +
    txt(box.x + 14, box.y + 17, 'TREE BOUNDARY', 8, C.muted, {weight:700, tracking:1}) +
    txt(box.x + 14, box.y + 36, headline, 12, C.ink, {weight:700}) +
    txt(box.x + 14, box.y + 51, detail, 9, C.muted, {weight:600}) +
    txt(box.x + 14, box.y + 67, 'Tree does not enumerate', 9, C.muted) +
    txt(box.x + 14, box.y + 80, 'every combined plan', 9, C.muted) +
    '</g>';
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
  let svg = '<g data-kind="stump">' +
    rect(box.x, box.y, box.w, box.h, wash(C.muted, '12'), {stroke:C.muted, sw:1, dash:'4 3'}) +
    txt(box.x + box.w / 2, box.y + 16, fits ? phrase : '+' + count, 11, C.muted,
      {weight:700, anchor:'middle'});
  for(const [index, item] of (box.items || []).entries()){
    svg += txt(box.x + 8, box.y + 32 + index * 16,
      clipped(item.title, box.w - 16, measure, SMALL_FONT), 9, C.muted, {weight:600});
  }
  return svg + '</g>';
}

function renderBreadcrumb(box, C, measure, ctx){
  const label = clipped(decisionName(box.crumb?.decision), box.w - 16, measure);
  const branch = box.crumb?.direction === 'no' ? 'No · If not' : 'Yes · If so';
  const interactiveHit = ctx?.interactive
    ? '<rect data-hit="" x="' + r2(box.x) + '" y="' + r2(box.y - Math.max(0, 44 - box.h) / 2) +
      '" width="' + r2(box.w) + '" height="' + r2(Math.max(44, box.h)) + '" fill="transparent"/>'
    : '';
  return '<g data-kind="breadcrumb"' + decisionTargetAttrs(box.crumb?.decision,
    answerLabel(box.crumb?.direction), ctx) + '>' + interactiveHit +
    rect(box.x, box.y, box.w, box.h, wash(C.accent, '12'), {stroke:C.accent, sw:1}) +
    txt(box.x + 8, box.y + 11, label, 9, C.ink, {weight:600}) +
    txt(box.x + 8, box.y + 23, branch, 8, C.muted, {weight:600}) +
    '</g>';
}

function renderCollapsedArmLabel(box, C){
  const side = box.crumb?.direction === 'yes' ? 'no' : 'yes';
  if(!(box.arms?.[side]?.length || box.stump?.side === side)) return '';
  const y = side === 'yes' ? box.y - 9 : box.y + box.h + 15;
  return txt(box.centerX + 8, y, side === 'yes' ? 'If so' : 'If not', 8, C.muted,
    {weight:700, tracking:0.5, anchor:'start'});
}

/* The pieces of a branch connector: from the decision to the nearest card on its side, then across each gap between cards.
   A card is opaque ink on paper; a rule never runs through one. */
export function connectorSegments(entry, connector){
  const node = entry.diamond || entry;
  const boxes = [...(entry.arms?.[connector.side] || []),
    ...(entry.stump && entry.stump.side === connector.side ? [entry.stump] : [])]
    .map(box => ({top:box.y, bottom:box.y + box.h}));
  const out = [];
  if(connector.side === 'yes'){
    let from = node.y;
    for(const box of boxes.sort((a, b) => b.bottom - a.bottom)){ if(from > box.bottom) out.push([box.bottom, from]); from = box.top; }
  } else {
    let from = node.y + node.h;
    for(const box of boxes.sort((a, b) => a.top - b.top)){ if(box.top > from) out.push([from, box.top]); from = box.bottom; }
  }
  return out;
}

export function renderTree(projection, layout, ctx){
  useFace(ctx);
  const C = palette(ctx.colors || {});
  const measure = typeof ctx.measure === 'function' ? ctx.measure : value => String(value ?? '').length * 7;
  const width = Math.max(1, Math.ceil(layout.contentWidth || layout.width || 1));
  const bodyHeight = Math.max(1, Math.ceil(layout.totalHeight || layout.height || 1));
  const data = artifactData(projection, ctx);
  const frame = wideFrame(data, width, C, measure);
  const bodyY = frame.height;
  const readoutY = bodyY + bodyHeight + 28;
  const readoutLine = boundedTokens(data.readout.line, Math.min(width - FRAME_PAD * 2, 820),
    measure, '700 22px ' + SANS);
  const readout = svgVerdict({x:FRAME_PAD, y:readoutY, width:width - FRAME_PAD * 2,
    line:readoutLine, fig:data.readout.fig, ink:C.ink, muted:C.muted,
    brandText:C.brandText, font:SANS, measure, size:22});
  const height = Math.max(1, Math.ceil(readoutY + readout.height + (readout.height ? 4 : 0)));
  const decisions = decisionMap(projection);
  let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height +
    '" viewBox="0 0 ' + width + ' ' + height + '" data-theme="' + (ctx.dark ? 'dark' : 'light') +
    '" font-family="' + SANS + '" role="' + (ctx.interactive ? 'group' : 'img') +
    '" aria-labelledby="paths-tree-name paths-tree-description">';
  svg += accessibleHead(data, 'tree');
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
  svg += frame.svg;
  svg += '<g data-kind="tree-body" transform="translate(0 ' + bodyY + ')">';
  svg += wideRegions(layout, C);

  if(layout.unplaced?.length){
    const top = Math.max(0, (layout.unplacedY || layout.unplaced[0].y) - 28);
    /* inset to the frame's margin: a panel that bleeds to the canvas edge leaves no margin there */
    svg += '<g data-kind="unplaced">' + rect(FRAME_PAD, top, Math.max(0, width - FRAME_PAD * 2), Math.max(0, bodyHeight - top), wash(C.muted, '0A')) +
      line(FRAME_PAD, top, width - FRAME_PAD, top, C.border, 1) +
      txt(FRAME_PAD + 12, top + 18, 'Unplaced', 10, C.muted, {weight:700, tracking:1}) + '</g>';
  }

  /* the axis runs between the cards and decisions on it, not under their text */
  const onAxis = [...(layout.spine || []), ...(layout.continuations || []), ...(layout.breadcrumbs || []),
    ...(layout.questions || []).flatMap(entry => [entry.diamond, ...(entry.continuation || [])])].filter(Boolean)
    .map(box => [box.x, box.x + box.w]).sort((a, b) => a[0] - b[0]);
  let from = layout.spineRun.x1;
  for(const [a, b] of onAxis){
    if(a > from) svg += line(from, layout.spineRun.y, a, layout.spineRun.y, C.ink, 2);
    from = Math.max(from, b);
  }
  if(layout.spineRun.x2 > from) svg += line(from, layout.spineRun.y, layout.spineRun.x2, layout.spineRun.y, C.ink, 2);
  for(const entry of [...(layout.questions || []), ...(layout.breadcrumbs || [])]){
    for(const connector of Object.values(entry.connectors || {})){
      if(connector) for(const [y1, y2] of connectorSegments(entry, connector))
        svg += line(connector.x, y1, connector.x, y2, C.border, 1.5);
    }
  }

  svg += '<g data-kind="today">' + rect(layout.today.x, layout.today.y, layout.today.w, layout.today.h,
    C.ink) + txt(layout.today.x + layout.today.w / 2, layout.today.y + 12, 'TODAY', 9, C.bg,
    {weight:700, tracking:1, anchor:'middle'});
  const today = String(ctx.today ?? projection.today ?? '');
  if(today) svg += txt(layout.today.x + layout.today.w / 2, layout.today.y + 24, today, 8, C.bg,
    {anchor:'middle'});
  svg += '</g>';

  for(const box of layout.spine || []) svg += renderItem(box, decisions, C, measure);
  for(const box of layout.breadcrumbs || []){
    for(const item of box.arms?.yes || []) svg += renderItem(item, decisions, C, measure);
    for(const item of box.arms?.no || []) svg += renderItem(item, decisions, C, measure);
    svg += renderStump(box.stump, C, measure);
    svg += renderCollapsedArmLabel(box, C);
    svg += renderBreadcrumb(box, C, measure, ctx);
  }
  for(const box of layout.continuations || []) svg += renderItem(box, decisions, C, measure);
  for(const entry of layout.questions || []){
    for(const box of entry.arms.yes || []) svg += renderItem(box, decisions, C, measure);
    for(const box of entry.arms.no || []) svg += renderItem(box, decisions, C, measure);
    for(const box of entry.continuation || []) svg += renderItem(box, decisions, C, measure);
    svg += renderStump(entry.stump, C, measure);
    svg += renderArmLabels(entry, C);
    svg += renderQuestion(entry, C, measure, ctx);
  }
  svg += renderTerminal(layout.terminal, C);
  for(const box of layout.unplaced || []) svg += renderItem(box, decisions, C, measure);
  svg += '</g>';
  if(readout.svg) svg += '<g data-kind="artifact-verdict">' + readout.svg + '</g>';
  return svg + '</svg>';
}

/* NARROW OUTLINE (below a 520px container). Not a scaled tree — a genuine
   relayout, because panning a fork diagram on a phone hides the one thing the
   view exists to show. Same projection, same display words, stacked vertically:
   shared work, then each question as a heading with its state, its arms
   indented beneath it. Exports stay pinned to the wide artefact (house rule),
   so this never becomes a second artefact of its own. */
export function renderOutline(projection, ctx){
  useFace(ctx);
  const {measure, colors} = ctx;
  const C = palette(colors);
  const W = Math.max(280, Math.min(520, ctx.width || 360));
  const PAD = 14, ROW = 34, HEAD = 44;
  const data = artifactData(projection, ctx);
  const decisions = decisionMap(projection);
  const rows = [];

  const push = (kind, text, note, indent, details = [], decision = null) =>
    rows.push({kind, text, note, indent, details, decision});
  const pushItem = (item, indent) => {
    const status = itemStatus(item)?.label;
    const meta = [status, treatmentLabel(itemTreatment(item, decisions)), item.lane].filter(Boolean).join(' · ');
    const details = [];
    if(item.note) details.push(item.note);
    if(item.parentDecision){
      const name = dependencyName(item.parentDecision, decisions);
      details.push(name ? 'Needs · ' + name : 'Needs a decision');
    }
    if(item.secondaryDependencyMode === 'required'){
      for(const dependency of item.secondaryDependencies || []){
        const name = dependencyName(dependency, decisions);
        details.push(name ? 'Also · ' + name : 'Also needs a decision');
      }
    }
    push('item', item.title, meta, indent, details);
  };
  const pushStump = (stump, indent = 2) => {
    push('item', 'Not needed · ' + (stump?.count ?? 0), '', indent);
    for(const item of stump?.items || [])
      push('item', item.title, 'Not needed', indent + 1);
  };
  if(projection.breadcrumbs?.length)
    push('crumbs', projection.breadcrumbs.map(crumb =>
      decisionName(crumb.decision) + ' · ' + answerLabel(crumb.decision?.effectiveAnswer)).join('  ·  '), '', 0);
  if(projection.spine?.length){
    push('region', 'Shared work · in every plan', '', 0);
    for(const item of projection.spine) pushItem(item, 1);
  }
  if(projection.questions?.length) push('region', 'Question paths · changes with answers', '', 0);
  for(const question of projection.questions || []){
    push('question', decisionName(question.decision), questionState(question) +
      (question.decision?.answerBy ? ' · Due ' + shortDate(question.decision.answerBy) : ''),
    0, [], question.decision);
    const arm = (list, label) => {
      if(!list?.length) return;
      push('arm', label, '', 1);
      for(const item of list) pushItem(item, 2);
    };
    if(question.chosenSide){
      const chosen = question.chosenSide;
      const rejected = chosen === 'yes' ? 'no' : 'yes';
      arm(question.continuation, chosen === 'yes' ? 'If so' : 'If not');
      const rejectedItems = question.arms?.[rejected] || [];
      if(rejectedItems.length || question.stump){
        push('arm', rejected === 'yes' ? 'If so' : 'If not', '', 1);
        for(const item of rejectedItems)
          pushItem(item, 2);
        if(question.stump) pushStump(question.stump);
      }
    } else {
      arm(question.arms?.yes, 'If so');
      arm(question.arms?.no, 'If not');
      if(question.stump){
        push('arm', question.stump.side === 'yes' ? 'If so' : 'If not', '', 1);
        pushStump(question.stump);
      }
    }
  }
  if(projection.unplaced?.length){
    push('head', 'Unplaced', '', 0);
    for(const item of projection.unplaced) pushItem(item, 1);
  }
  if(projection.terminal){
    const plans = projection.terminal.kind === 'limit' ? combinationsLabel(projection.terminal)
      : planCountLabel(projection.terminal);
    const text = projection.terminal.kind === 'limit' ? 'Enumeration limit reached' : plans + ' remain';
    const note = projection.terminal.kind === 'limit' ? plans : 'After the open decisions';
    push('terminal', text, note, 0, ['Tree does not enumerate every combined plan']);
  }

  const titleLines = wrapped(data.title, W - PAD * 2, 4, measure, '700 22px ' + SERIF);
  let headerY = PAD + 20;
  let header = '<g data-kind="artifact-header">';
  for(const titleLine of titleLines){
    header += '<text x="' + PAD + '" y="' + headerY + '" font-family="' + SERIF +
      '" font-size="22" font-weight="700" fill="' + C.ink + '">' + esc(titleLine) + '</text>';
    headerY += 26;
  }
  if(data.date){
    header += txt(PAD, headerY, data.date, 10, C.muted);
    headerY += 17;
  }

  const outlineVerdict = boundedTokens(data.readout.line, W - PAD * 2, measure, '700 17px ' + SANS);
  const vBlock = svgVerdict({x:PAD, y:headerY + 8, width:W - PAD * 2,
    line:outlineVerdict, fig:data.readout.fig, ink:C.ink, muted:C.muted,
    brandText:C.brandText, font:SANS, measure, size:17});
  if(vBlock.svg) header += '<g data-kind="artifact-verdict">' + vBlock.svg + '</g>';
  const bodyTop = headerY + 8 + vBlock.height + 18;
  header += line(PAD, bodyTop - 8, W - PAD, bodyTop - 8, C.border, 1) + '</g>';
  const rowHeight = row => row.kind === 'question' ? HEAD : row.kind === 'head' ? 30
    : row.kind === 'region' ? 28
    : row.kind === 'terminal' ? 74 : ROW + row.details.length * 14;
  const height = bodyTop + PAD + rows.reduce((sum, row) => sum + rowHeight(row), 0);
  let y = bodyTop, svg = '';
  for(const row of rows){
    const x = PAD + row.indent * 12;
    if(row.kind === 'region'){
      svg += rect(PAD, y, W - PAD * 2, 22, wash(C.accent, '0D')) +
        txt(PAD + 8, y + 15, row.text.toUpperCase(), 8, C.muted, {weight:700, tracking:0.8});
      y += 28;
      continue;
    }
    if(row.kind === 'question'){
      const hit = ctx.interactive
        ? '<rect data-hit="" x="' + PAD + '" y="' + r2(y) + '" width="' + (W - PAD * 2) +
          '" height="' + HEAD + '" fill="transparent"/>' : '';
      svg += '<g data-kind="outline-question"' + decisionTargetAttrs(row.decision,
        row.note.split(' · ')[0], ctx) + '>' + hit +
        txt(x, y + 15, clipped(row.text, W - x - PAD, measure, TITLE_FONT), 13, C.ink, {weight:700});
      if(row.note) svg += txt(x, y + 32, clipped(row.note, W - x - PAD, measure), 9, C.muted,
        {weight:600});
      svg += '</g>';
      y += HEAD;
      continue;
    }
    if(row.kind === 'head'){
      svg += txt(x, y + 18, clipped(row.text, W - x - PAD - 100, measure, TITLE_FONT), 13, C.ink, {weight:700});
      if(row.note) svg += txt(W - PAD, y + 18, clipped(row.note, 130, measure), 9, C.muted,
        {weight:600, anchor:'end'});
      y += rowHeight(row);
      continue;
    }
    if(row.kind === 'terminal'){
      svg += rect(PAD, y, W - PAD * 2, 66, wash(C.accent, '0D'), {stroke:C.border, sw:1}) +
        line(PAD, y, PAD, y + 66, C.accent, 3) +
        txt(PAD + 10, y + 15, 'TREE BOUNDARY', 8, C.muted, {weight:700, tracking:0.8}) +
        txt(PAD + 10, y + 30, clipped(row.text, W - PAD * 2 - 20, measure, TITLE_FONT), 11, C.ink, {weight:700}) +
        txt(PAD + 10, y + 42, clipped(row.note, W - PAD * 2 - 20, measure), 9, C.muted, {weight:600}) +
        txt(PAD + 10, y + 53, 'Tree does not enumerate', 8, C.muted) +
        txt(PAD + 10, y + 64, 'every combined plan', 8, C.muted);
      y += rowHeight(row);
      continue;
    }
    if(row.kind === 'crumbs' || row.kind === 'arm'){
      svg += txt(x, y + 16, clipped(row.text, W - x - PAD, measure), 9, C.muted, {weight:600});
      y += ROW - 8;
      continue;
    }
    svg += rect(x, y, W - x - PAD, rowHeight(row) - 6, C.surface, {stroke:C.border, sw:1});
    svg += txt(x + 8, y + 14, clipped(row.text, W - x - PAD - 16, measure, TITLE_FONT), 12, C.ink, {weight:600});
    if(row.note) svg += txt(x + 8, y + 25, clipped(row.note, W - x - PAD - 16, measure), 9, C.muted, {weight:600});
    for(const [index, detail] of row.details.entries()){
      svg += txt(x + 8, y + 39 + index * 14,
        clipped(detail, W - x - PAD - 16, measure, NOTE_FONT), 9, C.muted);
    }
    y += rowHeight(row);
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + r2(W) + '" height="' + r2(height) +
    '" viewBox="0 0 ' + r2(W) + ' ' + r2(height) + '" data-theme="' + (ctx.dark ? 'dark' : 'light') +
    '" font-family="' + SANS + '" role="' + (ctx.interactive ? 'group' : 'img') +
    '" aria-labelledby="paths-tree-name paths-tree-description">' +
    accessibleHead(data, 'outline') + rect(0, 0, W, height, C.bg) + header + svg + '</svg>';
}
