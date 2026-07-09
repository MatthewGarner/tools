/* Default params + "Conditions" presets for the GB-today world. Each condition is
   a shallow mutation applied on top of DEFAULT_PARAMS (never on live UI state, so
   presets are deterministic — mirrors v1's generatorsFromPreset rebuild). Pure. */
export const DEFAULT_PARAMS = {
  demand: 40, gas: 100, carbon: 50,
  wind: 0.28, solar: 0.20, imports: 3,
  storageAvail: 0.50, chargePrice: 40,
  mustRunOn: false, mustRunDepth: 30,
};

/* Conditions overlay a world. `coldPeak` carries NO demand (it's firm-constrained and
   world-relative — paramsFor resolves it from the world's coldPeakDemand) and pins imports
   LOW (still Dunkelflaute: neighbours short too). The others carry absolute low demands that
   read correctly at any world scale. */
export const CONDITIONS = {
  windy:    {label: 'Windy',           mutate: {wind: 0.70, demand: 32}},
  coldPeak: {label: 'Still cold peak', mutate: {wind: 0.05, solar: 0, storageAvail: 0, imports: 5}},
  gasSpike: {label: 'Gas spike',       mutate: {gas: 250}},
  negative: {label: 'Negative prices', mutate: {wind: 0.80, solar: 0.60, mustRunOn: true, demand: 16}},
};

/* Phase 2: FES 2035 "Worlds". Each world = a catalogue + params (typical `demand`, a
   `demandMax` slider ceiling, and a `coldPeakDemand` for the firm-constrained cold peak).
   The engine rides unchanged: buildStack(params, WORLDS[key].catalogue) → dispatch. */
import {GB_TODAY, FES_HT, FES_EE, FES_HE, FES_FB} from './technologies.js';
export const WORLDS = {
  gbToday: {label: 'GB today',                catalogue: GB_TODAY, params: {...DEFAULT_PARAMS, demandMax: 64, coldPeakDemand: 50}},
  ht:      {label: 'FES: Holistic Transition', catalogue: FES_HT, params: {...DEFAULT_PARAMS, demand: 50, demandMax: 82, coldPeakDemand: 50}},
  ee:      {label: 'FES: Electric Engagement', catalogue: FES_EE, params: {...DEFAULT_PARAMS, demand: 60, demandMax: 90, coldPeakDemand: 54}},
  he:      {label: 'FES: Hydrogen Evolution',  catalogue: FES_HE, params: {...DEFAULT_PARAMS, demand: 60, demandMax: 85, coldPeakDemand: 63}},
  fb:      {label: 'FES: Falling Behind',       catalogue: FES_FB, params: {...DEFAULT_PARAMS, demand: 70, demandMax: 80, coldPeakDemand: 75}},
};

/* Resolve params for a (world, condition). Unknown world → gbToday. coldPeak resolves its
   demand from the world's coldPeakDemand; other conditions use their own absolute demand,
   else the world's typical. */
export function paramsFor(worldKey, conditionKey){
  const w = (WORLDS[worldKey] ?? WORLDS.gbToday).params;
  const mut = CONDITIONS[conditionKey]?.mutate ?? {};
  const demand = conditionKey === 'coldPeak' ? w.coldPeakDemand : (mut.demand ?? w.demand);
  return {...w, ...mut, demand};
}
