/* Pure SVG for one decision's counterfactual lens. The selected question is
   read as a receipt, then compared in two written outcome columns. There are
   deliberately no graph edges: complete authored conditions travel with the
   work they govern. */

import {btnAttrs, esc, txt, wash} from '../assets/svg.js';
import {line, rect} from '../roadmap/deck-parts.js';

const SANS = "system-ui,-apple-system,'Segoe UI',sans-serif";
const SERIF = "Charter,'Bitstream Charter',Georgia,serif";
const PAD = 36;
const NARROW_PAD = 14;
const MIN_READABLE_SCALE = 0.93;

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

/* Long decision keys and hostile corpus strings still have to remain inside
   the exported page, so single tokens are split as well as normal copy. */
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
    const trial = current ? `${current} ${piece}` : piece;
    if(!current || safeMeasure(measure, trial, font) <= maxWidth) current = trial;
    else { lines.push(current); current = piece; }
  }
  if(current) lines.push(current);
  return lines;
}

function nameOf(value){
  const text = String(value?.name || value?.key || 'Question');
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

function titleOf(overview){
  return String(overview?.title || 'Roadmap questions');
}

function selectedDecision(overview, ctx){
  const key = String(ctx?.selectedKey || ctx?.impact?.key || overview?.initialSelection?.key || '').toLowerCase();
  return (overview?.decisions || []).find(decision => decision.key === key) || ctx?.impact?.decision || null;
}

function selectedImpact(decision, ctx){
  return decision && ctx?.impact?.key === decision.key ? ctx.impact : null;
}

function rootRole(ctx){
  return ctx?.interactive
    ? 'role="group" aria-labelledby="paths-question-lens-name paths-question-lens-description"'
    : 'role="img" aria-labelledby="paths-question-lens-name paths-question-lens-description"';
}

function accessibleHead(overview, decision, impact){
  const affected = impact ? affectedEntries(impact).length : 0;
  const title = `${titleOf(overview)} — question lens${decision ? ` for ${nameOf(decision)}` : ''}`;
  const question = String(decision?.question || nameOf(decision)).replace(/[.?!]+$/, '');
  const description = decision && !questionIsOpen(decision)
    ? `${question}. This question is not open yet. ${openingConditionCopy(decision.when)}. Answer outcomes are not compared until that prerequisite is satisfied.`
    : decision
    ? `${question}. If yes and if no are compared across ${affected} affected ${affected === 1 ? 'work item' : 'work items'}. Other questions are parallel, not sequential.`
    : 'No question is available to compare.';
  return '<title id="paths-question-lens-name">' + esc(title) + '</title>' +
    '<desc id="paths-question-lens-description">' + esc(description) + '</desc>';
}

function header(overview, width, C, measure, narrow){
  const pad = narrow ? NARROW_PAD : PAD;
  const titleSize = narrow ? 22 : 25;
  const titleWidth = width - pad * 2 - (!narrow && overview.date ? 180 : 0);
  const titles = wrapped(titleOf(overview), titleWidth, measure, `700 ${titleSize}px ${SERIF}`);
  let y = pad + titleSize;
  let svg = '<g data-kind="question-lens-header">';
  for(const title of titles){
    svg += '<text x="' + pad + '" y="' + y + '" font-family="' + SERIF + '" font-size="' +
      titleSize + '" font-weight="700" fill="' + C.ink + '">' + esc(title) + '</text>';
    y += titleSize + 5;
  }
  if(overview.date){
    if(narrow){ svg += txt(pad, y, String(overview.date), 10, C.muted); y += 18; }
    else svg += txt(width - pad, pad + 17, String(overview.date), 10, C.muted, {anchor:'end'});
  }
  svg += txt(pad, y + 3, 'QUESTION LENS', 9, C.accentInk, {weight:700, tracking:0.9});
  y += 23;
  const verdict = typeof overview.verdict === 'string' ? overview.verdict : overview.verdict?.line;
  if(verdict){
    const verdictLines = wrapped(verdict, width - pad * 2, measure, `700 ${narrow ? 14 : 17}px ${SANS}`);
    for(const value of verdictLines){
      svg += txt(pad, y, value, narrow ? 14 : 17, C.ink, {weight:700});
      y += narrow ? 19 : 22;
    }
    y += 5;
  }
  svg += line(pad, y, width - pad, y, C.border, 1) + '</g>';
  return {svg, height:y + (narrow ? 15 : 20)};
}

function receiptFacts(decision){
  return [
    ['SIGNAL', decision.signal || 'Needs repair'],
    ['LATEST READING', decision.reading || 'No reading recorded'],
    ['OWNER', decision.owner || 'Needs repair'],
    ['ANSWER BY', decision.answerBy || 'Needs repair'],
    ['OPENS WHEN', decision.when?.source || 'Always open'],
    ['ANSWER / ASSUMPTION', decision.answer?.raw || decision.assumption?.raw || 'Not answered'],
  ];
}

function receipt(decision, x, y, width, C, measure, narrow){
  if(!decision) return {svg:'', height:0};
  const inset = narrow ? 16 : 20;
  const state = decision.currentState?.sentence || 'Unanswered';
  const question = decision.question || nameOf(decision);
  let svg = '<g data-kind="question-receipt" data-decision-key="' + esc(decision.key) + '"><title>' +
    esc(`${nameOf(decision)} — ${state}`) + '</title>';
  if(narrow){
    const inner = width - inset * 2;
    const questionLines = wrapped(question, inner, measure, `700 19px ${SERIF}`);
    const stateLines = wrapped(state, inner, measure, `700 10px ${SANS}`);
    let ty = y + 25;
    svg += rect(x, y, width, 10, C.accent) + txt(x + inset, ty, nameOf(decision).toUpperCase(), 9,
      C.accentInk, {weight:700, tracking:0.8});
    ty += 23;
    for(const value of questionLines){ svg += txt(x + inset, ty, value, 19, C.ink, {weight:700, family:SERIF}); ty += 23; }
    ty += 3;
    for(const value of stateLines){ svg += txt(x + inset, ty, value, 10,
      decision.currentState?.kind === 'repair' ? C.urgent : C.muted, {weight:700}); ty += 13; }
    ty += 12;
    for(const [label, value] of receiptFacts(decision)){
      const lines = wrapped(value, inner, measure, `600 10px ${SANS}`);
      svg += txt(x + inset, ty, label, 8, C.muted, {weight:700, tracking:0.65}); ty += 13;
      for(const lineValue of lines){ svg += txt(x + inset, ty, lineValue, 10, C.ink, {weight:600}); ty += 13; }
      ty += 8;
    }
    const height = ty - y + 4;
    return {svg:rect(x, y, width, height, C.surface, {stroke:C.border, sw:1}) + svg + '</g>', height};
  }

  const questionWidth = Math.min(430, width * .4);
  const factsX = x + questionWidth + 28;
  const factsWidth = width - questionWidth - 48;
  const factGap = 20;
  const factWidth = (factsWidth - factGap) / 2;
  const questionLines = wrapped(question, questionWidth - inset * 2, measure, `700 22px ${SERIF}`);
  const stateLines = wrapped(state, questionWidth - inset * 2, measure, `700 10px ${SANS}`);
  const factLayouts = receiptFacts(decision).map(([label, value], index) => ({label,
    lines:wrapped(value, factWidth, measure, `600 10px ${SANS}`), column:index % 2, row:Math.floor(index / 2)}));
  const rowHeights = [0, 1, 2].map(row => Math.max(44, ...factLayouts.filter(fact => fact.row === row)
    .map(fact => 19 + fact.lines.length * 13)));
  const questionHeight = 59 + questionLines.length * 27 + stateLines.length * 13;
  const factsHeight = rowHeights.reduce((sum, value) => sum + value + 9, 0);
  const height = Math.max(174, 34 + questionHeight, 26 + factsHeight);
  svg = rect(x, y, width, height, C.surface, {stroke:C.border, sw:1}) +
    rect(x, y, 7, height, C.accent) + svg + txt(x + inset, y + 25, nameOf(decision).toUpperCase(), 9,
      C.accentInk, {weight:700, tracking:0.8});
  let qy = y + 55;
  for(const value of questionLines){ svg += txt(x + inset, qy, value, 22, C.ink, {weight:700, family:SERIF}); qy += 27; }
  qy += 6;
  for(const value of stateLines){ svg += txt(x + inset, qy, value, 10,
    decision.currentState?.kind === 'repair' ? C.urgent : C.muted, {weight:700}); qy += 13; }
  let rowY = y + 27;
  for(let row = 0; row < 3; row++){
    for(const fact of factLayouts.filter(entry => entry.row === row)){
      const fx = factsX + fact.column * (factWidth + factGap);
      svg += txt(fx, rowY, fact.label, 8, C.muted, {weight:700, tracking:0.65});
      fact.lines.forEach((value, index) => {
        svg += txt(fx, rowY + 17 + index * 13, value, 10, C.ink, {weight:600});
      });
    }
    rowY += rowHeights[row] + 9;
  }
  return {svg:svg + '</g>', height};
}

function decisionAttrs(decision, selected, ctx){
  if(!ctx?.interactive) return '';
  return ' data-select-decision="" data-line="' + decision.srcLine + '" data-selected="' + selected +
    '" aria-pressed="' + selected + '"' + btnAttrs('Inspect question ' + nameOf(decision));
}

function compactState(decision){
  const kind = decision.currentState?.kind;
  if(kind === 'overdue') return 'OVERDUE';
  if(kind === 'assumption') return 'ASSUMED';
  if(kind === 'answered') return 'ANSWERED';
  if(kind === 'dormant') return 'NOT OPEN YET';
  if(kind === 'moot') return 'NO LONGER APPLIES';
  if(kind === 'repair') return 'NEEDS REPAIR';
  return 'OPEN';
}

function parallelRegister(overview, decision, x, y, width, C, measure, ctx, narrow){
  const questions = overview.decisions || [];
  let svg = '<g data-kind="parallel-question-register">' +
    txt(x, y + 10, 'PARALLEL QUESTIONS · NOT SEQUENCED', 9, C.muted, {weight:700, tracking:0.8});
  y += 24;
  const start = y;
  if(!questions.length){
    svg += txt(x, y + 20, 'No questions authored yet', 11, C.muted, {weight:600});
    return {svg:svg + '</g>', height:48};
  }
  const columns = narrow ? 1 : Math.min(4, questions.length);
  const gap = 8;
  const cardWidth = (width - gap * (columns - 1)) / columns;
  const rowHeights = [];
  const layouts = questions.map((question, index) => {
    const nameLines = wrapped(nameOf(question), cardWidth - 24, measure, `700 11px ${SANS}`).slice(0, 2);
    const height = Math.max(52, 28 + nameLines.length * 14);
    const row = Math.floor(index / columns);
    rowHeights[row] = Math.max(rowHeights[row] || 0, height);
    return {question, index, row, column:index % columns, nameLines, height};
  });
  const rowTops = [];
  let top = y;
  for(const height of rowHeights){ rowTops.push(top); top += height + gap; }
  for(const layout of layouts){
    const selected = layout.question.key === decision?.key;
    const qx = x + layout.column * (cardWidth + gap);
    const qy = rowTops[layout.row];
    const height = rowHeights[layout.row];
    const stateColor = layout.question.currentState?.kind === 'overdue' ||
      layout.question.currentState?.kind === 'repair' ? C.urgent : selected ? C.accentInk : C.muted;
    svg += '<g data-kind="parallel-question" data-decision-key="' + esc(layout.question.key) +
      '" data-selected="' + selected + '"' + decisionAttrs(layout.question, selected, ctx) + '><title>' +
      esc(`${nameOf(layout.question)} — ${layout.question.currentState?.sentence || compactState(layout.question)}`) + '</title>' +
      rect(qx, qy, cardWidth, height, selected ? wash(C.accent, '0D') : C.surface,
        {stroke:selected ? C.accent : C.border, sw:selected ? 2 : 1}) + rect(qx, qy, selected ? 4 : 2, height,
        selected ? C.accent : C.border);
    layout.nameLines.forEach((value, index) => {
      svg += txt(qx + 12, qy + 19 + index * 14, value, 11, C.ink, {weight:700});
    });
    svg += txt(qx + cardWidth - 10, qy + height - 10, compactState(layout.question), 7.5, stateColor,
      {weight:700, tracking:0.35, anchor:'end'});
    if(ctx?.interactive) svg += '<rect data-hit="" x="' + r2(qx) + '" y="' + r2(qy) +
      '" width="' + r2(cardWidth) + '" height="' + r2(height) + '" fill="transparent"/>';
    svg += '</g>';
  }
  return {svg:svg + '</g>', height:top - start};
}

function termDirection(term){
  return String(term?.direction || (term?.negated ? 'no' : 'yes')).toLowerCase();
}

function conditionCopy(item){
  const condition = item?.condition;
  if(!condition) return 'MOVES REGARDLESS';
  if(!condition.valid) return 'CONDITION NEEDS FIXING';
  const terms = (condition.terms || []).map(term => `${nameOf(term)} = ${termDirection(term).toUpperCase()}`);
  if(terms.length === 1) return `IF ${terms[0]}`;
  if(condition.operator === 'or') return `IF EITHER ${terms.join(' OR ')}`;
  return `ONLY IF ${terms.join(' AND ')}`;
}

function affectedEntries(impact){
  if(!impact) return [];
  const entries = [...(impact.direct?.yes || []), ...(impact.direct?.no || []),
    ...(impact.compound?.and || []), ...(impact.compound?.or || [])];
  return [...new Map(entries.map(entry => [entry.item.identity, entry])).values()];
}

function branchSentence(entry, direction){
  const projected = entry?.[direction];
  if(projected?.displayState?.sentence) return projected.displayState.sentence;
  if(projected?.itemState === 'in-plan') return 'Would be in the plan';
  if(projected?.itemState === 'not-needed') return 'Would not be pursued';
  if(projected?.itemState === 'limbo') return 'Would be working to an assumption';
  if(projected?.itemState === 'waiting') return 'Would still be waiting';
  return 'Logic would still need repair';
}

function workCardMeasure(entry, direction, width, measure){
  const item = entry.item;
  const inner = width - 24;
  const place = wrapped(`${item.period || 'Unscheduled'} · ${item.lane || 'Unassigned'}`, inner, measure,
    `700 8px ${SANS}`);
  const condition = wrapped(conditionCopy(item), inner, measure, `700 8px ${SANS}`);
  const title = wrapped(item.title || 'Untitled item', inner, measure, `700 12px ${SANS}`);
  const note = item.note ? wrapped(item.note, inner, measure, `400 9px ${SANS}`) : [];
  const outcome = wrapped(branchSentence(entry, direction), inner, measure, `600 9px ${SANS}`);
  const current = item.displayState?.sentence && item.displayState.sentence !== branchSentence(entry, direction)
    ? wrapped(`Now: ${item.displayState.sentence}`, inner, measure, `600 8px ${SANS}`) : [];
  const height = 29 + place.length * 11 + condition.length * 11 + title.length * 15 + note.length * 13 +
    outcome.length * 12 + current.length * 11 + 14;
  return {place, condition, title, note, outcome, current, height};
}

function renderWorkCard(entry, direction, x, y, width, C, measure){
  const item = entry.item;
  const layout = workCardMeasure(entry, direction, width, measure);
  const state = item.displayState?.kind || 'waiting';
  const inactive = entry?.[direction]?.itemState === 'not-needed' || state === 'not-pursuing';
  let svg = '<g data-kind="question-work-card" data-item-identity="' + esc(String(item.identity)) +
    '" data-outcome="' + direction + '" data-current-state="' + esc(state) + '"><title>' +
    esc(`${item.title || 'Untitled item'} — ${branchSentence(entry, direction)}`) + '</title>' +
    rect(x, y, width, layout.height, C.surface, {stroke:inactive ? C.muted : C.border, sw:1,
      dash:inactive ? '4 3' : null}) + rect(x, y, 4, layout.height, inactive ? C.muted : C.accent);
  let ty = y + 17;
  for(const value of layout.place){ svg += txt(x + 12, ty, value, 8, C.muted, {weight:700, tracking:0.45}); ty += 11; }
  for(const value of layout.condition){ svg += txt(x + 12, ty, value, 8, C.accentInk, {weight:700, tracking:0.35}); ty += 11; }
  ty += 4;
  for(const value of layout.title){ svg += txt(x + 12, ty, value, 12, C.ink, {weight:700}); ty += 15; }
  for(const value of layout.note){ svg += txt(x + 12, ty + 1, value, 9, C.muted); ty += 13; }
  ty += 3;
  for(const value of layout.outcome){ svg += txt(x + 12, ty, value, 9, inactive ? C.muted : C.ink, {weight:700}); ty += 12; }
  for(const value of layout.current){ svg += txt(x + 12, ty + 1, value, 8, C.muted, {weight:600}); ty += 11; }
  return {svg:svg + '</g>', height:layout.height};
}

function openingConditionCopy(condition){
  if(!condition) return 'ALWAYS OPEN';
  if(!condition.valid) return 'OPENING CONDITION NEEDS FIXING';
  const terms = (condition.terms || []).map(term => `${nameOf(term)} = ${termDirection(term).toUpperCase()}`);
  if(terms.length === 1) return `OPENS IF ${terms[0]}`;
  if(condition.operator === 'or') return `OPENS IF EITHER ${terms.join(' OR ')}`;
  return `OPENS ONLY IF ${terms.join(' AND ')}`;
}

/* A `when:` gate belongs to the selected decision itself. Its yes/no worlds
   remain useful counterfactual machinery, but presenting them as options while
   the gate is dormant or moot would contradict the model. */
function questionIsOpen(decision){
  return !decision?.when || decision.availability === 'active';
}

function prerequisiteBarrier(decision, x, y, width, C, measure){
  const requirement = openingConditionCopy(decision.when);
  const state = decision.currentState?.kind === 'moot' ? 'NO LONGER APPLIES' : 'NOT OPEN YET';
  const copy = decision.currentState?.kind === 'moot'
    ? 'This question is not applicable in the current plan, so answer outcomes are not shown.'
    : 'This question cannot be answered yet. Answer outcomes are shown only after its opening condition is satisfied.';
  const requirementLines = wrapped(requirement, width - 32, measure, `700 10px ${SANS}`);
  const copyLines = wrapped(copy, width - 32, measure, `600 10px ${SANS}`);
  const height = 44 + requirementLines.length * 13 + 8 + copyLines.length * 13 + 16;
  let svg = '<g data-kind="question-prerequisite-barrier" data-availability="' +
    esc(decision.availability || 'dormant') + '"><title>' + esc(`${nameOf(decision)} — ${state}. ${requirement}`) +
    '</title>' + rect(x, y, width, height, wash(C.urgent, '08'), {stroke:C.urgent, sw:1}) +
    rect(x, y, 5, height, C.urgent) + txt(x + 16, y + 22, state, 9, C.urgent, {weight:700, tracking:0.8});
  let ty = y + 42;
  for(const value of requirementLines){ svg += txt(x + 16, ty, value, 10, C.accentInk, {weight:700, tracking:0.25}); ty += 13; }
  ty += 8;
  for(const value of copyLines){ svg += txt(x + 16, ty, value, 10, C.ink, {weight:600}); ty += 13; }
  return {svg:svg + '</g>', height};
}

function branchQuestionSentence(state){
  if(state?.availability === 'active') return state.effectiveAnswer
    ? `Would be open with a recorded ${state.effectiveAnswer} answer` : 'Would be open';
  if(state?.availability === 'moot') return 'Would no longer apply';
  return 'Would not be open yet';
}

function decisionChanges(impact, direction){
  const entries = impact?.whenEffects?.all;
  if(entries?.length) return entries.map(entry => ({
    question:entry.question || nameOf(entry),
    sentence:branchQuestionSentence(entry[direction]),
    requirement:openingConditionCopy(entry.condition),
  }));
  return impact?.narrative?.branches?.[direction]?.decisions || [];
}

function outcomeSection(impact, direction, x, y, width, C, measure){
  const entries = affectedEntries(impact);
  const changes = decisionChanges(impact, direction);
  const label = direction === 'yes' ? 'IF YES' : 'IF NO';
  const summary = `${entries.length} affected ${entries.length === 1 ? 'work item' : 'work items'}` +
    (changes.length ? ` · ${changes.length} ${changes.length === 1 ? 'question changes' : 'questions change'}` : '');
  let svg = '<g data-kind="question-outcome" data-outcome="' + direction + '">' +
    rect(x, y, width, 58, direction === 'yes' ? wash(C.accent, '10') : wash(C.muted, '09')) +
    rect(x, y, 5, 58, direction === 'yes' ? C.accent : C.ink) +
    txt(x + 16, y + 24, label, 11, direction === 'yes' ? C.accentInk : C.ink,
      {weight:700, tracking:0.85}) + txt(x + 16, y + 43, summary, 9, C.muted, {weight:600});
  let ty = y + 70;
  if(!entries.length){
    svg += rect(x, ty, width, 58, C.surface, {stroke:C.border, sw:1}) +
      txt(x + 12, ty + 25, 'No authored work changes under this answer', 10, C.muted, {weight:600});
    ty += 70;
  }else{
    for(const entry of entries){
      const card = renderWorkCard(entry, direction, x, ty, width, C, measure);
      svg += card.svg;
      ty += card.height + 9;
    }
  }
  if(changes.length){
    svg += '<g data-kind="question-changes" data-outcome="' + direction + '">' +
      txt(x, ty + 10, 'OTHER QUESTIONS', 8, C.muted, {weight:700, tracking:0.7});
    ty += 23;
    for(const change of changes){
      const lines = wrapped(`${change.question} — ${change.sentence}`, width - 24, measure, `600 9px ${SANS}`);
      const requirement = wrapped(change.requirement || '', width - 24, measure, `700 8px ${SANS}`);
      const height = Math.max(44, 20 + lines.length * 12 + requirement.length * 11);
      svg += rect(x, ty, width, height, wash(C.accent, '07'), {stroke:C.border, sw:1});
      lines.forEach((value, index) => {
        svg += txt(x + 12, ty + 18 + index * 12, value, 9, C.ink, {weight:index === 0 ? 700 : 600});
      });
      requirement.forEach((value, index) => {
        svg += txt(x + 12, ty + 20 + lines.length * 12 + index * 11, value, 8, C.accentInk,
          {weight:700, tracking:0.35});
      });
      ty += height + 7;
    }
    svg += '</g>';
  }
  return {svg:svg + '</g>', height:ty - y};
}

function historyBlock(impact, x, y, width, C, measure){
  const entries = impact?.completedHistory || [];
  if(!entries.length) return {svg:'', height:0};
  let svg = '<g data-kind="question-history">' +
    txt(x, y + 10, 'RECORDED HISTORY', 9, C.muted, {weight:700, tracking:0.8});
  let ty = y + 24;
  for(const entry of entries){
    const item = entry.item;
    const label = `${item.title} — ${item.period || 'Unscheduled'} · ${item.lane || 'Unassigned'}`;
    const lines = wrapped(label, width - 24, measure, `600 10px ${SANS}`);
    const condition = wrapped(conditionCopy(item), width - 24, measure, `700 8px ${SANS}`);
    const height = 25 + lines.length * 13 + condition.length * 11;
    svg += rect(x, ty, width, height, C.surface, {stroke:C.border, sw:1, dash:'4 3'});
    condition.forEach((value, index) => {
      svg += txt(x + 12, ty + 17 + index * 11, value, 8, C.accentInk, {weight:700, tracking:0.35});
    });
    lines.forEach((value, index) => {
      svg += txt(x + 12, ty + 21 + condition.length * 11 + index * 13, value, 10, C.ink, {weight:600});
    });
    ty += height + 7;
  }
  return {svg:svg + '</g>', height:ty - y};
}

function healthMessages(overview, impact){
  const entries = [];
  const seen = new Set();
  const add = value => {
    const text = String(value || '').trim();
    if(text && !seen.has(text)){ seen.add(text); entries.push(text); }
  };
  for(const warning of overview.modelHealth || []) add(warning.message || warning);
  for(const entry of impact?.repairEvidence || []) add(entry.item
    ? `${entry.item.title} — ${entry.evidence?.sentence || 'Logic needs repair'}`
    : entry.evidence?.sentence);
  return entries;
}

function healthBlock(overview, impact, x, y, width, C, measure){
  const messages = healthMessages(overview, impact);
  if(!messages.length) return {svg:'', height:0};
  let svg = '<g data-kind="question-model-health">' +
    txt(x, y + 10, 'MODEL HEALTH', 9, C.urgent, {weight:700, tracking:0.8});
  let ty = y + 25;
  for(const message of messages){
    const lines = wrapped(message, width - 24, measure, `600 9px ${SANS}`);
    const height = Math.max(38, 16 + lines.length * 12);
    svg += rect(x, ty, width, height, wash(C.urgent, '09'), {stroke:C.border, sw:1});
    lines.forEach((value, index) => {
      svg += txt(x + 12, ty + 18 + index * 12, value, 9, C.ink, {weight:600});
    });
    ty += height + 7;
  }
  return {svg:svg + '</g>', height:ty - y};
}

function emptyState(x, y, width, C){
  return '<g data-kind="question-lens-empty">' + rect(x, y, width, 82, C.surface, {stroke:C.border, sw:1}) +
    txt(x + 16, y + 31, 'No questions authored yet', 14, C.ink, {weight:700}) +
    txt(x + 16, y + 54, 'Add a decision to compare what changes under each answer.', 10, C.muted,
      {weight:600}) + '</g>';
}

export function renderQuestionLens(overview, ctx = {}){
  if(Number(ctx.width) > 0 && Number(ctx.width) < 520) return renderQuestionLensNarrow(overview, ctx);
  const measure = typeof ctx.measure === 'function' ? ctx.measure : value => String(value).length * 7;
  const C = palette(ctx.colors || {});
  const width = Math.max(1120, Math.ceil(Number(ctx.width) || 1160));
  const decision = selectedDecision(overview, ctx);
  const impact = selectedImpact(decision, ctx);
  const head = header(overview, width, C, measure, false);
  let y = head.height;
  let body = '';
  if(!decision){
    body = emptyState(PAD, y, width - PAD * 2, C);
    y += 82;
  }else{
    const selectedReceipt = receipt(decision, PAD, y, width - PAD * 2, C, measure, false);
    body += selectedReceipt.svg;
    y += selectedReceipt.height + 24;
    const register = parallelRegister(overview, decision, PAD, y, width - PAD * 2, C, measure, ctx, false);
    body += register.svg;
    y += register.height + 25;
    if(questionIsOpen(decision)){
      const gap = 22;
      const columnWidth = (width - PAD * 2 - gap) / 2;
      const yes = outcomeSection(impact, 'yes', PAD, y, columnWidth, C, measure);
      const no = outcomeSection(impact, 'no', PAD + columnWidth + gap, y, columnWidth, C, measure);
      body += yes.svg + no.svg;
      y += Math.max(yes.height, no.height) + 22;
    }else{
      const barrier = prerequisiteBarrier(decision, PAD, y, width - PAD * 2, C, measure);
      body += barrier.svg;
      y += barrier.height + 22;
    }
    const history = historyBlock(impact, PAD, y, width - PAD * 2, C, measure);
    body += history.svg;
    y += history.height ? history.height + 18 : 0;
    const health = healthBlock(overview, impact, PAD, y, width - PAD * 2, C, measure);
    body += health.svg;
    y += health.height;
  }
  const height = Math.ceil(y + PAD);
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height +
    '" viewBox="0 0 ' + width + ' ' + height + '" data-theme="' + (ctx.dark ? 'dark' : 'light') +
    '" data-kind="question-lens" data-layout="paired" data-min-readable-scale="' + MIN_READABLE_SCALE + '" font-family="' + SANS +
    '" ' + rootRole(ctx) + '>' + accessibleHead(overview, decision, impact) +
    rect(0, 0, width, height, C.bg) + head.svg + body + '</svg>';
}

export function renderQuestionLensNarrow(overview, ctx = {}){
  const measure = typeof ctx.measure === 'function' ? ctx.measure : value => String(value).length * 7;
  const C = palette(ctx.colors || {});
  const width = Math.max(280, Math.min(520, Number(ctx.width) || 360));
  const inner = width - NARROW_PAD * 2;
  const decision = selectedDecision(overview, ctx);
  const impact = selectedImpact(decision, ctx);
  const head = header(overview, width, C, measure, true);
  let y = head.height;
  let body = '';
  if(!decision){
    body = emptyState(NARROW_PAD, y, inner, C);
    y += 82;
  }else{
    const selectedReceipt = receipt(decision, NARROW_PAD, y, inner, C, measure, true);
    body += selectedReceipt.svg;
    y += selectedReceipt.height + 20;
    if(questionIsOpen(decision)){
      for(const direction of ['yes', 'no']){
        const outcome = outcomeSection(impact, direction, NARROW_PAD, y, inner, C, measure);
        body += outcome.svg;
        y += outcome.height + 22;
      }
    }else{
      const barrier = prerequisiteBarrier(decision, NARROW_PAD, y, inner, C, measure);
      body += barrier.svg;
      y += barrier.height + 22;
    }
    const history = historyBlock(impact, NARROW_PAD, y, inner, C, measure);
    body += history.svg;
    y += history.height ? history.height + 18 : 0;
    const health = healthBlock(overview, impact, NARROW_PAD, y, inner, C, measure);
    body += health.svg;
    y += health.height ? health.height + 18 : 0;
    const register = parallelRegister(overview, decision, NARROW_PAD, y, inner, C, measure, ctx, true);
    body += register.svg;
    y += register.height;
  }
  const height = Math.ceil(y + NARROW_PAD);
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + r2(width) + '" height="' + r2(height) +
    '" viewBox="0 0 ' + r2(width) + ' ' + r2(height) + '" data-theme="' + (ctx.dark ? 'dark' : 'light') +
    '" data-kind="question-lens-narrow" data-layout="stacked" font-family="' + SANS + '" ' + rootRole(ctx) + '>' +
    accessibleHead(overview, decision, impact) + rect(0, 0, width, height, C.bg) + head.svg + body + '</svg>';
}

export default renderQuestionLens;
