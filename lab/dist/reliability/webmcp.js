function allowed(input,keys){if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Input must be an object.');for(const key of Object.keys(input))if(!keys.includes(key))throw Error(`Unknown field: ${key}`);}
export function validateEdit(input){
  allowed(input,['action','sourceId','targetId','nodeId','failed']);
  if(input.action==='set_failure'){allowed(input,['action','nodeId','failed']);if(typeof input.nodeId!=='string'||!input.nodeId||typeof input.failed!=='boolean')throw Error('set_failure requires nodeId and a boolean failed.');}
  else if(['connect','disconnect'].includes(input.action)){allowed(input,['action','sourceId','targetId']);if(typeof input.sourceId!=='string'||!input.sourceId||typeof input.targetId!=='string'||!input.targetId)throw Error('Connection edits require sourceId and targetId.');}
  else throw Error('Choose set_failure, connect or disconnect.');
  return input;
}
export function registerTools(api,{documentRef=globalThis.document,navigatorRef=globalThis.navigator,reportError=()=>{}}={}){
  const registry=typeof documentRef?.modelContext?.registerTool==='function'?documentRef.modelContext:navigatorRef?.modelContext;
  if(typeof registry?.registerTool!=='function')return ()=>{};
  const lifecycle=new AbortController();
  const tools=[{name:'reliability_read_map',title:'Read the dependency map',description:'Read the current dependency graph, forced failures, nominal and conditioned availability, and deterministic live path state. Names may be user-authored.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute(input){allowed(input,[]);return api.getState();}},
    {name:'reliability_change_map',title:'Change a dependency or injected failure',description:'Use set_failure to hold a component down or restore it; connect to make targetId depend on sourceId; disconnect to remove that dependency. These use the same visible edits, preserve undo, and reject cycles or invalid IDs.',inputSchema:{type:'object',properties:{action:{type:'string',enum:['set_failure','connect','disconnect']},nodeId:{type:'string'},failed:{type:'boolean'},sourceId:{type:'string'},targetId:{type:'string'}},required:['action'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute(input){const v=validateEdit(input);if(v.action==='set_failure')api.setFailure(v.nodeId,v.failed);else api[v.action](v.sourceId,v.targetId);return api.getState();}}];
  for(const tool of tools)try{Promise.resolve(registry.registerTool(tool,{signal:lifecycle.signal})).catch(reportError);}catch(error){reportError(error);}
  return ()=>lifecycle.abort();
}
