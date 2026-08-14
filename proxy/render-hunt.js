/* Pure SVG renderer for Proxy Hunt. The causal lanes deliberately contain
   action -> mechanism -> outcome only. Measurements and reported readings are
   drawn in separate regions so layout cannot imply that a proxy is a cause. */

import {btnAttrs, esc, txt, wash} from '../assets/svg.js';
import {PALETTES, scheme} from '../assets/series.js';
import {artefactPalette as palette, wrappedArtefactText as wrapped} from '../paths/artefact-parts.js';

const SANS = "system-ui,-apple-system,'Segoe UI',sans-serif";
const DEFAULT_MEASURE = value => String(value ?? '').length * 7;

const s = value => String(value ?? '');
const shown = value => s(value).trim() || 'Not authored';
const cap = value => {
  const text = shown(value).replace(/-/g, ' ');
  return text[0].toUpperCase() + text.slice(1);
};

function huntPalette(hunt, ctx){
  const dark = Boolean(ctx.dark);
  const accent = hunt?.accent || PALETTES[hunt?.palette]?.[dark ? 'dark' : 'light'];
  const colors = accent ? {...(ctx.colors || {}), ...scheme(accent, dark)} : (ctx.colors || {});
  return palette(colors);
}

function rect(x, y, width, height, fill, {stroke = 'none', sw = 0, dash = ''} = {}){
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}"` +
    (stroke !== 'none' ? ` stroke="${stroke}" stroke-width="${sw}"` : '') +
    (dash ? ` stroke-dasharray="${dash}"` : '') + '/>';
}

function line(x1, y1, x2, y2, stroke, width = 1, dash = ''){
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}"` +
    (dash ? ` stroke-dasharray="${dash}"` : '') + '/>';
}

function arrow(x1, y1, x2, y2, stroke){
  const horizontal = Math.abs(x2 - x1) >= Math.abs(y2 - y1);
  const points = horizontal
    ? `${x2},${y2} ${x2 - 7},${y2 - 4} ${x2 - 7},${y2 + 4}`
    : `${x2},${y2} ${x2 - 4},${y2 - 7} ${x2 + 4},${y2 - 7}`;
  return line(x1, y1, x2, y2, stroke, 1.5) + `<polygon points="${points}" fill="${stroke}"/>`;
}

function textLines(value, maxWidth, measure, size = 12, weight = 600){
  const lines = wrapped(shown(value), Math.max(30, maxWidth), measure, `${weight} ${size}px ${SANS}`);
  return lines.length ? lines : ['Not authored'];
}

function drawLines(lines, x, y, size, fill, {weight = 600, lineHeight = size + 5, anchor} = {}){
  return lines.map((value, index) => txt(x, y + index * lineHeight, value, size, fill,
    {weight, anchor})).join('');
}

function field(label, value, x, y, width, C, measure, {strong = false, tone = null} = {}){
  const size = strong ? 13 : 11, lineHeight = strong ? 18 : 16;
  const lines = textLines(value, width, measure, size, strong ? 700 : 550);
  const color = tone || C.ink;
  return {
    label, lines, size, lineHeight, color, weight:strong ? 700 : 550,
    height:28 + lines.length * lineHeight,
  };
}

function drawField(item, x, y, C){
  return txt(x, y + 8, item.label, 8, C.muted, {weight:800, tracking:0.8}) +
    drawLines(item.lines, x, y + 28, item.size, item.color,
      {weight:item.weight, lineHeight:item.lineHeight});
}

function routePlan(route, width, measure, narrow){
  const gap = narrow ? 30 : 28;
  const cardWidth = narrow ? width : (width - gap * 2) / 3;
  const values = [route.action, route.mechanism, route.outcome || route.harmedOutcome];
  const lines = values.map(value => textLines(value, cardWidth - 24, measure, narrow ? 13 : 12, 650));
  const heights = lines.map(rows => Math.max(narrow ? 74 : 68, 39 + rows.length * (narrow ? 18 : 17)));
  return {gap, cardWidth, lines, heights,
    height:narrow ? heights.reduce((sum, h) => sum + h, 0) + gap * 2 : Math.max(...heights)};
}

function routeLane(route, x, y, width, C, measure, {narrow = false, failure = false} = {}){
  const L = routePlan(route, width, measure, narrow);
  const labels = failure ? ['ACTION', 'FAILURE MECHANISM', 'HARMED OUTCOME'] :
    ['ACTION', 'INTENDED MECHANISM', 'DESIRED OUTCOME'];
  let svg = `<g data-kind="${failure ? 'failure-route' : 'intended-route'}">`;
  let cursorX = x, cursorY = y;
  const stroke = failure ? C.urgent : C.accent;
  for(let index = 0; index < 3; index++){
    const h = L.heights[index];
    svg += rect(cursorX, cursorY, L.cardWidth, h,
      failure ? wash(C.urgent, '08') : wash(C.accent, '08'), {stroke, sw:index === 1 ? 1.5 : 1});
    svg += txt(cursorX + 12, cursorY + 17, labels[index], 8, index === 1 ? stroke : C.muted,
      {weight:800, tracking:0.75});
    svg += drawLines(L.lines[index], cursorX + 12, cursorY + 39, narrow ? 13 : 12, C.ink,
      {weight:index === 1 ? 700 : 600, lineHeight:narrow ? 18 : 17});
    if(index < 2){
      if(narrow){
        const ax = cursorX + L.cardWidth / 2;
        svg += arrow(ax, cursorY + h + 5, ax, cursorY + h + L.gap - 5, stroke);
        cursorY += h + L.gap;
      } else {
        const ay = y + L.height / 2;
        svg += arrow(cursorX + L.cardWidth + 5, ay, cursorX + L.cardWidth + L.gap - 5, ay, stroke);
        cursorX += L.cardWidth + L.gap;
      }
    }
  }
  return {height:L.height, svg:svg + '</g>'};
}

function theoryTone(theory, C){
  return theory.status === 'ready' && theory.basis !== 'speculative-concern' ? C.urgent : C.muted;
}

function interactionAttrs(theory, selected, interactive){
  if(!interactive) return '';
  return ` data-select-theory="" data-selected="${selected}" aria-pressed="${selected}"` +
    btnAttrs(`Review failure theory ${theory.id}`);
}

function theoryCard(theory, x, y, width, C, measure, {narrow = false, selected = false,
  interactive = false, compact = false} = {}){
  const inset = narrow ? 14 : 16;
  const inner = width - inset * 2;
  const headerHeight = narrow ? 58 : 43;
  const route = routeLane(theory.route, x + inset, y + headerHeight, inner, C, measure, {narrow, failure:true});
  const guardrail = field('PAIRED GUARDRAIL', theory.guardrail, x + inset, 0, inner, C, measure, {strong:true});
  const basis = field('BASIS', cap(theory.basis), x + inset, 0, inner, C, measure);
  const weaken = field('WHAT WOULD WEAKEN THIS CONCERN', theory.weakenWith, x + inset, 0, inner, C, measure);
  const support = theory.support ? field('AUTHORED SUPPORT', theory.support, x + inset, 0, inner, C, measure) : null;
  const details = compact ? [] : [guardrail, basis, support, weaken].filter(Boolean);
  const detailHeight = details.reduce((sum, item) => sum + item.height + 8, 0);
  const height = headerHeight + route.height + (compact ? inset : 18 + detailHeight + inset);
  const tone = theoryTone(theory, C);
  let svg = `<g data-kind="failure-theory" data-theory-id="${esc(s(theory.id))}"` +
    interactionAttrs(theory, selected, interactive) + '>';
  svg += rect(x, y, width, height, selected ? wash(C.urgent, '08') : C.surface,
    {stroke:selected ? C.urgent : C.border, sw:selected ? 2 : 1});
  if(selected) svg += rect(x, y, 4, height, C.urgent);
  svg += txt(x + inset, y + 20, `FAILURE THEORY · ${s(theory.id).toUpperCase()}`, 9, tone,
    {weight:800, tracking:0.85});
  const stateLabel = `${selected ? 'SELECTED · ' : ''}${s(theory.registerLabel)}`;
  svg += txt(narrow ? x + inset : x + width - inset, y + (narrow ? 39 : 20), stateLabel.toUpperCase(), 8,
    selected ? C.urgent : tone, {weight:800, tracking:0.65, anchor:narrow ? undefined : 'end'});
  svg += route.svg;
  if(!compact){
    let cursor = y + headerHeight + route.height + 16;
    svg += line(x + inset, cursor - 7, x + width - inset, cursor - 7, C.border, 1);
    for(const item of details){
      svg += drawField(item, x + inset, cursor, C);
      cursor += item.height + 8;
    }
  }
  if(interactive) svg += `<rect data-hit="" x="${x}" y="${y}" width="${width}" height="${Math.max(44, height)}" fill="${C.bg}" fill-opacity="0"/>`;
  return {height, svg:svg + '</g>'};
}

function patternStrip(pattern, x, y, width, C, measure, narrow){
  if(!pattern) return {height:0, svg:''};
  const inset = narrow ? 14 : 18, inner = width - inset * 2;
  const outcomeLabel = pattern.outcomeKind === 'desired' ? 'DESIRED OUTCOME READING' :
    pattern.outcomeKind === 'protected' ? 'PROTECTED OUTCOME READING' : 'OUTCOME READING';
  const fields = [
    ['PROXY READING', pattern.proxyReading],
    [outcomeLabel, `${shown(pattern.outcomeReading)} · ${shown(pattern.outcome)}`],
    ['POPULATION · HORIZON', `${shown(pattern.population)} · ${shown(pattern.horizon)}`],
    ['COMPARATOR · SOURCE', `${shown(pattern.comparator)} · ${shown(pattern.source)}`],
  ];
  const cols = narrow ? 1 : 4, gap = narrow ? 8 : 16, colWidth = (inner - gap * (cols - 1)) / cols;
  const planned = fields.map(([, value]) => textLines(value, colWidth, measure, narrow ? 12 : 10, 650));
  const rows = Math.ceil(fields.length / cols);
  const rowHeights = Array.from({length:rows}, (_, row) => Math.max(...planned.slice(row * cols, row * cols + cols)
    .map(lines => 25 + lines.length * (narrow ? 17 : 14))));
  const caveatLines = textLines(`${pattern.caveat} ${pattern.mechanismStatement}`, inner, measure, 10, 700);
  const height = inset + 24 + rowHeights.reduce((sum, h) => sum + h, 0) + gap * Math.max(0, rows - 1) +
    14 + caveatLines.length * 14 + inset;
  let svg = `<g data-kind="reported-pattern">` + rect(x, y, width, height, wash(C.accent, '06'),
    {stroke:pattern.complete ? C.accent : C.border, sw:1, dash:pattern.complete ? '' : '5 4'});
  svg += txt(x + inset, y + inset + 8, pattern.complete ? 'REPORTED PATTERN' : 'INCOMPLETE REPORTED PATTERN',
    9, pattern.complete ? C.accentInk : C.muted, {weight:800, tracking:0.9});
  let cursorY = y + inset + 30;
  for(let index = 0; index < fields.length; index++){
    const row = Math.floor(index / cols), col = index % cols;
    if(col === 0 && row > 0) cursorY += rowHeights[row - 1] + gap;
    const fx = x + inset + col * (colWidth + gap);
    svg += txt(fx, cursorY, fields[index][0], 8, C.muted, {weight:800, tracking:0.65});
    svg += drawLines(planned[index], fx, cursorY + 20, narrow ? 12 : 10, C.ink,
      {weight:650, lineHeight:narrow ? 17 : 14});
  }
  cursorY += rowHeights[rows - 1] + 7;
  svg += line(x + inset, cursorY, x + width - inset, cursorY, C.border, 1); cursorY += 19;
  svg += drawLines(caveatLines, x + inset, cursorY, 10, C.muted, {weight:700, lineHeight:14});
  return {height, svg:svg + '</g>'};
}

function receiptFields(receipt){
  return [
    ['FAILURE THEORY', receipt?.failureTheory],
    ['HARMED OUTCOME', receipt?.harmedOutcome],
    ['PAIRED GUARDRAIL', receipt?.guardrail],
    ['BASIS', cap(receipt?.basis)],
    ...(receipt?.support ? [['AUTHORED SUPPORT', receipt.support]] : []),
    ['WHAT WOULD WEAKEN THIS CONCERN', receipt?.weakenWith],
  ];
}

function receiptPatternContext(pattern, x, y, width, C, measure, narrow){
  if(!pattern) return {height:0, svg:''};
  const inset = narrow ? 12 : 14, inner = width - inset * 2;
  const outcomeLabel = pattern.outcomeKind === 'desired' ? 'DESIRED OUTCOME' :
    pattern.outcomeKind === 'protected' ? 'PROTECTED OUTCOME' : 'OUTCOME';
  const values = [
    ['PROXY READING', pattern.proxyReading],
    [outcomeLabel, `${shown(pattern.outcomeReading)} · ${shown(pattern.outcome)}`],
    ['POPULATION · HORIZON', `${shown(pattern.population)} · ${shown(pattern.horizon)}`],
    ['COMPARATOR · SOURCE', `${shown(pattern.comparator)} · ${shown(pattern.source)}`],
  ].map(([name, value]) => ({name,
    lines:textLines(value, inner, measure, narrow ? 11 : 10, 650)}));
  const rowsHeight = values.reduce((sum, entry) => sum + 18 + entry.lines.length * (narrow ? 16 : 14) + 7, 0);
  const caveat = textLines('Context only — reported pattern does not establish causality.', inner,
    measure, 10, 750);
  const height = inset + 28 + rowsHeight + 12 + caveat.length * 14 + inset;
  let svg = '<g data-kind="receipt-reported-pattern">' +
    rect(x, y, width, height, wash(C.accent, '06'), {stroke:C.border, sw:1}) +
    txt(x + inset, y + inset + 7, 'APPLICABLE REPORTED PATTERN · NON-CAUSAL CONTEXT', 8,
      C.accentInk, {weight:800, tracking:0.65});
  let cursor = y + inset + 31;
  for(const entry of values){
    svg += txt(x + inset, cursor, entry.name, 8, C.muted, {weight:800, tracking:0.55}); cursor += 18;
    svg += drawLines(entry.lines, x + inset, cursor, narrow ? 11 : 10, C.ink,
      {weight:650, lineHeight:narrow ? 16 : 14});
    cursor += entry.lines.length * (narrow ? 16 : 14) + 7;
  }
  svg += line(x + inset, cursor, x + width - inset, cursor, C.border, 1); cursor += 18;
  svg += drawLines(caveat, x + inset, cursor, 10, C.muted, {weight:750, lineHeight:14});
  return {height, svg:svg + '</g>'};
}

function receiptPanel(receipt, x, y, width, C, measure, {
  narrow = false, label = 'SELECTED THEORY RECEIPT', focusable = false,
} = {}){
  const inset = narrow ? 16 : 18, inner = width - inset * 2;
  const fields = receiptFields(receipt).map(([name, value]) => ({name,
    lines:textLines(value, inner, measure, narrow ? 13 : 11, name === 'PAIRED GUARDRAIL' ? 700 : 550)}));
  const fieldHeight = fields.reduce((sum, entry) => sum + 20 + entry.lines.length * (narrow ? 18 : 16) + 11, 0);
  const caveat = [shown(receipt?.causalLimitation)];
  if(receipt?.reportedPattern)
    caveat.push('Reported pattern does not establish causality.', 'Mechanism remains a hypothesis.');
  const caveatPlans = caveat.map(value => textLines(value, inner, measure, 10, 700));
  const caveatHeight = caveatPlans.reduce((sum, lines) => sum + lines.length * 15, 0);
  const pattern = receiptPatternContext(receipt?.reportedPattern, x + inset, 0, inner, C, measure, narrow);
  const patternHeight = pattern.height ? pattern.height + 17 : 0;
  const height = inset + 28 + fieldHeight + patternHeight + 31 + caveatHeight + inset;
  const focusAttrs = focusable
    ? ` tabindex="0" role="region" aria-label="Selected theory receipt for ${esc(s(receipt?.id))}"`
    : '';
  let svg = `<g data-kind="selected-theory-receipt" data-theory-id="${esc(s(receipt?.id))}"${focusAttrs}>` +
    rect(x, y, width, height, C.surface, {stroke:C.urgent, sw:1.5}) +
    rect(x, y, 4, height, C.urgent) + txt(x + inset, y + inset + 8, label, 9, C.urgent,
      {weight:800, tracking:0.9});
  let cursor = y + inset + 36;
  for(const entry of fields){
    svg += txt(x + inset, cursor, entry.name, 8, C.muted, {weight:800, tracking:0.65}); cursor += 20;
    svg += drawLines(entry.lines, x + inset, cursor, narrow ? 13 : 11, C.ink,
      {weight:entry.name === 'PAIRED GUARDRAIL' ? 700 : 550, lineHeight:narrow ? 18 : 16});
    cursor += entry.lines.length * (narrow ? 18 : 16) + 11;
  }
  if(pattern.height){
    cursor += 2;
    const placed = receiptPatternContext(receipt.reportedPattern, x + inset, cursor, inner, C, measure, narrow);
    svg += placed.svg; cursor += placed.height + 15;
  }
  svg += line(x + inset, cursor - 3, x + width - inset, cursor - 3, C.border, 1); cursor += 13;
  svg += txt(x + inset, cursor, 'CAUSAL LIMIT', 8, C.urgent, {weight:800, tracking:0.7}); cursor += 18;
  for(const lines of caveatPlans){
    svg += drawLines(lines, x + inset, cursor, 10, C.muted, {weight:700, lineHeight:15});
    cursor += lines.length * 15;
  }
  return {height, svg:svg + '</g>'};
}

function causalLimitBand(hunt, x, y, width, C, measure, narrow){
  const limitation = hunt.selectedReceipt?.causalLimitation || hunt.verdict?.limit ||
    'The mechanism is an authored hypothesis, not proof of causal effect.';
  const inset = narrow ? 14 : 18;
  const lines = textLines(limitation, width - inset * 2, measure, narrow ? 11 : 10, 700);
  const height = inset + 18 + lines.length * (narrow ? 16 : 14) + inset;
  let svg = '<g data-kind="causal-limitation">' +
    rect(x, y, width, height, wash(C.urgent, '05'), {stroke:C.border, sw:1}) +
    txt(x + inset, y + inset + 7, 'CAUSAL LIMIT', 8, C.urgent, {weight:800, tracking:0.75}) +
    drawLines(lines, x + inset, y + inset + 27, narrow ? 11 : 10, C.muted,
      {weight:700, lineHeight:narrow ? 16 : 14});
  return {height, svg:svg + '</g>'};
}

function semanticHead(hunt, suffix = 'Proxy Hunt'){
  const theorySummary = (hunt.failureTheories || []).map(theory =>
    `${theory.id}: ${theory.route?.mechanism || 'mechanism not authored'}; status ${theory.registerLabel}.`).join(' ');
  const pattern = hunt.reportedPattern ? ` ${hunt.reportedPattern.caveat} ${hunt.reportedPattern.mechanismStatement}` : '';
  const causalLimit = hunt.selectedReceipt?.causalLimitation || hunt.verdict?.limit || '';
  const authored = hunt.authoredVerdict?.line
    ? ` Author-stated verdict (hunt-level annotation, not a theory conclusion): ${hunt.authoredVerdict.line}.`
    : '';
  const description = `Tool-derived review state: ${hunt.verdict?.line || 'Unavailable'}. ` +
    `Intended theory: ${hunt.intendedRoute?.action || 'action not authored'}; ${hunt.intendedRoute?.mechanism || 'mechanism not authored'}; ` +
    `${hunt.intendedRoute?.outcome || 'outcome not authored'}. Failure theories: ${theorySummary || 'challenge not yet articulated.'} ` +
    `Causal limit: ${causalLimit}.${authored}${pattern}`;
  return `<title id="proxy-hunt-name">${esc(`${hunt.title || suffix} — ${suffix}`)}</title>` +
    `<desc id="proxy-hunt-description">${esc(description)}</desc>`;
}

function header(hunt, x, y, width, C, measure, narrow, {authoredScope = 'HUNT-LEVEL'} = {}){
  const titleLines = textLines(hunt.title || 'Proxy Hunt', width, measure, narrow ? 22 : 25, 700);
  const verdictLines = textLines(hunt.verdict?.line || 'No verdict available.', width, measure, narrow ? 16 : 18, 750);
  const limitLines = hunt.verdict?.limit ? textLines(hunt.verdict.limit, width, measure, 10, 650) : [];
  const authoredLines = hunt.authoredVerdict?.line
    ? textLines(hunt.authoredVerdict.line, width, measure, narrow ? 14 : 15, 700) : [];
  const dateLines = textLines(`AUTHORED DATE · ${hunt.date || 'NOT STATED'}`, Math.min(240, width * .42),
    measure, 8, 750);
  const status = hunt.status === 'ready' ? 'review ready' : hunt.status;
  let svg = txt(x, y + 8, `PROXY HUNT · ${s(status).toUpperCase()}`, 9,
    hunt.verdict?.authoritative ? C.accentInk : C.urgent, {weight:800, tracking:1.1});
  svg += drawLines(dateLines, x + width, y + 8, 8, C.muted,
    {weight:750, lineHeight:12, anchor:'end'});
  let cursor = y + Math.max(39, 15 + dateLines.length * 12);
  svg += drawLines(titleLines, x, cursor, narrow ? 22 : 25, C.ink,
    {weight:700, lineHeight:narrow ? 29 : 32}); cursor += titleLines.length * (narrow ? 29 : 32) + 9;
  svg += txt(x, cursor + 7, 'REVIEW STATE · TOOL-DERIVED', 8, C.muted, {weight:800, tracking:.8}); cursor += 20;
  svg += drawLines(verdictLines, x, cursor, narrow ? 16 : 18, C.ink,
    {weight:750, lineHeight:narrow ? 22 : 25}); cursor += verdictLines.length * (narrow ? 22 : 25);
  if(limitLines.length){ cursor += 6; svg += drawLines(limitLines, x, cursor, 10, C.muted, {weight:650, lineHeight:14});
    cursor += limitLines.length * 14; }
  if(authoredLines.length){
    cursor += 13;
    svg += txt(x, cursor + 7, `AUTHOR-STATED VERDICT · ${authoredScope}`, 8, C.accentInk,
      {weight:800, tracking:.75}); cursor += 20;
    svg += drawLines(authoredLines, x, cursor, narrow ? 14 : 15, C.ink,
      {weight:700, lineHeight:narrow ? 20 : 22}); cursor += authoredLines.length * (narrow ? 20 : 22);
  }
  return {height:cursor - y, svg};
}

function targetBand(hunt, x, y, width, C, measure, narrow){
  const fields = [
    ['DESIRED OUTCOME', hunt.target?.outcome],
    [hunt.measurement?.role === 'guardrail' ? 'MEASURE TO MONITOR' : 'MEASURE UNDER PRESSURE', hunt.measurement?.proxy],
    ['ACTION UNDER REVIEW', hunt.target?.action],
  ];
  if(hunt.target?.mode === 'monitor') fields.push(['OPTIMISATION PRESSURE', hunt.target.optimisationPressure]);
  const cols = narrow ? 1 : fields.length, gap = narrow ? 11 : 18, inset = narrow ? 14 : 18;
  const inner = width - inset * 2, colWidth = (inner - gap * (cols - 1)) / cols;
  const plans = fields.map(([, value]) => textLines(value, colWidth, measure, narrow ? 13 : 11, 650));
  const height = narrow
    ? inset * 2 + plans.reduce((sum, lines) => sum + 19 + lines.length * 18 + gap, 0) - gap
    : inset * 2 + 20 + Math.max(...plans.map(lines => lines.length)) * 16;
  let svg = `<g data-kind="target-and-measurement">` + rect(x, y, width, height, wash(C.accent, '06'),
    {stroke:C.border, sw:1});
  let cursorY = y + inset;
  for(let index = 0; index < fields.length; index++){
    const fx = narrow ? x + inset : x + inset + index * (colWidth + gap);
    if(narrow && index > 0) cursorY += plans[index - 1].length * 18 + 19 + gap;
    svg += txt(fx, cursorY + 8, fields[index][0], 8, index === 1 ? C.accentInk : C.muted,
      {weight:800, tracking:0.75});
    svg += drawLines(plans[index], fx, cursorY + 29, narrow ? 13 : 11, C.ink,
      {weight:index === 1 ? 750 : 600, lineHeight:narrow ? 18 : 16});
  }
  return {height, svg:svg + '</g>'};
}

function renderWide(hunt, ctx){
  const C = huntPalette(hunt, ctx), measure = ctx.measure || DEFAULT_MEASURE;
  const width = Math.max(860, Math.round(ctx.width || 1180)), pad = 34, gap = 22;
  const content = width - pad * 2;
  const liveSelection = !!ctx.interactive && ctx.selection !== false ? hunt.selectedTheoryId : null;
  const mainWidth = liveSelection ? Math.round(content * 0.68) : content;
  const receiptWidth = content - mainWidth - gap;
  let y = 30, body = '';
  const head = header(hunt, pad, y, content, C, measure, false); body += head.svg; y += head.height + 22;
  const target = targetBand(hunt, pad, y, content, C, measure, false); body += target.svg; y += target.height + 26;
  if(!ctx.interactive){
    const limit = causalLimitBand(hunt, pad, y - 8, content, C, measure, false);
    body += limit.svg; y += limit.height + 10;
  }
  body += txt(pad, y + 8, 'INTENDED THEORY', 9, C.accentInk, {weight:800, tracking:1}); y += 25;
  const intended = routeLane(hunt.intendedRoute || {}, pad, y, mainWidth, C, measure);
  body += intended.svg; y += intended.height + 28;
  body += txt(pad, y + 8, 'FAILURE THEORIES', 9, C.urgent, {weight:800, tracking:1});
  body += txt(pad + mainWidth, y + 8, `${(hunt.failureTheories || []).length} OF 3`, 9, C.muted,
    {weight:750, tracking:0.7, anchor:'end'}); y += 24;
  const theoryTop = y;
  if(!(hunt.failureTheories || []).length){
    const empty = textLines('Challenge not yet articulated. Incomplete review is not endorsement.', mainWidth - 30,
      measure, 13, 700);
    const emptyHeight = 46 + empty.length * 18;
    body += rect(pad, y, mainWidth, emptyHeight, wash(C.urgent, '06'), {stroke:C.urgent, sw:1, dash:'5 4'});
    body += drawLines(empty, pad + 15, y + 29, 13, C.ink, {weight:700, lineHeight:18}); y += emptyHeight + 16;
  } else {
    for(const theory of hunt.failureTheories){
      const selected = theory.id === liveSelection;
      const card = theoryCard(theory, pad, y, mainWidth, C, measure,
        {selected, interactive:!!ctx.interactive, compact:!!liveSelection && !selected});
      body += card.svg; y += card.height + 14;
    }
  }
  if(liveSelection && hunt.selectedReceipt){
    const receipt = receiptPanel(hunt.selectedReceipt, pad + mainWidth + gap, theoryTop, receiptWidth, C, measure,
      {focusable:true});
    body += receipt.svg;
    y = Math.max(y, theoryTop + receipt.height + 14);
  }
  if(hunt.reportedPattern){
    y += 8;
    const pattern = patternStrip(hunt.reportedPattern, pad, y, content, C, measure, false);
    body += pattern.svg; y += pattern.height + 20;
  }
  if(hunt.tradeOff){
    const lines = textLines(`Trade-off: ${shown(hunt.tradeOff.description)} Decision rule: ${shown(hunt.tradeOff.decisionRule)}`,
      content - 30, measure, 11, 650);
    const height = 28 + lines.length * 16;
    body += rect(pad, y, content, height, wash(C.urgent, '06'), {stroke:C.urgent, sw:1,
      dash:hunt.tradeOff.decisionRule ? '' : '5 4'});
    body += drawLines(lines, pad + 15, y + 23, 11, C.ink, {weight:650, lineHeight:16}); y += height + 18;
  }
  y += 16;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${Math.ceil(y)}" viewBox="0 0 ${width} ${Math.ceil(y)}" ` +
    `font-family="${SANS}" ${ctx.interactive ? 'role="group"' : 'role="img"'} ` +
    'aria-labelledby="proxy-hunt-name proxy-hunt-description">' + semanticHead(hunt) +
    rect(0, 0, width, Math.ceil(y), C.bg) + body + '</svg>';
}

function renderNarrow(hunt, ctx){
  const C = huntPalette(hunt, ctx), measure = ctx.measure || DEFAULT_MEASURE;
  const width = Math.max(300, Math.round(ctx.width || 390)), pad = 16, content = width - pad * 2;
  const liveSelection = !!ctx.interactive && ctx.selection !== false ? hunt.selectedTheoryId : null;
  let y = 24, body = '';
  const head = header(hunt, pad, y, content, C, measure, true); body += head.svg; y += head.height + 20;
  const target = targetBand(hunt, pad, y, content, C, measure, true); body += target.svg; y += target.height + 22;
  if(!ctx.interactive){
    const limit = causalLimitBand(hunt, pad, y - 6, content, C, measure, true);
    body += limit.svg; y += limit.height + 12;
  }
  body += txt(pad, y + 8, 'INTENDED THEORY', 9, C.accentInk, {weight:800, tracking:0.9}); y += 24;
  const intended = routeLane(hunt.intendedRoute || {}, pad, y, content, C, measure, {narrow:true});
  body += intended.svg; y += intended.height + 26;
  body += txt(pad, y + 8, 'FAILURE THEORY REGISTER', 9, C.urgent, {weight:800, tracking:0.9}); y += 24;
  if(!(hunt.failureTheories || []).length){
    const lines = textLines('Challenge not yet articulated. Incomplete review is not endorsement.', content - 28,
      measure, 13, 700);
    const height = 32 + lines.length * 18;
    body += rect(pad, y, content, height, wash(C.urgent, '06'), {stroke:C.urgent, sw:1, dash:'5 4'});
    body += drawLines(lines, pad + 14, y + 25, 13, C.ink, {weight:700, lineHeight:18}); y += height + 14;
  } else {
    for(const theory of hunt.failureTheories){
      const selected = theory.id === liveSelection;
      const card = theoryCard(theory, pad, y, content, C, measure,
        {narrow:true, selected, interactive:!!ctx.interactive, compact:!!liveSelection});
      body += card.svg; y += card.height + 12;
    }
  }
  if(liveSelection && hunt.selectedReceipt){
    const receipt = receiptPanel(hunt.selectedReceipt, pad, y + 4, content, C, measure,
      {narrow:true, focusable:true});
    body += receipt.svg; y += receipt.height + 20;
  }
  if(hunt.reportedPattern){
    const pattern = patternStrip(hunt.reportedPattern, pad, y + 4, content, C, measure, true);
    body += pattern.svg; y += pattern.height + 20;
  }
  if(hunt.tradeOff){
    const lines = textLines(`Trade-off: ${shown(hunt.tradeOff.description)} Decision rule: ${shown(hunt.tradeOff.decisionRule)}`,
      content - 28, measure, 11, 650);
    const height = 30 + lines.length * 16;
    body += rect(pad, y, content, height, wash(C.urgent, '06'), {stroke:C.urgent, sw:1,
      dash:hunt.tradeOff.decisionRule ? '' : '5 4'});
    body += drawLines(lines, pad + 14, y + 24, 11, C.ink, {weight:650, lineHeight:16}); y += height + 18;
  }
  y += 12;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${Math.ceil(y)}" viewBox="0 0 ${width} ${Math.ceil(y)}" ` +
    `font-family="${SANS}" ${ctx.interactive ? 'role="group"' : 'role="img"'} ` +
    'aria-labelledby="proxy-hunt-name proxy-hunt-description" data-layout="proxy-hunt-narrow">' + semanticHead(hunt) +
    rect(0, 0, width, Math.ceil(y), C.bg) + body + '</svg>';
}

export function renderHunt(hunt, ctx = {}){ return renderWide(hunt, ctx); }
export function renderHuntNarrow(hunt, ctx = {}){ return renderNarrow(hunt, ctx); }

export function renderHuntReceipt(hunt, ctx = {}){
  const C = huntPalette(hunt, ctx), measure = ctx.measure || DEFAULT_MEASURE;
  const width = Math.max(300, Math.round(ctx.width || 520)), pad = 20, content = width - pad * 2;
  const narrow = width < 440;
  let y = 24;
  const head = header(hunt, pad, y, content, C, measure, narrow,
    {authoredScope:'HUNT-LEVEL · NOT A THEORY CONCLUSION'}); y += head.height + 18;
  const target = targetBand(hunt, pad, y, content, C, measure, narrow); y += target.height + 18;
  const receipt = receiptPanel(hunt.selectedReceipt, pad, y, content, C, measure,
    {narrow, label:'FAILURE THEORY RECEIPT · SCOPED'}); y += receipt.height + 24;
  const height = y;
  const title = `${hunt.title || 'Proxy Hunt'} — selected failure theory receipt`;
  const description = `Scoped receipt for ${hunt.selectedReceipt?.id || 'no selected theory'}. ` +
    `Tool-derived review state: ${hunt.verdict?.line || ''}. ` +
    `${hunt.authoredVerdict?.line ? `Author-stated hunt-level annotation, not a theory conclusion: ${hunt.authoredVerdict.line}. ` : ''}` +
    `Causal limit: ${hunt.selectedReceipt?.causalLimitation || hunt.verdict?.limit || ''}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" ` +
    `font-family="${SANS}" role="img" aria-labelledby="proxy-hunt-receipt-name proxy-hunt-receipt-description">` +
    `<title id="proxy-hunt-receipt-name">${esc(title)}</title><desc id="proxy-hunt-receipt-description">${esc(description)}</desc>` +
    rect(0, 0, width, height, C.bg) + head.svg + target.svg + receipt.svg + '</svg>';
}
