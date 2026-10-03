/* Original Site compatibility build: same Lab code, common identity and backup.
   Never publish the repository root to Sites. The old origin retains its work. */
import {cpSync,existsSync,mkdirSync,readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const destination=process.argv[2]&&resolve(process.argv[2]);
if(!destination||existsSync(destination))throw Error('Pass a new output directory: node dev/package-lab.mjs /tmp/lab-release');
mkdirSync(destination,{recursive:true});
cpSync(join(root,'lab/dist'),destination,{recursive:true,filter:path=>!path.endsWith('.test.js')&&!path.endsWith('.md')});
const shared=['identity','identity-lab.css','identity-tools.css','suite-navigation.js','tokens.css','page.css','backup-store.js','saved-work-keys.js','backup-ui.js','backup-ui.css'];
mkdirSync(join(destination,'assets'),{recursive:true});
for(const file of shared)cpSync(join(root,'assets',file),join(destination,'assets',file),{recursive:true});
cpSync(join(root,'backup'),join(destination,'backup'),{recursive:true});
cpSync(join(root,'404.html'),join(destination,'404.html'));
cpSync(join(root,'assets/explore.css'),join(destination,'assets/explore.css'));
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
