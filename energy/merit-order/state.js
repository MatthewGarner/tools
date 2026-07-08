/* URL state codec for the GB merit-order tool (v2). State's source of truth is
   {condition, params, adv}: params drive buildStack(); adv is per-block hand-edits
   ({name:[cap,cost]}); condition names the active Conditions preset. A legacy v1
   hash (archetype names absent in v2) decodes to null → caller falls back to the
   GB-today default. No DOM here (node-testable).

   v2 URL schema: {v:2, c:conditionKey|null, params:{…}, adv?:{name→[cap,cost]}}. */
export function encodeStateV2({condition, params, adv}){
  const obj = {v: 2, c: condition ?? null, params};
  if(adv && Object.keys(adv).length) obj.adv = adv;
  return obj;
}
export function decodeStateV2(obj){
  if(!obj || obj.v !== 2 || typeof obj.params !== 'object' || !obj.params) return null;
  return {condition: obj.c ?? null, params: obj.params, adv: obj.adv ?? {}};
}
