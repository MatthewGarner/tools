/* Conservative static module graph for published models. Unlike the page walker,
   an unresolved import or an effectful application dependency is a release error. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const moduleExtensions=new Set(['.js','.mjs']);
const assetExtensions=new Set(['.svg','.png','.webp','.jpg','.jpeg','.woff2','.json','.css']);
const blockedFile=/(?:^|\/)(?:app(?:-common)?|snapshots|store|storage|session|relay-client|pwa|sw|service-worker|recent-ui|work-metadata|template-store|project-worker)\.(?:m?js)$/;
const blockedCalls=new Set(['fetch','XMLHttpRequest','WebSocket','EventSource','Worker','SharedWorker','eval','Function']);
const blockedGlobals=new Set(['document','localStorage','sessionStorage','indexedDB','navigator']);

// Lex only what dependency/isolation checks need. Literal text and comments are
// not code: a chart about a "window" or an XSS fixture is not a browser effect.
export function tokens(source){
 const out=[];let i=0;
 function scan(endBrace=false){let depth=0;
  while(i<source.length){let c=source[i];
   if(/\s/.test(c)){i++;continue;}
   if(source.startsWith('//',i)){i=source.indexOf('\n',i);if(i<0)i=source.length;continue;}
   if(source.startsWith('/*',i)){const end=source.indexOf('*/',i+2);if(end<0)throw Error('Unclosed module comment.');i=end+2;continue;}
   if(c==='"'||c==="'"){const quote=c;let value='';i++;while(i<source.length&&source[i]!==quote){if(source[i]==='\\'){value+='\\'+(source[++i]??'');i++;}else value+=source[i++];}if(source[i]!==quote)throw Error('Unclosed module string.');i++;out.push({kind:'string',value});continue;}
   if(c==='`'){i++;out.push({kind:'template',value:'`'});while(i<source.length){if(source[i]==='\\'){i+=2;continue;}if(source[i]==='`'){i++;break;}if(source.startsWith('${',i)){i+=2;scan(true);continue;}i++;}continue;}
   const previous=out.at(-1)?.value;
   if(c==='/' && (!previous||['(','[','{','=',':',',','!','?',';','return','=>','&&','||'].includes(previous))){let cls=false;i++;while(i<source.length){if(source[i]==='\\'){i+=2;continue;}if(source[i]==='[')cls=true;if(source[i]===']')cls=false;if(source[i]==='/'&&!cls){i++;break;}i++;}while(/[a-z]/i.test(source[i]??''))i++;out.push({kind:'regex',value:'/regexp/'});continue;}
   if(/[A-Za-z_$]/.test(c)){const start=i++;while(/[A-Za-z0-9_$]/.test(source[i]??''))i++;out.push({kind:'word',value:source.slice(start,i)});continue;}
   if(/[0-9]/.test(c)){const start=i++;while(/[0-9a-fA-F.xX_]/.test(source[i]??''))i++;out.push({kind:'number',value:source.slice(start,i)});continue;}
   if(c==='{'&&endBrace)depth++;if(c==='}'&&endBrace){if(!depth){i++;return;}depth--;}
   const pair=source.slice(i,i+2);if(['=>','&&','||','?.'].includes(pair)){out.push({kind:'punct',value:pair});i+=2;}else{out.push({kind:'punct',value:c});i++;}
  }
 }
 scan();return out;
}
export function references(file,source){
 const ts=tokens(source),refs=[];
 const localWindow=ts.some((t,i)=>t.value==='window'&&(['const','let','var'].includes(ts[i-1]?.value)||ts[i+1]?.value==='=>')) || /\(\s*window(?:\s*,[^)]*)?\)\s*=>/.test(source);
 const add=(token,kind)=>{if(token?.kind!=='string'||token.value.includes('\\'))throw Error(file+': dependency must be a literal, unescaped local path.');refs.push({specifier:token.value,kind});};
 for(let i=0;i<ts.length;i++){
  const t=ts[i],v=t.value,next=ts[i+1]?.value;
  if(t.kind!=='word')continue;
  if(v==='import'){
   if(next==='.')continue;
   if(next==='('){if(ts[i+2]?.kind!=='string'||ts[i+3]?.value!==')')throw Error(file+': unresolved dynamic import.');add(ts[i+2],'module');continue;}
   if(ts[i+1]?.kind==='string'){add(ts[i+1],'module');continue;}
   let j=i+1;while(j<ts.length&&ts[j].value!=='from'&&ts[j].value!==';')j++;
   if(ts[j]?.value!=='from')throw Error(file+': unresolved module import.');add(ts[j+1],'module');
  }
  if(v==='export'&&['{','*'].includes(next)){
   let j=i+1;while(j<ts.length&&ts[j].value!=='from'&&ts[j].value!==';')j++;
   if(ts[j]?.value==='from')add(ts[j+1],'module');
  }
  if(v==='URL'&&ts[i-1]?.value==='new'){
   const tail=ts.slice(i+1,i+24).map(t=>t.value).join('');
   // URL parsing alone is pure; only import.meta.url denotes a module asset.
   if(tail.split(')')[0].includes('import.meta.url')){
    if(next!=='('||ts[i+3]?.value!==','||ts.slice(i+4,i+9).map(t=>t.value).join('')!=='import.meta.url')throw Error(file+': unresolved resource URL.');
    add(ts[i+2],'asset');
   }
  }
  if(blockedGlobals.has(v)&&['.','?.','['].includes(next))throw Error(file+': browser/storage dependency '+v+' is not a pure model.');
  if(blockedCalls.has(v)&&next==='(')throw Error(file+': effectful '+v+' dependency is not allowed.');
  if(v==='window'&&ts[i-1]?.value!=='.'&&!localWindow&&['.','?.','['].includes(next))throw Error(file+': window access is not a pure model.');
 }
 return refs;
}
function resolve(root,from,specifier){
 if(!specifier.startsWith('./')&&!specifier.startsWith('../'))throw Error(from+': dependency must be relative and local: '+specifier);
 if(/[\\\0#]/.test(specifier)||specifier.includes('?')&&!/\?v=[a-zA-Z0-9._-]+$/.test(specifier))throw Error(from+': invalid dependency path: '+specifier);
 specifier=specifier.split('?')[0];
 const rel=path.posix.normalize(path.posix.join(path.posix.dirname(from),specifier));
 if(rel.startsWith('../')||path.posix.isAbsolute(rel))throw Error(from+': dependency escapes the repository.');
 const target=path.join(root,rel);let real;
 try{real=fs.realpathSync(target);}catch{throw Error(from+': missing dependency '+rel);}
 const relative=path.relative(fs.realpathSync(root),real);
 if(relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error(from+': dependency escapes through a symlink.');
 if(!fs.statSync(real).isFile())throw Error(from+': dependency is not a file: '+rel);
 return rel;
}
export function frozenGraph(root,entries,{assets=[]}={}){
 const files=new Map();
 function walk(file){
  if(files.has(file))return;
  if(file.startsWith('../')||path.isAbsolute(file)||blockedFile.test(file))throw Error('Disallowed model dependency: '+file);
  const verified=resolve(root,'__entry__.js','./'+file),bytes=fs.readFileSync(path.join(root,verified));files.set(file,bytes);
  if(!moduleExtensions.has(path.extname(file))){
   if(path.extname(file)==='.css')for(const m of bytes.toString('utf8').matchAll(/(?:url\(\s*|@import\s+)['"]?([^'"\s)]+)['"]?\s*\)?/g)){if(!m[1].startsWith('data:'))walk(resolve(root,file,m[1]));}
   return;
  }
  const source=bytes.toString('utf8');for(const ref of references(file,source)){
   const next=resolve(root,file,ref.specifier),ext=path.extname(next);
   if(ref.kind==='module'&&!moduleExtensions.has(ext))throw Error(file+': unsupported module dependency '+next);
   if(ref.kind==='asset'&&!moduleExtensions.has(ext)&&!assetExtensions.has(ext))throw Error(file+': unsupported static asset '+next);
   walk(next);
  }
 }
 for(const file of [...entries,...assets])walk(file);
 // The pure registry deliberately builds font URLs from filenames. Treat this
 // declared finite resource list as data, not an unresolved runtime fetch.
 // Some native renderers name the registered families directly rather than
 // importing the typography helper. Freeze those faces before measuring too.
 if(!files.has('assets/chapter-fonts.js')&&[...files].some(([file,bytes])=>moduleExtensions.has(path.extname(file))&&/DM Sans|Instrument Serif/.test(bytes.toString('utf8'))))walk('assets/chapter-fonts.js');
 if(files.has('assets/chapter-fonts.js')){
  const source=files.get('assets/chapter-fonts.js').toString('utf8');
  for(const m of source.matchAll(/file:\s*'([^']+\.woff2)'/g))walk('assets/fonts/'+m[1]);
 }
 return new Map([...files].sort(([a],[b])=>a.localeCompare(b)));
}
export function graphDigest(files){return sha256([...files].map(([name,bytes])=>name+'\0'+sha256(bytes)+'\n').join(''));}
