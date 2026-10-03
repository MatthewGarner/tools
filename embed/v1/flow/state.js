/* Article v1 is a bounded, fixed-seed subset of Flow's queue model. */
import {SEED} from './model/engine.js';
import {encodeHash} from './model/series.js';

export const DEFAULT_PARAMS = Object.freeze({demandPerWeek:8, itemDays:2, team:4, wipLimit:4, cov:'med'});
const fail = message => { throw new Error(message); };
function object(value, name, keys){
  if(!value || typeof value !== 'object' || Array.isArray(value)) fail(name + ' must be an object.');
  if(Object.keys(value).some(key => !keys.includes(key))) fail('Unsupported ' + name + ' setting.');
}
function number(value, name, min, max, step){
  if(typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || !Number.isInteger(value / step))
    fail(name + ' must be between ' + min + ' and ' + max + ' in steps of ' + step + '.');
}

export function parseState(hash = ''){
  let input = {};
  if(hash && hash !== '#'){
    if(hash.length > 4096) fail('The demonstration settings are too long.');
    try { input = JSON.parse(decodeURIComponent(hash.replace(/^#/, ''))); }
    catch { fail('The demonstration settings could not be read.'); }
  }
  object(input, 'demonstration', ['params', 'seed', 'controls']);
  if(input.params !== undefined) object(input.params, 'model', Object.keys(DEFAULT_PARAMS));
  const params = {...DEFAULT_PARAMS, ...input.params};
  number(params.demandPerWeek, 'Demand', .5, 10, .5);
  number(params.itemDays, 'Item size', 1, 15, 1);
  number(params.team, 'Team size', 1, 10, 1);
  if(params.wipLimit !== 40) number(params.wipLimit, 'WIP limit', 1, 20, 1);
  if(!['low', 'med', 'high'].includes(params.cov)) fail('Variability must be low, med or high.');
  const seed = input.seed === undefined ? SEED : input.seed;
  if(seed !== SEED) fail('Article v1 uses the fixed Flow seed ' + SEED + '.');
  const controls = input.controls === undefined ? ['demand'] : input.controls;
  if(!Array.isArray(controls) || controls.length > 1 || (controls.length && controls[0] !== 'demand'))
    fail('Article v1 supports only the demand control, or no controls.');
  return {params, seed, controls:[...controls]};
}

export function fullFlowState(params){
  return {d:params.demandPerWeek, s:params.itemDays, t:params.team,
    w:params.wipLimit === 40 ? 21 : params.wipLimit, v:params.cov, q:0, e:0};
}

export async function fullToolUrl(params, origin){
  const here = new URL(origin);
  const local = here.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(here.hostname);
  return (local ? here.origin : 'https://tools.matthewgarner.me') + '/flow/#' + await encodeHash(fullFlowState(params));
}
