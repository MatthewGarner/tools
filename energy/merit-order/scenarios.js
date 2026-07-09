/* Default params + "Conditions" presets for the GB-today world. Each condition is
   a shallow mutation applied on top of DEFAULT_PARAMS (never on live UI state, so
   presets are deterministic — mirrors v1's generatorsFromPreset rebuild). Pure. */
export const DEFAULT_PARAMS = {
  demand: 40, gas: 100, carbon: 50,
  wind: 0.28, solar: 0.20, imports: 3,
  storageAvail: 0.50, chargePrice: 40,
  mustRunOn: false, mustRunDepth: 30,
};

export const CONDITIONS = {
  windy:    {label: 'Windy',           mutate: {wind: 0.70, demand: 32}},
  coldPeak: {label: 'Still cold peak', mutate: {wind: 0.05, solar: 0, storageAvail: 0, demand: 50}},
  gasSpike: {label: 'Gas spike',       mutate: {gas: 250}},
  negative: {label: 'Negative prices', mutate: {wind: 0.80, solar: 0.60, mustRunOn: true, demand: 16}},
};

export function paramsFor(conditionKey){
  const base = {...DEFAULT_PARAMS};
  const c = conditionKey && CONDITIONS[conditionKey];
  return c ? {...base, ...c.mutate} : base;
}

/* Phase 2: FES 2035 "Worlds". Each world = a catalogue + params (typical `demand`, a
   `demandMax` slider ceiling, and a `coldPeakDemand` for the firm-constrained cold peak).
   The engine rides unchanged: buildStack(params, WORLDS[key].catalogue) → dispatch.
   NOTE: the `paramsFor(world, condition)` signature migration + the CONDITIONS.coldPeak
   change (no demand, imports:5) are DEFERRED to the app-wiring build (they touch app.js,
   owned meanwhile by the mobile-layout session). These params are validated here directly. */
import {GB_TODAY, FES_HT, FES_EE, FES_HE, FES_FB} from './technologies.js';
export const WORLDS = {
  gbToday: {label: 'GB today',                catalogue: GB_TODAY, params: {...DEFAULT_PARAMS, demandMax: 64, coldPeakDemand: 50}},
  ht:      {label: 'FES: Holistic Transition', catalogue: FES_HT, params: {...DEFAULT_PARAMS, demand: 50, demandMax: 82, coldPeakDemand: 50}},
  ee:      {label: 'FES: Electric Engagement', catalogue: FES_EE, params: {...DEFAULT_PARAMS, demand: 60, demandMax: 90, coldPeakDemand: 54}},
  he:      {label: 'FES: Hydrogen Evolution',  catalogue: FES_HE, params: {...DEFAULT_PARAMS, demand: 60, demandMax: 85, coldPeakDemand: 63}},
  fb:      {label: 'FES: Falling Behind',       catalogue: FES_FB, params: {...DEFAULT_PARAMS, demand: 70, demandMax: 80, coldPeakDemand: 75}},
};

/* Cold peak = still Dunkelflaute: little wind, no solar, storage depleted, and imports
   pinned LOW (neighbours short too). Demand = the world's coldPeakDemand. */
export const COLD_PEAK = {wind: 0.05, solar: 0, storageAvail: 0, imports: 5};
export function worldColdPeakParams(worldKey){
  const w = WORLDS[worldKey].params;
  return {...w, ...COLD_PEAK, demand: w.coldPeakDemand};
}
