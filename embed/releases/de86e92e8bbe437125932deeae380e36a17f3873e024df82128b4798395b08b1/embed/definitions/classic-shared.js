/* Adapter-local schema and source helpers. No browser effects. */
export const text = (maxLength = 120, minLength = 0) => ({type:'string', minLength, maxLength});
export const num = (minimum, maximum, multipleOf) => ({type:'number', minimum, maximum, ...(multipleOf ? {multipleOf} : {})});
export const int = (minimum, maximum) => ({type:'integer', minimum, maximum});
export const choice = values => ({type:typeof values[0], enum:values});
export const array = (items, minItems, maxItems) => ({type:'array', items, minItems, maxItems});
export const object = (properties, required = Object.keys(properties)) => ({type:'object', properties, required, additionalProperties:false});
export const tuple = items => ({type:'array',prefixItems:items,items:false,minItems:items.length,maxItems:items.length});
export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const range = (label, path, min, max, step = 1) => ({type:'range', label, path, min, max, step, commit:true});
export const select = (label, path, values) => ({type:'select', label, path, options:values.map(value => ({value,label:String(value)}))});
export const fullTool = (id, extra = {}) => ({url:id.startsWith('energy-') ? 'https://energy.matthewgarner.me/' + id.slice(7) + '/' : 'https://tools.matthewgarner.me/' + id + '/', encoding:'json-base64', ...extra});
export function base(id, title, description, initialState, stateSchema, controls, views, validate){
  return {id,version:1,title,description,status:'active',defaultView:Object.keys(views)[0],initialState,stateSchema,controls,views,fullTool:fullTool(id),...(validate ? {validate} : {})};
}
export function sourceCheck(state){
  if(typeof state.t !== 'string' || state.t.length > 8000 || state.t.split('\n').length > 100 || state.t.split('\n').some(line => /^ {18}/.test(line)))
    throw new Error('Use at most 8,000 characters, 100 lines and eight indentation levels.');
}
export function sourceDefinition({id,title,description,source,views,extraState={},extraSchema={},controls={},validate}){
  return base(id,title,description,{t:source,e:0,...extraState},object({t:text(8000,1),e:choice([0]),...extraSchema}),
    {source:{label:'Example source',type:'textarea',path:['t'],maxLength:8000,commit:true},...controls},views,
    state => {sourceCheck(state);validate?.(state);});
}
export function context(ctx){
  return {...ctx, dark:ctx.dark ?? ctx.theme==='dark', today:ctx.today || '2026-10-03', edit:false,
    width:Math.max(320,Math.min(1200,ctx.width || 720)), measure:ctx.measure || ((s,font='16px') => String(s).length * (parseFloat(String(font).match(/([\d.]+)px/)?.[1]) || 16)*.52)};
}
export const sourceSummary = (name, model, detail) => name + ': ' + detail + (model.warnings?.length ? ' Source warnings: '+model.warnings.join(' ') : '') + ' Illustrative authored model.';
export const htmlStyle = '<style>.embed-classic{font:16px/1.5 system-ui,sans-serif;color:var(--ink);overflow-x:auto}.embed-classic table{border-collapse:collapse;width:100%}.embed-classic th,.embed-classic td{padding:10px;text-align:left;border-bottom:1px solid var(--border)}.embed-classic button,.embed-classic input{font:inherit;min-height:44px}.embed-classic .note{color:var(--muted);font-size:13px}</style>';

// Bound decoded model complexity too: a short DSL can contain huge numeric ranges.
export function boundedModel(model){
  const seen=new Set();
  function visit(v){
    if(typeof v==='number' && (!Number.isFinite(v)||Math.abs(v)>1e12)) throw new Error('Model numbers must be finite and no larger than one trillion.');
    if(!v||typeof v!=='object'||seen.has(v)) return;
    seen.add(v);
    if(Array.isArray(v)&&v.length>100) throw new Error('Use at most 100 model elements.');
    for(const value of Object.values(v)) visit(value);
  }
  visit(model);return model;
}
