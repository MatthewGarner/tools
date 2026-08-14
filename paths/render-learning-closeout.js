/* Scoped SVG receipt for one answered/read Paths decision. This renderer only
   presents author-owned close-out text and derived documentation currency. It
   never evaluates evidence quality, causal truth, or the delivery projection. */

import {esc, txt, wash} from '../assets/svg.js';
import {line, rect} from '../roadmap/deck-parts.js';
import {artefactPalette as palette, wrappedArtefactText as wrapped} from './artefact-parts.js';

const SANS = "system-ui,-apple-system,'Segoe UI',sans-serif";
const SERIF = "Charter,'Bitstream Charter',Georgia,serif";

const label = value => String(value || '—').replace(/-/g, ' ').replace(/^./, first => first.toUpperCase());
const nameOf = decision => String(decision?.name || decision?.key || 'Decision').replace(/^./, first => first.toUpperCase());

function textBlock(value, width, measure, {size = 12, weight = 550, lineHeight = 17} = {}){
  const lines = wrapped(value || 'Not authored', width, measure, `${weight} ${size}px ${SANS}`);
  return {lines:lines.length ? lines : ['Not authored'], size, weight, lineHeight,
    height:Math.max(1, lines.length) * lineHeight};
}

function field(labelText, value, width, measure, options = {}){
  const body = textBlock(value, width, measure, options);
  return {label:labelText, body, height:22 + body.height};
}

function drawField(item, x, y, C){
  let svg = txt(x, y + 8, item.label.toUpperCase(), 8, C.muted, {weight:800, tracking:0.8});
  let cursor = y + 28;
  for(const value of item.body.lines){
    svg += txt(x, cursor, value, item.body.size, C.ink, {weight:item.body.weight});
    cursor += item.body.lineHeight;
  }
  return svg;
}

function section(title, fields, x, y, width, C, measure, narrow){
  const pad = narrow ? 14 : 18, gap = narrow ? 14 : 22;
  const columns = narrow ? 1 : Math.min(3, fields.length);
  const fieldWidth = (width - pad * 2 - gap * (columns - 1)) / columns;
  const rows = [];
  for(let i = 0; i < fields.length; i += columns){
    const items = fields.slice(i, i + columns).map(item => field(item[0], item[1], fieldWidth, measure, item[2]));
    rows.push({items, height:Math.max(...items.map(item => item.height))});
  }
  const height = 42 + pad + rows.reduce((sum, row) => sum + row.height + 18, 0);
  let svg = `<g data-kind="closeout-section">` + rect(x, y, width, height, C.surface, {stroke:C.border, sw:1}) +
    txt(x + pad, y + 25, title.toUpperCase(), 9, C.accentInk, {weight:800, tracking:1});
  let cursor = y + 46;
  for(const row of rows){
    row.items.forEach((item, index) => { svg += drawField(item, x + pad + index * (fieldWidth + gap), cursor, C); });
    cursor += row.height + 18;
  }
  return {svg:svg + '</g>', height};
}

function historyFields(receipt){
  const fields = [];
  const events = receipt?.events || [
    ...(receipt?.reviews || []).map(event => ({kind:'review', ...event})),
    ...(receipt?.retirements || []).map(event => ({kind:'retirement', ...event})),
  ].sort((left, right) => (left.srcLine ?? 0) - (right.srcLine ?? 0));
  for(const [index, event] of events.entries()){
    if(event.kind === 'review'){
      fields.push([`Event ${index + 1} · Review · ${label(event.relation)} · ${label(event.effect)}`,
        `Prior claim: ${event.priorClaim || 'Not authored'} · Prior scope: ${event.priorScope || 'Not authored'} · ` +
        `Observation: ${event.newObservation || 'Not authored'}${event.newScope ? ` · New scope: ${event.newScope}` : ''}`]);
    } else fields.push([`Event ${index + 1} · Retirement · ${label(event.effect)}`,
      `${event.reason || 'Reason not authored'}${event.retiredOn ? ` · ${event.retiredOn}` : ''}`]);
  }
  return fields;
}

function receiptStates(receipt){
  return receipt ? {
    record:receipt.record || 'incomplete', carryForward:receipt.carryForward || 'no-stated-carry-forward',
    currency:receipt.currency || 'current',
  } : {record:'not-documented', carryForward:'not-stated', currency:'not-applicable'};
}

function render(source, decision, receipt, ctx, narrow){
  const C = palette(ctx?.colors || {}), measure = ctx?.measure || (value => String(value).length * 7);
  const width = narrow ? Math.max(300, Number(ctx?.width) || 390) : Math.max(720, Number(ctx?.width) || 900);
  const pad = narrow ? 14 : 34, inner = width - pad * 2;
  const question = textBlock(decision?.question || nameOf(decision), inner - (narrow ? 0 : 180), measure,
    {size:narrow ? 22 : 27, weight:700, lineHeight:narrow ? 27 : 33});
  const qualifier = receipt?.qualifier || 'Author-stated contents; not evidence, causal, or research-quality certification.';
  const sections = [];
  sections.push(section('Learning contract & current truth', [
    ['Question', decision?.question || nameOf(decision)],
    ['Answer', decision?.answer?.direction ? `${decision.answer.direction}${decision.answer.date ? ` · ${decision.answer.date}` : ''}` : 'No answer recorded'],
    ['Latest reading', decision?.reading || 'No reading recorded'],
  ], pad, 0, inner, C, measure, narrow));
  sections.push(section('What is documented', [
    ['Basis kind', label(receipt?.basisKind)],
    ['Author-stated claim', receipt?.claim],
    ['Decision use', receipt?.decisionUse],
  ], pad, 0, inner, C, measure, narrow));
  sections.push(section('What may travel forward', [
    ['Author declaration', label(receipt?.declaredCarryForward || receipt?.carryForward)],
    ['Scope', receipt?.scope || (receipt?.carryForward === 'no-stated-carry-forward' ? 'Nothing stated to carry forward' : null)],
    ['Review by', receipt?.reviewBy],
  ], pad, 0, inner, C, measure, narrow));
  sections.push(section('When to reconsider', [
    ['Trigger', receipt?.reconsiderIf], ['Next check', receipt?.nextCheck],
  ], pad, 0, inner, C, measure, narrow));
  const history = historyFields(receipt);
  const states = receiptStates(receipt);
  if(history.length) sections.push(section('Append-only history', history, pad, 0, inner, C, measure, narrow));

  const headerHeight = pad + 24 + question.height + 84;
  const gap = 14;
  const qualifierBlock = textBlock(qualifier, inner, measure, {size:9, weight:600, lineHeight:13});
  const total = headerHeight + sections.reduce((sum, item) => sum + item.height + gap, 0) + qualifierBlock.height + pad + 26;
  const title = `${nameOf(decision)} — learning close-out`;
  const description = `Scoped learning close-out for ${decision?.question || nameOf(decision)}. ` +
    `Record ${states.record}. Carry-forward ${states.carryForward}. ` +
    `Currency ${states.currency}. ${qualifier}`;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${total}" viewBox="0 0 ${width} ${total}" ` +
    `role="img" aria-labelledby="paths-closeout-name paths-closeout-description" data-kind="learning-closeout" ` +
    `data-scope="selected-decision" data-layout="${narrow ? 'narrow' : 'wide'}">` +
    `<title id="paths-closeout-name">${esc(title)}</title><desc id="paths-closeout-description">${esc(description)}</desc>` +
    rect(0, 0, width, total, C.bg);
  let y = pad;
  svg += txt(pad, y + 9, 'LEARNING CLOSE-OUT · SELECTED DECISION', 9, C.accentInk, {weight:800, tracking:1.1});
  if(source?.date) svg += txt(width - pad, y + 9, String(source.date), 9, C.muted, {weight:700, anchor:'end'});
  y += 35;
  for(const value of question.lines){ svg += txt(pad, y, value, question.size, C.ink, {weight:question.weight}); y += question.lineHeight; }
  y += 13;
  const stateStamps = [
    ['RECORD', label(states.record)],
    ['CARRY-FORWARD', label(states.carryForward)],
    ['CURRENCY', label(states.currency)],
  ];
  const stampGap = narrow ? 7 : 10, stampWidth = (inner - stampGap * 2) / 3;
  stateStamps.forEach((state, index) => {
    const x = pad + index * (stampWidth + stampGap);
    const currencyChanged = index === 2 && states.currency !== 'current' && states.currency !== 'not-applicable';
    svg += rect(x, y, stampWidth, 52, currencyChanged ? wash(C.accent, '0D') : C.surface,
      {stroke:currencyChanged ? C.accent : C.border, sw:1}) +
      txt(x + 9, y + 16, state[0], narrow ? 6.5 : 7.5, C.muted, {weight:800, tracking:0.6}) +
      txt(x + 9, y + 37, state[1], narrow ? 8.5 : 10, C.ink, {weight:750});
  });
  y += 68;
  for(const item of sections){
    /* Sections are drawn at y=0 so one exact translation keeps their geometry
       and authored text together without recomputing every field coordinate. */
    svg += `<g transform="translate(0 ${y})">${item.svg}</g>`;
    y += item.height + gap;
  }
  svg += line(pad, y + 2, width - pad, y + 2, C.border, 1);
  y += 22;
  for(const value of qualifierBlock.lines){ svg += txt(pad, y, value, 9, C.muted, {weight:600}); y += 13; }
  return svg + '</svg>';
}

export function renderLearningCloseOut(source, decision, receipt, ctx = {}){
  return render(source, decision, receipt, ctx, false);
}

export function renderLearningCloseOutNarrow(source, decision, receipt, ctx = {}){
  return render(source, decision, receipt, ctx, true);
}
