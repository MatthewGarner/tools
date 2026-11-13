/* Pure density decisions for both Bets views. Display IDs are derived from
   source order for one render only; they never enter the parsed model or URL. */
import {wrapText} from '../assets/svg.js';

export const BOARD_LEDGER_THRESHOLD = 8;
export const QUADRANT_DIRECT_THRESHOLD = 6;
export const QUADRANT_KEY_THRESHOLD = 9;

/* Portfolio outcomes are deliberately read through two named lenses.  The
   engine owns how the shared-outcome run is produced; renderers own the
   promise that neither lens can disappear from a live or exported artefact.
   Keep this adapter tolerant of the portfolio being returned directly or
   wrapped in a scenario record so the rendering contract remains small. */
const portfolioResult = value => {
  const result = value && value.portfolio ? value.portfolio : value;
  return result && Number.isFinite(result.p50) && Number.isFinite(result.pLoss) ? result : null;
};

export function conditionReadings(sim){
  const baseline = portfolioResult(sim && sim.portfolio);
  const stressRecord = sim && (sim.sharedConditions || sim.sharedCondition ||
    (sim.scenarios && (sim.scenarios.sharedConditions || sim.scenarios.shared)));
  const stress = portfolioResult(stressRecord);
  const metadata = (stressRecord && stressRecord.meta) || (sim && (sim.dependence || sim.scenarioMetadata)) || {};
  return {
    baseline: {
      key: 'independent', label: 'Independent baseline', result: baseline,
      condition: 'If each bet resolves on its own', available: !!baseline,
    },
    stress: {
      key: 'shared', label: 'Shared-outcome stress', result: stress,
      condition: metadata.condition || metadata.description ||
        'If realised wins and losses move together; parameter ranges stay independent',
      available: !!stress,
    },
  };
}

const recOf = (sim, b) => sim?.bets?.get(b.srcLine) ||
  {ev: {p10: 0, p50: 0, p90: 0}, audits: []};
const stakeUpper = b => b.stake ? b.stake[1] : 0;

const SEGMENTER = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, {granularity: 'grapheme'}) : null;
const graphemes = text => SEGMENTER ? [...SEGMENTER.segment(text)].map(part => part.segment) : Array.from(text);

/* Wrapped lines. A word wider than the line is broken after one of its own boundaries (_ - / .) where it has one, and only
   inside a word, between whole characters, where it has none. */
export function measuredLines(text, font, maxWidth, measure){
  const source = String(text || '');
  const words = source.split(/\s+/).filter(Boolean);
  if(!words.some(word => measure(word, font) > maxWidth)){
    const lines = wrapText(source, font, maxWidth, measure);
    return lines.length ? lines : [''];
  }
  const tokens = [];
  for(const word of words){
    if(measure(word, font) <= maxWidth){ tokens.push({text: word, space: true}); continue; }
    let rest = graphemes(word), first = true;
    while(rest.length){
      let fit = 0;
      while(fit < rest.length && measure(rest.slice(0, fit + 1).join(''), font) <= maxWidth) fit++;
      let cut = rest.length;
      if(fit < rest.length){
        cut = Math.max(1, fit);
        for(let j = cut; j >= Math.max(2, Math.ceil(cut / 2)); j--) if(/[_\-/.]$/.test(rest[j - 1])){ cut = j; break; }
      }
      tokens.push({text: rest.slice(0, cut).join(''), space: first});
      first = false;
      rest = rest.slice(cut);
    }
  }
  const lines = [];
  let cur = '';
  for(const token of tokens){
    const trial = cur ? cur + (token.space ? ' ' : '') + token.text : token.text;
    if(!cur || measure(trial, font) <= maxWidth) cur = trial;
    else { lines.push(cur); cur = token.text; }
  }
  if(cur) lines.push(cur);
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
    const killText = record.b.kill && ('fold if ' + record.b.kill.text +
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
