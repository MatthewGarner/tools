/* Fixed 16:9 portfolio-summary render for Copy PNG. It is intentionally a
   deterministic selection, not a compressed claim that all bets are shown. */
import {esc, txt} from '../assets/svg.js';
import {measuredLines, presentationSelection} from './layout.js';

const W = 1920, H = 1080;
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const MINUS = '−';
const num = v => (v < 0 ? MINUS : '') + Math.round(Math.abs(v));
const sgn = v => (v < 0 ? MINUS : '+') + Math.round(Math.abs(v));
const rng = r => !r ? '—' : r[0] === r[1] ? num(r[0]) : num(r[0]) + '–' + num(r[1]);
const pct = r => !r ? '—' : r[0] === r[1] ? r[0] + '%' : r[0] + '–' + r[1] + '%';
const stakeMid = b => b.stake ? (b.stake[0] + b.stake[1]) / 2 : 0;

export function renderBetsPresentation(model, sim, ctx = {}){
  const c = ctx.colors, measure = ctx.measure || (s => String(s).length * 14);
  const selection = presentationSelection(model, sim);
  const pf = sim.portfolio;
  const pl = Math.round((pf.pLoss || 0) * 100);
  const totalStake = selection.selected.length || selection.total
    ? selection.total && model.groups.flatMap(g => g.bets).reduce((n, b) => n + stakeMid(b), 0)
    : 0;
  const parts = [];

  parts.push('<rect width="1920" height="1080" fill="' + c.bg + '"/>');
  parts.push('<rect x="0" y="0" width="18" height="1080" fill="' + c.accent + '"/>');
  parts.push('<text x="96" y="104" font-family="\'Helvetica Neue\',Helvetica,\'Segoe UI\',Roboto,sans-serif" font-size="44" fill="' + c.ink + '">' +
    esc(model.title || 'Bets board') + '</text>');
  parts.push(txt(96, 142, selection.total + ' BETS · ' + model.groups.length + ' BOOKS · TOTAL STAKE ' + num(totalStake) + ' ' + (model.unit || ''),
    18, c.muted, {mono: true, tracking: '0.05em'}));
  parts.push(txt(1824, 96, 'P(LOSES MONEY) ' + pl + '%', 30, pl >= 50 ? c.err : c.accentInk,
    {weight: 700, mono: true, anchor: 'end'}));
  parts.push(txt(1824, 136, 'NET EV ' + sgn(pf.p50) + ' · P10 ' + sgn(pf.p10) + ' · P90 ' + sgn(pf.p90),
    18, c.muted, {mono: true, anchor: 'end'}));

  parts.push('<rect x="96" y="178" width="1728" height="62" fill="' + c.card + '" stroke="' + c.border + '"/>');
  parts.push(txt(120, 205, 'SELECTION · ' + selection.rule.toUpperCase(), 15, c.accentInk,
    {weight: 700, tracking: '0.08em'}));
  parts.push(txt(120, 228, selection.selected.length + ' SHOWN · ' + selection.remainder +
    (selection.remainder === 1 ? ' FURTHER BET IN FULL SVG' : ' FURTHER BETS IN FULL SVG'), 16, c.muted,
    {weight: 700, tracking: '0.04em'}));

  const cols = 2, gapX = 34, cardW = (1728 - gapX) / cols, cardH = 226;
  selection.selected.forEach((record, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const x = 96 + col * (cardW + gapX), y = 270 + row * (cardH + 18);
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
  parts.push(txt(1824, 1040, 'RANGES ARE P10–P90 FROM 4,000 SEEDED RUNS', 14, c.muted,
    {anchor: 'end', tracking: '0.06em'}));
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080" font-family="' +
    SANS + '">' + parts.join('') + '</svg>';
}
