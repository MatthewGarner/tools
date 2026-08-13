import {encodeHash} from './series.js';

const ORIGINS = new Set(['map', 'gauge', 'timeline', 'roadmap', 'paths']);
const KINDS = new Set(['question-set', 'range-estimate', 'risk-register',
  'decision-plan', 'delivery-projection']);
const RETURN_PATH = /^\/([a-z0-9-]+)\/(?:\?[^#\s]*)?(?:#[^\s]*)?$/;
const MAX_RETURN_PATH = 6000;

/* A return is an internal, inert URL carried in the target URL. It is not a
   callback and cannot write back to the source. Keep it source-scoped so a
   crafted handoff cannot turn the return control into an open redirect. */
export function validHandoffReturn(value, from){
  if(typeof value !== 'string' || value.length > MAX_RETURN_PATH ||
     /[\u0000-\u0020\u007f<>"'\\]/.test(value)) return null;
  const match = value.match(RETURN_PATH);
  return match && match[1] === from ? value : null;
}

export async function handoffReturnHref(path, state, maxLen = MAX_RETURN_PATH){
  if(typeof path !== 'string' || !/^\/[a-z0-9-]+\/$/.test(path)) return null;
  const encoded = await encodeHash(state);
  const href = path + '#' + encoded;
  return href.length < maxLen ? href : null;
}

export function handoffMeta(from, kind, label = '', returnTo = ''){
  if(!ORIGINS.has(from) || !KINDS.has(kind)) return null;
  const clean = String(label).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 120);
  const back = returnTo === '' ? null : validHandoffReturn(returnTo, from);
  if(returnTo !== '' && !back) return null;
  return {v: 1, mode: 'draft', from, kind, ...(clean ? {label: clean} : {}),
    ...(back ? {returnTo: back} : {})};
}

export function validHandoffMeta(value, expected = {}){
  if(!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if(value.v !== 1 || value.mode !== 'draft') return null;
  if(Object.prototype.hasOwnProperty.call(value, 'returnTo') && typeof value.returnTo !== 'string') return null;
  const meta = handoffMeta(value.from, value.kind, value.label, value.returnTo || '');
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
