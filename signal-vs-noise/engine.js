/* /signal-vs-noise engine — pure, seeded. A stable person-in-system process
   (noise dominates; the system sets the baseline) with exactly one sustained
   real signal; the routine-variation band is a SEEDED ORACLE (from the true
   parameters, never estimated from the visible points). `shown` (rounded,
   clamped ≥0) is the ONE series the player judges and everything scores on. */
import {mulberry32, gaussian} from '../assets/series.js';

const NAMES = ['Ada', 'Ben', 'Cy', 'Dot', 'Eve', 'Fin', 'Gil', 'Hal'];

export function makeScenario(seed, params = {}){
  const {people = 6, quarters = 8, baseMean = 16, noiseSd = 3, signalDrop = 9, z = 2} = params;
  const rand = mulberry32(seed), gauss = gaussian(rand);
  const betweenSd = 0.3 * noiseSd;                       // the system dominates the individual (Deming) — not clones
  const trueMean = Array.from({length: people}, () => baseMean + betweenSd * gauss());
  const signalPerson = Math.floor(rand() * people);
  const signalQuarter = 3 + Math.floor(rand() * 2);      // 0-indexed 3–4 ⇒ ≥4 decline quarters
  const outputs = trueMean.map((mu, i) => Array.from({length: quarters}, (_, q) => {
    const shift = (i === signalPerson && q >= signalQuarter) ? signalDrop : 0;
    return mu - shift + noiseSd * gauss();
  }));
  const shown = outputs.map(row => row.map(v => Math.max(0, Math.round(v))));   // integers ≥ 0, what the player judges
  const marginalSd = Math.sqrt(betweenSd * betweenSd + noiseSd * noiseSd);
  const band = {lo: baseMean - z * marginalSd, hi: baseMean + z * marginalSd};  // the oracle — from true params, not data
  // detectability: the first 2-consecutive below-band run in the decline window (the tool's own standard)
  let firstCatchable = null;
  for(let q = signalQuarter + 1; q < quarters; q++){
    if(shown[signalPerson][q] < band.lo && shown[signalPerson][q - 1] < band.lo){ firstCatchable = q; break; }
  }
  return {people, quarters, names: NAMES.slice(0, people), trueMean, outputs, shown, band,
    signalPerson, signalQuarter, signalDrop, firstCatchable,
    params: {people, quarters, baseMean, noiseSd, signalDrop, z}};
}
