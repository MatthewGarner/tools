/* Original Site compatibility build: same Lab code, common identity and backup.
   Never publish the repository root to Sites. The old origin retains its work. */
import {cpSync,existsSync,mkdirSync,readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,join,dirname,posix} from 'node:path';
import {frozenGraph,references} from './embed-graph.mjs';
import {experiments} from '../lab/dist/shared/catalog.js';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const destination=process.argv[2]&&resolve(process.argv[2]);
if(!destination||existsSync(destination))throw Error('Pass a new output directory: node dev/package-lab.mjs /tmp/lab-release');
mkdirSync(destination,{recursive:true});
cpSync(join(root,'lab/dist'),destination,{recursive:true,filter:path=>!path.endsWith('.test.js')&&!path.endsWith('.md')});
const shared=['identity','identity-lab.css','identity-tools.css','suite-navigation.js','tokens.css','page.css','backup-store.js','saved-work-keys.js','backup-ui.js','backup-ui.css','template-store.js','template-ui.js','template-ui.css','work-metadata.js','work-reference.js','recent-store.js'];
mkdirSync(join(destination,'assets'),{recursive:true});
for(const file of shared)cpSync(join(root,'assets',file),join(destination,'assets',file),{recursive:true});
cpSync(join(root,'backup'),join(destination,'backup'),{recursive:true});
cpSync(join(root,'404.html'),join(destination,'404.html'));
cpSync(join(root,'assets/explore.css'),join(destination,'assets/explore.css'));
// Ship only the current Lab receiver's pure dependencies. The standalone Site
// flattens lab/dist to /, so definition imports must follow that same mapping.
// frozenGraph refuses app/storage dependencies and unresolved dynamic imports.
const articleEntries=['embed/core/codec.js','embed/core/schema.js',...experiments.map(tool=>'embed/definitions/lab-'+tool.route+'.js')];
const articleGraph=frozenGraph(root,articleEntries);
const standalonePath=file=>file.startsWith('lab/dist/')?file.slice('lab/dist/'.length):file;
for(const [file,bytes]of articleGraph){
  if(file.startsWith('lab/dist/'))continue; // Already copied, at the original Site route.
  let source=bytes;
  if(/\.m?js$/.test(file)){
    source=bytes.toString('utf8');
    for(const {specifier}of references(file,source)){
      const [module,cache]=specifier.split('?');
      const target=standalonePath(posix.normalize(posix.join(posix.dirname(file),module)));
      let adjusted=posix.relative(posix.dirname(standalonePath(file)),target);
      if(!adjusted.startsWith('.'))adjusted='./'+adjusted;
      if(cache)adjusted+='?'+cache;
      for(const quote of ["'",'"'])source=source.replaceAll(quote+specifier+quote,quote+adjusted+quote);
    }
  }
  const target=join(destination,standalonePath(file));mkdirSync(dirname(target),{recursive:true});writeFileSync(target,source);
}
// The one finite dynamic loader stays live; it targets only the 24 copied Lab
// definitions. Use a valid relative path after flattening, including off-origin.
const receiver=join(destination,'shared/article-import.js');
writeFileSync(receiver,readFileSync(receiver,'utf8').replaceAll('../../../embed/','../embed/'));
function adapt(directory){
  for(const entry of readdirSync(directory,{withFileTypes:true})){
    const path=join(directory,entry.name);
    if(entry.isDirectory())adapt(path);
    else if(entry.name.endsWith('.html')){
      let html=readFileSync(path,'utf8');
      for(const [section,url] of Object.entries({explore:'https://tools.matthewgarner.me/',tools:'https://tools.matthewgarner.me/product/',energy:'https://energy.matthewgarner.me/',lab:'/'}))
        html=html.replace(new RegExp('(data-suite-link="'+section+'" href=")[^"]*"','g'),'$1'+url+'"');
      writeFileSync(path,html);
    }
  }
}
adapt(destination);
writeFileSync(join(destination,'release.json'),JSON.stringify({component:'thinking-lab',version:JSON.parse(readFileSync(join(root,'lab/package.json'),'utf8')).version},null,2)+'\n');
console.log('Prepared standalone Lab at '+destination);
