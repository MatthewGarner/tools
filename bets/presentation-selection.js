/* Which bets a fixed-size slide shows. Slide-only: kept out of layout.js so an article embed, which draws the live views, does
   not carry it. */
import {sourceBets} from './layout.js';

export const PRESENTATION_LIMIT = 6;

export function presentationSelection(model, sim, limit = PRESENTATION_LIMIT){
  const records = sourceBets(model, sim);
  const scoreable = records.filter(record => record.rec.scoreable !== false);
  const unscored = records.filter(record => record.rec.scoreable === false);
  const ranked = scoreable.slice().sort((a, b) =>
    (b.stakeUpper - a.stakeUpper) ||
    (b.absP50Ev - a.absP50Ev) ||
    (a.sourceOrder - b.sourceOrder));
  const selected = ranked.slice(0, Math.max(0, limit));
  return {
    selected,
    records,
    unscored,
    omitted: ranked.slice(Math.max(0, limit)),
    remainder: Math.max(0, scoreable.length - selected.length),
    total: records.length,
    rule: 'highest stake upper bound · then |P50 EV| · source order',
  };
}

/* A fixed-size slide can select only six cards, but it must never make
   material exceptions vanish. This returns every omitted no-kill / P50-loss
   record for an exhaustive in-plane disclosure strip; concentration is a
   portfolio-level exception and is disclosed separately whether selected or
   omitted. */
export function omittedMaterialExceptions(selection){
  const shown = new Set(selection.selected.map(record => record.b.srcLine));
  /* Older callers do not provide selection.omitted; source records are not
     recoverable from the compact selection alone, so presentationSelection
     also exposes the complete ranked set below. */
  const records = selection.records || [...selection.selected];
  return records.filter(record => record.rec.scoreable !== false && !shown.has(record.b.srcLine)).map(record => {
    const reasons = [];
    if(record.rec.audits.includes('NO KILL CRITERION')) reasons.push('NO KILL');
    if(record.rec.audits.includes('LOSES AT P50')) reasons.push('P50 LOSS');
    return reasons.length ? {record, reasons} : null;
  }).filter(Boolean);
}
