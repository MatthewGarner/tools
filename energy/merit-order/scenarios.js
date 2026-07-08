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
