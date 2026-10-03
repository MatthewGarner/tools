import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {planRelease,writePlan,syncPublished} from './embed-release.mjs';
import {loadDefinitions,STANDARD_REGISTRY} from './embed-registry.mjs';
import {frozenGraph,graphDigest} from './embed-graph.mjs';
import {validateCatalogue} from '../embed/core/definition.js';
export async function main(args=process.argv.slice(2),root=path.resolve(import.meta.dirname,'..')){
 const [command='check',...ids]=args;
 if(command==='inspect'){
  const definitions=await loadDefinitions(root);
  for(const item of definitions){const graph=frozenGraph(root,[item.file]);console.log(item.id+' v'+item.metadata.version+': '+graph.size+' model/assets, '+[...graph.values()].reduce((sum,b)=>sum+b.length,0)+' bytes, '+graphDigest(graph).slice(0,12));}
  return;
 }
 if(command==='sync'){if(ids.length)throw Error('sync does not take tool IDs.');const c=syncPublished(root);if(c.tools.length)validateCatalogue(c);console.log('Synced '+c.tools.length+' published tool versions.');return;}
 if(!['check','release'].includes(command))throw Error('Usage: node dev/embed-catalogue.mjs inspect|check|sync|release [tool-id…]');
 const plan=await planRelease(root,{ids:ids.length?ids:STANDARD_REGISTRY.map(e=>e.id)});validateCatalogue(plan.catalogue);
 if(command==='check'&&plan.newTools.length)throw Error('Unpublished definitions: '+plan.newTools.join(', ')+'. Complete QA, then run the release command.');
 writePlan(root,plan,{check:command==='check'});
 if(command==='check')syncPublished(root,{check:true});
 console.log(command==='release'?'Released '+(plan.newTools.join(', ')||'no new versions')+'.':'Verified '+plan.catalogue.tools.length+' immutable tool versions.');
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)main().catch(error=>{console.error(error.message);process.exitCode=1;});
