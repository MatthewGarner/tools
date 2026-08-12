/* Pure SVG for the dependency lens. Work stays canonical in period × lane;
   routes come only from each item's complete authored condition. */

import {btnAttrs, esc, txt, wash} from '../assets/svg.js';
import {line, rect} from '../roadmap/deck-parts.js';

const SANS = "system-ui,-apple-system,'Segoe UI',sans-serif";
const SERIF = "Charter,'Bitstream Charter',Georgia,serif";
const PAD = 36;
const NARROW_PAD = 14;
const LANE_W = 150;
const PERIOD_W = 280;
const NODE_W = 190;
const NODE_H = 88;
const NODE_GAP = 10;
const MIN_READABLE_SCALE = 0.86;

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
      pieces.push(rest.slice(0, fit));
      rest = rest.slice(fit);
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

function nameOf(decision){
  const value = String(decision?.name || decision?.key || 'Decision');
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

function titleOf(overview){
  return String(overview?.title || 'Roadmap dependencies');
}

function rootRole(ctx){
  return ctx?.interactive
    ? 'role="group" aria-labelledby="paths-dependencies-name paths-dependencies-description"'
    : 'role="img" aria-labelledby="paths-dependencies-name paths-dependencies-description"';
}

function accessibleHead(overview, selectedKey){
  const conditional = (overview.items || []).filter(item => item.condition).length;
  const selected = (overview.decisions || []).find(decision => decision.key === selectedKey);
  const description = `${overview.decisions?.length || 0} parallel decisions. ` +
    `${conditional} conditional work ${conditional === 1 ? 'item' : 'items'} shown once in ` +
    `${overview.periods?.length || 0} periods and ${overview.lanes?.length || 0} lanes.` +
    (selected ? ` Selected decision: ${nameOf(selected)}.` : '');
  const title = titleOf(overview) + ' — dependencies' + (selected ? ` focused on ${nameOf(selected)}` : '');
  return '<title id="paths-dependencies-name">' + esc(title) + '</title>' +
    '<desc id="paths-dependencies-description">' + esc(description) + '</desc>';
}

function header(overview, width, C, measure, narrow = false){
  const pad = narrow ? NARROW_PAD : PAD;
  const titleSize = narrow ? 22 : 25;
  const titleLines = wrapped(titleOf(overview), width - pad * 2 - (narrow ? 0 : 170), measure,
    `700 ${titleSize}px ${SERIF}`);
  let y = pad + titleSize;
  let svg = '<g data-kind="dependency-header">';
  for(const title of titleLines){
    svg += '<text x="' + pad + '" y="' + y + '" font-family="' + SERIF + '" font-size="' +
      titleSize + '" font-weight="700" fill="' + C.ink + '">' + esc(title) + '</text>';
    y += titleSize + 5;
  }
  if(overview.date && !narrow) svg += txt(width - pad, pad + 17, String(overview.date), 10, C.muted,
    {anchor:'end'});
  if(overview.date && narrow){ svg += txt(pad, y, String(overview.date), 10, C.muted); y += 18; }
  svg += txt(pad, y + 4, 'DEPENDENCIES', 9, C.accentInk, {weight:700, tracking:0.9});
  y += 22;
  const purpose = 'What must be true for each piece of work to matter.';
  for(const text of wrapped(purpose, width - pad * 2, measure, '600 11px ' + SANS)){
    svg += txt(pad, y, text, 11, C.ink, {weight:600}); y += 15;
  }
  y += 8;
  svg += line(pad, y, width - pad, y, C.border, 1) + '</g>';
  return {svg, height:y + 18};
}

function decisionAttrs(decision, selected, ctx){
  if(!ctx?.interactive) return '';
  return ' data-select-decision="" data-line="' + decision.srcLine + '" data-selected="' + selected +
    '" aria-pressed="' + selected + '"' + btnAttrs('Inspect decision ' + nameOf(decision));
}

function decisionStateLabel(decision){
  const kind = decision.currentState?.kind;
  if(kind === 'overdue') return 'OVERDUE';
  if(kind === 'assumption') return 'ASSUMED';
  if(kind === 'answered') return 'ANSWERED';
  if(kind === 'dormant') return 'NOT OPEN YET';
  if(kind === 'moot') return 'NO LONGER APPLIES';
  if(kind === 'repair') return 'NEEDS REPAIR';
  return 'UNANSWERED';
}

function decisionOpeningCopy(decision){
  const when = decision?.when;
  if(!when) return 'OPEN NOW';
  if(!when.valid) return 'OPENING CONDITION NEEDS FIXING';
  const terms = (when.terms || []).map(term => `${nameOf(term)} = ${termDirection(term).toUpperCase()}`);
  if(!terms.length) return 'OPENING CONDITION NEEDS FIXING';
  if(terms.length === 1) return `OPENS IF ${terms[0]}`;
  return `OPENS IF ${terms.join(when.operator === 'or' ? ' OR ' : ' AND ')}`;
}

function spineLayout(overview, x, y, width, selectedKey){
  const authored = overview.decisions || [];
  const focused = authored.find(decision => decision.key === selectedKey);
  /* This is a focus lens over parallel decisions, so put the inspected decision
     at the viewport origin. The remaining decisions retain authored order; the
     heading explicitly prevents the visual order reading as causal sequence. */
  const decisions = focused ? [focused, ...authored.filter(decision => decision !== focused)] : authored;
  const columns = Math.max(1, Math.floor((width + NODE_GAP) / (NODE_W + NODE_GAP)));
  const usedW = Math.min(columns, Math.max(1, decisions.length)) * NODE_W +
    Math.max(0, Math.min(columns, decisions.length) - 1) * NODE_GAP;
  const startX = focused ? x : x + Math.max(0, (width - usedW) / 2);
  return decisions.map((decision, index) => ({decision,
    x:startX + (index % columns) * (NODE_W + NODE_GAP), y:y + Math.floor(index / columns) * (NODE_H + 26),
    width:NODE_W, height:NODE_H, index, row:Math.floor(index / columns)}));
}

function affectedDecisionKeys(ctx){
  return new Set(ctx?.impact?.whenEffects?.all?.map(entry => entry.key) || []);
}

function renderSpine(layouts, x, y, width, C, measure, selectedKey, ctx){
  const lastBottom = layouts.length ? Math.max(...layouts.map(layout => layout.y + layout.height)) : y + 28;
  const focused = layouts.find(layout => layout.decision.key === selectedKey)?.decision;
  let svg = '<g data-kind="decision-spine">' +
    txt(x, y - 15, 'PARALLEL DECISIONS', 9, C.muted, {weight:700, tracking:0.9}) +
    (focused ? txt(x, y - 3, 'FOCUSED: ' + nameOf(focused), 8, C.accentInk,
      {weight:700, tracking:0.5}) : '') +
    txt(x + width, y - 15, 'Each answer can affect several places', 9, C.muted, {weight:600, anchor:'end'});
  if(!layouts.length) svg += txt(x, y + 20, 'No decisions authored yet', 11, C.muted, {weight:600});
  for(const layout of layouts){
    const {decision} = layout;
    const selected = decision.key === selectedKey;
    const affected = affectedDecisionKeys(ctx).has(decision.key) ||
      (!!selectedKey && decision.when?.terms?.some(term => term.key === selectedKey));
    const dimmed = !!selectedKey && !selected && !affected;
    const titleLines = wrapped(nameOf(decision), layout.width - 24, measure, '700 12px ' + SANS).slice(0, 2);
    const state = decisionStateLabel(decision);
    const openLines = wrapped(decisionOpeningCopy(decision), layout.width - 24, measure, '700 8px ' + SANS).slice(0, 2);
    const stroke = selected || affected ? C.accent : decision.currentState?.kind === 'overdue' ? C.urgent : C.border;
    svg += '<g data-kind="decision-node" data-decision-key="' + esc(decision.key) +
      '" data-emphasis="' + (selected ? 'selected' : affected ? 'affected' : dimmed ? 'unrelated' : 'normal') + '" opacity="' +
      (dimmed ? '0.35' : '1') + '"' + decisionAttrs(decision, selected, ctx) + '><title>' +
      esc(`${nameOf(decision)} — ${decision.currentState?.sentence || state}`) + '</title>' +
      rect(layout.x, layout.y, layout.width, layout.height, selected ? wash(C.accent, '0D') : C.surface,
        {stroke, sw:selected ? 2 : 1}) + rect(layout.x, layout.y, 4, layout.height, stroke);
    titleLines.forEach((value, index) => {
      svg += txt(layout.x + 13, layout.y + 20 + index * 15, value, 12, C.ink, {weight:700});
    });
    openLines.forEach((value, index) => {
      svg += txt(layout.x + 13, layout.y + 55 + index * 10, value, 8,
        affected ? C.accentInk : C.muted, {weight:700, tracking:0.35});
    });
    svg += txt(layout.x + 13, layout.y + 79, state, 8,
      decision.currentState?.kind === 'overdue' ? C.urgent : C.muted, {weight:700, tracking:0.5});
    if(ctx?.interactive) svg += '<rect data-hit="" x="' + layout.x + '" y="' + layout.y +
      '" width="' + layout.width + '" height="' + layout.height + '" fill="transparent"/>';
    svg += '</g>';
  }
  /* YES and NO are output ports, not a legend. Their position is stable for every node. */
  for(const layout of layouts){
    const dimmed = !!selectedKey && layout.decision.key !== selectedKey;
    for(const [direction, fraction] of [['yes', .28], ['no', .72]]){
      const px = layout.x + layout.width * fraction;
      svg += '<g data-kind="decision-output" data-decision-key="' + esc(layout.decision.key) +
        '" data-outcome="' + direction + '" opacity="' + (dimmed ? '0.25' : '1') + '">' +
        line(px, layout.y + layout.height, px, layout.y + layout.height + 11, C.accent, 1.25) +
        '<circle cx="' + r2(px) + '" cy="' + r2(layout.y + layout.height + 11) +
        '" r="3" fill="' + C.accent + '"/>' +
        txt(px + (direction === 'yes' ? -5 : 5), layout.y + layout.height + 21, direction.toUpperCase(),
          8, C.accentInk, {weight:700, tracking:0.5, anchor:direction === 'yes' ? 'end' : 'start'}) + '</g>';
    }
  }
  return {svg:svg + '</g>', bottom:lastBottom + 24};
}

function repairReason(item, modelHealth = []){
  return modelHealth.find(warning => warning.line === item.srcLine + 1)?.message ||
    item.condition?.error || 'Logic needs repair';
}

function conditionCopy(item, modelHealth = []){
  const condition = item.condition;
  if(!condition) return {kind:'independent', label:'MOVES REGARDLESS', expression:'No decision outcome required'};
  if(!condition.valid) return {kind:'repair', label:'CONDITION NEEDS FIXING',
    expression:repairReason(item, modelHealth)};
  const terms = condition.terms || [];
  const phrase = terms.map(term => `${nameOf(term)} = ${String(term.direction || (term.negated ? 'no' : 'yes')).toUpperCase()}`);
  const historic = item.displayState?.kind === 'completed'
    ? 'Historical condition — already completed'
    : item.displayState?.kind === 'not-pursuing'
      ? 'This outcome is no longer being pursued' : null;
  if(terms.length === 1) return {kind:'simple', label:`IF ${phrase[0]}`,
    expression:historic || 'This outcome unlocks the work'};
  if(condition.operator === 'or') return {kind:'or', label:`IF EITHER ${phrase.join(' OR ')}`,
    expression:historic || 'Either can unlock'};
  return {kind:'and', label:`ONLY IF ${phrase.join(' AND ')}`,
    expression:historic || 'All are necessary; none is sufficient alone'};
}

function cardMeasure(item, width, measure, narrow = false, modelHealth = []){
  const inner = width - 24;
  const condition = conditionCopy(item, modelHealth);
  const conditionLines = wrapped(condition.label, inner, measure, '700 8px ' + SANS);
  const expressionLines = wrapped(condition.expression, inner, measure, '600 8px ' + SANS);
  const titleLines = wrapped(item.title || 'Untitled item', inner, measure, '700 12px ' + SANS);
  const noteLines = item.note ? wrapped(item.note, inner, measure, '400 9px ' + SANS) : [];
  const stateLines = wrapped(item.displayState?.sentence || 'State unavailable', inner, measure, '600 9px ' + SANS);
  const contextLines = narrow
    ? wrapped(`${item.period || 'Unscheduled'} · ${item.lane || 'Unassigned'}`, inner, measure, '700 9px ' + SANS)
    : [];
  return {condition, conditionLines, expressionLines, titleLines, noteLines, stateLines, contextLines,
    height:24 + conditionLines.length * 11 + expressionLines.length * 11 + contextLines.length * 12 +
      titleLines.length * 15 + noteLines.length * 13 + stateLines.length * 12 + 18};
}

function relationTo(item, selectedKey){
  if(!selectedKey) return 'normal';
  if(item.condition?.terms?.some(term => term.key === selectedKey)) return 'selected';
  return item.condition ? 'unrelated' : 'independent';
}

function renderCard(item, x, y, width, C, measure, selectedKey, narrow = false, modelHealth = []){
  const layout = cardMeasure(item, width, measure, narrow, modelHealth);
  const relation = relationTo(item, selectedKey);
  const opacity = relation === 'unrelated' ? .28 : relation === 'independent' ? .6 : 1;
  const stroke = relation === 'selected' ? C.accent : layout.condition.kind === 'repair' ? C.urgent : C.border;
  const dash = item.displayState?.kind === 'not-pursuing' ? '4 3' : null;
  let svg = '<g data-kind="dependency-item" data-identity="' + item.identity + '" data-condition="' +
    layout.condition.kind + '" data-emphasis="' + relation + '" opacity="' + opacity + '"><title>' +
    esc(`${item.title || 'Untitled item'} — ${layout.condition.label}`) + '</title>' +
    rect(x, y, width, layout.height, C.surface, {stroke, sw:relation === 'selected' ? 2 : 1, dash});
  let ty = y + 16;
  for(const value of layout.conditionLines){
    svg += txt(x + 12, ty, value, 8,
      layout.condition.kind === 'repair' ? C.urgent : C.accentInk, {weight:700, tracking:0.45}); ty += 11;
  }
  for(const value of layout.expressionLines){ svg += txt(x + 12, ty, value, 8, C.muted, {weight:600}); ty += 11; }
  for(const value of layout.contextLines){ svg += txt(x + 12, ty + 1, value, 9, C.muted, {weight:700}); ty += 12; }
  ty += 4;
  for(const value of layout.titleLines){ svg += txt(x + 12, ty, value, 12, C.ink, {weight:700}); ty += 15; }
  for(const value of layout.noteLines){ svg += txt(x + 12, ty + 2, value, 9, C.muted); ty += 13; }
  ty += 2;
  for(const value of layout.stateLines){ svg += txt(x + 12, ty + 2, value, 9,
    item.displayState?.kind === 'repair' ? C.urgent : C.muted, {weight:600}); ty += 12; }
  return {svg:svg + '</g>', height:layout.height, copy:layout.condition};
}

function cellMap(overview){
  return new Map((overview.cells || []).map(cell => [`${cell.period}\u0000${cell.lane}`, cell.items || []]));
}

function gridLayout(overview, x, y, measure){
  const periods = overview.periods || [], lanes = overview.lanes || [];
  const cells = cellMap(overview);
  const periodLabels = periods.map(period => wrapped(period.name, PERIOD_W - 24, measure, '700 11px ' + SANS));
  const headerHeight = Math.max(54, 22 + Math.max(1, ...periodLabels.map(lines => lines.length)) * 14);
  const rows = [];
  let rowY = y + headerHeight;
  for(const lane of lanes){
    const cellLayouts = periods.map((period, periodIndex) => {
      let cardY = rowY + 12;
      const items = (cells.get(`${period.name}\u0000${lane}`) || []).map(item => {
        const measured = cardMeasure(item, PERIOD_W - 20, measure, false, overview.modelHealth);
        const placed = {item, x:x + LANE_W + periodIndex * PERIOD_W + 10, y:cardY,
          width:PERIOD_W - 20, height:measured.height, copy:measured.condition};
        cardY += measured.height + 10;
        return placed;
      });
      return {period, items, needed:cardY - rowY + 2};
    });
    const laneLines = wrapped(lane, LANE_W - 24, measure, '700 11px ' + SANS);
    const height = Math.max(72, 32 + laneLines.length * 14, ...cellLayouts.map(cell => cell.needed));
    rows.push({lane, laneLines, y:rowY, height, cells:cellLayouts});
    rowY += height;
  }
  return {x, y, width:LANE_W + periods.length * PERIOD_W, height:rowY - y,
    headerHeight, periodLabels, periods, rows, itemLayouts:rows.flatMap(row => row.cells.flatMap(cell => cell.items))};
}

function gridBase(layout, C){
  const {x, y, width, height, headerHeight, periods, periodLabels, rows} = layout;
  if(!periods.length || !rows.length) return '<g data-kind="dependency-grid-empty">' +
    txt(x, y + 22, 'No roadmap work authored yet', 12, C.muted, {weight:600}) + '</g>';
  let svg = '<g data-kind="dependency-grid-base">' + rect(x, y, width, height, C.bg, {stroke:C.border, sw:1}) +
    rect(x, y, LANE_W, headerHeight, wash(C.accent, '08')) +
    txt(x + 12, y + 21, 'ROADMAP', 9, C.muted, {weight:700, tracking:0.9}) +
    txt(x + 12, y + 39, 'Lane × period', 10, C.ink, {weight:700});
  periods.forEach((period, index) => {
    const px = x + LANE_W + index * PERIOD_W;
    svg += '<g data-kind="dependency-period"><title>' + esc(period.name) + '</title>' +
      rect(px, y, PERIOD_W, headerHeight, wash(C.accent, index % 2 ? '06' : '0A'));
    periodLabels[index].forEach((label, lineIndex) => {
      svg += txt(px + 12, y + 25 + lineIndex * 14, label, 11, C.ink, {weight:700, tracking:0.5});
    });
    svg += '</g>' + line(px, y, px, y + height, C.border, 1);
  });
  for(const [index, row] of rows.entries()){
    svg += '<g data-kind="dependency-lane"><title>' + esc(row.lane) + '</title>' +
      rect(x, row.y, LANE_W, row.height, index % 2 ? wash(C.muted, '06') : C.bg);
    row.laneLines.forEach((label, lineIndex) => {
      svg += txt(x + 12, row.y + 23 + lineIndex * 14, label, 11, C.ink, {weight:700});
    });
    svg += '</g>' + line(x, row.y, x + width, row.y, C.border, 1);
  }
  return svg + '</g>';
}

function sourceAnchors(spine){
  const map = new Map();
  for(const layout of spine){
    map.set(`${layout.decision.key}\u0000yes`, {x:layout.x + layout.width * .28, y:layout.y + layout.height + 11,
      index:layout.index});
    map.set(`${layout.decision.key}\u0000no`, {x:layout.x + layout.width * .72, y:layout.y + layout.height + 11,
      index:layout.index});
  }
  return map;
}

function termDirection(term){
  return String(term.direction || (term.negated ? 'no' : 'yes')).toLowerCase();
}

function routeLayer(itemLayouts, spine, routeY, C, selectedKey){
  const anchors = sourceAnchors(spine);
  let paths = '<g data-kind="dependency-routes" fill="none">';
  let terminals = '<g data-kind="dependency-terminals">';
  for(const placed of itemLayouts){
    const condition = placed.item.condition;
    if(!condition?.valid || !condition.terms?.length) continue;
    const terms = condition.terms;
    const related = !!selectedKey && terms.some(term => term.key === selectedKey);
    /* This is a selected-decision lens. Drawing every authored edge at once
       turns a roadmap into a graph puzzle and implies a false primary owner
       for compound work. The complete condition remains written on the card;
       only the selected decision's route is traced through the grid. */
    if(!related) continue;
    for(const [termIndex, term] of terms.entries()){
      if(term.key !== selectedKey) continue;
      const direction = termDirection(term);
      const source = anchors.get(`${term.key}\u0000${direction}`);
      if(!source) continue;
      const targetX = placed.x + placed.width * ((termIndex + 1) / (terms.length + 1));
      const targetY = placed.y;
      const selectedRoute = true;
      const opacity = 1;
      const channelY = routeY + (source.index % 6) * 6;
      const d = `M ${r2(source.x)} ${r2(source.y)} V ${r2(channelY)} H ${r2(targetX)} V ${r2(targetY)}`;
      paths += '<path data-kind="dependency-route" data-decision-key="' + esc(term.key) +
        '" data-item-identity="' + placed.item.identity + '" data-outcome="' + direction +
        '" data-operator="' + esc(condition.operator || 'simple') + '" data-negated="' + (!!term.negated) +
        '" d="' + d + '" stroke="' + C.accent + '" stroke-width="' + (selectedRoute ? '1.5' : '1') +
        '" opacity="' + opacity + '"><title>' + esc(`${nameOf(term)} ${direction.toUpperCase()} feeds ${placed.item.title}`) +
        '</title></path>';
      terminals += '<g data-kind="dependency-terminal" data-decision-key="' + esc(term.key) +
        '" data-item-identity="' + placed.item.identity + '" opacity="' + opacity + '">' +
        '<circle cx="' + r2(targetX) + '" cy="' + r2(targetY) + '" r="3" fill="' + C.accent + '"/>' +
        txt(targetX, targetY - 6, direction.toUpperCase(), 8, C.accentInk,
          {weight:700, tracking:0.4, anchor:'middle', halo:C.bg}) + '</g>';
    }
    if(terms.length > 1){
      const left = placed.x + placed.width / (terms.length + 1);
      const right = placed.x + placed.width * terms.length / (terms.length + 1);
      const label = condition.operator === 'or' ? 'EITHER CAN UNLOCK' : 'ALL REQUIRED';
      terminals += '<g data-kind="condition-join" data-operator="' + esc(condition.operator) +
        '" data-item-identity="' + placed.item.identity + '" opacity="1">' +
        line(left, placed.y + 3, right, placed.y + 3, C.accent, 1.5) +
        txt((left + right) / 2, placed.y + 13, label, 7, C.accentInk,
          {weight:700, tracking:0.45, anchor:'middle', halo:C.surface}) + '</g>';
    }
  }
  return {paths:paths + '</g>', terminals:terminals + '</g>'};
}

function decisionRouteLayer(spine, C, selectedKey, impact){
  if(!selectedKey || !impact?.whenEffects?.all?.length) return '';
  const byKey = new Map(spine.map(layout => [layout.decision.key, layout]));
  const affected = new Set([selectedKey]);
  const pending = [...impact.whenEffects.all];
  let svg = '<g data-kind="decision-opening-routes" fill="none">';
  /* Impact entries retain author order, which need not be dependency order.
     Resolve routes to a fixed point so `C when B` authored before `B when A`
     still draws the truthful A → B → C chain. */
  while(pending.length){
    let progressed = false;
    for(let index = pending.length - 1; index >= 0; index--){
      const entry = pending[index];
      const target = byKey.get(entry.key);
      const sourceTerm = entry.condition?.terms?.find(term => affected.has(term.key));
      const source = sourceTerm ? byKey.get(sourceTerm.key) : null;
      if(!target || !source) continue;
      pending.splice(index, 1); progressed = true; affected.add(entry.key);
      const direction = termDirection(sourceTerm);
      const sx = source.x + source.width * (direction === 'yes' ? .28 : .72);
      const sy = source.y + source.height + 11;
      const tx = target.x + target.width / 2, ty = target.y;
      const bend = Math.max(sy + 8, ty - 10);
      const d = `M ${r2(sx)} ${r2(sy)} V ${r2(bend)} H ${r2(tx)} V ${r2(ty)}`;
      const relation = sourceTerm.key === selectedKey ? 'direct' : 'downstream';
      const label = relation.toUpperCase();
      svg += '<path data-kind="decision-opening-route" data-selected-decision="' + esc(selectedKey) +
        '" data-from-decision="' + esc(sourceTerm.key) + '" data-to-decision="' + esc(entry.key) +
        '" data-outcome="' + direction + '" data-relation="' + relation + '" d="' + d +
        '" stroke="' + C.accent + '" stroke-width="1.5"' +
        (relation === 'downstream' ? ' stroke-dasharray="4 3"' : '') + '><title>' +
        esc(relation === 'downstream'
          ? `${nameOf(sourceTerm)} ${direction.toUpperCase()} carries the selected effect downstream to ${entry.name}`
          : `${nameOf(sourceTerm)} ${direction.toUpperCase()} may open ${entry.name}`) + '</title></path>' +
        txt((sx + tx) / 2, bend - 4, label, 7, C.accentInk,
          {weight:700, tracking:0.45, anchor:'middle', halo:C.bg});
    }
    if(!progressed) break;
  }
  return svg + '</g>';
}

function modelHealthBlock(warnings, x, y, width, C, measure){
  if(!warnings?.length) return {svg:'', height:0};
  let svg = '<g data-kind="dependency-model-health">' +
    txt(x, y + 10, 'MODEL HEALTH', 9, C.urgent, {weight:700, tracking:0.8});
  let ty = y + 29;
  for(const warning of warnings){
    const lines = wrapped(warning.message || String(warning), width - 24, measure, '600 9px ' + SANS);
    for(const value of lines){ svg += txt(x + 12, ty, value, 9, C.ink, {weight:600}); ty += 12; }
    ty += 5;
  }
  return {svg:svg + '</g>', height:ty - y + 4};
}

function gridCards(layout, C, measure, selectedKey, modelHealth){
  let svg = '<g data-kind="dependency-grid-cards">';
  for(const placed of layout.itemLayouts){
    svg += renderCard(placed.item, placed.x, placed.y, placed.width, C, measure, selectedKey, false, modelHealth).svg;
  }
  return svg + '</g>';
}

export function renderDependencies(overview, ctx = {}){
  if(Number(ctx.width) > 0 && Number(ctx.width) < 520) return renderDependenciesNarrow(overview, ctx);
  const measure = typeof ctx.measure === 'function' ? ctx.measure : value => String(value).length * 7;
  const C = palette(ctx.colors || {});
  const selectedKey = String(ctx.selectedKey || '').toLowerCase();
  const naturalGrid = LANE_W + (overview.periods?.length || 0) * PERIOD_W;
  const width = Math.max(1120, Math.ceil(Number(ctx.width) || 1160), PAD * 2 + naturalGrid);
  const head = header(overview, width, C, measure);
  const spineTop = head.height + 20;
  const spine = spineLayout(overview, PAD, spineTop, width - PAD * 2, selectedKey);
  const spineRendered = renderSpine(spine, PAD, spineTop, width - PAD * 2, C, measure, selectedKey, ctx);
  const routeY = spineRendered.bottom + 8;
  const gridY = routeY + 48;
  const grid = gridLayout(overview, PAD, gridY, measure);
  const routes = routeLayer(grid.itemLayouts, spine, routeY, C, selectedKey);
  const health = modelHealthBlock(overview.modelHealth, PAD,
    gridY + Math.max(54, grid.height) + 18, width - PAD * 2, C, measure);
  const height = Math.ceil(gridY + Math.max(54, grid.height) + health.height + PAD + 18);
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height +
    '" viewBox="0 0 ' + width + ' ' + height + '" data-theme="' + (ctx.dark ? 'dark' : 'light') +
    '" data-min-readable-scale="' + MIN_READABLE_SCALE + '" font-family="' + SANS + '" ' +
    rootRole(ctx) + '>' + accessibleHead(overview, selectedKey) + rect(0, 0, width, height, C.bg) +
    head.svg + gridBase(grid, C) + routes.paths + decisionRouteLayer(spine, C, selectedKey, ctx.impact) +
    spineRendered.svg + gridCards(grid, C, measure, selectedKey, overview.modelHealth) +
    routes.terminals + health.svg + '</svg>';
}

function groupKey(item){
  if(!item.condition) return 'independent';
  if(!item.condition.valid) return 'repair';
  return `${item.condition.operator || 'simple'}:` + item.condition.terms
    .map(term => `${term.key}=${termDirection(term)}`).join('|');
}

function narrowGroups(overview){
  const groups = new Map();
  for(const item of overview.items || []){
    const key = groupKey(item);
    if(!groups.has(key)) groups.set(key, {key, copy:conditionCopy(item, overview.modelHealth), items:[]});
    groups.get(key).items.push(item);
  }
  return [...groups.values()];
}

function narrowDecisionList(overview, x, y, width, C, measure, selectedKey, ctx){
  let svg = '<g data-kind="narrow-decision-spine">' +
    txt(x, y + 10, 'PARALLEL DECISIONS', 9, C.muted, {weight:700, tracking:0.8});
  y += 24;
  const start = y;
  for(const decision of overview.decisions || []){
    const selected = decision.key === selectedKey;
    const affected = affectedDecisionKeys(ctx).has(decision.key) ||
      (!!selectedKey && decision.when?.terms?.some(term => term.key === selectedKey));
    const nameLines = wrapped(nameOf(decision), width - 112, measure, '700 11px ' + SANS);
    const openLines = wrapped(decisionOpeningCopy(decision), width - 24, measure, '700 8px ' + SANS);
    const height = Math.max(52, 22 + nameLines.length * 14 + openLines.length * 11);
    svg += '<g data-kind="narrow-decision-node" data-decision-key="' + esc(decision.key) +
      '" data-emphasis="' + (selected ? 'selected' : affected ? 'affected' : selectedKey ? 'unrelated' : 'normal') + '" opacity="' +
      (selectedKey && !selected && !affected ? '.4' : '1') + '"' + decisionAttrs(decision, selected, ctx) + '><title>' +
      esc(`${nameOf(decision)} — ${decision.currentState?.sentence || decisionStateLabel(decision)}`) + '</title>' +
      rect(x, y, width, height, selected ? wash(C.accent, '0D') : C.surface,
        {stroke:selected ? C.accent : C.border, sw:selected ? 2 : 1});
    nameLines.forEach((value, index) => { svg += txt(x + 12, y + 20 + index * 14, value, 11, C.ink, {weight:700}); });
    let openY = y + 20 + nameLines.length * 14;
    openLines.forEach((value, index) => { svg += txt(x + 12, openY + index * 11, value, 8,
      affected ? C.accentInk : C.muted, {weight:700, tracking:0.35}); });
    svg += txt(x + width - 12, y + 25, decisionStateLabel(decision), 8, C.muted,
      {weight:700, tracking:0.35, anchor:'end'});
    if(ctx?.interactive) svg += '<rect data-hit="" x="' + x + '" y="' + y + '" width="' + width +
      '" height="' + height + '" fill="transparent"/>';
    svg += '</g>'; y += height + 7;
  }
  if(!(overview.decisions || []).length){ svg += txt(x, y + 18, 'No decisions authored yet', 11, C.muted); y += 42; }
  return {svg:svg + '</g>', height:y - start + 24};
}

export function renderDependenciesNarrow(overview, ctx = {}){
  const measure = typeof ctx.measure === 'function' ? ctx.measure : value => String(value).length * 7;
  const C = palette(ctx.colors || {});
  const selectedKey = String(ctx.selectedKey || '').toLowerCase();
  const width = Math.max(280, Math.min(520, Number(ctx.width) || 360));
  const inner = width - NARROW_PAD * 2;
  const head = header(overview, width, C, measure, true);
  let y = head.height;
  const decisions = narrowDecisionList(overview, NARROW_PAD, y, inner, C, measure, selectedKey, ctx);
  y += decisions.height + 4;
  let body = '<g data-kind="dependency-agenda">';
  for(const group of narrowGroups(overview)){
    const related = !selectedKey || group.items.some(item => item.condition?.terms?.some(term => term.key === selectedKey));
    const headerLines = wrapped(group.copy.label, inner - 24, measure, '700 9px ' + SANS);
    const explanationLines = wrapped(group.copy.expression, inner - 24, measure, '600 9px ' + SANS);
    const groupHeight = 20 + headerLines.length * 12 + explanationLines.length * 12;
    body += '<g data-kind="dependency-group" data-condition="' + group.copy.kind + '" data-emphasis="' +
      (related ? selectedKey ? 'selected' : 'normal' : 'unrelated') + '" opacity="' +
      (related ? '1' : '.3') + '">' + rect(NARROW_PAD, y, inner, groupHeight,
        group.copy.kind === 'repair' ? wash(C.urgent, '0D') : wash(C.accent, '0A'));
    let ty = y + 19;
    for(const value of headerLines){ body += txt(NARROW_PAD + 12, ty, value, 9,
      group.copy.kind === 'repair' ? C.urgent : C.accentInk, {weight:700, tracking:0.45}); ty += 12; }
    for(const value of explanationLines){ body += txt(NARROW_PAD + 12, ty, value, 9, C.muted, {weight:600}); ty += 12; }
    body += '</g>'; y += groupHeight + 8;
    for(const item of group.items){
      const card = renderCard(item, NARROW_PAD, y, inner, C, measure, selectedKey, true,
        overview.modelHealth);
      body += card.svg; y += card.height + 9;
    }
    y += 10;
  }
  if(!(overview.items || []).length){ body += txt(NARROW_PAD, y + 20, 'No roadmap work authored yet', 11, C.muted); y += 48; }
  const health = modelHealthBlock(overview.modelHealth, NARROW_PAD, y, inner, C, measure);
  body += health.svg; y += health.height;
  const height = Math.ceil(y + NARROW_PAD);
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + r2(width) + '" height="' + r2(height) +
    '" viewBox="0 0 ' + r2(width) + ' ' + r2(height) + '" data-theme="' + (ctx.dark ? 'dark' : 'light') +
    '" font-family="' + SANS + '" ' + rootRole(ctx) + '>' + accessibleHead(overview, selectedKey) +
    rect(0, 0, width, height, C.bg) + head.svg + decisions.svg + body + '</g></svg>';
}

export default renderDependencies;
