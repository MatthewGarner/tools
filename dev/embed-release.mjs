/* Immutable model bundles; browser host and compatible transport fixes stay live. */
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {frozenGraph,graphDigest,sha256} from './embed-graph.mjs';
import {loadDefinitions,STANDARD_REGISTRY} from './embed-registry.mjs';
const readJSON=file=>JSON.parse(fs.readFileSync(file,'utf8'));
export const stableJSON=value=>JSON.stringify(value)+'\n';
const key=tool=>tool.id+'@'+tool.version;
const sortTools=tools=>tools.sort((a,b)=>a.id.localeCompare(b.id)||a.version-b.version);
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function portableFiles(root,catalogue){
 const files=new Map([['embed/portable/catalogue.json',Buffer.from(stableJSON(catalogue))]]);
 for(const name of ['schema','codec','definition','legacy']){
  const file='embed/core/'+name+'.js';if(!fs.existsSync(path.join(root,file)))throw Error('Missing portable helper '+file);
  files.set('embed/portable/'+name+'.js',fs.readFileSync(path.join(root,file)));
 }
 // No wildcard copies: adding a helper dependency must be an explicit contract change.
 return files;
}
export function readReleases(root){
 const directory=path.join(root,'embed/releases'),manifests=[];
 if(!fs.existsSync(directory))return manifests;
 for(const name of fs.readdirSync(directory).sort()){
  if(!/^[a-f0-9]{64}$/.test(name))throw Error('Unknown release directory: '+name);
  const base=path.join(directory,name),manifest=readJSON(path.join(base,'manifest.json'));
  if(manifest.schemaVersion!==1||manifest.bundleDigest!==name||!Array.isArray(manifest.files)||!Array.isArray(manifest.tools)||!Array.isArray(manifest.records))throw Error('Invalid release manifest: '+name);
  const actual=new Map();
  const onDisk=[];function list(directory,prefix=''){for(const item of fs.readdirSync(directory,{withFileTypes:true})){const file=prefix+item.name;if(item.isSymbolicLink())throw Error('Published bundles cannot contain symlinks.');if(item.isDirectory())list(path.join(directory,item.name),file+'/');else onDisk.push(file);}}list(base);
  const expected=['manifest.json',...manifest.files.map(f=>f.path)].sort();
  if(JSON.stringify(onDisk.sort())!==JSON.stringify(expected))throw Error('Published bundle contains missing or unrecorded files: '+name);
  for(const file of manifest.files){
   if(!file.path||file.path.startsWith('/')||file.path.split('/').includes('..')||actual.has(file.path))throw Error('Invalid release file inventory: '+name);
   const bytes=fs.readFileSync(path.join(base,file.path));if(bytes.length!==file.bytes||sha256(bytes)!==file.sha256)throw Error('Published model bytes changed: '+file.path);
   actual.set(file.path,bytes);
  }
  if(graphDigest(actual)!==name)throw Error('Published bundle digest mismatch: '+name);
  for(const tool of manifest.tools){
   const record=manifest.records.find(r=>r.identity===key(tool));
   const {route,modelDigest,definition,fonts,...metadata}=tool;
   if(modelDigest!==name||definition!=='embed/releases/'+name+'/embed/definitions/'+tool.id+'.js'||!record||record.metadataHash!==sha256(stableJSON(metadata)))throw Error('Published metadata changed: '+key(tool));
   const graph=frozenGraph(base,['embed/definitions/'+tool.id+'.js']);
   if(graphDigest(graph)!==record.graphDigest)throw Error('Published tool dependency graph changed: '+key(tool));
  }
  manifests.push(manifest);
 }
 const seen=new Set();for(const manifest of manifests)for(const tool of manifest.tools){if(seen.has(key(tool)))throw Error('Duplicate published tool version: '+key(tool));seen.add(key(tool));}
 return manifests;
}
export function releasedCatalogue(root){
 const tools=sortTools(readReleases(root).flatMap(m=>m.tools));
 return {schemaVersion:1,tools};
}
export function entryFiles(tool){
 const directory='embed/'+tool.id+'/v'+tool.version,relative='../../releases/'+tool.modelDigest+'/embed/definitions/'+tool.id+'.js';
 const fonts=tool.fonts??[];
 const fontExpression=fonts.length?',fonts:'+JSON.stringify(fonts.map(({file,...face})=>({...face,file}))).replace(/"file":"([^"\\]+)"/g,(_all,file)=>'url:new URL('+JSON.stringify('../../'+file.slice('embed/'.length))+',import.meta.url).href'):'';
 const entry=`import {definition} from '${relative}';\nimport {mount} from '../../runtime/mount.js';\nmount(definition,undefined,{moduleURL:new URL('${relative}',import.meta.url).href${fontExpression}});\n`;
 const html=`<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escape(tool.title)} · article example</title><link rel="stylesheet" href="../../runtime/style.css"><script type="module" src="./entry.js"></script></head><body><main id="embed"><p>Loading example…</p><noscript>This example needs JavaScript. <a href="${escape(tool.fullTool.url)}">Open the full tool</a>.</noscript></main></body></html>\n`;
 return new Map([[directory+'/index.html',Buffer.from(html)],[directory+'/entry.js',Buffer.from(entry)]]);
}
function provenance(root){
 try{return {commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim()};}
 catch{return {commit:null};}
}
export async function planRelease(root,{registry=STANDARD_REGISTRY,ids=registry.map(e=>e.id)}={}){
 const loaded=await loadDefinitions(root,registry),published=readReleases(root),old=published.flatMap(m=>m.tools),oldByKey=new Map(old.map(t=>[key(t),t])),records=new Map(published.flatMap(m=>m.records).map(r=>[r.identity,r]));
 if(new Set(ids).size!==ids.length||ids.some(id=>!registry.some(e=>e.id===id)))throw Error('Unknown or duplicate release selection.');
 const pending=[],union=new Map();
 for(const item of loaded.filter(e=>ids.includes(e.id))){
  const graph=frozenGraph(root,[item.file]),modelDigest=graphDigest(graph),existing=oldByKey.get(key(item.metadata));
  if(existing){if(records.get(key(existing))?.graphDigest!==modelDigest||records.get(key(existing))?.metadataHash!==sha256(stableJSON(item.metadata)))throw Error('Cannot replace published '+key(existing)+'; bump the definition version.');continue;}
  const previous=old.filter(t=>t.id===item.id);if(previous.some(t=>t.version>=item.metadata.version))throw Error('A new release must increase the tool version: '+item.id);
  pending.push({...item,graph,modelDigest});for(const [file,bytes]of graph)union.set(file,bytes);
 }
 const sorted=new Map([...union].sort(([a],[b])=>a.localeCompare(b))),bundleDigest=sorted.size?graphDigest(sorted):null,files=new Map();
 const newTools=[];
 for(const item of pending){
  let fonts=[];
  if(item.graph.has('assets/chapter-fonts.js')){
   const source=item.graph.get('assets/chapter-fonts.js').toString('utf8');
   const module=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
   fonts=module.FONT_FACES.map(face=>({...face,file:'embed/releases/'+bundleDigest+'/assets/fonts/'+face.file}));
  }
  const tool={...item.metadata,route:'/embed/'+item.id+'/v'+item.metadata.version+'/',definition:'embed/releases/'+bundleDigest+'/'+item.file,modelDigest:bundleDigest,...(fonts.length?{fonts}:{})};
  newTools.push(tool);for(const [file,bytes]of entryFiles(tool))files.set(file,bytes);
 }
 if(pending.length){
  const manifest={schemaVersion:1,bundleDigest,provenance:provenance(root),files:[...sorted].map(([file,bytes])=>({path:file,sha256:sha256(bytes),bytes:bytes.length})),tools:sortTools(newTools),records:pending.map(item=>({identity:key(item.metadata),graphDigest:item.modelDigest,metadataHash:sha256(stableJSON(item.metadata))}))};
  for(const [file,bytes]of sorted)files.set('embed/releases/'+bundleDigest+'/'+file,bytes);
  files.set('embed/releases/'+bundleDigest+'/manifest.json',Buffer.from(stableJSON(manifest)));
 }
 const catalogue={schemaVersion:1,tools:sortTools([...old,...newTools])};
 files.set('embed/catalogue.json',Buffer.from(stableJSON(catalogue)));
 for(const [file,bytes]of portableFiles(root,catalogue))files.set(file,bytes);
 return {files,catalogue,bundleDigest,newTools:newTools.map(key)};
}
export function writePlan(root,plan,{check=false}={}){
 // Preflight every immutable destination before writing anything. Partial writes
 // cannot repoint a published version; a byte-identical retry is safe.
 for(const [file,bytes]of plan.files){
  if(!fs.existsSync(path.join(root,file)))continue;
  const same=fs.readFileSync(path.join(root,file)).equals(bytes);
  if(!same&&/^embed\/(?:releases\/|[^/]+\/v\d+\/)/.test(file))throw Error('Refusing to replace immutable release file: '+file);
 }
 for(const [file,bytes]of plan.files){
  const target=path.join(root,file),same=fs.existsSync(target)&&fs.readFileSync(target).equals(bytes);
  if(check){if(!same)throw Error('Generated embed file is stale or missing: '+file);continue;}
  if(!same){fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);}
 }
}
export function syncPublished(root,{check=false}={}){
 const catalogue=releasedCatalogue(root),files=portableFiles(root,catalogue);files.set('embed/catalogue.json',Buffer.from(stableJSON(catalogue)));
 // Route entry bytes belong to their immutable model version as well.
 for(const tool of catalogue.tools)for(const [file,bytes]of entryFiles(tool))files.set(file,bytes);
 writePlan(root,{files},{check});return catalogue;
}
