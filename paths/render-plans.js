/* /paths Possible Plans artefact. Pure: consumes the existing plan projection. */

import {esc, txt, wash, wrapText} from '../assets/svg.js';
import {svgMetrics, svgVerdict} from '../assets/verdict-svg.js';
import {line, rect} from '../roadmap/deck-parts.js';
import {verdict} from './verdict.js';

const SANS = "system-ui,-apple-system,'Segoe UI',sans-serif";
const SERIF = "Charter,'Bitstream Charter',Georgia,serif";
const PAD = 36;
const NARROW_PAD = 14;

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
    brandText:pick(accent, 'brandText', 'accentInk', 'accent', 'brand', 'ink'),
    included:pick(accent, 'yes', 'positive', 'success', 'accent', 'brand', 'ink'),
    waiting:pick(accent, 'conditional', 'warning', 'accent', 'brand', 'ink'),
    assumed:pick(accent, 'doing', 'status.doing', 'accent', 'brand', 'ink'),
    done:pick(accent, 'status.done', 'done', 'success', 'accent', 'brand', 'ink'),
    doing:pick(accent, 'status.doing', 'doing', 'accent', 'brand', 'ink'),
    risk:pick(accent, 'status.risk', 'risk', 'warning', 'accent', 'brand', 'ink'),
    blocked:pick(accent, 'status.blocked', 'blocked', 'danger', 'accent', 'brand', 'ink')};
}

function safeMeasure(measure, value, font){
  const width = Number(measure(String(value ?? ''), font));
  return Number.isFinite(width) && width >= 0 ? width : String(value ?? '').length * 7;
}

function clipped(value, maxWidth, measure, font = '600 10px ' + SANS){
  const source = String(value ?? '');
  if(safeMeasure(measure, source, font) <= maxWidth) return source;
  let out = source;
  while(out && safeMeasure(measure, out + '…', font) > maxWidth) out = out.slice(0, -1);
  return out ? out + '…' : '';
}

/* wrapText keeps a single long token intact. Paths permits long slug decision
   names and free-text titles, so split an overlong token into measured chunks
   instead of letting it cross the SVG edge or silently dropping its suffix. */
function hardWrapped(value, maxWidth, measure, font){
  const tokens = String(value ?? '').trim().split(/\s+/).filter(Boolean);
  const pieces = [];
  for(const token of tokens){
    if(safeMeasure(measure, token, font) <= maxWidth){ pieces.push(token); continue; }
    let rest = token;
    while(rest){
      let lo = 1, hi = rest.length, fit = 1;
      while(lo <= hi){
        const mid = Math.floor((lo + hi) / 2);
        if(safeMeasure(measure, rest.slice(0, mid), font) <= maxWidth){ fit = mid; lo = mid + 1; }
        else hi = mid - 1;
      }
      pieces.push(rest.slice(0, fit));
      rest = rest.slice(fit);
    }
  }
  const lines = [];
  let current = '';
  for(const piece of pieces){
    const trial = current ? current + ' ' + piece : piece;
    if(current && safeMeasure(measure, trial, font) > maxWidth){ lines.push(current); current = piece; }
    else current = trial;
  }
  if(current) lines.push(current);
  return lines;
}

function boundedTokens(value, maxWidth, measure, font){
  return String(value ?? '').split(/(\s+)/).map(token => /^\s+$/.test(token) ||
    safeMeasure(measure, token, font) <= maxWidth ? token : clipped(token, maxWidth, measure, font)).join('');
}

function titleLines(value, width, measure, size = 24){
  return hardWrapped(String(value || 'Untitled paths'), width, measure, `700 ${size}px ${SERIF}`);
}

function artifactData(projection, ctx){
  const worlds = projection.worlds || {refused:false, possibleCount:0, plans:[]};
  const plans = worlds.refused ? [] : (worlds.plans || []);
  const assignmentCount = Number(worlds.possibleCount) || plans.reduce((sum, plan) => sum + (plan.covers || 0), 0);
  const counts = worlds.refused
    ? [`${projection.decisions?.length || 0} questions`, `${projection.items?.length || 0} items`, 'plans unavailable']
    : [`${assignmentCount} ${assignmentCount === 1 ? 'assignment' : 'assignments'}`,
      `${plans.length} distinct ${plans.length === 1 ? 'plan' : 'plans'}`,
      `${projection.items?.length || 0} ${(projection.items?.length || 0) === 1 ? 'item' : 'items'}`];
  return {title:String(projection.title || 'Untitled paths'),
    date:projection.dateStr === 'off' ? '' : String(projection.dateStr || projection.today || ctx.today || ''),
    worlds, plans, assignmentCount, counts, readout:verdict(projection)};
}

function accessibleHead(data){
  const description = data.worlds.refused
    ? `${data.counts.join(', ')}. ${data.worlds.reason} Use style: tree to see the decision paths.`
    : `${data.counts.join(', ')}. The matrix compares each item across every distinct possible plan.` +
      (data.readout?.line ? ` Verdict: ${data.readout.line}` : '');
  return '<title id="paths-plans-name">' + esc(data.title + ' — possible plans') + '</title>' +
    '<desc id="paths-plans-description">' + esc(description) + '</desc>';
}

function wideHeader(data, width, C, measure){
  const titleWidth = width - PAD * 2 - (data.date ? 190 : 0);
  const titles = titleLines(data.title, Math.max(120, titleWidth), measure);
  let y = 38, svg = '<g data-kind="artifact-header">';
  for(const title of titles){
    svg += '<text x="' + PAD + '" y="' + y + '" font-family="' + SERIF +
      '" font-size="24" font-weight="700" fill="' + C.ink + '">' + esc(title) + '</text>';
    y += 28;
  }
  if(data.date) svg += txt(width - PAD, 38, data.date, 11, C.muted, {anchor:'end'});
  const metricsY = Math.max(58, y + 2);
  svg += '<g data-kind="artifact-metrics">' + svgMetrics({x:PAD, y:metricsY, model:'', counts:data.counts,
    ink:C.ink, muted:C.muted, font:SANS}) + '</g>';
  const bottom = metricsY + 24;
  svg += line(PAD, bottom - 1, width - PAD, bottom - 1, C.border, 1) + '</g>';
  return {svg, height:bottom};
}

function statusOf(item){
  const status = String(item?.status || '').toLowerCase();
  return ['done','doing','risk','blocked'].includes(status) ? status : null;
}

function decisionName(projection, key){
  return String(projection.decisionByName?.[key]?.name || key || 'an answer');
}

function assumptionApplies(currentItem, plan){
  const evidence = currentItem?.displayEvidence;
  if(evidence?.kind !== 'assumption') return null;
  const direction = evidence.direction === 'no' ? 'no' : 'yes';
  const assignments = plan.assignments || [];
  if(assignments.length && assignments.every(entry => entry.answers?.[evidence.decision] === direction))
    return direction;
  return null;
}

/* Display words are deliberately centralised here: wide cells and the narrow
   plan-first relayout cannot drift into different claims about the same world. */
export function planCellDisplay(projection, plan, identity){
  const currentItem = projection.items?.find(item => item.identity === identity);
  const planItem = plan.items?.find(item => item.identity === identity);
  const state = planItem?.itemState || 'waiting';
  const evidence = planItem?.displayEvidence || currentItem?.displayEvidence || null;
  if(evidence?.kind === 'condition-error')
    return {kind:'waiting', label:'Condition needs fixing'};
  if(state === 'not-needed') return {kind:'not-needed', label:'Not needed'};
  if(state === 'limbo' || evidence?.kind === 'assumption'){
    const direction = evidence?.direction === 'no' ? 'no' : 'yes';
    return {kind:'assumed', label:`Following an assumed ${direction}`};
  }
  if(state === 'in-plan'){
    const assumed = assumptionApplies(currentItem, plan);
    if(assumed) return {kind:'assumed', label:`Following an assumed ${assumed}`};
    return {kind:'included', label:'Included'};
  }
  const dependency = evidence?.decision || currentItem?.condition?.terms?.[0]?.key;
  return {kind:'waiting', label:dependency
    ? `Waiting for ${decisionName(projection, dependency)}` : 'Waiting for an answer'};
}

function cellColour(kind, C){
  if(kind === 'included') return C.included;
  if(kind === 'assumed') return C.assumed;
  if(kind === 'waiting') return C.waiting;
  return C.muted;
}

function assignmentRows(plan, width, measure){
  const rows = [];
  const seen = new Set();
  for(const assignment of plan.assignments || []){
    const labels = assignment.contextLabels || assignment.labels || plan.labels || [];
    const signature = labels.join('\0');
    if(seen.has(signature)) continue;
    if(seen.size) rows.push({kind:'gap', text:''});
    seen.add(signature);
    for(const label of labels){
      const wrapped = hardWrapped(label, width, measure, '600 9px ' + SANS);
      for(const text of wrapped) rows.push({kind:'label', text});
    }
  }
  return rows;
}

function contextTitleFor(plan){
  const contexts = new Set((plan.assignments || []).map(assignment =>
    (assignment.contextLabels || assignment.labels || []).join('; ')).filter(Boolean));
  return [...contexts].join(' · ');
}

function shareFigure(shares, x, y, width, C, measure, narrow = false){
  if(!shares) return {svg:'', height:0};
  const parts = [
    ['In every possible plan', shares.shared, shares.sharedShare, C.included],
    ['Following an assumed answer', shares.assumed, shares.assumedShare, C.assumed],
    ['Depends on an answer', shares.dependent, shares.dependentShare, C.waiting],
  ];
  const gap = narrow ? 8 : 12;
  const partWidth = narrow ? width : (width - gap * 2) / 3;
  const partHeight = 54;
  let svg = '<g data-kind="share-figure">';
  for(const [index, part] of parts.entries()){
    const [label, count, share, colour] = part;
    const px = narrow ? x : x + index * (partWidth + gap);
    const py = narrow ? y + index * (partHeight + gap) : y;
    svg += '<g data-kind="share-part">' + rect(px, py, partWidth, partHeight, C.surface, {stroke:C.border, sw:1}) +
      rect(px, py, Math.max(2, partWidth * (Number(share) || 0)), 3, colour) +
      txt(px + 10, py + 19, clipped(label, partWidth - 20, measure), 9, C.ink, {weight:700}) +
      txt(px + 10, py + 38, `${count} of ${shares.denominator} · ${Math.round((Number(share) || 0) * 100)}%`,
        11, colour, {weight:700}) + '</g>';
  }
  svg += '</g>';
  return {svg, height:narrow ? parts.length * partHeight + (parts.length - 1) * gap : partHeight};
}

function refusal(data, x, y, width, C, measure, narrow = false){
  const pad = narrow ? 14 : 22;
  const lineWidth = width - pad * 2;
  const reasonLines = wrapText(data.worlds.reason, `700 ${narrow ? 17 : 21}px ${SERIF}`, lineWidth, measure);
  const height = pad + 18 + reasonLines.length * (narrow ? 23 : 28) + 48;
  let svg = '<g data-kind="plans-refusal">' + rect(x, y, width, height, wash(C.waiting, '0D'),
    {stroke:C.border, sw:1}) + line(x, y, x, y + height, C.waiting, 4) +
    txt(x + pad, y + pad, 'POSSIBLE PLANS UNAVAILABLE', 9, C.muted, {weight:700, tracking:1});
  let baseline = y + pad + 28;
  for(const text of reasonLines){
    svg += '<text x="' + (x + pad) + '" y="' + baseline + '" font-family="' + SERIF +
      '" font-size="' + (narrow ? 17 : 21) + '" font-weight="700" fill="' + C.ink + '">' +
      esc(text) + '</text>';
    baseline += narrow ? 23 : 28;
  }
  svg += txt(x + pad, y + height - 18, 'Use style: tree to see the decision paths.', 10, C.muted,
    {weight:600}) + '</g>';
  return {svg, height};
}

function wideMatrix(data, projection, x, y, minimumWidth, C, measure){
  const plans = data.plans;
  const itemWidth = 260;
  const available = Math.max(1, minimumWidth - itemWidth);
  /* Few-plan matrices share the artefact's right edge with the header and
     figure; many-plan matrices grow horizontally rather than crushing cells. */
  const columnWidth = Math.max(205, available / Math.max(1, plans.length));
  const width = itemWidth + columnWidth * plans.length;
  const assignmentSets = plans.map(plan => assignmentRows(plan, columnWidth - 20, measure));
  const headerHeight = Math.max(86, ...assignmentSets.map(rows => 52 + rows.reduce((sum, row) =>
    sum + (row.kind === 'gap' ? 7 : 13), 0)));
  const itemById = new Map(projection.items.map(item => [item.identity, item]));
  const bodyRows = (projection.matrix || []).map(row => {
    const item = itemById.get(row.identity) || {};
    const title = hardWrapped(item.title || 'Untitled item', itemWidth - 24, measure, '600 12px ' + SANS);
    const cells = plans.map(plan => {
      const display = planCellDisplay(projection, plan, row.identity);
      return {display, lines:hardWrapped(display.label, columnWidth - 34, measure, '700 9px ' + SANS)};
    });
    const cellLines = Math.max(1, ...cells.map(cell => cell.lines.length));
    return {row, item, title, cells,
      height:Math.max(58, 30 + title.length * 15, 28 + cellLines * 13)};
  });
  const height = headerHeight + bodyRows.reduce((sum, row) => sum + row.height, 0);
  let svg = '<g data-kind="plans-matrix">';
  svg += rect(x, y, width, height, C.surface, {stroke:C.border, sw:1});
  svg += rect(x, y, itemWidth, headerHeight, wash(C.accent, '0D')) +
    txt(x + 14, y + 24, 'WORK', 9, C.muted, {weight:700, tracking:1}) +
    txt(x + 14, y + 44, 'Items × distinct possible plans', 12, C.ink, {weight:700});
  for(const [index, plan] of plans.entries()){
    const px = x + itemWidth + index * columnWidth;
    const contextTitle = contextTitleFor(plan);
    svg += '<g data-kind="plan-column"><title>' + esc(contextTitle) + '</title>' +
      rect(px, y, columnWidth, headerHeight, wash(C.accent, index % 2 ? '08' : '10')) +
      rect(px, y, 3, headerHeight, C.accent) +
      txt(px + 12, y + 20, `POSSIBLE PLAN ${index + 1}`, 9, C.ink, {weight:700, tracking:0.8}) +
      txt(px + 12, y + 37, `COVERS ${plan.covers} ${plan.covers === 1 ? 'ASSIGNMENT' : 'ASSIGNMENTS'}`,
        8, C.muted, {weight:700, tracking:0.5});
    let ay = y + 55;
    for(const assignment of assignmentSets[index]){
      if(assignment.kind === 'gap'){
        svg += line(px + 12, ay - 4, px + columnWidth - 12, ay - 4, C.border, 1);
        ay += 7;
      } else {
        svg += txt(px + 12, ay, assignment.text, 9, C.muted, {weight:600});
        ay += 13;
      }
    }
    svg += '</g>';
  }
  let rowY = y + headerHeight;
  for(const [rowIndex, entry] of bodyRows.entries()){
    const fill = rowIndex % 2 ? wash(C.muted, '06') : C.bg;
    svg += '<g data-kind="plan-item-row"><title>' + esc(entry.item.title || 'Untitled item') + '</title>' +
      rect(x, rowY, width, entry.height, fill) + line(x, rowY, x + width, rowY, C.border, 1);
    const status = statusOf(entry.item);
    svg += txt(x + 14, rowY + 16, String(entry.item.period || '').toUpperCase(), 8, C.muted,
      {weight:700, tracking:0.7});
    if(status) svg += txt(x + itemWidth - 14, rowY + 16, status.toUpperCase(), 8, C[status],
      {weight:700, anchor:'end', tracking:0.5});
    for(const [lineIndex, title] of entry.title.entries())
      svg += txt(x + 14, rowY + 35 + lineIndex * 15, title, 12, C.ink, {weight:600});
    for(const [planIndex, plan] of plans.entries()){
      const px = x + itemWidth + planIndex * columnWidth;
      const {display, lines:displayLines} = entry.cells[planIndex];
      const colour = cellColour(display.kind, C);
      svg += line(px, rowY, px, rowY + entry.height, C.border, 1) +
        rect(px + 12, rowY + 13, 3, Math.max(24, displayLines.length * 13), colour);
      for(const [lineIndex, displayLine] of displayLines.entries())
        svg += txt(px + 23, rowY + 27 + lineIndex * 13, displayLine, 9, colour, {weight:700});
    }
    svg += '</g>';
    rowY += entry.height;
  }
  return {svg:svg + '</g>', width, height};
}

export function renderPlans(projection, ctx){
  const measure = typeof ctx.measure === 'function' ? ctx.measure : value => String(value).length * 7;
  const C = palette(ctx.colors || {});
  const data = artifactData(projection, ctx);
  if(Number(ctx.width) > 0 && Number(ctx.width) < 520) return renderPlansNarrow(projection, ctx);
  const planCount = Math.max(1, data.plans.length);
  const matrixNatural = 260 + planCount * 205;
  const width = Math.max(760, Math.ceil(ctx.width || 1160), PAD * 2 + matrixNatural);
  const header = wideHeader(data, width, C, measure);
  let y = header.height + 22, content = '';
  if(data.worlds.refused){
    const block = refusal(data, PAD, y, width - PAD * 2, C, measure);
    content += block.svg; y += block.height + 24;
  } else {
    const figure = shareFigure(projection.shares, PAD, y, width - PAD * 2, C, measure);
    if(figure.svg){ content += figure.svg; y += figure.height + 22; }
    const matrix = wideMatrix(data, projection, PAD, y, width - PAD * 2, C, measure);
    content += matrix.svg; y += matrix.height + 24;
  }
  const readoutLine = data.readout ? boundedTokens(data.readout.line,
    Math.min(width - PAD * 2, 820), measure, '700 22px ' + SANS) : '';
  const readout = data.readout ? svgVerdict({x:PAD, y, width:width - PAD * 2,
    line:readoutLine, fig:data.readout.fig, ink:C.ink, muted:C.muted,
    brandText:C.brandText, font:SANS, measure, size:22}) : {svg:'', height:0};
  if(readout.svg){ content += '<g data-kind="artifact-verdict">' + readout.svg + '</g>'; y += readout.height + 24; }
  const height = Math.ceil(y);
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height +
    '" viewBox="0 0 ' + width + ' ' + height + '" data-theme="' + (ctx.dark ? 'dark' : 'light') +
    '" font-family="' + SANS + '" role="img" aria-labelledby="paths-plans-name paths-plans-description">' +
    accessibleHead(data) + rect(0, 0, width, height, C.bg) + header.svg + content + '</svg>';
}

function narrowHeader(data, width, C, measure){
  const titles = titleLines(data.title, width - NARROW_PAD * 2, measure, 22);
  let y = NARROW_PAD + 20, svg = '<g data-kind="artifact-header">';
  for(const title of titles){
    svg += '<text x="' + NARROW_PAD + '" y="' + y + '" font-family="' + SERIF +
      '" font-size="22" font-weight="700" fill="' + C.ink + '">' + esc(title) + '</text>';
    y += 26;
  }
  if(data.date){ svg += txt(NARROW_PAD, y, data.date, 10, C.muted); y += 17; }
  for(const metrics of wrapText(data.counts.join(' · ').toUpperCase(), '600 9px ' + SANS,
    width - NARROW_PAD * 2, measure)){
    svg += txt(NARROW_PAD, y, metrics, 9, C.muted, {weight:600, tracking:0.8}); y += 14;
  }
  y += 8;
  svg += line(NARROW_PAD, y, width - NARROW_PAD, y, C.border, 1) + '</g>';
  return {svg, height:y + 14};
}

function narrowPlan(plan, planIndex, projection, x, y, width, C, measure){
  const assignment = assignmentRows(plan, width - 28, measure);
  const assignmentsHeight = Math.max(14, assignment.reduce((sum, row) => sum + (row.kind === 'gap' ? 7 : 13), 0));
  const itemRows = projection.items.map(item => {
    const title = hardWrapped(item.title || 'Untitled item', width - 28, measure, '600 12px ' + SANS);
    const display = planCellDisplay(projection, plan, item.identity);
    const status = statusOf(item);
    const meta = hardWrapped((status ? status.toUpperCase() + ' · ' : '') + display.label,
      width - 38, measure, '700 9px ' + SANS);
    /* Title and state are two real rows. The old arithmetic put the state
       baseline one pixel above the next divider, so descenders crossed it. */
    return {item, title, display, status, meta,
      height:43 + title.length * 15 + meta.length * 13};
  });
  const height = 58 + assignmentsHeight + itemRows.reduce((sum, row) => sum + row.height, 0);
  const contextTitle = contextTitleFor(plan);
  let svg = '<g data-kind="narrow-plan"><title>' + esc(contextTitle) + '</title>' +
    rect(x, y, width, height, C.surface, {stroke:C.border, sw:1}) +
    rect(x, y, 4, height, C.accent) +
    txt(x + 14, y + 19, `POSSIBLE PLAN ${planIndex + 1}`, 9, C.ink, {weight:700, tracking:0.8}) +
    txt(x + 14, y + 37, `COVERS ${plan.covers} ${plan.covers === 1 ? 'ASSIGNMENT' : 'ASSIGNMENTS'}`,
      8, C.muted, {weight:700, tracking:0.5});
  let ay = y + 55;
  for(const row of assignment){
    if(row.kind === 'gap'){
      svg += line(x + 14, ay - 4, x + width - 14, ay - 4, C.border, 1); ay += 7;
    } else { svg += txt(x + 14, ay, row.text, 9, C.muted, {weight:600}); ay += 13; }
  }
  let rowY = y + 58 + assignmentsHeight;
  for(const [rowIndex, row] of itemRows.entries()){
    svg += '<g data-kind="narrow-plan-item"><title>' + esc(row.item.title || 'Untitled item') + '</title>';
    if(rowIndex) svg += line(x + 14, rowY, x + width - 14, rowY, C.border, 1);
    svg += txt(x + 14, rowY + 15, String(row.item.period || '').toUpperCase(), 8, C.muted,
      {weight:700, tracking:0.7});
    if(row.status) svg += txt(x + width - 14, rowY + 15, row.status.toUpperCase(), 8, C[row.status],
      {weight:700, anchor:'end'});
    for(const [index, title] of row.title.entries())
      svg += txt(x + 14, rowY + 34 + index * 15, title, 12, C.ink, {weight:600});
    const metaY = rowY + 37 + row.title.length * 15;
    const colour = cellColour(row.display.kind, C);
    svg += rect(x + 14, metaY - 9, 3, Math.max(13, row.meta.length * 13), colour);
    for(const [index, meta] of row.meta.entries())
      svg += txt(x + 24, metaY + index * 13, meta, 9, colour, {weight:700});
    svg += '</g>';
    rowY += row.height;
  }
  return {svg:svg + '</g>', height};
}

export function renderPlansNarrow(projection, ctx){
  const measure = typeof ctx.measure === 'function' ? ctx.measure : value => String(value).length * 7;
  const C = palette(ctx.colors || {});
  const data = artifactData(projection, ctx);
  const width = Math.max(280, Math.min(520, Number(ctx.width) || 360));
  const header = narrowHeader(data, width, C, measure);
  let y = header.height, content = '<g data-kind="plans-narrow">';
  const readoutLine = data.readout ? boundedTokens(data.readout.line,
    width - NARROW_PAD * 2, measure, '700 17px ' + SANS) : '';
  const readout = data.readout ? svgVerdict({x:NARROW_PAD, y:y + 2, width:width - NARROW_PAD * 2,
    line:readoutLine, fig:data.readout.fig, ink:C.ink, muted:C.muted,
    brandText:C.brandText, font:SANS, measure, size:17}) : {svg:'', height:0};
  if(readout.svg){ content += '<g data-kind="artifact-verdict">' + readout.svg + '</g>'; y += readout.height + 20; }
  if(data.worlds.refused){
    const block = refusal(data, NARROW_PAD, y, width - NARROW_PAD * 2, C, measure, true);
    content += block.svg; y += block.height + 16;
  } else {
    const figure = shareFigure(projection.shares, NARROW_PAD, y, width - NARROW_PAD * 2, C, measure, true);
    if(figure.svg){ content += figure.svg; y += figure.height + 16; }
    for(const [index, plan] of data.plans.entries()){
      const block = narrowPlan(plan, index, projection, NARROW_PAD, y, width - NARROW_PAD * 2, C, measure);
      content += block.svg; y += block.height + 12;
    }
  }
  content += '</g>';
  const height = Math.ceil(y + NARROW_PAD);
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + r2(width) + '" height="' + r2(height) +
    '" viewBox="0 0 ' + r2(width) + ' ' + r2(height) + '" data-theme="' + (ctx.dark ? 'dark' : 'light') +
    '" font-family="' + SANS + '" role="img" aria-labelledby="paths-plans-name paths-plans-description">' +
    accessibleHead(data) + rect(0, 0, width, height, C.bg) + header.svg + content + '</svg>';
}

export default renderPlans;
