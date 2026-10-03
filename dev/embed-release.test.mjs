import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {TOOL_DIRS,ENERGY_TOOL_DIRS} from './tool-dirs.mjs';
import {experiments} from '../lab/dist/shared/catalog.js';
import {moduleReferences} from './module-graph.mjs';
import {STANDARD_REGISTRY,validateRegistry,loadDefinitions} from './embed-registry.mjs';
import {frozenGraph,graphDigest,references} from './embed-graph.mjs';
import {planRelease,writePlan,readReleases,syncPublished,entryFiles} from './embed-release.mjs';
import {validateCatalogue} from '../embed/core/definition.js';
const root=path.resolve(import.meta.dirname,'..');
function write(dir,file,body){fs.mkdirSync(path.dirname(path.join(dir,file)),{recursive:true});fs.writeFileSync(path.join(dir,file),body);}
function source(id,version=1){return `import {value} from '../../model/engine.js';\nexport const definition={id:'${id}',version:${version},title:'${id}',description:'A synthetic bounded fixture.',status:'active',defaultView:'result',initialState:{x:2},stateSchema:{type:'object',properties:{x:{type:'number',minimum:0,maximum:4}},required:['x'],additionalProperties:false},controls:{x:{type:'range',label:'Input',path:['x'],min:0,max:4,step:1}},views:{result:{title:'Result',description:'A synthetic result.',controls:['x'],render:s=>({svg:'<svg><text>'+value(s.x)+'</text></svg>',summary:'Illustrative fixture result.'})}},fullTool:{url:'https://tools.matthewgarner.me/${id}/',encoding:'json-base64'}};\n`;}
function fixture(t,ids=['alpha','beta']){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'embed-release-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 write(dir,'package.json','{"type":"module"}');write(dir,'model/engine.js','export const value=x=>x*2;\n');
 for(const name of ['schema','codec','definition','legacy'])write(dir,'embed/core/'+name+'.js',fs.readFileSync(path.join(root,'embed/core/'+name+'.js')));
 for(const id of ids)write(dir,'embed/definitions/'+id+'.js',source(id));
 const registry=ids.map(id=>({id,status:'active',file:'embed/definitions/'+id+'.js'}));return {dir,registry};
}
test('every registered classic, Energy and preserved Lab route owns valid article metadata and a pure graph',async()=>{
 const expected=TOOL_DIRS.length+ENERGY_TOOL_DIRS.length+experiments.length;
 assert.equal(STANDARD_REGISTRY.length,expected);assert.equal(new Set(STANDARD_REGISTRY.map(x=>x.id)).size,expected);
 const loaded=await loadDefinitions(root);assert.equal(loaded.length,expected);
 for(const e of loaded){const graph=frozenGraph(root,[e.file]);assert.ok(graph.size);assert.match(graphDigest(graph),/^[a-f0-9]{64}$/);}
});
test('catalogue/release planning is deterministic and deduplicates shared modules',async t=>{
 const {dir,registry}=fixture(t),a=await planRelease(dir,{registry}),b=await planRelease(dir,{registry});
 assert.deepEqual([...a.files],[...b.files]);assert.equal(a.newTools.length,2);validateCatalogue(a.catalogue);
 const shared=[...a.files.keys()].filter(f=>f.startsWith('embed/releases/')&&f.endsWith('/model/engine.js'));assert.equal(shared.length,1);
 writePlan(dir,a);assert.equal(readReleases(dir).length,1);syncPublished(dir,{check:true});
 const repeated=await planRelease(dir,{registry});assert.deepEqual(repeated.newTools,[]);writePlan(dir,repeated,{check:true});
 const workerEntry=[...entryFiles(a.catalogue.tools[0]).values()].map(b=>b.toString()).find(x=>x.includes('mount(definition'));
 assert.match(workerEntry,/\.\.\/\.\.\/runtime\/mount\.js/);assert.match(workerEntry,/moduleURL:new URL/);
 assert.ok(![...a.files.keys()].some(f=>f.includes('/releases/')&&f.includes('/runtime/')));
});
test('published versions refuse changed graphs and preserve earlier versions on a bump',async t=>{
 const {dir,registry}=fixture(t),first=await planRelease(dir,{registry});writePlan(dir,first);
 write(dir,'model/engine.js','export const value=x=>x*3;\n');
 await assert.rejects(planRelease(dir,{registry}),/Cannot replace published/);
 write(dir,'embed/definitions/alpha.js',source('alpha',2));
 const next=await planRelease(dir,{registry,ids:['alpha']});assert.equal(next.catalogue.tools.length,3);
 assert.deepEqual(next.catalogue.tools.find(t=>t.id==='alpha'&&t.version===1),first.catalogue.tools.find(t=>t.id==='alpha'));
 writePlan(dir,next);assert.equal(readReleases(dir).length,2);
 const original=[...first.files.keys()].find(f=>f.endsWith('/model/engine.js'));write(dir,original,'corrupted');assert.throws(()=>readReleases(dir),/Published model bytes changed/);
});
test('release preflight cannot silently repair or repoint a published route',async t=>{
 const {dir,registry}=fixture(t,['alpha']),plan=await planRelease(dir,{registry});writePlan(dir,plan);
 write(dir,'embed/alpha/v1/entry.js','import "https://example.com/wrong.js";');assert.throws(()=>syncPublished(dir),/Refusing to replace immutable/);
});
test('missing, extra and duplicate registrations fail; unregistered draft scaffolds remain usable',async t=>{
 const {dir,registry}=fixture(t,['alpha']);
 await assert.rejects(validateRegistry(dir,[...registry,...registry]),/Duplicate/);
 await assert.rejects(validateRegistry(dir,[{id:'missing',file:'embed/definitions/missing.js',status:'active'}]),/Missing/);
 write(dir,'embed/definitions/extra.js',source('extra'));await assert.rejects(validateRegistry(dir,registry),/Unregistered/);
 write(dir,'embed/definitions/extra.js',source('extra')+'definition.draft=true;');await validateRegistry(dir,registry);
 write(dir,'embed/definitions/alpha.js',source('alpha')+'definition.draft=true;');await assert.rejects(planRelease(dir,{registry}),/draft/);
});
test('invalid defaults cannot enter the catalogue',async t=>{
 const {dir,registry}=fixture(t,['alpha']);write(dir,'embed/definitions/alpha.js',source('alpha').replace('initialState:{x:2}','initialState:{x:20}'));
 await assert.rejects(planRelease(dir,{registry}),/maximum/);
});
test('graph resolves cache tags and static assets, refusing missing, escaping, dynamic and effectful dependencies',t=>{
 const {dir}=fixture(t,['alpha']);write(dir,'model/asset.svg','<svg xmlns="http://www.w3.org/2000/svg"/>');
 write(dir,'model/dependency.js','export const n=1;');write(dir,'model/engine.js',"import {n} from './dependency.js?v=1.0';export const art=new URL('./asset.svg',import.meta.url);export const value=x=>x*n;");
 const graph=frozenGraph(dir,['model/engine.js']);assert.equal(graph.size,3);
 const bad=[['./missing.js','missing dependency'],['../../escape.js','escapes'],['https://example.com/a.js','relative and local'],['node:fs','relative and local']];
 for(const [spec,reason]of bad){write(dir,'bad.js',`import '${spec}';`);assert.throws(()=>frozenGraph(dir,['bad.js']),new RegExp(reason));}
 for(const code of ["export const model=()=>import(name);","export const model=()=>fetch('/data');","export const model=()=>globalThis.fetch('/data');","export const model=()=>localStorage.getItem('work');","export const model=()=>window.location.href;"]){write(dir,'bad.js',code);assert.throws(()=>frozenGraph(dir,['bad.js']));}
 write(dir,'app.js','export const value=1;');write(dir,'bad.js',"import './app.js';");assert.throws(()=>frozenGraph(dir,['bad.js']),/Disallowed/);
 const outside=fs.mkdtempSync(path.join(os.tmpdir(),'embed-outside-'));t.after(()=>fs.rmSync(outside,{recursive:true,force:true}));write(outside,'remote.js','export const n=1;');fs.symlinkSync(path.join(outside,'remote.js'),path.join(dir,'link.js'));write(dir,'bad.js',"import './link.js';");assert.throws(()=>frozenGraph(dir,['bad.js']),/symlink/);
});
test('dependency scanner ignores prose and comments but sees code inside template interpolations',()=>{
 assert.deepEqual(references('example.js',"// import './missing.js'\nconst label='fetch( and window.location';const regex=/document[.]/;export const windowLabel=`A window into work`;"),[]);
 assert.throws(()=>references('example.js','const label=`Result ${import(dynamicName)}`;'),/dynamic/);
});


test('checked-in catalogue, releases and portable helpers match every registered definition',async()=>{
 const plan=await planRelease(root);assert.deepEqual(plan.newTools,[],'Run the release command after approved model QA.');
 validateCatalogue(plan.catalogue);writePlan(root,plan,{check:true});syncPublished(root,{check:true});
});


test('page payload graph sees compact and cache-tagged Lab imports',()=>{
 assert.deepEqual(moduleReferences('lab/dist/reframe/state.js',"import{read}from'./inquiry.js?v=0.21.0';"),['lab/dist/reframe/inquiry.js']);
});
