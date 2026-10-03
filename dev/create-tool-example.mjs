/* Render a frozen model once, then publish its immutable article manifest/image pair. */
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {validateCatalogue,selectView,validateControls,embedFragment} from '../embed/core/definition.js';
import {validateState} from '../embed/core/schema.js';
import {startServer} from './pw/session.mjs';
const root=path.resolve(import.meta.dirname,'..');
const [tool,id,...args]=process.argv.slice(2),options={};
for(let i=0;i<args.length;i++){
  const key=args[i];
  if(!['--content','--version','--view','--state','--controls','--title','--summary','--alt','--width'].includes(key)||options[key]!==undefined||!args[i+1]||args[i+1].startsWith('--'))throw Error('Unknown, duplicate or incomplete option: '+key);
  options[key]=args[++i];
}
if(!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(tool??'')||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id??'')||!options['--content'])throw Error('Usage: node dev/create-tool-example.mjs <tool-id> <example-id> --content <website/content> [--version N] [--view name] [--state state.json] [--controls a,b|none] [--title text] [--summary text] [--alt text] [--width 900]');
const width=Number(options['--width']??900);
if(!Number.isSafeInteger(width)||width<320||width>1600)throw Error('Illustration width must be 320–1600 pixels.');
const catalogue=validateCatalogue(JSON.parse(fs.readFileSync(path.join(root,'embed/catalogue.json'),'utf8')));
const entries=catalogue.tools.filter(entry=>entry.id===tool&&(!options['--version']||entry.version===Number(options['--version']))).sort((a,b)=>b.version-a.version),entry=entries[0];
if(!entry)throw Error('No released version matches this tool. Release its definition first.');
const {definition}=await import(pathToFileURL(path.join(root,entry.definition)));
const supplied=options['--state']?JSON.parse(fs.readFileSync(options['--state'],'utf8')):definition.initialState;
const state=validateState(definition,supplied);
const requested=options['--controls']===undefined?undefined:options['--controls']==='none'?[]:options['--controls'].split(',');
const selection=selectView(definition,options['--view'],requested);
validateControls(definition,state,selection.controls);
const content=path.resolve(options['--content']);
if(!fs.statSync(content).isDirectory())throw Error('The content directory does not exist.');
const imageRelative='assets/tool-examples/'+id+'.png',imagePath=path.join(content,imageRelative),manifestPath=path.join(content,'tool-examples',id+'.json');
for(const file of [imagePath,manifestPath])if(fs.existsSync(file))throw Error('Published snapshots are immutable; choose a new example id. Existing file: '+file);
for(const directory of [path.join(content,'assets'),path.dirname(imagePath),path.dirname(manifestPath)]){
  fs.mkdirSync(directory,{recursive:true});
  if(fs.lstatSync(directory).isSymbolicLink())throw Error('Example output directories cannot be symlinks.');
}
const require=createRequire(path.join(root,'dev/pw/package.json'));
let chromium;
try{({chromium}=require('playwright'));}catch{throw Error('Install the browser harness first: npm ci --prefix dev/pw');}
const server=await startServer();let browser;
try{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width,height:1000},deviceScaleFactor:1,colorScheme:'light',reducedMotion:'reduce',serviceWorkers:'block'}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(server.base+entry.route+embedFragment({state,view:selection.id,controls:selection.controls}));
  await page.waitForFunction(()=>document.querySelector('#embed')?.dataset.embedState==='ready'||document.querySelector('[role="alert"]:not([hidden])'),{},{timeout:30000});
  if(await page.locator('#embed').getAttribute('data-embed-state')!=='ready')throw Error(await page.locator('[role="alert"]').innerText());
  // The accessible transcript is in collapsed details; innerText can be empty.
  const summary=(await page.locator('.embed-summary').textContent()).trim();
  const clip=await page.evaluate(async()=>{
    const stage=document.querySelector('.embed-stage');document.querySelector('#embed').style.overflow='visible';
    stage.style.maxHeight='none';stage.style.overflow='visible';
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const box=stage.getBoundingClientRect();
    return {x:box.x+scrollX,y:box.y+scrollY,width:Math.ceil(Math.max(box.width,stage.scrollWidth)),height:Math.ceil(Math.max(box.height,stage.scrollHeight))};
  });
  if(clip.width*clip.height>24000000||clip.height>20000)throw Error('This view is too large for an article illustration; use a smaller state or focused view.');
  const png=await page.screenshot({type:'png',clip,animations:'disabled',captureBeyondViewport:true});
  if(errors.length)throw Error('The illustration raised a browser error: '+errors.join('; '));
  const example={tool:definition.id,version:definition.version,view:selection.id,state,controls:selection.controls,title:options['--title']??definition.title+' — '+selection.view.title,summary:options['--summary']??summary,image:'/'+imageRelative,alt:options['--alt']??summary};
  for(const field of ['title','summary','alt'])if(!example[field].trim())throw Error('Provide a nonempty '+field+'.');
  fs.writeFileSync(imagePath,png,{flag:'wx'});
  try{fs.writeFileSync(manifestPath,JSON.stringify(example,null,2)+'\n',{flag:'wx'});}catch(error){fs.unlinkSync(imagePath);throw error;}
  console.log(JSON.stringify({manifest:manifestPath,image:imagePath,tool:tool,version:definition.version,view:selection.id,modelDigest:entry.modelDigest,pixels:[clip.width,clip.height]},null,2));
}finally{await browser?.close();server.stop();}
