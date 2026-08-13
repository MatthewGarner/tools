/* Pure SVG for the parallel roadmap overview. All semantic labels and group
   membership arrive in overviewProjection; this file only lays them out. */

import {btnAttrs, esc, txt, wash} from '../assets/svg.js';
import {line, rect} from '../roadmap/deck-parts.js';

const SANS = "system-ui,-apple-system,'Segoe UI',sans-serif";
const SERIF = "Charter,'Bitstream Charter',Georgia,serif";
const PAD = 36;
const NARROW_PAD = 14;
const PERIOD_W = 260;
const LANE_W = 150;
/* A period column is authored at 260px and remains meaningfully readable down
   to roughly 240px. The shared Fit control respects this renderer declaration
   and pans instead of silently reducing the roadmap beyond that point. */
const MIN_READABLE_SCALE = 0.925;

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

/* Unlike assets/wrapText, this also breaks a single long token so authored
   slugs and hostile corpus strings cannot cross the artefact boundary. */
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

function statusLabel(item){
  const status = String(item?.status || '').toLowerCase();
  return ['done', 'doing', 'risk', 'blocked'].includes(status) ? status.toUpperCase() : '';
}

function decisionName(decision){
  return String(decision?.name || decision?.key || 'Decision');
}

function titleOf(overview){
  return String(overview?.title || 'Roadmap overview');
}

function selectedDecision(overview, ctx){
  const key = String(ctx?.selectedKey || overview?.initialSelection?.key || '').toLowerCase();
  return (overview?.decisions || []).find(decision => decision.key === key) || null;
}

function selectedImpact(selected, ctx){
  return selected && ctx?.impact?.key === selected.key ? ctx.impact : null;
}

function accessibleText(overview, selected){
  const periods = overview.periods?.length || 0;
  const lanes = overview.lanes?.length || 0;
  const items = overview.items?.length || 0;
  const attention = overview.attention?.length || 0;
  const parts = [`${periods} ${periods === 1 ? 'period' : 'periods'}`,
    `${lanes} ${lanes === 1 ? 'lane' : 'lanes'}`, `${items} ${items === 1 ? 'item' : 'items'}`,
    `${attention} ${attention === 1 ? 'decision needs' : 'decisions need'} attention`];
  if(periods) parts.push(`Periods: ${overview.periods.map(period => period.name).join(', ')}`);
  if(lanes) parts.push(`Lanes: ${overview.lanes.join(', ')}`);
  if(selected) parts.push(`Selected decision ${decisionName(selected)}. ${selected.currentState?.sentence || ''}`);
  return parts.join('. ') + '.';
}

function accessibleHead(overview, selected){
  return '<title id="paths-overview-name">' + esc(titleOf(overview)) + '</title>' +
    '<desc id="paths-overview-description">' + esc(accessibleText(overview, selected)) + '</desc>';
}

function rootRole(ctx){
  return ctx?.interactive
    ? 'role="group" aria-labelledby="paths-overview-name paths-overview-description"'
    : 'role="img" aria-labelledby="paths-overview-name paths-overview-description"';
}

function header(overview, width, C, measure, narrow = false){
  const pad = narrow ? NARROW_PAD : PAD;
  const size = narrow ? 22 : 25;
  const font = `700 ${size}px ${SERIF}`;
  const titles = wrapped(titleOf(overview), width - pad * 2 - (narrow ? 0 : 160), measure, font);
  let y = pad + size, svg = '<g data-kind="artifact-header">';
  for(const title of titles){
    svg += '<text x="' + pad + '" y="' + y + '" font-family="' + SERIF +
      '" font-size="' + size + '" font-weight="700" fill="' + C.ink + '">' + esc(title) + '</text>';
    y += size + 5;
  }
  if(overview.date){
    if(narrow){ svg += txt(pad, y, String(overview.date), 10, C.muted); y += 17; }
    else svg += txt(width - pad, pad + 17, String(overview.date), 10, C.muted, {anchor:'end'});
  }
  const metrics = `${overview.periods?.length || 0} PERIODS · ${overview.lanes?.length || 0} LANES · ` +
    `${overview.items?.length || 0} ITEMS · ${overview.decisions?.length || 0} DECISIONS`;
  for(const metric of wrapped(metrics, width - pad * 2, measure, '600 9px ' + SANS)){
    svg += txt(pad, y, metric, 9, C.muted, {weight:600, tracking:0.7}); y += 14;
  }
  y += 6;
  svg += line(pad, y, width - pad, y, C.border, 1) + '</g>';
  return {svg, height:y + (narrow ? 14 : 18)};
}

function verdictBlock(overview, x, y, width, C, measure, narrow = false){
  const value = typeof overview.verdict === 'string' ? overview.verdict : overview.verdict?.line;
  if(!value) return {svg:'', height:0};
  const size = narrow ? 15 : 18;
  const lines = wrapped(value, width, measure, `700 ${size}px ${SANS}`);
  let svg = '<g data-kind="overview-verdict">' +
    txt(x, y + 10, 'VERDICT', 9, C.muted, {weight:700, tracking:0.9});
  lines.forEach((text, index) => {
    svg += txt(x, y + 34 + index * (size + 5), text, size, C.ink, {weight:700});
  });
  return {svg:svg + '</g>', height:42 + lines.length * (size + 5)};
}

function decisionAttrs(decision, selected, ctx){
  if(!ctx?.interactive) return '';
  return ' data-select-decision="" data-decision-key="' + esc(decision.key) +
    '" data-line="' + decision.srcLine + '" data-selected="' + selected +
    '" aria-pressed="' + selected + '"' + btnAttrs('Inspect decision ' + decisionName(decision));
}

function attentionRow(decision, x, y, width, C, measure, selected, ctx, kind = 'attention-decision'){
  const question = wrapped(decision.question || decisionName(decision), width - 28, measure, '700 12px ' + SANS);
  const owner = decision.owner ? `Owner: ${decision.owner}` : 'Owner needs repair';
  const state = decision.currentState?.sentence || 'Unanswered';
  const meta = wrapped(`${owner} · ${state}`, width - 28, measure, '600 9px ' + SANS);
  const impact = wrapped(decision.impactSummary || 'No authored work depends on this yet', width - 28,
    measure, '600 9px ' + SANS);
  const height = Math.max(72, 26 + question.length * 15 + meta.length * 13 + impact.length * 13);
  const stroke = selected ? C.accent : decision.currentState?.kind === 'overdue' ? C.urgent : C.border;
  let svg = '<g data-kind="' + kind + '" data-state="' + esc(decision.currentState?.kind || 'open') + '"' +
    decisionAttrs(decision, selected, ctx) + '><title>' + esc(`${decisionName(decision)} — ${state}`) + '</title>' +
    rect(x, y, width, height, selected ? wash(C.accent, '0D') : C.surface, {stroke, sw:selected ? 2 : 1}) +
    rect(x, y, 4, height, stroke);
  let ty = y + 18;
  for(const text of question){ svg += txt(x + 14, ty, text, 12, C.ink, {weight:700}); ty += 15; }
  for(const text of meta){ svg += txt(x + 14, ty + 2, text, 9,
    decision.currentState?.kind === 'overdue' ? C.urgent : C.muted, {weight:600}); ty += 13; }
  for(const text of impact){ svg += txt(x + 14, ty + 4, text, 9, C.muted, {weight:600}); ty += 13; }
  if(ctx?.interactive) svg += '<rect data-hit="" x="' + x + '" y="' + y + '" width="' + width +
    '" height="' + height + '" fill="transparent"/>';
  return {svg:svg + '</g>', height};
}

const GROUPS = [
  ['workingToAssumption', 'Working to an assumption'], ['answered', 'Answered'],
  ['dormant', 'Not open yet'], ['moot', 'No longer applies'], ['repair', 'Needs repair'],
];

function stateGroups(overview, selected, x, y, width, C, measure, ctx, narrow = false){
  let svg = '<g data-kind="decision-state-groups">';
  const start = y;
  svg += txt(x, y + 11, 'OTHER DECISION STATES', 9, C.muted, {weight:700, tracking:0.9});
  y += 24;
  for(const [key, label] of GROUPS){
    const decisions = overview.groups?.[key] || [];
    /* A static export is the decision ledger, not a disclosure widget: expose
       every identity. The live artefact keeps the groups user-expandable. */
    const expanded = !ctx?.interactive || (ctx.expandedGroups instanceof Set
      ? ctx.expandedGroups.has(key) : (ctx?.expandedGroups || []).includes(key));
    const height = 44;
    const names = decisions.map(decisionName).join(', ');
    let attrs = ' data-state-group="' + key + '"';
    if(ctx?.interactive) attrs += ' data-toggle-decision-group="" aria-expanded="' + expanded + '"' +
      btnAttrs(`${label}, ${decisions.length} ${decisions.length === 1 ? 'decision' : 'decisions'}`);
    svg += '<g data-kind="decision-state-group"' + attrs + '><title>' +
      esc(names ? `${label}: ${names}` : `${label}: none`) + '</title>' +
      rect(x, y, width, height, C.surface, {stroke:C.border, sw:1}) +
      txt(x + 12, y + 23, label, narrow ? 10 : 11, C.ink, {weight:700}) +
      txt(x + width - 12, y + 23, String(decisions.length), 10, C.muted, {weight:700, anchor:'end'});
    if(ctx?.interactive) svg += '<rect data-hit="" x="' + x + '" y="' + y + '" width="' + width +
      '" height="' + height + '" fill="transparent"/>';
    svg += '</g>'; y += height;
    if(expanded){
      for(const decision of decisions){
        const row = attentionRow(decision, x + 10, y + 6, width - 20, C, measure,
          selected?.key === decision.key, ctx, 'state-decision');
        svg += row.svg; y += row.height + 8;
      }
    }
    y += 6;
  }
  return {svg:svg + '</g>', height:y - start};
}

function receiptSection(label, entries, empty = ''){
  const values = entries?.map(entry => entry.sentence || String(entry)) || [];
  return values.length || empty ? [{label, values:values.length ? values : [empty]}] : [];
}

function receipt(decision, impact, x, y, width, C, measure){
  if(!decision) return {svg:'', height:0};
  const names = wrapped(decisionName(decision), width - 28, measure, '700 14px ' + SANS);
  const facts = [
    ['QUESTION', decision.question || decisionName(decision)], ['SIGNAL', decision.signal || 'Needs repair'],
    ['LATEST READING', decision.reading || 'No reading recorded'], ['OWNER', decision.owner || 'Needs repair'],
    ['ANSWER BY', decision.answerBy || 'Needs repair'], ['CURRENT STATE', decision.currentState?.sentence || 'Unanswered'],
    ['OPENS WHEN', decision.when?.source || 'Always open'],
    ['ANSWER / RECEIPT', decision.answer?.raw || 'Not answered'],
  ].map(([label, value]) => ({label, values:[value]}));
  const narrative = impact?.narrative;
  const sections = narrative ? [
    ...receiptSection('CONTINUES WHILE UNRESOLVED', narrative.continues,
      'No continuing authored work is unchanged by this answer'),
    ...receiptSection('CHANGES DIRECTLY WITH THIS ANSWER', narrative.direct,
      'No simple-condition work changes directly'),
    ...receiptSection('ALSO NEEDS', narrative.alsoNeeds),
    ...receiptSection('EITHER CAN UNLOCK', narrative.eitherCanUnlock),
    ...receiptSection('MAY OPEN / MAKES IRRELEVANT', [...narrative.mayOpen, ...narrative.makesIrrelevant]),
    ...receiptSection('COMPLETED HISTORY', narrative.completedHistory),
    ...receiptSection('REPAIR EVIDENCE', narrative.repairEvidence),
  ] : [{label:'IMPACT', values:[decision.impactSummary || 'No authored work depends on this yet']}];
  const rows = [...facts, ...sections].map(row => ({label:row.label,
    lines:row.values.flatMap(value => wrapped(value, width - 28, measure, '600 10px ' + SANS))}));
  const height = 46 + names.length * 17 + rows.reduce((sum, row) =>
    sum + 18 + Math.max(1, row.lines.length) * 13, 0);
  let svg = '<g data-kind="overview-receipt" data-decision-key="' + esc(decision.key) + '"><title>' +
    esc(`Selected decision: ${decisionName(decision)}`) + '</title>' +
    rect(x, y, width, height, C.surface, {stroke:C.accent, sw:2}) + rect(x, y, 5, height, C.accent) +
    txt(x + 15, y + 20, 'SELECTED DECISION', 9, C.accentInk, {weight:700, tracking:0.9});
  let ty = y + 40;
  for(const name of names){ svg += txt(x + 15, ty, name, 14, C.ink, {weight:700}); ty += 17; }
  ty += 4;
  for(const row of rows){
    svg += txt(x + 15, ty, row.label, 8, C.muted, {weight:700, tracking:0.7}); ty += 14;
    for(const value of row.lines){ svg += txt(x + 15, ty, value, 10, C.ink, {weight:600}); ty += 13; }
    ty += 4;
  }
  return {svg:svg + '</g>', height};
}

function decisionStage(overview, selected, x, y, width, C, measure, ctx){
  const gap = 18;
  const showReceipt = ctx?.showReceipt !== false;
  const attentionW = Math.min(410, showReceipt ? 410 : Math.max(410, width * .58));
  const groupsW = showReceipt ? 270 : Math.max(270, width - attentionW - gap);
  const receiptW = selected && showReceipt ? Math.max(300, width - attentionW - groupsW - gap * 2) : 0;
  let attentionY = y + 28, attentionSvg = '<g data-kind="overview-attention">' +
    txt(x, y + 11, 'DECISIONS NEEDING ATTENTION', 9, C.muted, {weight:700, tracking:0.9});
  if(!overview.attention?.length){
    attentionSvg += txt(x, attentionY + 18, 'No active unanswered decisions', 11, C.muted, {weight:600});
    attentionY += 44;
  }
  for(const decision of overview.attention || []){
    const row = attentionRow(decision, x, attentionY, attentionW, C, measure,
      selected?.key === decision.key, ctx);
    attentionSvg += row.svg; attentionY += row.height + 8;
  }
  attentionSvg += '</g>';
  const groups = stateGroups(overview, selected, x + attentionW + gap, y, groupsW, C, measure, ctx);
  const selectedReceipt = selected && showReceipt
    ? receipt(selected, selectedImpact(selected, ctx), x + attentionW + groupsW + gap * 2, y, receiptW, C, measure)
    : {svg:'', height:0};
  return {svg:attentionSvg + groups.svg + selectedReceipt.svg,
    height:Math.max(attentionY - y, groups.height, selectedReceipt.height)};
}

function itemCard(item, x, y, width, C, measure, selectedKey){
  const inner = width - 24;
  const titleLines = wrapped(item.title || 'Untitled item', inner, measure, '700 12px ' + SANS);
  const stateLines = wrapped(item.displayState?.sentence || 'Logic needs repair', inner, measure, '600 9px ' + SANS);
  const noteLines = item.note ? wrapped(item.note, inner, measure, '400 9px ' + SANS) : [];
  const status = statusLabel(item);
  const related = !!selectedKey && !!item.condition?.terms?.some(term => term.key === selectedKey);
  const notPursuing = item.displayState?.kind === 'not-pursuing';
  const height = 28 + titleLines.length * 15 + stateLines.length * 13 + noteLines.length * 13 + (status ? 14 : 0);
  const stroke = related ? C.accent : C.border;
  let svg = '<g data-kind="roadmap-item" data-identity="' + item.identity + '" data-state="' +
    esc(item.displayState?.kind || 'repair') + '" data-related="' + related + '"><title>' +
    esc(`${item.title || 'Untitled item'} — ${item.displayState?.sentence || 'Logic needs repair'}`) + '</title>' +
    rect(x, y, width, height, C.surface, {stroke, sw:related ? 2 : 1, dash:notPursuing ? '4 3' : null});
  let ty = y + 18;
  if(status){ svg += txt(x + 12, ty, status, 8, C.muted, {weight:700}); ty += 14; }
  for(const text of titleLines){ svg += txt(x + 12, ty, text, 12, C.ink, {weight:700}); ty += 15; }
  for(const text of stateLines){ svg += txt(x + 12, ty + 1, text, 9, C.muted, {weight:600}); ty += 13; }
  for(const text of noteLines){ svg += txt(x + 12, ty + 3, text, 9, C.muted); ty += 13; }
  return {svg:svg + '</g>', height};
}

function cellMap(overview){
  return new Map((overview.cells || []).map(cell => [`${cell.period}\u0000${cell.lane}`, cell.items || []]));
}

function roadmapGrid(overview, x, y, C, measure, selectedKey){
  const periods = overview.periods || [], lanes = overview.lanes || [];
  const width = LANE_W + periods.length * PERIOD_W;
  if(!periods.length || !lanes.length){
    return {svg:'<g data-kind="roadmap-grid-empty">' +
      txt(x, y + 22, 'No roadmap work authored yet', 12, C.muted, {weight:600}) + '</g>', width, height:54};
  }
  const cells = cellMap(overview);
  const periodLabels = periods.map(period => wrapped(period.name, PERIOD_W - 24, measure, '700 11px ' + SANS));
  const headerHeight = Math.max(52, 22 + Math.max(1, ...periodLabels.map(lines => lines.length)) * 14);
  const layouts = [];
  for(const lane of lanes){
    const laneLines = wrapped(lane, LANE_W - 24, measure, '700 11px ' + SANS);
    const cellLayouts = periods.map(period => {
      const cards = (cells.get(`${period.name}\u0000${lane}`) || []).map(item =>
        itemCard(item, 0, 0, PERIOD_W - 20, C, measure, selectedKey));
      return {period, cards, height:cards.reduce((sum, card) => sum + card.height, 0) +
        Math.max(0, cards.length - 1) * 8 + 20};
    });
    layouts.push({lane, laneLines, cells:cellLayouts,
      height:Math.max(32 + laneLines.length * 14, 64, ...cellLayouts.map(cell => cell.height))});
  }
  const height = headerHeight + layouts.reduce((sum, lane) => sum + lane.height, 0);
  let svg = '<g data-kind="roadmap-grid">' + rect(x, y, width, height, C.bg, {stroke:C.border, sw:1}) +
    rect(x, y, LANE_W, headerHeight, wash(C.accent, '08')) +
    txt(x + 12, y + 20, 'ROADMAP', 9, C.muted, {weight:700, tracking:0.9}) +
    txt(x + 12, y + 38, 'Lane × period', 10, C.ink, {weight:700});
  periods.forEach((period, index) => {
    const px = x + LANE_W + index * PERIOD_W;
    svg += '<g data-kind="period-header"><title>' + esc(period.name) + '</title>' +
      rect(px, y, PERIOD_W, headerHeight, wash(C.accent, index % 2 ? '06' : '0A'));
    periodLabels[index].forEach((label, lineIndex) => {
      svg += txt(px + 12, y + 25 + lineIndex * 14, label, 11, C.ink, {weight:700, tracking:0.5});
    });
    svg += '</g>' +
      line(px, y, px, y + height, C.border, 1);
  });
  let rowY = y + headerHeight;
  for(const [laneIndex, lane] of layouts.entries()){
    svg += '<g data-kind="roadmap-lane"><title>' + esc(lane.lane) + '</title>' +
      rect(x, rowY, LANE_W, lane.height, laneIndex % 2 ? wash(C.muted, '06') : C.bg) +
      lane.laneLines.map((label, lineIndex) =>
        txt(x + 12, rowY + 22 + lineIndex * 14, label, 11, C.ink, {weight:700})).join('') + '</g>' +
      line(x, rowY, x + width, rowY, C.border, 1);
    for(const [periodIndex, cell] of lane.cells.entries()){
      const cellX = x + LANE_W + periodIndex * PERIOD_W;
      svg += '<g data-kind="roadmap-cell" data-period="' + esc(cell.period.name) + '" data-lane="' +
        esc(lane.lane) + '">';
      let cardY = rowY + 10;
      const items = cells.get(`${cell.period.name}\u0000${lane.lane}`) || [];
      for(const [index, item] of items.entries()){
        const card = itemCard(item, cellX + 10, cardY, PERIOD_W - 20, C, measure, selectedKey);
        svg += card.svg; cardY += card.height + 8;
      }
      svg += '</g>';
    }
    rowY += lane.height;
  }
  return {svg:svg + '</g>', width, height};
}

function gridPreface(x, y, width, C, measure){
  const copy = 'Work stays in its authored place; each card says what must be true for it to proceed.';
  const lines = wrapped(copy, width, measure, '600 11px ' + SANS);
  let svg = '<g data-kind="roadmap-preface">' +
    txt(x, y + 10, 'THE ROADMAP', 9, C.muted, {weight:700, tracking:0.9});
  lines.forEach((text, index) => { svg += txt(x, y + 29 + index * 14, text, 11, C.ink, {weight:600}); });
  return {svg:svg + '</g>', height:38 + lines.length * 14};
}

function modelHealth(overview, x, y, width, C, measure){
  const warnings = overview.modelHealth || [];
  if(!warnings.length) return {svg:'', height:0};
  let svg = '<g data-kind="overview-model-health">' +
    txt(x, y + 10, 'MODEL HEALTH · ' + warnings.length, 9, C.urgent, {weight:700, tracking:0.8});
  let ty = y + 31;
  for(const warning of warnings){
    const lines = wrapped(warning.message || String(warning), width, measure, '600 10px ' + SANS);
    for(const text of lines){ svg += txt(x, ty, text, 10, C.ink, {weight:600}); ty += 14; }
    ty += 4;
  }
  return {svg:svg + '</g>', height:ty - y + 4};
}

export function renderOverview(overview, ctx = {}){
  if(Number(ctx.width) > 0 && Number(ctx.width) < 520) return renderOverviewNarrow(overview, ctx);
  const measure = typeof ctx.measure === 'function' ? ctx.measure : value => String(value).length * 7;
  const C = palette(ctx.colors || {});
  const selected = selectedDecision(overview, ctx);
  const gridNatural = LANE_W + (overview.periods?.length || 0) * PERIOD_W;
  const width = Math.max(1100, Math.ceil(Number(ctx.width) || 1160), PAD * 2 + gridNatural);
  const head = header(overview, width, C, measure);
  let y = head.height;
  const readout = verdictBlock(overview, PAD, y, Math.min(900, width - PAD * 2), C, measure);
  y += readout.height;
  const stage = decisionStage(overview, selected, PAD, y, width - PAD * 2, C, measure, ctx);
  y += stage.height + 24;
  const health = modelHealth(overview, PAD, y, Math.min(900, width - PAD * 2), C, measure);
  y += health.height;
  const preface = gridPreface(PAD, y, Math.min(720, width - PAD * 2), C, measure);
  y += preface.height;
  const grid = roadmapGrid(overview, PAD, y, C, measure, selected?.key || null);
  y += grid.height + PAD;
  const height = Math.ceil(y);
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height +
    '" viewBox="0 0 ' + width + ' ' + height + '" data-theme="' + (ctx.dark ? 'dark' : 'light') +
    '" data-min-readable-scale="' + MIN_READABLE_SCALE + '" font-family="' + SANS + '" ' +
    rootRole(ctx) + '>' + accessibleHead(overview, selected) +
    rect(0, 0, width, height, C.bg) + head.svg + readout.svg + stage.svg + health.svg +
    preface.svg + grid.svg + '</svg>';
}

function narrowDecisions(overview, selected, x, y, width, C, measure, ctx){
  let svg = '<g data-kind="overview-attention">' +
    txt(x, y + 11, 'DECISIONS NEEDING ATTENTION', 9, C.muted, {weight:700, tracking:0.8});
  let rowY = y + 26;
  if(!overview.attention?.length){ svg += txt(x, rowY + 17, 'No active unanswered decisions', 11, C.muted); rowY += 44; }
  for(const decision of overview.attention || []){
    const row = attentionRow(decision, x, rowY, width, C, measure, selected?.key === decision.key, ctx);
    svg += row.svg; rowY += row.height + 8;
  }
  return {svg:svg + '</g>', height:rowY - y};
}

function narrowAgenda(overview, x, y, width, C, measure, selectedKey){
  const cells = cellMap(overview);
  let svg = '<g data-kind="roadmap-agenda">';
  const start = y;
  for(const period of overview.periods || []){
    const periodLines = wrapped(period.name, width - 24, measure, '700 11px ' + SANS);
    const periodHeight = 18 + periodLines.length * 14;
    svg += '<g data-kind="agenda-period"><title>' + esc(period.name) + '</title>' +
      rect(x, y, width, periodHeight, wash(C.accent, '0A'));
    periodLines.forEach((label, index) => {
      svg += txt(x + 12, y + 23 + index * 14, label, 11, C.ink, {weight:700, tracking:0.5});
    });
    svg += '</g>'; y += periodHeight;
    for(const lane of overview.lanes || []){
      const items = cells.get(`${period.name}\u0000${lane}`) || [];
      if(!items.length) continue;
      const laneLines = wrapped(lane, width - 8, measure, '700 10px ' + SANS);
      svg += '<g data-kind="agenda-lane"><title>' + esc(lane) + '</title>' +
        laneLines.map((label, index) => txt(x + 4, y + 18 + index * 13, label, 10, C.muted,
          {weight:700, tracking:0.5})).join('') + '</g>';
      y += 16 + laneLines.length * 13;
      for(const item of items){
        const card = itemCard(item, x, y, width, C, measure, selectedKey);
        svg += card.svg; y += card.height + 8;
      }
      y += 5;
    }
    y += 12;
  }
  if(!(overview.periods || []).length){
    svg += txt(x, y + 20, 'No roadmap work authored yet', 11, C.muted, {weight:600}); y += 48;
  }
  return {svg:svg + '</g>', height:y - start};
}

export function renderOverviewNarrow(overview, ctx = {}){
  const measure = typeof ctx.measure === 'function' ? ctx.measure : value => String(value).length * 7;
  const C = palette(ctx.colors || {});
  const selected = selectedDecision(overview, ctx);
  const width = Math.max(280, Math.min(520, Number(ctx.width) || 360));
  const inner = width - NARROW_PAD * 2;
  const head = header(overview, width, C, measure, true);
  let y = head.height;
  const readout = verdictBlock(overview, NARROW_PAD, y, inner, C, measure, true);
  y += readout.height;
  const decisions = narrowDecisions(overview, selected, NARROW_PAD, y, inner, C, measure, ctx);
  y += decisions.height + 12;
  const selectedReceipt = ctx?.showReceipt === false ? {svg:'', height:0}
    : receipt(selected, selectedImpact(selected, ctx), NARROW_PAD, y, inner, C, measure);
  y += selectedReceipt.height ? selectedReceipt.height + 12 : 0;
  const groups = stateGroups(overview, selected, NARROW_PAD, y, inner, C, measure, ctx, true);
  y += groups.height + 18;
  const health = modelHealth(overview, NARROW_PAD, y, inner, C, measure);
  y += health.height;
  const preface = gridPreface(NARROW_PAD, y, inner, C, measure);
  y += preface.height;
  const agenda = narrowAgenda(overview, NARROW_PAD, y, inner, C, measure, selected?.key || null);
  y += agenda.height + NARROW_PAD;
  const height = Math.ceil(y);
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + r2(width) + '" height="' + r2(height) +
    '" viewBox="0 0 ' + r2(width) + ' ' + r2(height) + '" data-theme="' + (ctx.dark ? 'dark' : 'light') +
    '" font-family="' + SANS + '" ' + rootRole(ctx) + '>' + accessibleHead(overview, selected) +
    rect(0, 0, width, height, C.bg) + head.svg + readout.svg + decisions.svg + selectedReceipt.svg +
    groups.svg + health.svg + preface.svg + agenda.svg + '</svg>';
}

export default renderOverview;
