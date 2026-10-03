/*
 * Consumer projection contract: the parsed document settings and evaluator output
 * (`today`, `decisions`, `decisionByName`, `items`, `warnings`), with numeric `reach`
 * on every decision and the plan projection's numeric `reachDenominator`, `worlds`,
 * `shares`, and `matrix`.
 */

import {enumeratePlans} from './plans.js';

export function project(model, today){
  return enumeratePlans(model, today);
}

