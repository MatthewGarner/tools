import {encodeHash} from './series.js';

const ORIGINS = new Set(['map', 'gauge', 'timeline']);
const KINDS = new Set(['question-set', 'range-estimate', 'risk-register']);

export function handoffMeta(from, kind, label = ''){
  if(!ORIGINS.has(from) || !KINDS.has(kind)) return null;
  const clean = String(label).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 120);
  return {v: 1, mode: 'draft', from, kind, ...(clean ? {label: clean} : {})};
}

export function validHandoffMeta(value, expected = {}){
  if(!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if(value.v !== 1 || value.mode !== 'draft') return null;
  const meta = handoffMeta(value.from, value.kind, value.label);
  if(!meta) return null;
  if(expected.from && meta.from !== expected.from) return null;
  if(expected.kind && meta.kind !== expected.kind) return null;
  return meta;
}

export async function handoffHref(path, state, meta, maxLen = 6000){
  if(typeof path !== 'string' || !/^\/[a-z0-9-]+\/$/.test(path)) return null;
  const clean = validHandoffMeta(meta);
  if(!clean) return null;
  const encoded = await encodeHash({...state, x: clean});
  return encoded.length < maxLen ? path + '#' + encoded : null;
}

export function withoutHandoffMeta(state){
  const clean = {...state};
  delete clean.x;
  return clean;
}

export function targetHashState(state, transientMeta = null){
  const clean = withoutHandoffMeta(state);
  const meta = transientMeta && validHandoffMeta(transientMeta);
  return meta ? {...clean, x: meta} : clean;
}
