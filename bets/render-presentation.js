/* Fixed 16:9 portfolio-summary render for Copy PNG. It is intentionally a
   deterministic selection, not a compressed claim that all bets are shown. */
import {esc, txt} from '../assets/svg.js';
import {conditionReadings, measuredLines, omittedMaterialExceptions, presentationSelection} from './layout.js';

const W = 1920, H = 1080;
const TABLE_LIMIT_Y = 720;
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const MINUS = '−';
const num = v => (v < 0 ? MINUS : '') + Math.round(Math.abs(v));
const sgn = v => (v < 0 ? MINUS : '+') + Math.round(Math.abs(v));
const rng = r => !r ? '—' : r[0] === r[1] ? num(r[0]) : num(r[0]) + '–' + num(r[1]);
const pct = r => !r ? '—' : r[0] === r[1] ? r[0] + '%' : r[0] + '–' + r[1] + '%';
const stakeMid = b => b.stake ? (b.stake[0] + b.stake[1]) / 2 : 0;
const reading = value => value ? {
  loss: 'P(LOSES MONEY) ' + Math.round((value.pLoss || 0) * 100) + '%',
  median: 'MEDIAN OUTCOME ' + sgn(value.p50),
  range: 'P10 ' + sgn(value.p10) + ' · P90 ' + sgn(value.p90),
} : {loss: 'Not available', median: 'Add a scoreable bet', range: 'Correct invalid terms'};

function compactIds(records){
  const nums = records.map(item => item.record.sourceOrder).sort((a, b) => a - b);
  const spans = [];
  for(let i = 0; i < nums.length;){
    let j = i;
    while(j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    const id = n => 'B' + String(n).padStart(2, '0');
    spans.push(i === j ? id(nums[i]) : id(nums[i]) + '–' + id(nums[j]));
    i = j + 1;
  }
  return spans.join(', ');
}

function exceptionCopy(exceptions, selectionSize){
  if(!exceptions.length) return 'NO MATERIAL EXCEPTIONS HIDDEN BY THE ' + selectionSize + '-POSITION SELECTION';
  return ['NO KILL', 'P50 LOSS', 'HIGH CONCENTRATION'].map(reason => {
    const matches = exceptions.filter(item => item.reasons.includes(reason));
    return matches.length ? reason + ' ' + compactIds(matches) : null;
  }).filter(Boolean).join(' · ');
}

function concentrationCopy(selection, sim){
  const concentration = sim && sim.concentration;
  if(!concentration) return 'PORTFOLIO CONCENTRATION CLEAR';
  /* Source lines are the simulation/result join key. Matching that identity
     prevents an invalid giant or a duplicate visible name from being blamed. */
  const record = selection.records.find(item => item.rec.scoreable !== false &&
    item.b.srcLine === concentration.srcLine);
  return 'PORTFOLIO EXCEPTION · HIGH CONCENTRATION ' + (record ? record.id : concentration.name);
}

const unscoredCopy = selection => selection.unscored.length
  ? 'NOT SCORED · ' + selection.unscored.map(record => record.id + ' ' + record.b.name).join(', ')
  : 'ALL BETS SCORED';

/* The plate's left header is a physical reading area, not an ellipsis. Keep
   authored titles whole while they fit; an exceptional title earns a clear
   refusal rather than silently becoming an inaccurate crop. */
function presentationTitle(text, measure){
  const width = 970;
  for(const size of [42, 38, 34, 30, 26, 22]){
    const lines = measuredLines(text, '600 ' + size + 'px ' + SANS, width, measure);
    if(lines.length <= 2) return {lines, size, leading: Math.round(size * 1.1), refused: false};
  }
  const lines = measuredLines(text, '600 22px ' + SANS, width, measure);
  return lines.length <= 3 ? {lines, size: 22, leading: 25, refused: false} : {lines, refused: true};
}

function titleLine(x, y, line, size, c){
  return '<text data-bets-title-line="" x="' + x + '" y="' + y +
    '" font-family="\'Helvetica Neue\',Helvetica,\'Segoe UI\',Roboto,sans-serif" font-size="' + size +
    '" font-weight="600" fill="' + c.ink + '">' + esc(line) + '</text>';
}

function titleRefusal(title, c){
  return '<svg data-bets-surface="allocation-field-presentation" data-bets-title-refusal="" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080" font-family="' +
    SANS + '" role="img" aria-labelledby="bets-presentation-title bets-presentation-desc"><title id="bets-presentation-title">' +
    esc(title) + '</title><desc id="bets-presentation-desc">The authored title is too long for a legible 16 by 9 allocation field.</desc>' +
    '<rect width="1920" height="1080" fill="' + c.bg + '"/><line x1="96" y1="162" x2="1824" y2="162" stroke="' + c.ink + '" stroke-width="2"/>' +
    titleLine(96, 116, 'Title too long for presentation field', 42, c) +
    txt(96, 210, 'SHORTEN THE AUTHORED TITLE, THEN COPY PNG AGAIN', 14, c.muted, {weight: 700, tracking: '0.09em'}) +
    txt(96, 1040, 'ALLOCATION FIELD · SOURCE TITLE PRESERVED IN SVG METADATA', 11, c.muted, {weight: 700, tracking: '0.1em'}) +
    '</svg>';
}

function densityRefusal(title, c){
  return '<svg data-bets-surface="allocation-field-presentation" data-bets-density-refusal="" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080" font-family="' +
    SANS + '" role="img" aria-labelledby="bets-presentation-title bets-presentation-desc"><title id="bets-presentation-title">' +
    esc(title) + '</title><desc id="bets-presentation-desc">The selected positions are too wordy for a legible 16 by 9 allocation field.</desc>' +
    '<rect width="1920" height="1080" fill="' + c.bg + '"/><line x1="96" y1="162" x2="1824" y2="162" stroke="' + c.ink + '" stroke-width="2"/>' +
    titleLine(96, 116, 'Selection too dense for presentation field', 42, c) +
    txt(96, 210, 'SHORTEN POSITION OR KILL TEXT, THEN COPY PNG AGAIN', 14, c.muted, {weight: 700, tracking: '0.09em'}) +
    txt(96, 1040, 'ALLOCATION FIELD · FULL DETAIL: DOWNLOAD SVG', 11, c.muted, {weight: 700, tracking: '0.1em'}) +
    '</svg>';
}

function rowPlan(record, C, measure){
  const b = record.b;
  const names = measuredLines(b.name, '600 17px ' + SANS, C.nameEnd - C.name, measure);
  const killText = b.kill && ('fold if ' + b.kill.text + (b.kill.by ? ' — by ' + b.kill.by : ''));
  const kills = killText ? measuredLines(killText, '10px ' + SANS, C.nameEnd - C.name, measure) : [];
  const audits = record.rec.audits.length ? record.rec.audits : ['—'];
  const height = Math.max(58, 20 + names.length * 19 + kills.length * 13, 18 + audits.length * 14);
  return {names, kills, audits, height};
}

function bodyEnd(records, C, startY, measure){
  let y = startY, group = null;
  for(const record of records){
    if(record.group.name !== group){
      if(group !== null) y += 8;
      group = record.group.name;
      y += 24;
    }
    y += rowPlan(record, C, measure).height;
  }
  return y;
}

/* A fixed plate has a lower portfolio field. Admission is source-honest: it
   stops at the first ranked position that would displace that evidence, then
   names the remainder in the existing full-SVG handoff. */
function admittedSelection(selection, C, startY, measure){
  const selected = [];
  for(const record of selection.selected){
    const next = selected.concat(record).sort((a, b) => a.sourceOrder - b.sourceOrder);
    const end = bodyEnd(next, C, startY, measure);
    if(end <= TABLE_LIMIT_Y) selected.push(record);
    else break;
  }
  const omitted = selection.selected.length - selected.length;
  return {...selection, selected, remainder: selection.remainder + omitted, refused: selection.selected.length > 0 && selected.length === 0};
}

/* The disclosure strip is measured before row admission. It is part of the
   plate's factual header, so malformed source gets its own vertical room
   rather than colliding with a right-aligned annotation. */
function receiptPlan(selection, sim, measure){
  const font = '700 10.5px ' + SANS, width = 1728;
  const exceptions = omittedMaterialExceptions(selection);
  const rows = [
    {key: 'exceptions', tone: exceptions.length ? 'err' : 'muted',
      lines: measuredLines('OMITTED MATERIAL EXCEPTIONS · ' + exceptionCopy(exceptions, selection.selected.length), font, width, measure)},
    {key: 'concentration', tone: sim.concentration ? 'err' : 'muted',
      lines: measuredLines(concentrationCopy(selection, sim), font, width, measure)},
  ];
  if(selection.unscored.length) rows.push({key: 'unscored', tone: 'err',
    lines: measuredLines(unscoredCopy(selection), font, width, measure)});
  else rows.push({key: 'unscored', tone: 'muted', lines: ['ALL BETS SCORED']});
  return {exceptions, rows, height: rows.reduce((sum, row) => sum + row.lines.length * 13, 0)};
}

function conditionReceipt(readings, x0, y0, width, c){
  const gap = 28, receiptW = (width - gap) / 2, parts = [];
  [readings.baseline, readings.stress].forEach((item, i) => {
    const x = x0 + i * (receiptW + gap), pf = item.result;
    const loss = pf ? Math.round((pf.pLoss || 0) * 100) : null;
    if(i) parts.push('<line x1="' + (x - gap / 2) + '" y1="' + y0 + '" x2="' + (x - gap / 2) + '" y2="' + (y0 + 68) + '" stroke="' + c.border + '"/>');
    parts.push('<g data-condition-receipt="" data-condition="' + item.key + '">');
    parts.push(txt(x, y0 + 13, item.label.toUpperCase(), 10.5, c.muted, {weight: 700, tracking: '0.07em'}));
    parts.push(txt(x, y0 + 40, loss == null ? 'NOT AVAILABLE' : 'P(LOSES MONEY) ' + loss + '%', 20,
      loss != null && loss >= 50 ? c.err : c.accentInk, {weight: 700, mono: true}));
    parts.push(txt(x, y0 + 61, pf ? 'MEDIAN ' + sgn(pf.p50) + ' · P10 ' + sgn(pf.p10) + ' · P90 ' + sgn(pf.p90) : 'Correct invalid terms',
      11.5, c.ink, {weight: 600, mono: true}));
    parts.push('</g>');
  });
  return parts;
}

/* The plate ends on the portfolio's two actual outcome ranges. They occupy the
   quiet lower field with evidence—not decoration—and share one scale so the
   stress reading can be compared at a glance. */
function portfolioExposureRails(readings, x0, x1, y0, c){
  const baseline = readings.baseline.result, stress = readings.stress.result;
  if(!baseline || !stress) return [];
  const lo = Math.min(0, baseline.p10, stress.p10);
  const hi = Math.max(1, baseline.p90, stress.p90);
  const scale = value => x0 + (value - lo) / (hi - lo || 1) * (x1 - x0);
  const out = [];
  [[readings.baseline.label.toUpperCase(), baseline, c.accent, c.accentInk],
    [readings.stress.label.toUpperCase(), stress, c.err, c.err]].forEach(([label, result, tone, ink], index) => {
    const y = y0 + index * 58, loss = Math.round((result.pLoss || 0) * 100);
    out.push('<g data-portfolio-exposure="" data-condition="' + (index ? 'shared' : 'independent') + '">');
    out.push(txt(x0, y + 10, label, 10, index ? c.err : c.muted, {weight: 700, tracking: '0.08em'}));
    out.push(txt(x1, y + 10, loss + '% BELOW ZERO · MEDIAN ' + sgn(result.p50), 10, ink,
      {weight: 700, tracking: '0.05em', anchor: 'end'}));
    out.push('<line x1="' + x0 + '" y1="' + (y + 28) + '" x2="' + x1 + '" y2="' + (y + 28) +
      '" stroke="' + c.border + '" stroke-width="1"/>');
    if(lo < 0) out.push('<line x1="' + exRound(scale(0)) + '" y1="' + (y + 20) + '" x2="' + exRound(scale(0)) +
      '" y2="' + (y + 36) + '" stroke="' + c.muted + '" stroke-width="1" stroke-dasharray="2 2"/>');
    out.push('<line x1="' + exRound(scale(result.p10)) + '" y1="' + (y + 28) + '" x2="' + exRound(scale(result.p90)) +
      '" y2="' + (y + 28) + '" stroke="' + tone + '" stroke-width="6" stroke-opacity="' + (index ? '0.34' : '0.62') +
      '"' + (index ? ' stroke-dasharray="3 2"' : '') + '/>');
    out.push('<line x1="' + exRound(scale(result.p50)) + '" y1="' + (y + 19) + '" x2="' + exRound(scale(result.p50)) +
      '" y2="' + (y + 37) + '" stroke="' + (index ? c.err : c.ink) + '" stroke-width="2"/>');
    out.push(txt(scale(result.p10), y + 48, 'P10 ' + sgn(result.p10), 9.5, c.muted, {mono: true, anchor: 'middle'}));
    out.push(txt(scale(result.p50), y + 48, 'P50 ' + sgn(result.p50), 9.5, index ? c.err : c.ink,
      {mono: true, weight: 700, anchor: 'middle'}));
    out.push(txt(scale(result.p90), y + 48, 'P90 ' + sgn(result.p90), 9.5, c.muted, {mono: true, anchor: 'middle'}));
    out.push('</g>');
  });
  return out;
}

const exRound = value => Math.round(value * 100) / 100;

export function renderBetsPresentation(model, sim, ctx = {}){
  const c = ctx.colors, measure = ctx.measure || (s => String(s).length * 14);
  const authoredTitle = model.title || 'Bets board';
  const title = presentationTitle(authoredTitle, measure);
  if(title.refused) return titleRefusal(authoredTitle, c);
  const conditions = conditionReadings(sim);
  const C = {left: 96, id: 98, name: 168, nameEnd: 650, stake: 790, odds: 920, payoff: 1060,
    p10: 1210, p50: 1320, p90: 1430, range0: 1482, range1: 1710, audit: 1780, right: 1824};
  const titleBottom = 86 + (title.lines.length - 1) * title.leading + title.size * 0.25;
  const headerShift = Math.max(0, Math.ceil(titleBottom - 116));
  const ruleY = 142 + headerShift;
  const initial = presentationSelection(model, sim);
  let selection = initial, receipts, headY;
  /* Selection and exceptions inform one another: when a row cannot be
     admitted, its audit joins the receipt. Iterate to a stable measured
     header instead of clipping either fact. */
  for(let pass = 0; pass < 4; pass++){
    receipts = receiptPlan(selection, sim, measure);
    headY = Math.max(ruleY + 136, ruleY + 74 + receipts.height + 25);
    const next = admittedSelection(initial, C, headY + 30, measure);
    const same = next.selected.length === selection.selected.length &&
      next.selected.every((record, index) => record.b.srcLine === selection.selected[index]?.b.srcLine);
    selection = next;
    if(same) break;
  }
  receipts = receiptPlan(selection, sim, measure);
  headY = Math.max(ruleY + 136, ruleY + 74 + receipts.height + 25);
  selection = admittedSelection(initial, C, headY + 30, measure);
  /* A receipt can be the whole source truth when every position is malformed.
     It still consumes the plate's table field; refuse before its measured
     header crosses into the lower outcome field instead of exporting crop. */
  if(selection.refused || headY + 14 > TABLE_LIMIT_Y) return densityRefusal(authoredTitle, c);
  const displayed = selection.selected.slice().sort((a, b) => a.sourceOrder - b.sourceOrder);
  receipts = receiptPlan(selection, sim, measure);
  const exceptions = receipts.exceptions;
  const totalStake = selection.records.filter(record => record.rec.scoreable !== false).reduce((n, record) => n + stakeMid(record.b), 0);
  let elo = 0, ehi = 1;
  for(const record of displayed){ elo = Math.min(elo, record.rec.ev.p10); ehi = Math.max(ehi, record.rec.ev.p90); }
  const epad = (ehi - elo) * 0.07 || 1;
  elo -= epad; ehi += epad;
  const ex = v => C.range0 + (v - elo) / (ehi - elo || 1) * (C.range1 - C.range0);
  const parts = ['<rect width="1920" height="1080" fill="' + c.bg + '"/>'];

  title.lines.forEach((line, index) => parts.push(titleLine(96, 86 + index * title.leading, line, title.size, c)));
  parts.push(txt(96, 116 + headerShift, 'TOTAL STAKE ' + num(totalStake) + ' ' + (model.unit || ''),
    15, c.muted, {mono: true, tracking: '0.06em'}));
  parts.push(...conditionReceipt(conditions, 1110, 30, 714, c));
  parts.push('<line x1="96" y1="' + ruleY + '" x2="1824" y2="' + ruleY + '" stroke="' + c.ink + '" stroke-width="2"/>');
  parts.push(txt(96, ruleY + 30, 'SELECTION · ' + selection.rule.toUpperCase(), 12, c.accentInk,
    {weight: 700, tracking: '0.08em'}));
  parts.push(txt(96, ruleY + 52, displayed.length + ' SHOWN · ' + selection.remainder +
    (selection.remainder === 1 ? ' FURTHER BET IN FULL SVG' : ' FURTHER BETS IN FULL SVG'), 16, c.muted,
    {weight: 700, tracking: '0.04em'}));
  let receiptY = ruleY + 74;
  for(const row of receipts.rows){
    const tone = row.tone === 'err' ? c.err : c.muted;
    row.lines.forEach((line, index) => {
      const attr = row.key === 'unscored' ? ' data-bets-unscored-line=""' : '';
      parts.push('<text' + attr + ' x="96" y="' + (receiptY + index * 13) +
        '" font-size="10.5" font-weight="700" letter-spacing="0.03em" fill="' + tone + '">' + esc(line) + '</text>');
    });
    receiptY += row.lines.length * 13;
  }

  for(const [label, x, anchor] of [['POSITION', C.left, 'start'], ['STAKE', C.stake, 'end'], ['ODDS', C.odds, 'end'],
    ['PAYOFF', C.payoff, 'end'], ['P10', C.p10, 'end'], ['P50', C.p50, 'end'], ['P90', C.p90, 'end']])
    parts.push(txt(x, headY, label, 10, c.muted, {weight: 700, tracking: '0.08em', anchor}));
  parts.push(txt((C.range0 + C.range1) / 2, headY, 'P10 ▸ P90', 10, c.muted, {weight: 700, tracking: '0.08em', anchor: 'middle'}));
  parts.push(txt(C.audit, headY, 'AUDIT NOTE', 10, c.muted, {weight: 700, tracking: '0.08em', anchor: 'middle'}));
  parts.push('<line x1="96" y1="' + (headY + 14) + '" x2="1824" y2="' + (headY + 14) + '" stroke="' + c.ink + '" stroke-width="1.5"/>');

  let y = headY + 30, group = null;
  for(const record of displayed){
    if(record.group.name !== group){
      if(group !== null) y += 8;
      group = record.group.name;
      const groupRows = displayed.filter(item => item.group.name === group);
      parts.push(txt(C.left, y + 13, group.toUpperCase(), 11, c.accentInk, {weight: 700, tracking: '0.11em'}));
      parts.push(txt(C.right, y + 13, 'STAKE ' + num(groupRows.reduce((n, item) => n + stakeMid(item.b), 0)), 10, c.muted, {mono: true, anchor: 'end'}));
      y += 24;
    }
    const b = record.b, e = record.rec.ev;
    const {names, kills, audits, height: rowH} = rowPlan(record, C, measure);
    parts.push('<g data-row="bet" data-id="' + record.id + '">');
    parts.push(txt(C.id, y + 21, record.id, 10, c.muted, {weight: 700, mono: true}));
    names.forEach((line, i) => parts.push(txt(C.name, y + 20 + i * 19, line, 17, c.ink, {weight: 600})));
    kills.forEach((line, i) => parts.push(txt(C.name, y + 23 + names.length * 19 + i * 13, '↳ ' + line, 10, c.muted)));
    for(const [x, value] of [[C.stake, rng(b.stake)], [C.odds, pct(b.odds)], [C.payoff, rng(b.payoff)]])
      parts.push(txt(x, y + 21, value, 14, c.ink, {mono: true, anchor: 'end'}));
    for(const [x, value] of [[C.p10, e.p10], [C.p50, e.p50], [C.p90, e.p90]])
      parts.push(txt(x, y + 21, sgn(value), 14, value < 0 ? c.err : (x === C.p50 ? c.ink : c.muted), {mono: true, anchor: 'end', weight: x === C.p50 ? 700 : 400}));
    parts.push('<line x1="' + C.range0 + '" y1="' + (y + 18) + '" x2="' + C.range1 + '" y2="' + (y + 18) + '" stroke="' + c.border + '"/>');
    parts.push('<line data-exposure-range="" x1="' + ex(e.p10) + '" y1="' + (y + 18) + '" x2="' + ex(e.p90) + '" y2="' + (y + 18) + '" stroke="' + (e.p50 < 0 ? c.err : c.accent) + '" stroke-width="5" stroke-opacity="0.72"/>');
    parts.push('<line data-exposure-median="" x1="' + ex(e.p50) + '" y1="' + (y + 10) + '" x2="' + ex(e.p50) + '" y2="' + (y + 26) + '" stroke="' + c.ink + '" stroke-width="2"/>');
    audits.forEach((audit, i) => parts.push(txt(C.audit, y + 21 + i * 14, audit, 9.5, record.rec.audits.length ? c.err : c.muted,
      {weight: 700, anchor: 'middle', tracking: '0.035em'})));
    parts.push('</g>');
    y += rowH;
    parts.push('<line x1="96" y1="' + y + '" x2="1824" y2="' + y + '" stroke="' + c.border + '"/>');
  }

  const railY = Math.max(y + 34, 760);
  parts.push(...portfolioExposureRails(conditions, 96, 1824, railY, c));

  parts.push(txt(96, 1040, 'ALLOCATION FIELD · FULL DETAIL: DOWNLOAD SVG', 11, c.muted,
    {weight: 700, tracking: '0.1em'}));
  parts.push(txt(1824, 1040, 'P10–P90 RANGES · 4,000 SIMULATIONS', 11, c.muted,
    {anchor: 'end', tracking: '0.06em'}));
  const baseline = reading(conditions.baseline.result), stress = reading(conditions.stress.result);
  const svgTitle = esc(authoredTitle + ' — allocation field');
  const desc = esc(conditions.baseline.label + ': ' + baseline.loss + ', ' + baseline.median + '. ' +
    conditions.stress.label + ': ' + stress.loss + ', ' + stress.median + '. ' +
    (exceptions.length ? exceptions.length + ' material exceptions are outside the presentation selection.' : 'No material exceptions are omitted.'));
  return '<svg data-bets-surface="allocation-field-presentation" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080" font-family="' +
    SANS + '" role="img" aria-labelledby="bets-presentation-title bets-presentation-desc"><title id="bets-presentation-title">' +
    svgTitle + '</title><desc id="bets-presentation-desc">' + desc + '</desc>' + parts.join('') + '</svg>';
}
