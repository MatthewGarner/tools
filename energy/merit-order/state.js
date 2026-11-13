import {WORLDS} from './scenarios.js';
/* URL state codec for the GB merit-order tool (v2). State's source of truth is
   {condition, params, adv}: params drive buildStack(); adv is per-block hand-edits
   ({name:[cap,cost]}); condition names the active Conditions preset. A legacy v1
   hash (archetype names absent in v2) decodes to null → caller falls back to the
   GB-today default. No DOM here (node-testable).

   v2 URL schema: {v:2, w?:worldKey, c:conditionKey|null, params:{…}, adv?:{name→[cap,cost]}}.
   `w` absent → GB today (so Phase-1 v2 hashes still decode). The caller guards an unknown
   world key against WORLDS before use (a corrupt shared URL falls back to gbToday). */
export function encodeStateV2({world, condition, params, adv}){
  const obj = {v: 2, c: condition ?? null, params};
  if(world && world !== 'gbToday') obj.w = world;
  if(adv && Object.keys(adv).length) obj.adv = adv;
  return obj;
}
/* Ranges are the controls' own (index.html sliders, the edit stepper); imports, storageAvail and
   chargePrice have no control, so they take a sane physical range. A missing, null, empty or
   non-numeric value is dropped, so the world's own default applies at merge time. */
const RANGES = {gas: [20, 300], carbon: [20, 100], wind: [0, 1], solar: [0, 1], mustRunDepth: [0, 50],
  imports: [0, 30], storageAvail: [0, 1], chargePrice: [0, 300]};
const ADV_CAP = [0, 90], ADV_COST = [-200, 400];
const num = raw => (typeof raw === 'number' || (typeof raw === 'string' && raw.trim() !== '')) ? Number(raw) : NaN;
const clampTo = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));

export function decodeStateV2(obj){
  if(!obj || obj.v !== 2 || typeof obj.params !== 'object' || !obj.params) return null;
  const world = WORLDS[obj.w] ? obj.w : 'gbToday';
  const params = {};
  for(const [k, range] of Object.entries({...RANGES, demand: [0, WORLDS[world].params.demandMax]})){
    const v = num(obj.params[k]);
    if(Number.isFinite(v)) params[k] = clampTo(v, range);
  }
  if(typeof obj.params.mustRunOn === 'boolean') params.mustRunOn = obj.params.mustRunOn;
  const adv = {};
  if(obj.adv && typeof obj.adv === 'object') for(const [name, row] of Object.entries(obj.adv)){
    if(!Array.isArray(row)) continue;
    const cap = num(row[0]), cost = num(row[1]);
    const c = Number.isFinite(cap) ? clampTo(cap, ADV_CAP) : null, k = Number.isFinite(cost) ? clampTo(cost, ADV_COST) : null;
    if(c !== null || k !== null) adv[name] = [c, k];
  }
  return {world: obj.w ?? 'gbToday', condition: obj.c ?? null, params, adv};
}
