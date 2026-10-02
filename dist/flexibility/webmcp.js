function object(input){if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Input must be an object.');}
function keys(input,allowed){object(input);for(const key of Object.keys(input))if(!allowed.includes(key))throw Error(`Unknown input field: ${key}`);}
export function validateAction(input){
  object(input);
  if(input.action==='commit'){keys(input,['action']);return {action:'commit'};}
  if(input.action!=='stage')throw Error('Action must be stage or commit.');
  keys(input,['action','acceptedOfferIds','dispatchMW']);
  if(!('acceptedOfferIds' in input)&&!('dispatchMW' in input))throw Error('Stage requires acceptedOfferIds or dispatchMW.');
  if('acceptedOfferIds' in input&&(!Array.isArray(input.acceptedOfferIds)||input.acceptedOfferIds.some(id=>typeof id!=='string'||!id)||new Set(input.acceptedOfferIds).size!==input.acceptedOfferIds.length))throw Error('acceptedOfferIds must contain unique non-empty strings.');
  if('dispatchMW' in input&&(typeof input.dispatchMW!=='number'||!Number.isFinite(input.dispatchMW)))throw Error('dispatchMW must be a finite number.');
  return input;
}
export function registerFlexibilityTools(api,{documentRef=globalThis.document,navigatorRef=globalThis.navigator,reportError=()=>{}}={}){
  const context=typeof documentRef?.modelContext?.registerTool==='function'?documentRef.modelContext:navigatorRef?.modelContext;
  if(typeof context?.registerTool!=='function')return ()=>{};
  const lifecycle=new AbortController();
  const definitions=[{
    name:'flexibility_read_state',title:'Read the visible battery day',description:'Read the same revealed prices, current offers, firm promises and feasible dispatch range shown in the operating-day experiment. Only the declared information condition is included: current prices alone, or the explicitly announced next-hour price. Later prices and offers are excluded.',
    inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},
    execute(input){keys(input,[]);return api.getState();}
  },{
    name:'flexibility_stage_or_commit_hour',title:'Stage decisions or commit this hour',description:'Stage replaces current tentative offer selections and/or battery dispatch, without advancing time. Commit makes the staged promises firm, settles this hour and reveals the next price. Read state first; only current visible offers and feasible dispatch are accepted. Cannot stage changes during a fixed-policy replay.',
    inputSchema:{type:'object',properties:{action:{type:'string',enum:['stage','commit']},acceptedOfferIds:{type:'array',items:{type:'string',minLength:1},uniqueItems:true},dispatchMW:{type:'number',minimum:-4,maximum:4}},required:['action'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},
    execute(input){const action=validateAction(input);if(action.action==='commit')api.advance();else api.configure(action);return api.getState();}
  }];
  for(const tool of definitions){try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(reportError);}catch(error){reportError(error);}}
  return ()=>lifecycle.abort();
}
