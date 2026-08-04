/* Pure density decisions for both Bets views. Display IDs are derived from
   source order for one render only; they never enter the parsed model or URL. */
import {wrapText} from '../assets/svg.js';

export const BOARD_LEDGER_THRESHOLD = 8;
export const QUADRANT_DIRECT_THRESHOLD = 6;
export const QUADRANT_KEY_THRESHOLD = 9;
export const PRESENTATION_LIMIT = 6;

const recOf = (sim, b) => sim?.bets?.get(b.srcLine) ||
  {ev: {p10: 0, p50: 0, p90: 0}, audits: []};
const stakeUpper = b => b.stake ? b.stake[1] : 0;

export function measuredLines(text, font, maxWidth, measure){
  const lines = [];
  for(const wordLine of wrapText(String(text || ''), font, maxWidth, measure)){
    if(measure(wordLine, font) <= maxWidth){ lines.push(wordLine); continue; }
    let current = '';
    for(const ch of wordLine){
      const next = current + ch;
      if(current && measure(next, font) > maxWidth){ lines.push(current); current = ch; }
      else current = next;
    }
    if(current) lines.push(current);
  }
  return lines.length ? lines : [''];
}

export function sourceBets(model, sim){
  const total = model.groups.reduce((n, g) => n + g.bets.length, 0);
  const digits = Math.max(2, String(total).length);
  const out = [];
  let sourceOrder = 0;
  model.groups.forEach((group, groupIndex) => {
    group.bets.forEach(b => {
      const rec = recOf(sim, b);
      sourceOrder += 1;
      out.push({
        id: 'B' + String(sourceOrder).padStart(digits, '0'),
        sourceOrder, group, groupIndex, b, rec,
        stakeUpper: stakeUpper(b),
        absP50Ev: Math.abs(rec.ev.p50 || 0),
      });
    });
  });
  return out;
}

export function boardPlan(model, sim, {measure, nameWidth = 230, killWidth = 245} = {}){
  const m = measure || (s => String(s).length * 7);
  const records = sourceBets(model, sim);
  const mode = records.length > BOARD_LEDGER_THRESHOLD ? 'ledger' : 'board';
  const rows = records.map(record => {
    const nameLines = measuredLines(record.b.name, '600 13px sans-serif', nameWidth, m);
    const killText = record.b.kill && ('↳ fold if ' + record.b.kill.text +
      (record.b.kill.by ? ' — by ' + record.b.kill.by : ''));
    const killLines = killText ? measuredLines(killText, '10.5px sans-serif', killWidth, m) : [];
    const nameTop = mode === 'ledger' ? 24 : 22;
    const contentHeight = nameTop + (nameLines.length - 1) * 16 +
      (killLines.length ? 7 + killLines.length * 14 : 0) + 10;
    const auditHeight = 14 + record.rec.audits.length * 21 + 8;
    return {...record, nameLines, killLines, nameTop,
      height: Math.max(mode === 'ledger' ? 48 : 48, contentHeight, auditHeight)};
  });
  return {mode, records, rows, byLine: new Map(rows.map(row => [row.b.srcLine, row]))};
}

export function quadrantDensity(count){
  if(count <= QUADRANT_DIRECT_THRESHOLD) return 'direct';
  if(count <= QUADRANT_KEY_THRESHOLD) return 'compact';
  return 'keyed';
}

export function presentationSelection(model, sim, limit = PRESENTATION_LIMIT){
  const records = sourceBets(model, sim);
  const ranked = records.slice().sort((a, b) =>
    (b.stakeUpper - a.stakeUpper) ||
    (b.absP50Ev - a.absP50Ev) ||
    (a.sourceOrder - b.sourceOrder));
  const selected = ranked.slice(0, Math.max(0, limit));
  return {
    selected,
    remainder: Math.max(0, records.length - selected.length),
    total: records.length,
    rule: 'highest stake upper bound · then |P50 EV| · source order',
  };
}
