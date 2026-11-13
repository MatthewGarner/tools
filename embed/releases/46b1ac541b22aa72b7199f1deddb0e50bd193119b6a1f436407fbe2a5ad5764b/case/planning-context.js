/* Safe, bounded context for planning-family exhibits in Case.
   This module never opens, fetches or mutates a member tool. It reads only the
   URL string already pasted into Case and, for a canonical Roadmap URL, may
   decode its URL-carried text to recognize Roadmap's atomic Paths basis.

   The three tools remain different models. Case adds a claim label; it does
   not translate their state or pretend they share one schema. */
import {decodeHash} from '../assets/series.js';
import {parseProjectionBasis} from '../assets/projection-basis.js';

const ORIGIN = 'https://tools.matthewgarner.me';
const HASH_MAX = 24000;
const TEXT_MAX = 100000;
const SHORT_HASH = 'eyJ2IjoxfQ';   // `{v:1}` — the suite's documented teaching placeholder, not an artefact
const ROLE = Object.freeze({
  paths: Object.freeze({kind:'paths', role:'Decision plan', scope:'All outcomes', basis:null}),
  roadmap: Object.freeze({kind:'roadmap', role:'Delivery roadmap', scope:'Commitment and shaped work', basis:null}),
  timeline: Object.freeze({kind:'timeline', role:'Timing forecast', scope:'P50–P90 ranges', basis:null}),
});

function copyRole(role){
  return role ? {...role} : null;
}

/* Exact canonical pages only. URL() is used as a parser, never as navigation.
   Reject query strings, credentials, ports and scheme-relative URLs so a
   familiar-looking prefix cannot earn trusted planning metadata. */
function planningTarget(value){
  if(typeof value !== 'string' || !value || value.length > HASH_MAX + 128 || /[\u0000-\u001f\u007f\\]/.test(value))
    return null;
  const relative = value.startsWith('/') && !value.startsWith('//');
  const hashAt = value.indexOf('#');
  /* URL() normalises dot segments. That is useful for navigation, but not for
     a trust label: `/tree/../paths/` must not look canonical while its pill
     says TREE. Verify the authored pathname before normalising the URL. */
  const rawPath = relative
    ? value.slice(0, hashAt < 0 ? value.length : hashAt)
    : (() => {
      const authorityEnd = value.indexOf('/', value.indexOf('://') + 3);
      return authorityEnd < 0 ? '' : value.slice(authorityEnd, hashAt < 0 ? value.length : hashAt);
    })();
  const rawMatch = /^\/(paths|roadmap|timeline)\/$/.exec(rawPath);
  if(!rawMatch) return null;
  let url;
  try{ url = new URL(value, ORIGIN); }catch(e){ return null; }
  if(url.origin !== ORIGIN || url.username || url.password || url.port || url.search) return null;
  if(!relative && !/^https:\/\//i.test(value)) return null;
  return {kind:rawMatch[1], hash:url.hash ? url.hash.slice(1) : ''};
}

export function planningRole(url){
  const target = planningTarget(url);
  return target && target.hash && target.hash !== SHORT_HASH ? copyRole(ROLE[target.kind]) : null;
}

/* Extract the one atomic basis line, then delegate to the shared grammar. */
export function parseRoadmapBasis(text){
  if(typeof text !== 'string' || text.length > TEXT_MAX) return null;
  const lines = text.split(/\r?\n/);
  const candidates = lines.map(line => line.trim()).filter(line => /^basis\s*:/i.test(line));
  if(candidates.length !== 1) return null;
  const line = candidates[0];
  const parsed = parseProjectionBasis(line.slice(line.indexOf(':') + 1).trim(), 0);
  if(parsed.error) return null;
  return {source:parsed.value.source, known:parsed.value.answered, assumed:parsed.value.assumed};
}

export async function inspectPlanningContext(url, {decode = decodeHash} = {}){
  const target = planningTarget(url);
  if(!target || !target.hash || target.hash === SHORT_HASH) return null;
  const generic = copyRole(ROLE[target.kind]);
  if(target.kind !== 'roadmap' || target.hash.length > HASH_MAX) return generic;
  let state = null;
  try{ state = await decode(target.hash); }catch(e){ return generic; }
  if(!state || typeof state !== 'object' || Array.isArray(state) || !Object.hasOwn(state, 't') || typeof state.t !== 'string') return generic;
  const basis = parseRoadmapBasis(state.t);
  return basis ? {
    kind:'roadmap', role:'Delivery projection', scope:'One exact Paths outcome', basis,
  } : generic;
}

export function projectPlanningContexts(exhibits, options){
  if(!Array.isArray(exhibits)) return Promise.resolve([]);
  return Promise.all(exhibits.map(exhibit => inspectPlanningContext(exhibit && exhibit.url, options)));
}
