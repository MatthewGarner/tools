import {validHandoffMeta} from '../assets/handoff.js';
import {tokenize, parse, collectVars} from './engine.js';

export function fermiImport(state){
  const meta = validHandoffMeta(state && state.x, {from: 'gauge', kind: 'range-estimate'});
  if(!meta || typeof state.f !== 'string' || !state.v || typeof state.v !== 'object') return null;
  let vars;
  try{ vars = collectVars(parse(tokenize(state.f)), []); }catch(e){ return null; }
  if(!vars.length || vars.some(name => !Array.isArray(state.v[name]) || state.v[name].length < 2)) return null;
  const v = {};
  for(const name of vars) v[name] = state.v[name];
  return {state: {...state, v}, meta};
}

export function cloneEstimateState(state){
  if(!state || typeof state !== 'object') return null;
  if(state.a && state.b){
    const a = cloneEstimateState(state.a), b = cloneEstimateState(state.b);
    return a && b ? {a, b, on: state.on === 'B' ? 'B' : 'A'} : null;
  }
  if(typeof state.f !== 'string' || !state.v || typeof state.v !== 'object') return null;
  const v = {};
  for(const [name, pair] of Object.entries(state.v)) if(Array.isArray(pair)) v[name] = [...pair];
  return {f: state.f, v, ...(typeof state.t === 'string' && state.t ? {t: state.t} : {})};
}

export function returnEstimateState(current, fallback){
  return cloneEstimateState(current) || cloneEstimateState(fallback);
}
