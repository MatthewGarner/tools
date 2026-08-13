/* Fixed 16:9 portfolio-summary render for Copy PNG. It is intentionally a
   deterministic selection, not a compressed claim that all bets are shown. */
import {esc, txt} from '../assets/svg.js';
import {conditionReadings, measuredLines, omittedMaterialExceptions, presentationSelection} from './layout.js';

const W = 1920, H = 1080;
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

function exceptionCopy(exceptions){
  if(!exceptions.length) return 'NO MATERIAL EXCEPTIONS HIDDEN BY THE SIX-CARD SELECTION';
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

export function renderBetsPresentation(model, sim, ctx = {}){
  const c = ctx.colors, measure = ctx.measure || (s => String(s).length * 14);
  const selection = presentationSelection(model, sim);
  const conditions = conditionReadings(sim);
  const baseline = reading(conditions.baseline.result);
  const stress = reading(conditions.stress.result);
  const exceptions = omittedMaterialExceptions(selection);
  const totalStake = selection.selected.length
    ? selection.records.filter(record => record.rec.scoreable !== false).reduce((n, record) => n + stakeMid(record.b), 0)
    : 0;
  const parts = [];

  parts.push('<rect width="1920" height="1080" fill="' + c.bg + '"/>');
  parts.push('<rect x="0" y="0" width="18" height="1080" fill="' + c.accent + '"/>');
  parts.push('<text x="96" y="104" font-family="\'Helvetica Neue\',Helvetica,\'Segoe UI\',Roboto,sans-serif" font-size="44" fill="' + c.ink + '">' +
    esc(model.title || 'Bets board') + '</text>');
  parts.push(txt(96, 142, selection.total + ' BETS · ' + model.groups.length + ' BOOKS · TOTAL STAKE ' + num(totalStake) + ' ' + (model.unit || ''),
    18, c.muted, {mono: true, tracking: '0.05em'}));
  const conditionCards = [
    {x: 1000, title: conditions.baseline.label, copy: baseline, tone: c.accentInk, condition: conditions.baseline.condition},
    {x: 1420, title: conditions.stress.label, copy: stress,
      tone: conditions.stress.available && conditions.stress.result.pLoss >= 0.5 ? c.err : c.accentInk,
      condition: conditions.stress.condition},
  ];
  for(const card of conditionCards){
    parts.push('<rect x="' + card.x + '" y="38" width="394" height="112" fill="' + c.card + '" stroke="' + c.border + '"/>');
    parts.push(txt(card.x + 18, 61, card.title.toUpperCase(), 12, c.muted,
      {weight: 700, tracking: '0.08em'}));
    parts.push(txt(card.x + 18, 91, card.copy.loss.toUpperCase(), 23, card.tone, {weight: 700, mono: true}));
    parts.push(txt(card.x + 18, 116, card.copy.median + ' · ' + card.copy.range, 14, c.ink, {weight: 600, mono: true}));
    parts.push(txt(card.x + 18, 138, card.condition, 11.5, c.muted));
  }

  parts.push('<rect x="96" y="178" width="1728" height="106" fill="' + c.card + '" stroke="' + c.border + '"/>');
  parts.push(txt(120, 205, 'SELECTION · ' + selection.rule.toUpperCase(), 15, c.accentInk,
    {weight: 700, tracking: '0.08em'}));
  parts.push(txt(120, 228, selection.selected.length + ' SHOWN · ' + selection.remainder +
    (selection.remainder === 1 ? ' FURTHER BET IN FULL SVG' : ' FURTHER BETS IN FULL SVG'), 16, c.muted,
    {weight: 700, tracking: '0.04em'}));
  parts.push(txt(120, 254, 'OMITTED MATERIAL EXCEPTIONS · ' + exceptionCopy(exceptions), 12,
    exceptions.length ? c.err : c.muted, {weight: 700, tracking: '0.03em'}));
  const concentration = concentrationCopy(selection, sim);
  parts.push(txt(120, 276, concentration, 12, sim.concentration ? c.err : c.muted,
    {weight: 700, tracking: '0.03em'}));
  parts.push(txt(1800, 276, unscoredCopy(selection), 12, selection.unscored.length ? c.err : c.muted,
    {weight: 700, tracking: '0.02em', anchor: 'end'}));

  const cols = 2, gapX = 34, cardW = (1728 - gapX) / cols, cardH = 226;
  selection.selected.forEach((record, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const x = 96 + col * (cardW + gapX), y = 304 + row * (cardH + 18);
    const b = record.b, e = record.rec.ev;
    parts.push('<rect x="' + x + '" y="' + y + '" width="' + cardW + '" height="' + cardH +
      '" fill="' + c.card + '" stroke="' + (record.rec.audits.length ? c.err : c.border) + '" stroke-width="1.5"/>');
    parts.push('<rect x="' + x + '" y="' + y + '" width="8" height="' + cardH + '" fill="' + c.accent + '"/>');
    parts.push(txt(x + 28, y + 34, record.id + ' · ' + record.group.name.toUpperCase(), 14, c.accentInk,
      {weight: 700, tracking: '0.08em'}));
    let nameSize = 27;
    let nameLines = measuredLines(b.name, '600 27px ' + SANS, cardW - 58, measure);
    if(nameLines.length > 2){
      nameSize = 22;
      nameLines = measuredLines(b.name, '600 22px ' + SANS, cardW - 58, measure);
    }
    const nameStep = nameSize + 3;
    nameLines.forEach((line, li) => parts.push(txt(x + 28, y + 74 + li * nameStep, line, nameSize, c.ink, {weight: 600})));
    const stripY = Math.max(y + 138, y + 74 + (nameLines.length - 1) * nameStep + nameSize + 8);
    parts.push('<rect x="' + (x + 24) + '" y="' + stripY + '" width="' + (cardW - 48) + '" height="48" fill="' + c.track + '" fill-opacity="0.55"/>');
    const cells = [['STAKE', rng(b.stake)], ['ODDS', pct(b.odds)], ['PAYOFF', rng(b.payoff)], ['P50 EV', sgn(e.p50)]];
    cells.forEach(([label, value], ci) => {
      const cx = x + 44 + ci * (cardW - 80) / 4;
      parts.push(txt(cx, stripY + 17, label, 11, c.muted, {weight: 700, tracking: '0.08em'}));
      parts.push(txt(cx, stripY + 38, value, 17, label === 'P50 EV' && e.p50 < 0 ? c.err : c.ink, {mono: true, weight: 700}));
    });
    const audit = record.rec.audits.length ? record.rec.audits.join(' · ') : 'AUDITS CLEAR';
    parts.push(txt(x + 28, y + 211, audit, 12, record.rec.audits.length ? c.err : c.muted,
      {weight: 700, tracking: '0.05em'}));
  });

  parts.push(txt(96, 1040, 'PRESENTATION SUMMARY · FULL DETAIL: DOWNLOAD SVG', 14, c.muted,
    {weight: 700, tracking: '0.1em'}));
  parts.push(txt(1824, 1040, 'BOTH CONDITION READINGS · RANGES ARE P10–P90 FROM 4,000 SEEDED RUNS', 14, c.muted,
    {anchor: 'end', tracking: '0.06em'}));
  const title = esc((model.title || 'Bets board') + ' — decision comparison');
  const desc = esc(conditions.baseline.label + ': ' + baseline.loss + ', ' + baseline.median + '. ' +
    conditions.stress.label + ': ' + stress.loss + ', ' + stress.median + '. ' +
    (exceptions.length ? exceptions.length + ' material exceptions are outside the card selection.' : 'No material exceptions are omitted.'));
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080" font-family="' +
    SANS + '" role="img" aria-labelledby="bets-presentation-title bets-presentation-desc"><title id="bets-presentation-title">' +
    title + '</title><desc id="bets-presentation-desc">' + desc + '</desc>' + parts.join('') + '</svg>';
}
