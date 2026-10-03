import {decodeArticleFragment,encodeArticleFragment} from '../../../embed/core/codec.js';
import {validateState} from '../../../embed/core/schema.js';
import {saveTrackedWork} from './work-storage.js';
const sessions=new Map();
const copy=value=>structuredClone(value);
const isArticle=hash=>String(hash).startsWith('#article:');
async function example(route,hash){
 if(!/^[a-z][a-z-]*$/.test(route))throw Error('Unknown article tool.');
 const module=await import(`../../../embed/definitions/lab-${route}.js`);
 let decoded,matched=false,decodeError;
 // A released older example may have an explicit native migration. Never
 // accept unknown versions just because their state resembles the new shape.
 for(const version of [module.definition.version,...Object.keys(module.articleMigrations||{}).map(Number)]){
  try{decoded=decodeArticleFragment(hash,{tool:'lab-'+route,version});}catch(error){decodeError??=error;continue;}
  if(version!==module.definition.version)decoded=module.articleMigrations[version](decoded);
  matched=true;break;
 }
 if(!matched)throw decodeError;
 const state=validateState(module.definition,decoded);
 return{module,state};
}
function notice(message,error=false){const el=document.createElement('aside');el.className='lab-archive-notice';el.dataset.articleExample='';el.textContent=message;if(error)el.setAttribute('role','alert');const header=document.querySelector('.mg-masthead');if(header)header.after(el);else document.body.prepend(el);}
// The native application owns saved-work recovery and import semantics. Persist
// its additive result before consuming the fragment, so reload cannot lose work.
export async function receiveArticleWorkspace({route,state,key,append,paused=false},env=globalThis){
 if(!isArticle(env.location?.hash))return{state,imported:false};
 try{
  if(paused)throw Error('Recover saved work before importing this example.');
  const {state:workspace}=await example(route,env.location.hash);
  const next=append(copy(state),copy(workspace),'article-'+env.crypto.randomUUID());
  saveTrackedWork(env.localStorage,key,JSON.stringify(next));
  env.history.replaceState(env.history.state,'',env.location.pathname+env.location.search);
  return{state:next,imported:true};
 }catch(error){return{state,imported:false,error:'Article example could not be imported: '+error.message};}
}
// Model tools own one current-state slot. Article sessions never replace it.
// Only this explicitly registered key is redirected; other work stays native.
export async function prepareArticleModel(route,key,env=globalThis){
 if(!isArticle(env.location?.hash))return false;
 try{
  const {module,state}=await example(route,env.location.hash);
  if(!module.toToolState||!module.fromToolState)throw Error('This model has no article handoff.');
  const native=module.toToolState(copy(state));
  validateState(module.definition,module.fromToolState(copy(native)));
  sessions.set(key,{module,state,native,env});
  if(env===globalThis)notice('Article example · changes stay in this example.');
  return true;
 }catch(error){sessions.set(key,{rejected:true});if(env===globalThis)notice('Article example could not be opened: '+error.message,true);return false;}
}
export function readArticleStore(key){const entry=sessions.get(key);return entry&&!entry.rejected?{found:true,value:copy(entry.native)}:{found:false};}
export function readArticleRaw(key){const entry=readArticleStore(key);return entry.found?JSON.stringify(entry.value):localStorage.getItem(key);}
export function writeArticleStore(key,value){
 const entry=sessions.get(key);if(!entry)return{handled:false};if(entry.rejected)return{handled:true,saved:false};
 try{const state=validateState(entry.module.definition,entry.module.fromToolState(copy(value)));
  const fragment=encodeArticleFragment({tool:entry.module.definition.id,version:entry.module.definition.version,state});
  entry.env.history.replaceState(entry.env.history.state,'',entry.env.location.pathname+entry.env.location.search+'#'+fragment);
  entry.state=state;entry.native=copy(value);return{handled:true,saved:true};
 }catch{return{handled:true,saved:false};}
}
