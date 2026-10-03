import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertJSON,validateState,applyControl,validateSchema} from '../core/schema.js';
import {encodeArticleFragment,decodeArticleFragment,fullToolURL} from '../core/codec.js';
import {definitionMetadata,readExampleState,embedFragment,selectView,validateCatalogue} from '../core/definition.js';
const definition = {
  id:'example',version:1,title:'Example',description:'A bounded example.',status:'active',defaultView:'result',
  initialState:{demand:8,title:'Café → choice',weights:[1,2]},
  stateSchema:{type:'object',properties:{demand:{type:'number',minimum:.5,maximum:10,multipleOf:.5},title:{type:'string',maxLength:100},weights:{type:'array',prefixItems:[{type:'number',minimum:0},{type:'number',minimum:0}],items:false,minItems:2,maxItems:2}},required:['demand','title','weights'],additionalProperties:false},
  controls:{demand:{label:'Demand',type:'range',path:['demand'],min:.5,max:10,step:.5},weight:{label:'First weight',type:'range',path:['weights',0],min:0,max:10,step:1},reset:{label:'Clear weight',type:'action',action:'clear'}},
  actions:{clear:state=>({...state,weights:[0,state.weights[1]]})},
  views:{result:{title:'Result',description:'A result.',controls:['demand','weight','reset'],render:()=>({svg:'<svg/>',summary:'A result.'})}},
  fullTool:{url:'https://tools.matthewgarner.me/example/',encoding:'json-base64'}
};
test('bounded JSON rejects hostile shape, invalid numbers, circularity and excessive work',()=>{
  for(const value of [NaN,Infinity,undefined,new Date(),{fn(){}},JSON.parse('{"__proto__":{}}'),[,1]]) assert.throws(()=>assertJSON(value));
  const cycle={};cycle.self=cycle;assert.throws(()=>assertJSON(cycle),/circular/);
  assert.throws(()=>assertJSON({value:'éé'},{maxBytes:8}),/large/);
  assert.throws(()=>assertJSON([1,2,3],{maxNodes:3}),/too many/);
  assert.throws(()=>assertJSON({a:{b:1}},{maxDepth:1}),/deeply/);
});
test('typed state rejects coercion, unknown properties, invalid tuple positions and bounds',()=>{
  for(const changes of [{demand:'8'},{demand:0},{demand:8.1},{extra:true},{weights:[1,'2']},{weights:[1,2,3]}]) assert.throws(()=>validateState(definition,{...definition.initialState,...changes}));
  assert.doesNotThrow(()=>validateSchema(.3,{type:'number',multipleOf:.1}));
  assert.doesNotThrow(()=>validateSchema('🌿',{type:'string',maxLength:1}));
});
test('domain validation is non-mutating and controls create independent valid states',()=>{
  const initial=structuredClone(definition.initialState);
  const next=applyControl(definition,initial,'weight','3');
  assert.deepEqual(initial,definition.initialState);assert.deepEqual(next.weights,[3,2]);
  assert.deepEqual(applyControl(definition,initial,'reset').weights,[0,2]);
  for(const input of ['',null,true,'Infinity','11']) assert.throws(()=>applyControl(definition,initial,'demand',input));
  assert.throws(()=>validateState({...definition,validate:s=>{s.demand=1;}},initial),/changed/);
});
test('metadata and article settings enforce available views and controls',()=>{
  const metadata=definitionMetadata(definition);
  assert.equal(metadata.views.result.render,undefined);
  assert.deepEqual(readExampleState(definition,embedFragment({state:definition.initialState,view:'result',controls:['demand']})).controls,['demand']);
  for(const controls of [['missing'],['demand','demand'],'demand']) assert.throws(()=>selectView(definition,'result',controls));
  for(const hash of ['#%FF','#null','#'+encodeURIComponent('{"state":{},"url":"https://example.com"}')]) assert.throws(()=>readExampleState(definition,hash));
  assert.throws(()=>selectView(definition,'toString',[]));
});
test('portable article links preserve Unicode and reject wrong receivers and versions',()=>{
  const fragment=encodeArticleFragment({tool:'example',version:1,state:definition.initialState});
  assert.deepEqual(decodeArticleFragment('#'+fragment,{tool:'example'}),definition.initialState);
  assert.throws(()=>decodeArticleFragment(fragment,{tool:'other'}),/different tool/);
  assert.throws(()=>decodeArticleFragment(fragment,{tool:'example',version:2}),/unsupported version/);
  assert.throws(()=>decodeArticleFragment(fragment,{tool:'example',maxBytes:8}),/large/);
  assert.throws(()=>encodeArticleFragment({tool:['example'],version:1,state:{}}),/envelope/);
  assert.throws(()=>decodeArticleFragment('#article:_w',{tool:'example'}),/could not be read/);
});
test('native links round-trip through the real Tools decoder; target origins are restricted',async()=>{
  const {decodeHash}=await import('../../assets/series.js');
  const url=fullToolURL(definition,definition.initialState);
  assert.deepEqual(await decodeHash(new URL(url).hash.slice(1)),definition.initialState);
  assert.throws(()=>fullToolURL({...definition,fullTool:{...definition.fullTool,url:'https://evil.example/'}},{}),/approved/);
  assert.throws(()=>fullToolURL({...definition,fullTool:{...definition.fullTool,maxLength:20}},definition.initialState),/too large/);
  const lab={...definition,fullTool:{url:'https://tools.matthewgarner.me/lab/example/',encoding:'article-json-base64url'}};
  assert.deepEqual(decodeArticleFragment(new URL(fullToolURL(lab,lab.initialState)).hash,{tool:'example'}),lab.initialState);
});

test('authored controls must exist and represent the current state without silent clamping',()=>{
  const custom={...definition,initialState:{...definition.initialState,weights:[15,2]}};
  const fragment=controls=>embedFragment({state:custom.initialState,view:'result',controls});
  assert.throws(()=>readExampleState(custom,fragment(['weight'])),/maximum/);
  assert.equal(readExampleState(custom,fragment([])).state.weights[0],15);
  const defaults={...definition,views:{result:{...definition.views.result,defaultControls:['demand']}}};
  assert.deepEqual(readExampleState(defaults,'').controls,['demand']);
});

test('portable catalogue validates metadata without importing model functions',()=>{
  const modelDigest='a'.repeat(64);
  const entry={...definitionMetadata(definition),route:'/embed/example/v1/',modelDigest,definition:`embed/releases/${modelDigest}/embed/definitions/example.js`};
  const catalogue={schemaVersion:1,tools:[entry]};
  assert.equal(validateCatalogue(catalogue),catalogue);
  assert.throws(()=>validateCatalogue({...catalogue,tools:[entry,entry]}),/Duplicate/);
  for(const change of [{route:'/flow/'},{modelDigest:'../escape'},{definition:'embed/definitions/example.js'},{version:0}])assert.throws(()=>validateCatalogue({schemaVersion:1,tools:[{...entry,...change}]}));
});
test('published Flow v1 contract keeps its exact route, snapshot codec and controls',async()=>{
  const {validateLegacyExample,legacyExampleURLs}=await import('../core/legacy.js');
  const example={tool:'flow',version:1,view:'waiting-time',params:{demandPerWeek:4,itemDays:5,team:3,wipLimit:40,cov:'med'},seed:61709,controls:['demand']};
  const urls=legacyExampleURLs(example),p=example.params;
  assert.equal(urls.embedUrl,'https://tools.matthewgarner.me/embed/v1/flow/#'+encodeURIComponent(JSON.stringify({params:p,seed:61709,controls:['demand']})));
  assert.equal(new URL(urls.fullToolUrl).hash,'#'+Buffer.from(JSON.stringify({d:4,s:5,t:3,w:21,v:'med'})).toString('base64'));
  assert.throws(()=>validateLegacyExample({...example,state:{}}));
  assert.throws(()=>validateLegacyExample({...example,controls:['team']}));
  assert.throws(()=>legacyExampleURLs(example,'https://evil.example'));
});
