/* Review composition preserves authored claims and legacy exhibits. No score,
   posterior, recommendation or causal claim is inferred across instruments. */
import {classifyReference} from './parse.js';
import {inspectPlanningContext} from './planning-context.js';
import {decodeHash} from '../assets/series.js';

export function project(model){
  const claims = (model.claims || []).map(claim => ({...claim, reference: claim.reference || classifyReference(claim.url)}));
  for(const exhibit of model.exhibits || []){
    if(claims.some(claim => claim.legacy && claim.srcLine === exhibit.srcLine)) continue;
    claims.push({
    ...exhibit, kind: 'claim', id: 'exhibit-' + exhibit.srcLine, basis: '',
    detail: exhibit.note || '', qualification: '', assumptions: '', fields: {}, legacy: true,
    reference: exhibit.live ? classifyReference(exhibit.url) : {safe: false, kind: 'invalid', tool: exhibit.tool || '', capture: 'none'}, planningContext: exhibit.planningContext || exhibit.context || null,
    });
  }
  return {...model, claims};
}

/* Decode only state already in the URL. A readable snapshot is not a validated
   forecast: the owning tool remains responsible for the model's semantics. */
export async function inspectReference(value, {decode = decodeHash} = {}){
  const reference = {...classifyReference(value), exactUrl: String(value || ''), planningContext: null};
  if(reference.kind !== 'tool' || reference.capture !== 'unverified') return reference;
  const hash = value.slice(value.indexOf('#') + 1);
  if(hash.length > 200000){ reference.capture = 'invalid'; return reference; }
  let state;
  try{ state = await decode(hash); }catch{ reference.capture = 'invalid'; return reference; }
  // Text instruments require source; calculators carry named inputs. A teaching
  // seed, empty object or array must never earn a captured-model label.
  const textTool = !['fermi', 'rank', 'gauge', 'alarm', 'duel', 'signal-vs-noise', 'cycles', 'risk', 'frequency', 'merit-order', 'intraday'].includes(reference.tool);
  const validObject = state && typeof state === 'object' && !Array.isArray(state);
  const meaningful = validObject && (textTool
    ? typeof state.t === 'string' && state.t.trim().length > 0
    : Object.keys(state).some(key => !['v', 'e', 'view', 'theme', 'palette'].includes(key)));
  reference.capture = meaningful ? 'captured' : 'invalid';
  if(meaningful) reference.planningContext = await inspectPlanningContext(value, {decode});
  return reference;
}

export async function inspectReview(model, options){
  const review = project(model);
  review.claims = await Promise.all(review.claims.map(async claim => ({...claim,
    reference: claim.legacy && !claim.live ? claim.reference : await inspectReference(claim.url, options),
    planningContext: await inspectPlanningContext(claim.url, options),
  })));
  review.reviews = await Promise.all((review.reviews || []).map(async entry => ({...entry,
    reference: await inspectReference(entry.url, options),
    previousReference: await inspectReference(entry.previous, options),
  })));
  return review;
}
