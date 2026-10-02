import test from 'node:test';
import assert from 'node:assert/strict';
import {registerFlexibilityTools,validateAction} from './webmcp.js';
test('WebMCP rejects malformed actions before calling the visible app',()=>{
  for(const input of [null,[],{},'stage',{action:'stage'},{action:'other'},{action:'stage',dispatchMW:NaN},{action:'stage',dispatchMW:'2'},{action:'stage',acceptedOfferIds:['a','a']},{action:'stage',acceptedOfferIds:['']},{action:'stage',acceptedOfferIds:['a'],unknown:true},{action:'commit',dispatchMW:0}])assert.throws(()=>validateAction(input));
  const tools=[];let changed=0;const api={getState:()=>({slot:changed}),configure:()=>changed++,advance:()=>changed++};
  const unregister=registerFlexibilityTools(api,{documentRef:{modelContext:{registerTool:(tool,options)=>tools.push({tool,options})}},navigatorRef:null});
  assert.equal(tools.length,2);assert.equal(tools[0].tool.annotations.readOnlyHint,true);assert.equal(tools[1].tool.annotations.readOnlyHint,false);
  assert.deepEqual(tools[0].tool.execute({}),{slot:0});assert.throws(()=>tools[0].tool.execute({future:true}));assert.throws(()=>tools[1].tool.execute({action:'commit',unknown:true}));assert.equal(changed,0);
  assert.deepEqual(tools[1].tool.execute({action:'stage',acceptedOfferIds:['a'],dispatchMW:-2}),{slot:1});assert.deepEqual(tools[1].tool.execute({action:'commit'}),{slot:2});
  unregister();assert.ok(tools.every(t=>t.options.signal.aborted));
});
test('unsupported registries are harmless; both sync and async registration errors are caught',async()=>{
  assert.doesNotThrow(()=>registerFlexibilityTools({}, {documentRef:null,navigatorRef:null})());
  const failures=[];let count=0;registerFlexibilityTools({}, {documentRef:{modelContext:{registerTool(){if(count++===0)throw Error('sync');return Promise.reject(Error('async'));}}},navigatorRef:null,reportError:e=>failures.push(e.message)});
  await Promise.resolve();assert.deepEqual(failures,['sync','async']);
});
test('document registry takes priority, with navigator fallback when needed',()=>{
  let doc=0,nav=0;registerFlexibilityTools({}, {documentRef:{modelContext:{registerTool:()=>doc++}},navigatorRef:{modelContext:{registerTool:()=>nav++}}});assert.equal(doc,2);assert.equal(nav,0);
  registerFlexibilityTools({}, {documentRef:{},navigatorRef:{modelContext:{registerTool:()=>nav++}}});assert.equal(nav,2);
});
