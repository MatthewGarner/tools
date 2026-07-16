/* /signal-vs-noise engine — pure, seeded. A stable person-in-system process
   (noise dominates; the system sets the baseline) with exactly one sustained
   real signal; the routine-variation band is a SEEDED ORACLE (from the true
   parameters, never estimated from the visible points). `shown` (rounded,
   clamped ≥0) is the ONE series the player judges and everything scores on. */
import {mulberry32, gaussian} from '../assets/series.js';

const NAMES = ['Ada', 'Ben', 'Cy', 'Dot', 'Eve', 'Fin', 'Gil', 'Hal'];

/* the hand-picked first-play scenario: Ben's clean sustained decline, Dot's
   tempting high spike (praise → regresses), Fin's tempting low (warn → bounces)
   — a naive player is forced into one "praise backfires" AND one "tough love
   works" illusion, and the real decline is catchable. */
export const AUTHORED_SEED = 42;

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

const sideOf = (v, band) => v < band.lo ? 'lo' : v > band.hi ? 'hi' : null;

/* the EVIDENCE available at the moment of a call: the length of the consecutive
   same-side out-of-band run ending at quarter q (0 = in-band, nothing unusual). */
export function evidenceRun(s, p, q){
  const row = s.shown[p], side = sideOf(row[q], s.band);
  if(!side) return 0;
  let run = 0;
  for(let k = q; k >= 0 && sideOf(row[k], s.band) === side; k--) run++;
  return run;
}

/* Grade the DECISION at the moment of the call (evidence, symmetric across
   people), and report the OUTCOME against the seeded truth (the honest ledger).
   Never grade decision quality by outcome — that's resulting, the bias the essay
   condemns. calls = [{person, quarter}]. */
export function scoreCalls(s, calls){
  const sp = s.signalPerson, sq = s.signalQuarter;
  const sorted = [...calls].sort((a, b) => a.quarter - b.quarter);
  const perCall = [];
  let falseAlarms = 0, coinFlip = 0, defensible = 0, caught = null;
  for(const {person, quarter} of sorted){
    const run = evidenceRun(s, person, quarter);
    const quality = run >= 2 ? 'defensible' : 'coin-flip';    // evidence — symmetric across people
    const isSignal = person === sp && quarter >= sq;
    let outcome;
    if(!isSignal){ outcome = 'falseAlarm'; falseAlarms++; }
    else if(!caught){
      outcome = 'caught';
      // catch tag by evidence-at-call: run≤1 is a coin flip (lucky if right); a
      // sustained run promptly acted is clean; a sustained run acted late names its cost.
      const tag = run <= 1 ? 'lucky'
        : (s.firstCatchable !== null && quarter <= s.firstCatchable + 1) ? 'clean' : 'late';
      caught = {tag, quarter, run};
    } else outcome = 'followup';
    if(quality === 'defensible') defensible++; else coinFlip++;
    perCall.push({person, quarter, truth: isSignal ? 'signal' : 'noise', outcome, evidenceRun: run, quality});
  }
  const acted = new Set(calls.map(c => c.person + ':' + c.quarter));
  let correctHolds = 0;
  for(let p = 0; p < s.people; p++) for(let q = 0; q < s.quarters; q++)
    if(!(p === sp && q >= sq) && !acted.has(p + ':' + q)) correctHolds++;
  return {perCall, falseAlarms, caught, coinFlip, defensible, correctHolds};
}

/* the verdict — leads with ACTS (not the flattering 48-cell grid), and is
   detectability-aware (never shames a miss nobody could have caught). */
export function verdict(s, calls){
  const sc = scoreCalls(s, calls);
  const detectable = s.firstCatchable !== null;
  const name = s.names[s.signalPerson];
  const nAct = calls.length;
  const conv = nAct + (nAct === 1 ? ' special-cause conversation' : ' special-cause conversations');
  const noise = sc.falseAlarms + (sc.falseAlarms === 1 ? ' chased noise' : ' chased noise');
  let line;
  if(sc.caught){
    const tail = {lucky: 'you flagged the real decline (' + name + ') — but on a single point, that call was a coin flip',
      clean: 'and you caught the one real decline (' + name + ')',
      late: 'and you caught ' + name + '’s real decline, late'}[sc.caught.tag];
    line = conv + '. ' + noise + ' — ' + tail + '.';
  } else if(!detectable){
    line = conv + '. ' + noise + '. ' + name + '’s decline was unspottable in ' + s.quarters +
      ' quarters — nobody could know.';
  } else {
    line = conv + '. ' + noise + '. The one real decline — ' + name + '’s — you missed.';
  }
  return {line, detectable, firstCatchable: s.firstCatchable, ...sc};
}

/* the between-turn reveal DATA (copy lives here; render/app style it). Fires on
   EVERY act and branches honestly — regression is on-average, not per-draw, so a
   praised outlier that rises again gets the other half of the truth, and an
   integer tie is 'held'. Never discloses ground truth (that lands at the collapse). */
export function revealFor(s, p, actedQuarter){
  if(actedQuarter + 1 >= s.quarters) return {next: null, regressed: null, kind: null, illusion: null};
  const row = s.shown[p], cur = row[actedQuarter], next = row[actedQuarter + 1];
  const kind = cur >= (s.band.lo + s.band.hi) / 2 ? 'praise' : 'warn';   // praised a high / warned a low
  const name = s.names[p];
  let regressed, illusion;
  if(next === cur){ regressed = 'held'; illusion = name + ' is flat — noise doesn’t owe you a reaction.'; }
  else {
    regressed = kind === 'praise' ? next < cur : next > cur;             // moved back toward the middle
    illusion = regressed
      ? (kind === 'praise' ? '“Looks like praise made ' + name + ' complacent.”'
                           : '“Looks like the tough conversation with ' + name + ' worked.”')
      : (kind === 'praise' ? name + ' is up again — luck cuts both ways; outliers regress on average, not every time.'
                           : name + ' slipped further — a warning is no cure for a bad draw.');
  }
  return {next, regressed, kind, illusion};
}

/* the Deming-funnel counterfactual: a manager who re-aims the target to each
   quarter's number reviews a GAP with ~2× the variance (var(x_t − x_{t−1}) = 2σ²
   vs σ² for a fixed target) — the extra "exceptions" are self-inflicted. NOT the
   team's output, which cannot change. Pooled over non-signal people (so the real
   step doesn't pollute the fixed side); degenerate seeds fall back to the analytic. */
export function funnelRatio(s){
  const varOf = a => { const m = a.reduce((x, y) => x + y, 0) / a.length; return a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length; };
  const fixedDevs = [], reaimDevs = [];
  for(let p = 0; p < s.people; p++){
    if(p === s.signalPerson) continue;
    const row = s.shown[p], mean = row.reduce((a, b) => a + b, 0) / row.length;
    for(let q = 0; q < row.length; q++) fixedDevs.push(row[q] - mean);      // gap to a fixed target: var = within-person σ²
    for(let q = 1; q < row.length; q++) reaimDevs.push(row[q] - row[q - 1]); // gap to last quarter: ~2σ²
  }
  const fixedVar = varOf(fixedDevs), reaimVar = varOf(reaimDevs);
  const ratio = fixedVar > 0 ? reaimVar / fixedVar : null;
  if(ratio === null || ratio < 1.2) return {ratio: null, phrase: '~2× (Deming rule 2)'};
  return {ratio, phrase: '~' + (Math.round(ratio * 10) / 10) + '×'};
}
