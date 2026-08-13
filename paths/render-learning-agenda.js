/* Pure SVG for the Learning Agenda. Rank is urgency, never causal order; each
   docket therefore carries its complete authored evidence move and condition
   reach instead of relying on graph lines or a legend. */

import {btnAttrs, esc, txt, wash} from '../assets/svg.js';
import {line, rect} from '../roadmap/deck-parts.js';
import {artefactPalette as palette, wrappedArtefactText as wrapped} from './artefact-parts.js';

const SANS = "system-ui,-apple-system,'Segoe UI',sans-serif";
const SERIF = "Charter,'Bitstream Charter',Georgia,serif";
const MIN_READABLE_SCALE = 0.9;

function nameOf(decision){
  const value = String(decision?.name || decision?.key || 'Decision');
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

function verdictOf(agenda){
  return String(typeof agenda?.verdict === 'string' ? agenda.verdict : agenda?.verdict?.line || '');
}

function selectedDecision(agenda, ctx){
  if(ctx?.selection === false) return null;
  const key = String(ctx?.selectedKey || agenda?.initialSelection?.key || '').toLowerCase();
  return (agenda?.entries || []).find(decision => decision.key === key) || null;
}

function rootRole(ctx){
  return ctx?.interactive
    ? 'role="group" aria-labelledby="paths-agenda-name paths-agenda-description"'
    : 'role="img" aria-labelledby="paths-agenda-name paths-agenda-description"';
}

function accessibleHead(agenda, selected){
  const title = `${agenda.title || 'Paths'} — Learning agenda`;
  const verdict = verdictOf(agenda);
  const counts = `${agenda.assumptions.length} working on an assumption, ${agenda.active.length} to do next, ` +
    `${agenda.blocked.length} blocked, ${agenda.notReady.length} not ready, ` +
    `${agenda.settled.length} settled or no longer applicable`;
  const selection = selected
    ? ` Selected decision ${nameOf(selected)}. Current state: ${selected.currentState.sentence}.`
    : '';
  const verdictCopy = verdict ? `Verdict: ${verdict.replace(/[.!?]+$/, '')}. ` : '';
  return `<title id="paths-agenda-name">${esc(title)}</title>` +
    `<desc id="paths-agenda-description">${esc(`${verdictCopy}${counts}.${selection}`)}</desc>`;
}

function entryCopy(entry, group){
  const lines = [];
  if(group === 'active' || group === 'assumption')
    lines.push({kind:'move', label:'NEXT LEARNING MOVE', value:entry.nextAction});
  if(group === 'blocked'){
    lines.push({kind:'opening', label:'OPENING CONDITION', value:entry.openingCondition || 'Opening condition is unavailable.'});
    lines.push({kind:'quiet', label:'NEXT LEARNING MOVE', value:entry.nextAction});
  }
  if(group === 'not-ready'){
    if(entry.openingRepair?.length){
      lines.push({kind:'repair', label:'NEXT ACTION',
        value:entry.nextAction});
      lines.push({kind:'repair', label:'OPENING CONDITION',
        value:entry.openingCondition || 'Opening condition needs repair.'});
    }
    for(const reason of entry.hygiene || [])
      lines.push({kind:'repair', label:'MISSING OR INVALID', value:reason.sentence});
  }
  if(group === 'settled') lines.push({kind:'quiet', label:'LEARNING STATUS',
    value:'No learning move is due while this state holds.'});
  lines.push({kind:'fact', label:'OWNER', value:entry.owner || 'Needs repair'});
  lines.push({kind:'fact', label:'ANSWER BY', value:entry.answerBy || 'Needs repair'});
  lines.push({kind:'fact', label:'SIGNAL', value:entry.signal || 'Needs repair'});
  lines.push({kind:'fact', label:'LATEST READING', value:entry.reading || 'No reading recorded'});
  lines.push({kind:'impact', label:'YES / NO REACH', value:entry.reachSentence});
  for(const value of entry.impact.direct) lines.push({kind:'impact-detail', label:'DIRECT', value});
  for(const value of entry.impact.shared) lines.push({kind:'impact-detail', label:'SHARED CONDITION', value});
  for(const value of entry.impact.downstream) lines.push({kind:'impact-detail', label:'DOWNSTREAM QUESTION', value});
  if(group !== 'not-ready') for(const reason of entry.hygiene || [])
    lines.push({kind:'repair', label:'MODEL HYGIENE', value:reason.sentence});
  return lines;
}

function entryLayout(entry, group, width, measure, narrow){
  const contentWidth = width - (narrow ? 30 : 76);
  const questionSize = narrow ? 18 : 18;
  const questionLine = narrow ? 24 : 22;
  const stateSize = narrow ? 14 : 11;
  const stateLine = narrow ? 19 : 14;
  const valueSize = narrow ? 14 : 11;
  const valueLine = narrow ? 19 : 14;
  const labelLine = narrow ? 17 : 0;
  const detailGap = narrow ? 12 : 10;
  const question = wrapped(entry.question || nameOf(entry), contentWidth, measure, `700 ${questionSize}px ${SERIF}`);
  const state = wrapped(entry.currentState?.sentence || 'State unavailable', contentWidth, measure, `600 ${stateSize}px ${SANS}`);
  const detailWidth = narrow ? contentWidth : contentWidth - 146;
  const details = entryCopy(entry, group).map(item => ({...item,
    lines:wrapped(item.value, detailWidth, measure, `500 ${valueSize}px ${SANS}`)}));
  const detailHeight = details.reduce((sum, item) => sum + labelLine +
    Math.max(1, item.lines.length) * valueLine + detailGap, 0);
  const top = narrow ? 52 : 45;
  return {question, state, details, questionSize, questionLine, stateSize, stateLine,
    valueSize, valueLine, labelSize:narrow ? 10 : 8, labelLine, detailGap,
    height:top + question.length * questionLine + state.length * stateLine + 10 + detailHeight + 14};
}

function renderEntry(entry, group, x, y, width, C, measure, narrow, selected, interactive){
  const layout = entryLayout(entry, group, width, measure, narrow);
  const fill = selected ? wash(C.accent, '0D') : C.surface;
  const attr = interactive
    ? ` data-select-decision="" aria-pressed="${selected}"${btnAttrs(`Select ${entry.question || nameOf(entry)}`)}`
    : '';
  let svg = `<g data-kind="agenda-entry" data-group="${group}" data-decision-key="${esc(entry.key)}" ` +
    `data-current-state="${esc(entry.currentState?.kind || 'unknown')}" data-selected="${selected}"${attr}>` +
    `<title>${esc(`${entry.question || nameOf(entry)} — ${entry.currentState?.sentence || 'State unavailable'}`)}</title>` +
    rect(x, y, width, layout.height, fill, {stroke:selected ? C.accent : C.border, sw:selected ? 2 : 1});
  if(selected) svg += rect(x, y, 5, layout.height, C.accent);
  if(interactive) svg += `<rect data-hit="" x="${x}" y="${y}" width="${width}" height="${layout.height}" fill="${C.bg}" fill-opacity="0"/>`;
  const left = x + (narrow ? 15 : 22);
  let ty = y + (narrow ? 24 : 22);
  if(group === 'active' || group === 'assumption'){
    const urgency = entry.overdue ? 'OVERDUE' : 'DO NEXT';
    svg += txt(left, ty, group === 'assumption' ? 'WORKING ON AN ASSUMPTION' : urgency, narrow ? 10 : 8,
      entry.overdue && group === 'active' ? C.urgent : C.accentInk, {weight:800, tracking:0.8});
  } else svg += txt(left, ty, group === 'blocked' ? 'BLOCKED LEARNING' : group === 'not-ready' ? 'NOT READY' : 'SETTLED / NO LONGER APPLICABLE',
    narrow ? 10 : 8, group === 'not-ready' ? C.urgent : C.muted, {weight:800, tracking:0.75});
  if(selected) svg += txt(x + width - 16, ty, 'SELECTED', narrow ? 9 : 8, C.accentInk,
    {weight:800, tracking:0.7, anchor:'end'});
  ty += narrow ? 28 : 23;
  for(const value of layout.question){ svg += txt(left, ty, value, layout.questionSize, C.ink, {weight:700}); ty += layout.questionLine; }
  for(const value of layout.state){ svg += txt(left, ty, value, layout.stateSize,
    entry.currentState?.kind === 'not-ready' || entry.currentState?.kind === 'overdue' ? C.urgent : C.muted,
  {weight:600}); ty += layout.stateLine; }
  ty += 10;
  for(const detail of layout.details){
    if(narrow){
      svg += txt(left, ty, detail.label, layout.labelSize,
        detail.kind === 'repair' ? C.urgent : detail.kind === 'move' ? C.accentInk : C.muted,
      {weight:800, tracking:0.65}); ty += layout.labelLine;
      for(const value of detail.lines){ svg += txt(left, ty, value, layout.valueSize, C.ink,
        {weight:detail.kind === 'move' ? 700 : 500}); ty += layout.valueLine; }
    } else {
      svg += txt(left, ty, detail.label, 8,
        detail.kind === 'repair' ? C.urgent : detail.kind === 'move' ? C.accentInk : C.muted,
      {weight:800, tracking:0.65});
      const valueX = left + 146;
      for(const value of detail.lines){ svg += txt(valueX, ty, value, 11, C.ink,
        {weight:detail.kind === 'move' ? 700 : 500}); ty += 14; }
    }
    ty += layout.detailGap;
  }
  return {svg:svg + '</g>', height:layout.height};
}

function sectionHeight(entries, group, width, measure, narrow){
  if(!entries.length) return 88;
  return 58 + entries.reduce((sum, entry) => sum + entryLayout(entry, group, width, measure, narrow).height + 12, 0);
}

function renderSection(section, x, y, width, C, measure, narrow, selectedKey, interactive){
  const {label, note, group, entries} = section;
  let svg = `<g data-kind="agenda-section" data-section="${group}">`;
  svg += txt(x, y + 11, label.toUpperCase(), 9,
    group === 'active' || group === 'assumption' ? C.accentInk : group === 'not-ready' ? C.urgent : C.muted,
    {weight:800, tracking:1});
  svg += txt(x + width, y + 11, String(entries.length), 11, C.muted, {weight:700, anchor:'end'});
  svg += txt(x, y + 31, note, 10, C.muted, {weight:500});
  svg += line(x, y + 43, x + width, y + 43, C.border, 1);
  let cursor = y + 55;
  if(!entries.length){
    svg += txt(x + 14, cursor + 20, group === 'active' ? 'No active unanswered questions.' : 'None.', 11, C.muted);
    return {svg:svg + '</g>', height:88};
  }
  for(const entry of entries){
    const rendered = renderEntry(entry, group, x, cursor, width, C, measure, narrow,
      entry.key === selectedKey, interactive);
    svg += rendered.svg; cursor += rendered.height + 12;
  }
  return {svg:svg + '</g>', height:cursor - y};
}

function render(agenda, ctx, narrow){
  const C = palette(ctx?.colors || {}), measure = ctx?.measure || (value => String(value).length * 7);
  const width = narrow ? Math.max(300, Number(ctx?.width) || 390) : Math.max(840, Number(ctx?.width) || 1160);
  const pad = narrow ? 14 : 36, contentWidth = width - pad * 2;
  const selected = selectedDecision(agenda, ctx), selectedKey = selected?.key || '';
  const titleLines = wrapped(agenda.title || 'Paths', contentWidth - (!narrow && agenda.date ? 180 : 0), measure,
    `700 ${narrow ? 24 : 29}px ${SERIF}`);
  const verdict = verdictOf(agenda);
  const verdictLines = verdict
    ? wrapped(verdict, contentWidth - (narrow ? 0 : 100), measure, `600 12px ${SANS}`) : [];
  const titleEnd = pad + 40 + titleLines.length * (narrow ? 29 : 34);
  const copyEnd = verdictLines.length ? titleEnd + 27 + verdictLines.length * 15 : titleEnd;
  const attentionY = copyEnd + 10;
  const headerHeight = attentionY + 31;
  const sections = [
    {group:'assumption', label:'Working on an assumption', note:'Still unanswered; test the temporary direction before it hardens.', entries:agenda.assumptions || []},
    {group:'active', label:'Do next', note:'Attention order: overdue, answer-by, yes / no reach, then source order.', entries:agenda.active || []},
    {group:'blocked', label:'Blocked learning', note:'These questions are not open until their written conditions hold.', entries:agenda.blocked || []},
    {group:'not-ready', label:'Not ready', note:'Complete the evidence contract before trying to answer these questions.', entries:agenda.notReady || []},
    {group:'settled', label:'Settled / no longer applicable', note:'Answered or moot decisions retained as context.', entries:agenda.settled || []},
  ];
  const total = headerHeight + sections.reduce((sum, section) =>
    sum + sectionHeight(section.entries, section.group, contentWidth, measure, narrow) + 20, 0) + pad;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${total}" viewBox="0 0 ${width} ${total}" ` +
    `${rootRole(ctx)} data-kind="learning-agenda${narrow ? '-narrow' : ''}" data-layout="${narrow ? 'stacked' : 'docket'}" ` +
    `data-min-readable-scale="${MIN_READABLE_SCALE}">` + accessibleHead(agenda, selected) + rect(0, 0, width, total, C.bg);
  svg += `<g data-kind="agenda-header">` + txt(pad, pad + 9, 'LEARNING AGENDA', 9, C.accentInk, {weight:800, tracking:1.2});
  let ty = pad + 40;
  for(const value of titleLines){ svg += txt(pad, ty, value, narrow ? 24 : 29, C.ink, {weight:700}); ty += narrow ? 29 : 34; }
  if(agenda.date) svg += txt(width - pad, pad + 9, agenda.date, 9, C.muted, {weight:700, tracking:0.7, anchor:'end'});
  if(agenda.today) svg += txt(width - pad, pad + (agenda.date ? 24 : 9), `EVALUATED ${agenda.today}`, 8, C.muted,
    {weight:700, tracking:0.6, anchor:'end'});
  if(verdict){
    svg += txt(pad, ty + 8, 'VERDICT', 8, C.muted, {weight:800, tracking:0.8});
    let vy = ty + 27;
    for(const value of verdictLines){ svg += txt(pad, vy, value, 12, C.ink, {weight:600}); vy += 15; }
  }
  svg += txt(pad, attentionY, 'Attention order is not a causal sequence.', 10, C.muted, {weight:600});
  svg += line(pad, attentionY + 15, width - pad, attentionY + 15, C.border, 1) + '</g>';
  let y = headerHeight;
  for(const section of sections){
    const drawn = renderSection(section, pad, y, contentWidth, C, measure, narrow, selectedKey, !!ctx?.interactive);
    svg += drawn.svg; y += drawn.height + 20;
  }
  return svg + '</svg>';
}

export function renderLearningAgenda(agenda, ctx = {}){ return render(agenda, ctx, false); }
export function renderLearningAgendaNarrow(agenda, ctx = {}){ return render(agenda, ctx, true); }
