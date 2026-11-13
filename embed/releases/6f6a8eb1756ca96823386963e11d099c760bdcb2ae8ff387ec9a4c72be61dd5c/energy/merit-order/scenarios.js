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
   world-relative — paramsFor resolves it from the world's coldPeakDemand) and sets imports to
   5 GW, above the 3 GW default: the shipped headlines (Electric Engagement and Falling Behind
   priced by gas peakers, the net-zero worlds by hydrogen) were built on 5 GW, and at the 3 GW
   default three FES worlds leave a little demand unmet. Whether 5 GW is the right figure for a
   Europe-wide still spell is a judgement call, not a derived number. The others carry absolute
   low demands that read correctly at any world scale. */
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

/* One plain sentence when a Conditions chip leaves the price where the world's own default has it —
   today that is Gas spike in the net-zero worlds, where gas is not what sets the price. '' otherwise. */
import {buildStack} from './stack.js';
import {dispatch} from './engine.js';
export function conditionNote(worldKey, conditionKey){
  if(!CONDITIONS[conditionKey]) return '';
  const w = WORLDS[worldKey] ?? WORLDS.gbToday;
  const at = key => { const p = paramsFor(worldKey, key); return dispatch(buildStack(p, w.catalogue), p.demand); };
  const a = at(null), b = at(conditionKey);
  if(Math.abs(a.clearingPrice - b.clearingPrice) > 1e-9 || a.marginalName !== b.marginalName || !b.marginalName) return '';
  const label = CONDITIONS[conditionKey].label, price = Math.round(b.clearingPrice);
  return conditionKey === 'gasSpike'
    ? `${label} changes nothing in this world: gas is not setting the price — ${b.marginalName} is (£${price}/MWh).`
    : `${label} leaves the price at £${price}/MWh in this world: ${b.marginalName} still sets it.`;
}
