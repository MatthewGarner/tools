/* Pure SVG for the Conditions atlas. Work keeps its authored period/lane
   address; equal decision columns expose complete conditions without edges or
   a false causal order. */

import {btnAttrs, esc, txt, wash} from '../assets/svg.js';
import {line, rect} from '../roadmap/deck-parts.js';

const SANS = "system-ui,-apple-system,'Segoe UI',sans-serif";
const SERIF = "Charter,'Bitstream Charter',Georgia,serif";
const PAD = 36;
const NARROW_PAD = 14;
const WORK_W = 360;
const DECISION_W = 132;
const MIN_READABLE_SCALE = 0.88;

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
  const surface = pick(bg, 'card', 'surface', 'panel', 'paper', 'bg');
  const border = pick(muted, 'line', 'border', 'rule', 'muted', 'ink');
  const accent = pick(ink, 'accent', 'brand', 'ink');
  return {ink, muted, bg, surface, border, accent,
    accentInk:pick(accent, 'accentInk', 'brandText', 'accent', 'brand', 'ink'),
    urgent:pick(accent, 'err', 'danger', 'status.blocked', 'accent', 'ink')};
}

function safeMeasure(measure, value, font){
  const measured = Number(measure(String(value ?? ''), font));
  return Number.isFinite(measured) && measured >= 0 ? measured : String(value ?? '').length * 7;
}

/* Long authored tokens must wrap as safely as normal prose: SVG does not clip
   text itself, and a URL-like title should never widen the artefact. */
function wrapped(value, maxWidth, measure, font){
  const words = String(value ?? '').trim().split(/\s+/).filter(Boolean);
  const pieces = [];
  for(const word of words){
    if(safeMeasure(measure, word, font) <= maxWidth){ pieces.push(word); continue; }
    let rest = word;
    while(rest){
      let lo = 1, hi = rest.length, fit = 1;
      while(lo <= hi){
        const mid = Math.floor((lo + hi) / 2);
        if(safeMeasure(measure, rest.slice(0, mid), font) <= maxWidth){ fit = mid; lo = mid + 1; }
        else hi = mid - 1;
      }
      pieces.push(rest.slice(0, fit)); rest = rest.slice(fit);
    }
  }
  const lines = [];
  let current = '';
  for(const piece of pieces){
    const trial = current ? current + ' ' + piece : piece;
    if(!current || safeMeasure(measure, trial, font) <= maxWidth) current = trial;
    else { lines.push(current); current = piece; }
  }
  if(current) lines.push(current);
  return lines;
}

function nameOf(value){
  const text = String(value?.name || value?.key || 'Decision');
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

function termDirection(term){
  return String(term?.direction || (term?.negated ? 'no' : 'yes')).toLowerCase();
}

function termsSentence(terms, operator){
  const values = (terms || []).map(term => `${nameOf(term)} = ${termDirection(term).toUpperCase()}`);
  if(values.length < 2) return values[0] || '';
  const conjunction = operator === 'or' ? ' or ' : ' and ';
  return values.slice(0, -1).join(', ') + conjunction + values.at(-1);
}

function conditionCopy(item, modelHealth = []){
  if(!item.condition) return {kind:'shared', formula:'Moves regardless', explanation:'No decision outcome required'};
  if(!item.condition.valid){
    const warning = modelHealth.find(entry => entry.line === item.srcLine + 1);
    return {kind:'repair', formula:'Condition needs fixing',
      explanation:warning?.message || item.condition.error || 'Logic needs repair'};
  }
  const formula = termsSentence(item.condition.terms, item.condition.operator);
  if((item.condition.terms || []).length === 1)
    return {kind:'direct', formula:`If ${formula}`, explanation:'This outcome directly controls the work'};
  if(item.condition.operator === 'or')
    return {kind:'any', formula:`If either ${formula}`, explanation:'Any named outcome can unlock the work'};
  return {kind:'all', formula:`Only if ${formula}`, explanation:'All named outcomes are required'};
}

function openingCopy(decision){
  if(!decision.when) return 'Opens independently';
  if(!decision.when.valid) return 'Opening condition needs fixing';
  const formula = termsSentence(decision.when.terms, decision.when.operator);
  return formula ? `Opens if ${formula}` : 'Opening condition needs fixing';
}

function decisionState(decision){
  return decision.currentState?.sentence || 'State unavailable';
}

function stateLabel(item){
  const kind = item.displayState?.kind;
  if(kind === 'completed') return 'COMPLETED HISTORY';
  if(kind === 'not-pursuing') return 'NOT PURSUING';
  if(kind === 'assumption') return 'WORKING TO ASSUMPTION';
  if(kind === 'proceeding') return 'PROCEEDING';
  if(kind === 'waiting') return 'WAITING';
  if(kind === 'repair') return 'NEEDS REPAIR';
  return 'SHARED WORK';
}

function decisionAttrs(decision, selected, ctx){
  if(!ctx?.interactive) return '';
  return ' data-select-decision="" data-decision-key="' + esc(decision.key) +
    '" data-line="' + decision.srcLine + '" data-selected="' + selected +
    '" aria-pressed="' + selected + '"' + btnAttrs('Inspect decision ' + nameOf(decision));
}

function rootRole(ctx){
  return ctx?.interactive
    ? 'role="group" aria-labelledby="paths-conditions-name paths-conditions-description"'
    : 'role="img" aria-labelledby="paths-conditions-name paths-conditions-description"';
}

function accessibleHead(overview){
  const conditional = (overview.items || []).filter(item => item.condition).length;
  const title = String(overview.title || 'Roadmap') + ' — conditions atlas';
  const description = `${overview.items?.length || 0} work items grouped by period and lane against ` +
    `${overview.decisions?.length || 0} parallel decisions. ${conditional} work ` +
    `${conditional === 1 ? 'item has' : 'items have'} authored conditions. Columns do not imply sequence.`;
  return '<title id="paths-conditions-name">' + esc(title) + '</title>' +
    '<desc id="paths-conditions-description">' + esc(description) + '</desc>';
}

function artifactHeader(overview, width, C, measure, narrow = false){
  const pad = narrow ? NARROW_PAD : PAD;
  const titleSize = narrow ? 22 : 25;
  const titleLines = wrapped(overview.title || 'Roadmap', width - pad * 2 - (narrow ? 0 : 160), measure,
    `700 ${titleSize}px ${SERIF}`);
  let y = pad + titleSize;
  let svg = '<g data-kind="conditions-header">';
  for(const value of titleLines){
    svg += '<text x="' + pad + '" y="' + y + '" font-family="' + SERIF + '" font-size="' +
      titleSize + '" font-weight="700" fill="' + C.ink + '">' + esc(value) + '</text>';
    y += titleSize + 5;
  }
  if(overview.date && !narrow) svg += txt(width - pad, pad + 17, String(overview.date), 10, C.muted,
    {anchor:'end'});
  if(overview.date && narrow){ svg += txt(pad, y, String(overview.date), 10, C.muted); y += 18; }
  svg += txt(pad, y + 4, 'CONDITIONS ATLAS', 9, C.accentInk, {weight:700, tracking:0.9});
  y += 22;
  const thesis = 'Every item once. Read across to see exactly what must be true.';
  for(const value of wrapped(thesis, width - pad * 2, measure, '600 11px ' + SANS)){
    svg += txt(pad, y, value, 11, C.ink, {weight:600}); y += 15;
  }
  y += 8;
  svg += line(pad, y, width - pad, y, C.border, 1) + '</g>';
  return {svg, height:y + 18};
}

function decisionHeaderMeasures(decisions, measure, decisionWidth){
  return decisions.map(decision => {
    const title = wrapped(nameOf(decision), decisionWidth - 20, measure, '700 11px ' + SANS);
    const state = wrapped(decisionState(decision), decisionWidth - 20, measure, '600 8px ' + SANS);
    const opens = wrapped(openingCopy(decision), decisionWidth - 20, measure, '700 8px ' + SANS);
    return {decision, title, state, opens, height:28 + title.length * 14 + state.length * 11 + opens.length * 11};
  });
}

function decisionHeaders(overview, x, y, workWidth, decisionWidth, C, measure, selectedKey, ctx){
  const layouts = decisionHeaderMeasures(overview.decisions || [], measure, decisionWidth);
  const height = Math.max(106, ...layouts.map(layout => layout.height));
  let svg = '<g data-kind="conditions-decision-headers">' +
    rect(x, y, workWidth, height, wash(C.accent, '08'), {stroke:C.border, sw:1}) +
    txt(x + 14, y + 23, 'PARALLEL QUESTIONS', 9, C.muted, {weight:700, tracking:0.9}) +
    txt(x + 14, y + 43, 'Columns do not imply sequence', 11, C.ink, {weight:700}) +
    txt(x + 14, y + 62, 'YES / NO appears only where an outcome matters.', 9, C.muted, {weight:600});
  for(const [index, layout] of layouts.entries()){
    const hx = x + workWidth + index * decisionWidth;
    const selected = layout.decision.key === selectedKey;
    const stateKind = layout.decision.currentState?.kind;
    const stroke = selected ? C.accent : stateKind === 'repair' || stateKind === 'overdue' ? C.urgent : C.border;
    svg += '<g data-kind="conditions-decision-header" data-decision-key="' + esc(layout.decision.key) +
      '" data-selected="' + selected + '"' + decisionAttrs(layout.decision, selected, ctx) + '><title>' +
      esc(`${nameOf(layout.decision)} — ${decisionState(layout.decision)} — ${openingCopy(layout.decision)}`) + '</title>' +
      rect(hx, y, decisionWidth, height, selected ? wash(C.accent, '0D') : C.surface,
        {stroke, sw:selected ? 2 : 1}) + rect(hx, y, 4, height, stroke);
    let ty = y + 21;
    for(const value of layout.title){ svg += txt(hx + 11, ty, value, 11, C.ink, {weight:700}); ty += 14; }
    ty += 2;
    for(const value of layout.state){
      svg += txt(hx + 11, ty, value, 8, stateKind === 'repair' || stateKind === 'overdue' ? C.urgent : C.muted,
        {weight:600}); ty += 11;
    }
    ty += 3;
    for(const value of layout.opens){ svg += txt(hx + 11, ty, value, 8, C.accentInk, {weight:700}); ty += 11; }
    if(ctx?.interactive) svg += '<rect data-hit="" x="' + hx + '" y="' + y + '" width="' + decisionWidth +
      '" height="' + height + '" fill="transparent"/>';
    svg += '</g>';
  }
  if(!layouts.length) svg += txt(x + 14, y + 85, 'No decisions authored yet — all work currently moves regardless',
    10, C.muted, {weight:600});
  return {svg:svg + '</g>', height};
}

function itemsByCell(overview){
  return new Map((overview.cells || []).map(cell => [`${cell.period}\0${cell.lane}`, cell.items || []]));
}

function orderedGroups(overview){
  const cells = itemsByCell(overview);
  return (overview.periods || []).map(period => ({period, lanes:(overview.lanes || []).map(lane => ({lane,
    items:cells.get(`${period.name}\0${lane}`) || []})).filter(group => group.items.length)}))
    .filter(group => group.lanes.length);
}

function itemMeasure(item, measure, modelHealth, width = WORK_W){
  const inner = width - 28;
  const condition = conditionCopy(item, modelHealth);
  const title = wrapped(item.title || 'Untitled item', inner, measure, '700 12px ' + SANS);
  const note = item.note ? wrapped(item.note, inner, measure, '400 9px ' + SANS) : [];
  const formula = wrapped(condition.formula, inner, measure, '700 9px ' + SANS);
  const state = wrapped(item.displayState?.sentence || 'State unavailable', inner, measure, '600 9px ' + SANS);
  return {condition, title, note, formula, state,
    height:24 + title.length * 15 + note.length * 12 + formula.length * 12 + state.length * 12 + 18};
}

function renderOutcomeCell(item, decision, x, y, width, height, C, selected){
  const condition = item.condition;
  const term = condition?.valid ? condition.terms?.find(candidate => candidate.key === decision.key) : null;
  const participation = !condition ? 'shared' : !condition.valid ? 'repair' : term
    ? condition.terms.length === 1 ? 'direct' : condition.operator === 'or' ? 'any' : 'all' : 'none';
  const fill = term && selected ? wash(C.accent, '0D') : participation === 'repair' ? wash(C.urgent, '08') : 'none';
  let svg = '<g data-kind="conditions-cell" data-decision-key="' + esc(decision.key) +
    '" data-participation="' + participation + '"' + (term ? ' data-outcome="' + termDirection(term) + '"' : '') + '>' +
    rect(x, y, width, height, fill) + line(x, y, x, y + height, C.border, 1);
  if(term){
    const direction = termDirection(term).toUpperCase();
    const relation = participation === 'direct' ? 'DIRECT' : participation === 'any' ? 'ANY' : 'ALL';
    const center = x + width / 2;
    svg += '<title>' + esc(`${nameOf(decision)} must be ${direction}. ${relation === 'ALL'
      ? 'All named outcomes are required' : relation === 'ANY' ? 'Any named outcome can unlock the work'
        : 'This outcome directly controls the work'}.`) + '</title>' +
      rect(center - 23, y + Math.max(13, height / 2 - 18), 46, 22, wash(C.accent, selected ? '1F' : '12'),
        {stroke:C.accent, sw:1}) +
      txt(center, y + Math.max(28, height / 2 - 3), direction, 10, C.accentInk,
        {weight:700, tracking:0.7, anchor:'middle'}) +
      txt(center, y + Math.max(46, height / 2 + 15), relation, 8, C.muted,
        {weight:700, tracking:0.7, anchor:'middle'});
  } else if(participation === 'repair'){
    svg += '<title>Condition needs fixing</title>' +
      txt(x + width / 2, y + height / 2 + 3, 'FIX LOGIC', 8, C.urgent,
        {weight:700, tracking:0.6, anchor:'middle'});
  } else {
    svg += '<title>' + esc(participation === 'shared' ? 'No decision outcome required' :
      `${nameOf(decision)} is not part of this condition`) + '</title>' +
      txt(x + width / 2, y + height / 2 + 3, participation === 'shared' ? '—' : '·', 12, C.muted,
        {weight:600, anchor:'middle'});
  }
  return svg + '</g>';
}

function renderWorkRow(item, x, y, workWidth, decisionWidth, decisions, C, measure, modelHealth, selectedKey, odd){
  const layout = itemMeasure(item, measure, modelHealth, workWidth);
  const width = workWidth + decisions.length * decisionWidth;
  const bg = odd ? wash(C.muted, '05') : C.bg;
  const stateKind = item.displayState?.kind;
  let svg = '<g data-kind="conditions-work-row" data-identity="' + item.identity +
    '" data-condition="' + layout.condition.kind + '"><title>' +
    esc(`${item.title || 'Untitled item'} — ${layout.condition.formula}`) + '</title>' +
    rect(x, y, width, layout.height, bg) + line(x, y, x + width, y, C.border, 1);
  let ty = y + 18;
  svg += txt(x + 14, ty, stateLabel(item), 8,
    stateKind === 'repair' ? C.urgent : layout.condition.kind === 'shared' ? C.muted : C.accentInk,
    {weight:700, tracking:0.65}); ty += 16;
  for(const value of layout.title){ svg += txt(x + 14, ty, value, 12, C.ink, {weight:700}); ty += 15; }
  for(const value of layout.note){ svg += txt(x + 14, ty + 1, value, 9, C.muted); ty += 12; }
  ty += 3;
  for(const value of layout.formula){
    svg += txt(x + 14, ty, value, 9,
      layout.condition.kind === 'repair' ? C.urgent : layout.condition.kind === 'shared' ? C.muted : C.accentInk,
      {weight:700}); ty += 12;
  }
  for(const value of layout.state){ svg += txt(x + 14, ty, value, 9,
    stateKind === 'repair' ? C.urgent : C.muted, {weight:600}); ty += 12; }
  decisions.forEach((decision, index) => {
    svg += renderOutcomeCell(item, decision, x + workWidth + index * decisionWidth, y, decisionWidth,
      layout.height, C, decision.key === selectedKey);
  });
  return {svg:svg + '</g>', height:layout.height};
}

function modelHealthBlock(warnings, x, y, width, C, measure){
  if(!warnings?.length) return {svg:'', height:0};
  let svg = '<g data-kind="conditions-model-health">' +
    rect(x, y, width, 30, wash(C.urgent, '0A')) +
    txt(x + 12, y + 20, 'MODEL HEALTH', 9, C.urgent, {weight:700, tracking:0.8});
  let ty = y + 46;
  for(const warning of warnings){
    const lines = wrapped(warning.message || String(warning), width - 24, measure, '600 9px ' + SANS);
    for(const value of lines){ svg += txt(x + 12, ty, value, 9, C.ink, {weight:600}); ty += 12; }
    ty += 5;
  }
  return {svg:svg + '</g>', height:ty - y + 4};
}

export function renderConditions(overview, ctx = {}){
  if(Number(ctx.width) > 0 && Number(ctx.width) < 520) return renderConditionsNarrow(overview, ctx);
  const measure = typeof ctx.measure === 'function' ? ctx.measure : value => String(value).length * 7;
  const C = palette(ctx.colors || {});
  const selectedKey = String(ctx.selectedKey || '').toLowerCase();
  const decisions = overview.decisions || [];
  const naturalWidth = PAD * 2 + WORK_W + decisions.length * DECISION_W;
  const width = Math.max(1120, Math.ceil(Number(ctx.width) || 1160), naturalWidth);
  const head = artifactHeader(overview, width, C, measure);
  const atlasX = PAD;
  const workWidth = decisions.length ? WORK_W : width - PAD * 2;
  const decisionWidth = decisions.length ? (width - PAD * 2 - workWidth) / decisions.length : 0;
  const atlasWidth = workWidth + decisions.length * decisionWidth;
  const headers = decisionHeaders(overview, atlasX, head.height + 14, workWidth, decisionWidth,
    C, measure, selectedKey, ctx);
  let y = head.height + 14 + headers.height;
  let body = '<g data-kind="conditions-atlas">';
  let rowIndex = 0;
  for(const group of orderedGroups(overview)){
    body += '<g data-kind="conditions-period"><title>' + esc(group.period.name) + '</title>' +
      rect(atlasX, y, atlasWidth, 34, wash(C.accent, '0A')) +
      txt(atlasX + 12, y + 22, group.period.name, 10, C.ink, {weight:700, tracking:0.65}) + '</g>';
    y += 34;
    for(const laneGroup of group.lanes){
      body += '<g data-kind="conditions-lane"><title>' + esc(laneGroup.lane) + '</title>' +
        rect(atlasX, y, atlasWidth, 28, C.surface) +
        txt(atlasX + 12, y + 19, laneGroup.lane, 9, C.muted, {weight:700, tracking:0.55}) +
        txt(atlasX + atlasWidth - 12, y + 19,
          `${laneGroup.items.length} ${laneGroup.items.length === 1 ? 'item' : 'items'}`, 8, C.muted,
          {weight:600, anchor:'end'}) + '</g>';
      y += 28;
      for(const item of laneGroup.items){
        const row = renderWorkRow(item, atlasX, y, workWidth, decisionWidth, decisions, C, measure, overview.modelHealth,
          selectedKey, rowIndex % 2 === 1);
        body += row.svg; y += row.height; rowIndex++;
      }
    }
  }
  if(!rowIndex){
    body += rect(atlasX, y, atlasWidth, 64, C.surface, {stroke:C.border, sw:1}) +
      txt(atlasX + 14, y + 37, 'No roadmap work authored yet', 11, C.muted, {weight:600});
    y += 64;
  }
  body += line(atlasX + atlasWidth, headers.height + head.height + 14, atlasX + atlasWidth, y, C.border, 1) + '</g>';
  const health = modelHealthBlock(overview.modelHealth, atlasX, y + 20, atlasWidth, C, measure);
  y += 20 + health.height;
  const height = Math.ceil(y + PAD);
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height +
    '" viewBox="0 0 ' + width + ' ' + height + '" data-theme="' + (ctx.dark ? 'dark' : 'light') +
    '" data-min-readable-scale="' + MIN_READABLE_SCALE + '" font-family="' + SANS + '" ' + rootRole(ctx) +
    '>' + accessibleHead(overview) + rect(0, 0, width, height, C.bg) + head.svg + headers.svg + body +
    health.svg + '</svg>';
}

function narrowDecisionList(overview, x, y, width, C, measure, selectedKey, ctx){
  let svg = '<g data-kind="conditions-narrow-decisions">' +
    txt(x, y + 10, 'PARALLEL QUESTIONS', 9, C.muted, {weight:700, tracking:0.8}) +
    txt(x + width, y + 10, 'NOT A SEQUENCE', 8, C.muted, {weight:700, tracking:0.5, anchor:'end'});
  y += 24;
  const start = y;
  for(const decision of overview.decisions || []){
    const selected = decision.key === selectedKey;
    const nameLines = wrapped(nameOf(decision), width - 24, measure, '700 11px ' + SANS);
    const stateLines = wrapped(decisionState(decision), width - 24, measure, '600 9px ' + SANS);
    const openLines = wrapped(openingCopy(decision), width - 24, measure, '700 9px ' + SANS);
    const height = Math.max(52, 22 + nameLines.length * 14 + stateLines.length * 12 + openLines.length * 12);
    const stateKind = decision.currentState?.kind;
    svg += '<g data-kind="conditions-narrow-decision" data-decision-key="' + esc(decision.key) +
      '" data-selected="' + selected + '"' + decisionAttrs(decision, selected, ctx) + '><title>' +
      esc(`${nameOf(decision)} — ${decisionState(decision)} — ${openingCopy(decision)}`) + '</title>' +
      rect(x, y, width, height, selected ? wash(C.accent, '0D') : C.surface,
        {stroke:selected ? C.accent : C.border, sw:selected ? 2 : 1});
    let ty = y + 19;
    for(const value of nameLines){ svg += txt(x + 12, ty, value, 11, C.ink, {weight:700}); ty += 14; }
    for(const value of stateLines){ svg += txt(x + 12, ty, value, 9,
      stateKind === 'repair' || stateKind === 'overdue' ? C.urgent : C.muted, {weight:600}); ty += 12; }
    for(const value of openLines){ svg += txt(x + 12, ty, value, 9, C.accentInk, {weight:700}); ty += 12; }
    if(ctx?.interactive) svg += '<rect data-hit="" x="' + x + '" y="' + y + '" width="' + width +
      '" height="' + height + '" fill="transparent"/>';
    svg += '</g>'; y += height + 7;
  }
  if(!(overview.decisions || []).length){ svg += txt(x, y + 18, 'No decisions authored yet', 11, C.muted); y += 42; }
  return {svg:svg + '</g>', height:y - start + 20};
}

function narrowOutcomeRows(item, x, y, width, C){
  const condition = item.condition;
  if(!condition?.valid || !condition.terms?.length) return {svg:'', height:0};
  let svg = '<g data-kind="conditions-narrow-outcomes">';
  const relation = condition.terms.length === 1 ? 'DIRECT' : condition.operator === 'or' ? 'ANY' : 'ALL';
  for(const term of condition.terms){
    svg += '<g data-kind="conditions-narrow-outcome" data-decision-key="' + esc(term.key) +
      '" data-outcome="' + termDirection(term) + '" data-participation="' + relation.toLowerCase() + '">' +
      txt(x, y + 13, nameOf(term), 9, C.ink, {weight:700}) +
      txt(x + width, y + 13, `${termDirection(term).toUpperCase()} · ${relation}`, 9, C.accentInk,
        {weight:700, tracking:0.5, anchor:'end'}) + '</g>';
    y += 19;
  }
  return {svg:svg + '</g>', height:condition.terms.length * 19};
}

function narrowItem(item, x, y, width, C, measure, modelHealth){
  const copy = conditionCopy(item, modelHealth);
  const inner = width - 24;
  const titleLines = wrapped(item.title || 'Untitled item', inner, measure, '700 12px ' + SANS);
  const noteLines = item.note ? wrapped(item.note, inner, measure, '400 9px ' + SANS) : [];
  const formulaLines = wrapped(copy.formula, inner, measure, '700 9px ' + SANS);
  const explanationLines = wrapped(copy.explanation, inner, measure, '600 9px ' + SANS);
  const stateLines = wrapped(item.displayState?.sentence || 'State unavailable', inner, measure, '600 9px ' + SANS);
  const outcomesHeight = item.condition?.valid ? (item.condition.terms?.length || 0) * 19 : 0;
  const height = 34 + titleLines.length * 15 + noteLines.length * 12 + formulaLines.length * 12 +
    explanationLines.length * 12 + outcomesHeight + stateLines.length * 12 + 24;
  const stateKind = item.displayState?.kind;
  let svg = '<g data-kind="conditions-narrow-item" data-identity="' + item.identity +
    '" data-condition="' + copy.kind + '"><title>' + esc(`${item.title || 'Untitled item'} — ${copy.formula}`) +
    '</title>' + rect(x, y, width, height, C.surface, {stroke:copy.kind === 'repair' ? C.urgent : C.border, sw:1});
  let ty = y + 18;
  svg += txt(x + 12, ty, stateLabel(item), 8,
    stateKind === 'repair' ? C.urgent : copy.kind === 'shared' ? C.muted : C.accentInk,
    {weight:700, tracking:0.65}); ty += 18;
  for(const value of titleLines){ svg += txt(x + 12, ty, value, 12, C.ink, {weight:700}); ty += 15; }
  for(const value of noteLines){ svg += txt(x + 12, ty + 1, value, 9, C.muted); ty += 12; }
  ty += 3;
  for(const value of formulaLines){ svg += txt(x + 12, ty, value, 9,
    copy.kind === 'repair' ? C.urgent : copy.kind === 'shared' ? C.muted : C.accentInk, {weight:700}); ty += 12; }
  for(const value of explanationLines){ svg += txt(x + 12, ty, value, 9, C.muted, {weight:600}); ty += 12; }
  ty += 5;
  const outcomes = narrowOutcomeRows(item, x + 12, ty, inner, C);
  svg += outcomes.svg; ty += outcomes.height + 3;
  for(const value of stateLines){ svg += txt(x + 12, ty, value, 9,
    stateKind === 'repair' ? C.urgent : C.muted, {weight:600}); ty += 12; }
  return {svg:svg + '</g>', height};
}

export function renderConditionsNarrow(overview, ctx = {}){
  const measure = typeof ctx.measure === 'function' ? ctx.measure : value => String(value).length * 7;
  const C = palette(ctx.colors || {});
  const selectedKey = String(ctx.selectedKey || '').toLowerCase();
  const width = Math.max(280, Math.min(520, Number(ctx.width) || 360));
  const inner = width - NARROW_PAD * 2;
  const head = artifactHeader(overview, width, C, measure, true);
  let y = head.height;
  const decisions = narrowDecisionList(overview, NARROW_PAD, y, inner, C, measure, selectedKey, ctx);
  y += decisions.height + 6;
  let body = '<g data-kind="conditions-narrow-atlas">';
  let count = 0;
  for(const group of orderedGroups(overview)){
    body += '<g data-kind="conditions-narrow-period"><title>' + esc(group.period.name) + '</title>' +
      rect(NARROW_PAD, y, inner, 34, wash(C.accent, '0A')) +
      txt(NARROW_PAD + 12, y + 22, group.period.name, 10, C.ink, {weight:700, tracking:0.65}) + '</g>';
    y += 34;
    for(const laneGroup of group.lanes){
      body += '<g data-kind="conditions-narrow-lane"><title>' + esc(laneGroup.lane) + '</title>' +
        txt(NARROW_PAD, y + 18, laneGroup.lane, 9, C.muted, {weight:700, tracking:0.55}) + '</g>';
      y += 28;
      for(const item of laneGroup.items){
        const card = narrowItem(item, NARROW_PAD, y, inner, C, measure, overview.modelHealth);
        body += card.svg; y += card.height + 9; count++;
      }
      y += 7;
    }
  }
  if(!count){ body += txt(NARROW_PAD, y + 20, 'No roadmap work authored yet', 11, C.muted); y += 48; }
  const health = modelHealthBlock(overview.modelHealth, NARROW_PAD, y + 4, inner, C, measure);
  body += health.svg; y += 4 + health.height;
  const height = Math.ceil(y + NARROW_PAD);
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + r2(width) + '" height="' + r2(height) +
    '" viewBox="0 0 ' + r2(width) + ' ' + r2(height) + '" data-theme="' + (ctx.dark ? 'dark' : 'light') +
    '" data-layout="stacked" font-family="' + SANS + '" ' + rootRole(ctx) + '>' + accessibleHead(overview) +
    rect(0, 0, width, height, C.bg) + head.svg + decisions.svg + body + '</svg>';
}

export default renderConditions;
