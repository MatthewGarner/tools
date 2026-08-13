/* Pure SVG for the Learning Agenda. Decisions are parallel, never causal order;
   authored learning contracts and evaluator-backed consequences stay separate. */

import {btnAttrs, esc, txt, wash} from '../assets/svg.js';
import {line, rect} from '../roadmap/deck-parts.js';
import {artefactPalette as palette, wrappedArtefactText as wrapped} from './artefact-parts.js';

const SANS = "system-ui,-apple-system,'Segoe UI',sans-serif";
const MIN_READABLE_SCALE = 0.9;
const RESULT_BASIS = 'Result changes are computed from current Paths conditions at the evaluated date; not a delivery commitment.';

function nameOf(decision){
  const value = String(decision?.name || decision?.key || 'Decision');
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

function questionFragment(decision, limit = 92){
  const value = String(decision?.question || nameOf(decision)).replace(/\s+/g, ' ').trim();
  return value.length > limit ? value.slice(0, limit - 1).trimEnd() + '…' : value;
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

/* Dossier-first composition. */

function dossierHead(agenda, selected){
  const verdict = verdictOf(agenda);
  const counts = `${agenda.assumptions.length} working on an assumption, ${agenda.active.length} to do next, ` +
    `${agenda.blocked.length} blocked, ${agenda.notReady.length} not ready, ` +
    `${agenda.settled.length} settled or no longer applicable`;
  const stopless = value => String(value || '').replace(/[.!?]+$/, '');
  const selection = !selected ? '' : ` Selected decision ${nameOf(selected)}. ` +
    `Current state: ${selected.currentState?.sentence || 'State unavailable'}. ` +
    `Learning move: ${stopless(selected.learningMove || 'not authored')}. ` +
    `Evidence sufficient when: ${stopless(selected.evidenceStandard || 'not authored')}. ` +
    `If yes: ${stopless(selected.outcomes?.yes?.summary || 'No modeled plan or downstream changes for this outcome')}. ` +
    `If no: ${stopless(selected.outcomes?.no?.summary || 'No modeled plan or downstream changes for this outcome')}.`;
  return `<title id="paths-agenda-name">${esc(`${agenda.title || 'Paths'} — Learning agenda`)}</title>` +
    `<desc id="paths-agenda-description">${esc(`${verdict ? `Verdict: ${verdict.replace(/[.!?]+$/, '')}. ` : ''}${counts}. ${RESULT_BASIS}${selection}`)}</desc>`;
}

function dossierGroup(entry){
  const kind = entry.currentState?.kind;
  if(kind === 'assumption') return 'assumption';
  if(kind === 'dormant') return 'blocked';
  if(kind === 'not-ready') return 'not-ready';
  if(kind === 'answered' || kind === 'moot') return 'settled';
  return 'active';
}

function dossierGroupLabel(group, entry){
  if(group === 'assumption') return 'WORKING ON AN ASSUMPTION';
  if(group === 'blocked') return 'BLOCKED LEARNING';
  if(group === 'not-ready') return 'NOT READY';
  if(group === 'settled') return 'SETTLED / NO LONGER APPLICABLE';
  return entry.overdue ? 'OVERDUE' : 'DO NEXT';
}

function dossierTone(entry, C){
  const kind = entry.currentState?.kind;
  return kind === 'not-ready' || kind === 'overdue' ? C.urgent :
    kind === 'assumption' ? C.accentInk : C.muted;
}

function dossierBlock(value, width, measure, narrow, strong = false){
  const size = narrow ? 14 : strong ? 12 : 11;
  const weight = strong ? 700 : 500;
  const lineHeight = narrow ? 19 : strong ? 16 : 15;
  const lines = wrapped(value || '—', Math.max(24, width), measure, `${weight} ${size}px ${SANS}`);
  return {lines:lines.length ? lines : ['—'], size, weight, lineHeight,
    height:Math.max(1, lines.length) * lineHeight};
}

function dossierField(label, value, width, measure, narrow, {strong = false, tone = 'normal'} = {}){
  const body = dossierBlock(value, width, measure, narrow, strong);
  return {label, body, tone, height:(narrow ? 27 : 22) + body.height + (narrow ? 12 : 9)};
}

function missingContract(entry, field){
  if(!(entry.learningContract?.missing || []).includes(field)) return null;
  return `Not authored — add "${field}:" to make this learning contract ready.`;
}

function dossierCurrent(entry, width, measure, narrow){
  const out = [dossierField('CURRENT STATE', entry.currentState?.sentence || 'State unavailable', width,
    measure, narrow, {strong:true, tone:entry.currentState?.kind === 'not-ready' ? 'repair' : 'normal'})];
  if(entry.openingCondition) out.push(dossierField('WHEN THIS CAN OPEN', entry.openingCondition, width, measure, narrow));
  if(entry.nextAction && (!entry.learningMove || dossierGroup(entry) === 'blocked' || dossierGroup(entry) === 'settled'))
    out.push(dossierField('NEXT ACTION', entry.nextAction, width, measure, narrow,
      {strong:entry.currentState?.kind === 'not-ready', tone:entry.currentState?.kind === 'not-ready' ? 'repair' : 'normal'}));
  for(const reason of entry.hygiene || []) out.push(dossierField('MODEL HYGIENE', reason.sentence, width,
    measure, narrow, {tone:'repair'}));
  return out;
}

function dossierContract(entry, width, measure, narrow){
  const move = entry.learningMove || missingContract(entry, 'learn') || 'Not authored — no move is currently required.';
  const enough = entry.evidenceStandard || missingContract(entry, 'enough') ||
    'Not authored — no evidence threshold is currently required.';
  return [
    dossierField('LEARNING MOVE', move, width, measure, narrow,
      {strong:true, tone:entry.learningMove ? 'accent' : entry.learningContract?.required ? 'repair' : 'normal'}),
    dossierField('ENOUGH EVIDENCE', enough, width, measure, narrow,
      {strong:true, tone:entry.evidenceStandard ? 'accent' : entry.learningContract?.required ? 'repair' : 'normal'}),
    dossierField('OWNER · ANSWER BY', `${entry.owner || 'Needs repair'} · ${entry.answerBy || 'Needs repair'}`,
      width, measure, narrow),
    dossierField('SIGNAL', entry.signal || 'Needs repair', width, measure, narrow),
    dossierField('CURRENT READING', entry.reading || 'No reading recorded', width, measure, narrow),
  ];
}

function dossierOutcomes(entry, direction, width, measure, narrow){
  const arm = entry.outcomes?.[direction] || {work:[], decisions:[]};
  const rows = [];
  for(const work of arm.work || []){
    const relation = work.relation === 'AND' ? 'ALSO NEEDS' : work.relation === 'OR' ? 'EITHER CAN UNLOCK' : 'DIRECT';
    const condition = work.relation === 'AND' || work.relation === 'OR' ? ` · Condition: ${work.requirement}` : '';
    rows.push(dossierField(`${relation} · ${work.title}`, `${work.effect}${condition}`, width, measure, narrow));
  }
  for(const decision of arm.decisions || []) rows.push(dossierField(`DOWNSTREAM · ${decision.question}`,
    decision.effect, width, measure, narrow));
  if(!rows.length) rows.push(dossierField('NO MODELED EFFECT',
    'No modeled plan or downstream changes for this outcome.', width, measure, narrow));
  return rows;
}

const dossierStackHeight = fields => fields.reduce((sum, field) => sum + field.height, 0);

function dossierLayout(entry, width, measure, narrow){
  const inset = narrow ? 15 : 22, inner = width - inset * 2;
  const question = dossierBlock(entry.question || nameOf(entry), inner - (narrow ? 0 : 120), measure, narrow, true);
  const armGap = narrow ? 0 : 20, armWidth = narrow ? inner : (inner - armGap) / 2;
  const current = dossierCurrent(entry, inner, measure, narrow);
  const contract = dossierContract(entry, inner, measure, narrow);
  const yes = dossierOutcomes(entry, 'yes', armWidth, measure, narrow);
  const no = dossierOutcomes(entry, 'no', armWidth, measure, narrow);
  const outcomeHeight = narrow
    ? 22 + dossierStackHeight(yes) + 19 + 22 + dossierStackHeight(no)
    : 22 + Math.max(dossierStackHeight(yes), dossierStackHeight(no));
  return {inset, inner, question, armGap, armWidth, current, contract, yes, no,
    height:inset + 31 + question.height + 22 +
      27 + dossierStackHeight(current) + 13 +
      27 + dossierStackHeight(contract) + 13 +
      27 + outcomeHeight + inset};
}

function dossierDrawFields(fields, x, y, C, narrow){
  let svg = '', cursor = y;
  for(const field of fields){
    const labelColor = field.tone === 'repair' ? C.urgent : field.tone === 'accent' ? C.accentInk : C.muted;
    svg += txt(x, cursor + (narrow ? 10 : 8), field.label, narrow ? 10 : 8, labelColor,
      {weight:800, tracking:0.7});
    cursor += narrow ? 27 : 22;
    for(const value of field.body.lines){
      svg += txt(x, cursor, value, field.body.size, C.ink, {weight:field.body.weight});
      cursor += field.body.lineHeight;
    }
    cursor += narrow ? 12 : 9;
  }
  return {svg, height:cursor - y};
}

function dossierLayer(x, y, label, C){
  return txt(x, y + 9, label, 8, C.accentInk, {weight:800, tracking:0.9});
}

function dossierBody(entry, x, y, width, C, measure, narrow, selected){
  const L = dossierLayout(entry, width, measure, narrow), left = x + L.inset;
  let cursor = y + L.inset;
  let svg = txt(left, cursor + 8, dossierGroupLabel(dossierGroup(entry), entry), 8, dossierTone(entry, C),
    {weight:800, tracking:0.8});
  if(selected) svg += txt(x + width - L.inset, cursor + 8, 'SELECTED', 8, C.accentInk,
    {weight:800, tracking:0.8, anchor:'end'});
  cursor += 31;
  for(const value of L.question.lines){
    svg += txt(left, cursor, value, L.question.size, C.ink, {weight:700}); cursor += L.question.lineHeight;
  }
  cursor += 10;
  svg += line(left, cursor, x + width - L.inset, cursor, C.border, 1); cursor += 12;
  svg += dossierLayer(left, cursor, '1 · CURRENT TRUTH', C); cursor += 27;
  const current = dossierDrawFields(L.current, left, cursor, C, narrow); svg += current.svg; cursor += current.height + 13;
  svg += line(left, cursor - 2, x + width - L.inset, cursor - 2, C.border, 1);
  svg += dossierLayer(left, cursor, '2 · LEARNING CONTRACT', C); cursor += 27;
  const contract = dossierDrawFields(L.contract, left, cursor, C, narrow); svg += contract.svg; cursor += contract.height + 13;
  svg += line(left, cursor - 2, x + width - L.inset, cursor - 2, C.border, 1);
  svg += dossierLayer(left, cursor, '3 · WHAT THE RESULT CHANGES', C); cursor += 27;
  if(narrow){
    svg += txt(left, cursor + 9, 'IF YES', 9, C.accentInk, {weight:800, tracking:0.8}); cursor += 22;
    const yes = dossierDrawFields(L.yes, left, cursor, C, narrow); svg += yes.svg; cursor += yes.height + 19;
    svg += txt(left, cursor + 9, 'IF NO', 9, C.muted, {weight:800, tracking:0.8}); cursor += 22;
    svg += dossierDrawFields(L.no, left, cursor, C, narrow).svg;
  } else {
    const noX = left + L.armWidth + L.armGap;
    svg += txt(left, cursor + 9, 'IF YES', 9, C.accentInk, {weight:800, tracking:0.8});
    svg += txt(noX, cursor + 9, 'IF NO', 9, C.muted, {weight:800, tracking:0.8}); cursor += 22;
    svg += dossierDrawFields(L.yes, left, cursor, C, narrow).svg;
    svg += dossierDrawFields(L.no, noX, cursor, C, narrow).svg;
  }
  return {svg, height:L.height};
}

function dossierAttrs(entry, selected){
  return ` data-select-decision="" aria-pressed="${selected}"${btnAttrs(`Select ${entry.question || nameOf(entry)}`)}`;
}

function dossierFocus(entry, x, y, width, C, measure, narrow){
  const body = dossierBody(entry, x, y + 31, width, C, measure, narrow, true);
  const height = body.height + 31;
  return {height, svg:`<g data-kind="agenda-dossier" data-decision-key="${esc(entry.key)}">` +
    rect(x, y, width, height, wash(C.accent, '08'), {stroke:C.accent, sw:1.5}) +
    txt(x + (narrow ? 15 : 22), y + 20, 'FOCUS DOSSIER', 9, C.accentInk, {weight:800, tracking:1}) +
    body.svg + '</g>'};
}

function parallelEntries(agenda){
  return [...(agenda.assumptions || []), ...(agenda.active || []),
    ...(agenda.notReady || []).filter(entry => entry.availability === 'active')];
}

function parallelRoster(agenda, x, y, width, C, measure, narrow, selectedKey, interactive){
  const entries = parallelEntries(agenda);
  if(!entries.length) return {height:44, svg:txt(x, y + 24, 'No unanswered decisions are open.', 11, C.muted)};
  const cols = narrow ? 2 : 3, gap = narrow ? 8 : 12, cardWidth = (width - gap * (cols - 1)) / cols;
  const cards = entries.map(entry => {
    const question = dossierBlock(questionFragment(entry), cardWidth - 24, measure, false, true);
    const state = dossierBlock(entry.currentState?.sentence || 'State unavailable', cardWidth - 24, measure, false);
    return {entry, question, state, height:Math.max(64, 28 + question.height + state.height)};
  });
  const rows = Math.ceil(cards.length / cols);
  const rowHeights = Array.from({length:rows}, (_, row) => Math.max(64,
    ...cards.slice(row * cols, row * cols + cols).map(card => card.height)));
  let svg = '', rowY = y;
  for(let index = 0; index < cards.length; index++){
    const card = cards[index], col = index % cols, row = Math.floor(index / cols);
    if(col === 0 && row > 0) rowY += rowHeights[row - 1] + gap;
    const cx = x + col * (cardWidth + gap), h = rowHeights[row], selected = card.entry.key === selectedKey;
    svg += `<g data-kind="agenda-roster-entry" data-decision-key="${esc(card.entry.key)}" data-selected="${selected}"` +
      `${interactive ? dossierAttrs(card.entry, selected) : ''}>` + rect(cx, rowY, cardWidth, h,
        selected ? wash(C.accent, '0D') : C.surface, {stroke:selected ? C.accent : C.border, sw:selected ? 2 : 1});
    if(selected) svg += rect(cx, rowY, 4, h, C.accent);
    let ty = rowY + 18;
    svg += txt(cx + 12, ty, dossierGroupLabel(dossierGroup(card.entry), card.entry), 7, dossierTone(card.entry, C),
      {weight:800, tracking:0.65}); ty += 19;
    for(const value of card.question.lines){ svg += txt(cx + 12, ty, value, 12, C.ink, {weight:700}); ty += 16; }
    for(const value of card.state.lines){ svg += txt(cx + 12, ty, value, 10, dossierTone(card.entry, C), {weight:600}); ty += 13; }
    if(interactive) svg += `<rect data-hit="" x="${cx}" y="${rowY}" width="${cardWidth}" height="${h}" fill="${C.bg}" fill-opacity="0"/>`;
    svg += '</g>';
  }
  return {svg, height:rowHeights.reduce((sum, h) => sum + h, 0) + Math.max(0, rows - 1) * gap};
}

function registerCell(label, value, width, measure, narrow, strong = false){
  const size = narrow ? 11 : 10, lineHeight = narrow ? 15 : 14;
  const body = wrapped(value || '—', Math.max(24, width), measure,
    `${strong ? 700 : 550} ${size}px ${SANS}`);
  return {label, body:body.length ? body : ['—'], size, lineHeight,
    weight:strong ? 700 : 550, height:16 + Math.max(1, body.length) * lineHeight};
}

function registerNextAction(entry){
  const primary = entry.nextAction || entry.learningMove || '—';
  const authored = entry.learningMove && entry.learningMove !== primary
    ? ` Authored learning move: ${entry.learningMove}` : '';
  const repair = (entry.hygiene || []).map(reason => reason.sentence).filter(Boolean).join(' ');
  return `${primary}${authored}${repair ? ` ${repair}` : ''}`;
}

function registerLayout(entry, width, measure, narrow){
  const inset = narrow ? 13 : 14, inner = width - inset * 2;
  if(narrow){
    const fields = [
      registerCell('DECISION', questionFragment(entry), inner, measure, true, true),
      registerCell('CURRENT STATE', entry.currentState?.sentence || 'State unavailable', inner, measure, true),
      registerCell('NEXT ACTION', registerNextAction(entry), inner, measure, true),
      registerCell('ENOUGH EVIDENCE', entry.evidenceStandard || 'Not authored', inner, measure, true),
    ];
    return {inset, fields, height:inset + fields.reduce((sum, field) => sum + field.height + 8, 0)};
  }
  const gap = 18;
  const widths = [inner * 0.29, inner * 0.19, inner * 0.28, inner * 0.24 - gap * 3];
  const fields = [
    registerCell('DECISION', questionFragment(entry), widths[0], measure, false, true),
    registerCell('CURRENT STATE', entry.currentState?.sentence || 'State unavailable', widths[1], measure, false),
    registerCell('NEXT ACTION', registerNextAction(entry), widths[2], measure, false),
    registerCell('ENOUGH EVIDENCE', entry.evidenceStandard || 'Not authored', widths[3], measure, false),
  ];
  return {inset, gap, widths, fields, height:Math.max(64, inset * 2 + Math.max(...fields.map(field => field.height)))};
}

function registerEntry(entry, group, x, y, width, C, measure, narrow, selected, interactive){
  const L = registerLayout(entry, width, measure, narrow);
  let svg = `<g data-kind="agenda-entry" data-detail="compact-register" data-group="${group}" ` +
    `data-decision-key="${esc(entry.key)}" data-current-state="${esc(entry.currentState?.kind || 'unknown')}" ` +
    `data-selected="${selected}"${interactive ? dossierAttrs(entry, selected) : ''}>` +
    `<title>${esc(`${entry.question || nameOf(entry)} — ${entry.currentState?.sentence || 'State unavailable'}`)}</title>` +
    rect(x, y, width, L.height, C.surface, {stroke:C.border, sw:1});
  if(narrow){
    let cursor = y + L.inset;
    for(const field of L.fields){
      svg += txt(x + L.inset, cursor + 8, field.label, 8, C.muted, {weight:800, tracking:0.65});
      cursor += 16;
      for(const value of field.body){ svg += txt(x + L.inset, cursor, value, field.size, C.ink, {weight:field.weight}); cursor += field.lineHeight; }
      cursor += 8;
    }
  } else {
    let cursor = x + L.inset;
    for(let index = 0; index < L.fields.length; index++){
      const field = L.fields[index];
      svg += txt(cursor, y + L.inset + 8, field.label, 8, C.muted, {weight:800, tracking:0.65});
      let ty = y + L.inset + 26;
      for(const value of field.body){ svg += txt(cursor, ty, value, field.size, C.ink, {weight:field.weight}); ty += field.lineHeight; }
      cursor += L.widths[index] + L.gap;
    }
  }
  if(interactive) svg += `<rect data-hit="" x="${x}" y="${y}" width="${width}" height="${L.height}" fill="${C.bg}" fill-opacity="0"/>`;
  return {svg:svg + '</g>', height:L.height};
}

function dossierSection(section, x, y, width, C, measure, narrow, selectedKey, interactive, selectedInRoster){
  let svg = `<g data-kind="agenda-section" data-section="${section.group}">`;
  const tone = section.group === 'not-ready' ? C.urgent :
    section.group === 'active' || section.group === 'assumption' ? C.accentInk : C.muted;
  svg += txt(x, y + 11, section.label.toUpperCase(), 9, tone, {weight:800, tracking:1});
  const entries = section.entries.filter(entry => entry.key !== selectedKey || narrow && !selectedInRoster);
  const selectedAbove = section.entries.length !== entries.length;
  svg += txt(x + width, y + 11, String(section.entries.length), 11, C.muted, {weight:700, anchor:'end'});
  const note = selectedAbove ? `${section.note} Selected decision is shown above.` : section.note;
  svg += txt(x, y + 31, note, 10, C.muted, {weight:500}) + line(x, y + 43, x + width, y + 43, C.border, 1);
  let cursor = y + 55;
  if(!entries.length) return {height:70, svg:svg + txt(x + 14, cursor + 16,
    selectedAbove ? 'Selected decision shown above.' : 'None.', 11, C.muted) + '</g>'};
  for(const entry of entries){
    const drawn = registerEntry(entry, section.group, x, cursor, width, C, measure, narrow,
      entry.key === selectedKey, interactive);
    svg += drawn.svg; cursor += drawn.height + 12;
  }
  return {height:cursor - y, svg:svg + '</g>'};
}

function dossierHeader(agenda, x, y, width, C, measure, narrow){
  const title = dossierBlock(agenda.title || 'Paths', width - (!narrow && agenda.date ? 180 : 0), measure, narrow, true);
  const verdict = verdictOf(agenda), verdictLines = verdict ? dossierBlock(verdict, width, measure, false, true) : null;
  let svg = `<g data-kind="agenda-header">` + txt(x, y + 9, 'LEARNING AGENDA', 9, C.accentInk, {weight:800, tracking:1.2});
  let ty = y + 40;
  for(const value of title.lines){ svg += txt(x, ty, value, narrow ? 24 : 29, C.ink, {weight:700}); ty += narrow ? 29 : 34; }
  if(agenda.date) svg += txt(x + width, y + 9, agenda.date, 9, C.muted, {weight:700, tracking:0.7, anchor:'end'});
  if(agenda.today) svg += txt(x + width, y + (agenda.date ? 24 : 9), `EVALUATED ${agenda.today}`, 8, C.muted,
    {weight:700, tracking:0.6, anchor:'end'});
  if(verdictLines){
    svg += txt(x, ty + 8, 'VERDICT', 8, C.muted, {weight:800, tracking:0.8}); ty += 27;
    for(const value of verdictLines.lines){ svg += txt(x, ty, value, 12, C.ink, {weight:600}); ty += 15; }
  }
  ty += 12;
  svg += txt(x, ty, 'Moves run in parallel; attention is triage, not a sequence.', 10, C.muted, {weight:600}); ty += 17;
  const basisLines = wrapped(RESULT_BASIS, width, measure, `600 9px ${SANS}`);
  for(const value of basisLines){ svg += txt(x, ty, value, 9, C.muted, {weight:600}); ty += 13; }
  svg += line(x, ty, x + width, ty, C.border, 1) + '</g>';
  return {svg, height:ty - y + 18};
}

function renderDossierAgenda(agenda, ctx, narrow){
  const C = palette(ctx?.colors || {}), measure = ctx?.measure || (value => String(value).length * 7);
  const width = narrow ? Math.max(300, Number(ctx?.width) || 390) : Math.max(840, Number(ctx?.width) || 1160);
  const pad = narrow ? 14 : 36, contentWidth = width - pad * 2;
  const selected = selectedDecision(agenda, ctx), selectedKey = selected?.key || '';
  const selectedInRoster = !!selected && parallelEntries(agenda).some(entry => entry.key === selected.key);
  const header = dossierHeader(agenda, pad, pad, contentWidth, C, measure, narrow);
  const roster = parallelRoster(agenda, pad, 0, contentWidth, C, measure, narrow, selectedKey, !!ctx?.interactive);
  const focusHeight = selected && !narrow ? dossierFocus(selected, pad, 0, contentWidth, C, measure, false).height : 0;
  const sections = [
    {group:'assumption', label:'Working on an assumption', note:'Still unanswered; test the temporary direction before it hardens.', entries:agenda.assumptions || []},
    {group:'active', label:'Do next', note:'Open learning contracts. They can progress in parallel.', entries:agenda.active || []},
    {group:'blocked', label:'Blocked learning', note:'These questions are not open until their written conditions hold.', entries:agenda.blocked || []},
    {group:'not-ready', label:'Not ready', note:'Author the exact missing parts before treating these as learning moves.', entries:agenda.notReady || []},
    {group:'settled', label:'Settled / no longer applicable', note:'Answered or moot decisions retained as decision history.', entries:agenda.settled || []},
  ];
  const sectionHeights = sections.map(section => {
    const entries = section.entries.filter(entry => entry.key !== selectedKey || narrow && !selectedInRoster);
    return entries.length ? 55 + entries.reduce((sum, entry) =>
      sum + registerLayout(entry, contentWidth, measure, narrow).height + 12, 0) : 70;
  });
  const rosterHeadHeight = narrow ? 66 : 53;
  const total = pad + header.height + rosterHeadHeight + roster.height + 22 + (selected ? focusHeight + 26 : 0) +
    sectionHeights.reduce((sum, h) => sum + h + 20, 0) + pad;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${total}" viewBox="0 0 ${width} ${total}" ` +
    `${rootRole(ctx)} data-kind="learning-agenda${narrow ? '-narrow' : ''}" data-layout="${narrow ? 'dossier-stack' : 'dossier-board'}" ` +
    `data-min-readable-scale="${MIN_READABLE_SCALE}">` + dossierHead(agenda, selected) + rect(0, 0, width, total, C.bg) + header.svg;
  let y = pad + header.height;
  svg += txt(pad, y + 10, 'PARALLEL LEARNING MOVES', 9, C.accentInk, {weight:800, tracking:1});
  svg += txt(width - pad, y + 10, String(parallelEntries(agenda).length), 11, C.muted, {weight:700, anchor:'end'});
  const countLines = narrow
    ? [`${agenda.assumptions.length} ASSUMED · ${agenda.active.length} DO NEXT · ${agenda.notReady.length} NOT READY`,
      `${agenda.blocked.length} BLOCKED · ${agenda.settled.length} SETTLED`]
    : [`${agenda.assumptions.length} ASSUMED · ${agenda.active.length} DO NEXT · ${agenda.notReady.length} NOT READY · ` +
      `${agenda.blocked.length} BLOCKED · ${agenda.settled.length} SETTLED`];
  for(let index = 0; index < countLines.length; index++) svg += txt(pad, y + 29 + index * 15,
    countLines[index], narrow ? 8 : 9, C.muted, {weight:700, tracking:0.35});
  y += narrow ? 56 : 43;
  const drawnRoster = parallelRoster(agenda, pad, y, contentWidth, C, measure, narrow, selectedKey, !!ctx?.interactive);
  svg += drawnRoster.svg; y += drawnRoster.height + 22;
  if(selected && !narrow){
    const focus = dossierFocus(selected, pad, y, contentWidth, C, measure, false);
    svg += focus.svg; y += focus.height + 26;
  }
  for(const section of sections){
    const drawn = dossierSection(section, pad, y, contentWidth, C, measure, narrow, selectedKey,
      !!ctx?.interactive, selectedInRoster);
    svg += drawn.svg; y += drawn.height + 20;
  }
  return svg + '</svg>';
}

export function renderLearningAgenda(agenda, ctx = {}){ return renderDossierAgenda(agenda, ctx, false); }
export function renderLearningAgendaNarrow(agenda, ctx = {}){ return renderDossierAgenda(agenda, ctx, true); }

export function renderLearningAgendaReceipt(agenda, ctx = {}){
  const C = palette(ctx?.colors || {}), measure = ctx?.measure || (value => String(value).length * 7);
  const entry = selectedDecision(agenda, ctx);
  if(!entry) return '';
  const width = Math.max(620, Number(ctx?.width) || 760), pad = 32, inner = width - pad * 2;
  const heading = dossierBlock(agenda.title || 'Paths', inner - 180, measure, false, true);
  const introLines = wrapped('Scoped receipt for one selected decision. The full Learning Agenda remains the complete artefact.',
    inner, measure, `600 10px ${SANS}`);
  const basisLines = wrapped(RESULT_BASIS, inner, measure, `600 9px ${SANS}`);
  const headerHeight = 34 + heading.height + 12 + introLines.length * 14 + 8 + basisLines.length * 13 + 18;
  const body = dossierBody(entry, pad, pad + headerHeight, inner, C, measure, false, true);
  const total = pad + headerHeight + body.height + pad;
  const title = `${entry.question || nameOf(entry)} — selected decision receipt`;
  const description = `Scoped selected-decision receipt. Current state: ${entry.currentState?.sentence || 'State unavailable'}. ` +
    `Learning move: ${entry.learningMove || 'not authored'}. Evidence sufficient when: ${entry.evidenceStandard || 'not authored'}. ${RESULT_BASIS}`;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${total}" viewBox="0 0 ${width} ${total}" ` +
    `role="img" aria-labelledby="paths-agenda-receipt-name paths-agenda-receipt-description" ` +
    `data-kind="learning-agenda-receipt" data-scope="selected-decision">` +
    `<title id="paths-agenda-receipt-name">${esc(title)}</title>` +
    `<desc id="paths-agenda-receipt-description">${esc(description)}</desc>` + rect(0, 0, width, total, C.bg);
  let y = pad;
  svg += txt(pad, y + 9, 'DECISION RECEIPT · SCOPED TO ONE DECISION', 9, C.accentInk, {weight:800, tracking:1.1}); y += 34;
  if(agenda.today) svg += txt(width - pad, pad + 9, `EVALUATED ${agenda.today}`, 8, C.muted,
    {weight:700, tracking:0.6, anchor:'end'});
  for(const value of heading.lines){ svg += txt(pad, y, value, 22, C.ink, {weight:700}); y += heading.lineHeight; }
  y += 12;
  for(const value of introLines){ svg += txt(pad, y, value, 10, C.muted, {weight:600}); y += 14; }
  y += 8;
  for(const value of basisLines){ svg += txt(pad, y, value, 9, C.muted, {weight:600}); y += 13; }
  svg += line(pad, y + 6, width - pad, y + 6, C.border, 1) + body.svg;
  return svg + '</svg>';
}
