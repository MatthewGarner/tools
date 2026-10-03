/* The executable product inventories are the registration requirement. Browser
   entries import one explicit leaf; this Node-only registry never ships a loader. */
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {TOOL_DIRS,ENERGY_TOOL_DIRS} from './tool-dirs.mjs';
import {experiments} from '../lab/dist/shared/catalog.js';
import {definitionMetadata,selectView,validateControls} from '../embed/core/definition.js';
import {sha256} from './embed-graph.mjs';
export const STANDARD_REGISTRY=Object.freeze([
 ...TOOL_DIRS.map(id=>({id,status:'active',file:'embed/definitions/'+id+'.js'})),
 ...ENERGY_TOOL_DIRS.map(route=>({id:'energy-'+route,status:'active',file:'embed/definitions/energy-'+route+'.js'})),
 ...experiments.map(tool=>({id:'lab-'+tool.route,status:tool.status??'active',file:'embed/definitions/lab-'+tool.route+'.js'})),
].map(Object.freeze));
export async function validateRegistry(root,registry=STANDARD_REGISTRY){
 const ids=new Set(),paths=new Set();
 for(const e of registry){
  if(!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(e.id)||e.file!=='embed/definitions/'+e.id+'.js')throw Error('Invalid definition registration: '+e.id);
  if(ids.has(e.id)||paths.has(e.file))throw Error('Duplicate definition registration: '+e.id);
  if(!fs.existsSync(path.join(root,e.file)))throw Error('Missing article definition: '+e.id);
  ids.add(e.id);paths.add(e.file);
 }
 const directory=path.join(root,'embed/definitions');
 for(const file of fs.readdirSync(directory).filter(f=>f.endsWith('.js'))){
  const source=fs.readFileSync(path.join(directory,file),'utf8');
  if(/\bexport\s+(?:const|let|var)\s+definition\b|\bexport\s*\{[^}]*\bdefinition\b/.test(source)&&!paths.has('embed/definitions/'+file)){const url=pathToFileURL(path.join(directory,file));url.search='source='+sha256(source);const {definition}=await import(url.href);if(definition?.draft!==true)throw Error('Unregistered article definition: '+file);}
 }
 return registry;
}
export async function loadDefinitions(root,registry=STANDARD_REGISTRY){
 await validateRegistry(root,registry);const result=[];
 for(const entry of registry){
  const file=path.join(root,entry.file),url=pathToFileURL(file);url.search='source='+sha256(fs.readFileSync(file));
  const {definition}=await import(url.href);if(definition?.draft===true)throw Error('Cannot release draft definition: '+entry.id);const metadata=definitionMetadata(definition);
  if(metadata.id!==entry.id||metadata.status!==entry.status)throw Error('Definition identity/status disagrees with product inventory: '+entry.id);
  const selected=selectView(definition);validateControls(definition,definition.initialState,selected.controls);
  result.push({...entry,definition,metadata});
 }
 return result;
}
