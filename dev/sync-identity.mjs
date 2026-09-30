/* The website owns the pinned identity folder. Copy only on an explicit update;
   ordinary runs maintain static markup and check the shipped snapshot offline. */
import {readFileSync,writeFileSync,cpSync,existsSync,readdirSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {TOOL_DIRS,ENERGY_TOOL_DIRS} from './tool-dirs.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),check=args.includes('--check');
const from=args.indexOf('--from');
const bundle=join(root,'assets/identity');
if(from>=0){
  if(check) throw Error('--from cannot be used with --check');
  const source=resolve(args[from+1]||'');
  if(!existsSync(join(source,'identity.css'))) throw Error('Expected website/site/src/identity');
  cpSync(source,bundle,{recursive:true});
}
const files=directory=>readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(join(directory,entry.name)):[join(directory,entry.name)]);
const hashes=Object.fromEntries(files(bundle).filter(f=>!f.endsWith('/manifest.json')).sort().map(f=>[f.slice(bundle.length+1),createHash('sha256').update(readFileSync(f)).digest('hex')]));
const manifest=JSON.stringify({version:1,source:'MatthewGarner/website:site/src/identity',files:hashes},null,2)+'\n';
function save(file,content){
  if(check){if(readFileSync(file,'utf8')!==content)throw Error(`${file}: identity snapshot/markup drift; run node dev/sync-identity.mjs`);}
  else writeFileSync(file,content);
}
save(join(bundle,'manifest.json'),manifest);
// Phosphor circle-half-fill, MIT; copied from the website's installed icon library.
const icon='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24ZM40,128a88.1,88.1,0,0,1,88-88V216A88.1,88.1,0,0,1,40,128Z"/></svg>';
const personal='https://www.matthewgarner.me';
for(const page of ['home',...TOOL_DIRS,'energy',...ENERGY_TOOL_DIRS.map(x=>'energy/'+x)]){
  const path=join(root,page,'index.html');let html=readFileSync(path,'utf8');
  const energy=page.startsWith('energy'),section=energy?'energy':'tools';
  const catalogue=page==='home'||page==='energy';
  // A local collection link works for production hosts, tools-shaped previews
  // and the two-origin dev server; cross-collection links are explicit domains.
  const local=catalogue?'./':'../';
  const tools=energy?'https://tools.matthewgarner.me/':local;
  const energyHref=energy?local:'https://energy.matthewgarner.me/';
  const main=html.match(/<main\b[^>]*\bid="([^"]+)"/)?.[1]||'main';
  const header=`<!-- identity:header:start -->\n<a class="mg-skip" href="#${main}">Skip to content</a>\n<div class="mg-masthead" role="banner">\n  <a class="mg-identity" href="${personal}/">Matthew Garner</a>\n  <nav class="mg-nav" aria-label="Main navigation"><a href="${personal}/writing">Writing</a><a href="${tools}"${!energy?' aria-current="'+(catalogue?'page':'true')+'"':''}>Tools</a><a href="${energyHref}"${energy?' aria-current="'+(catalogue?'page':'true')+'"':''}>Energy</a><a href="${personal}/now">Now</a></nav>\n  <button class="mg-appearance" type="button" aria-label="Appearance: toggle light and dark mode"><span class="mg-icon" aria-hidden="true">${icon}</span></button>\n</div>\n<!-- identity:header:end -->`;
  const footer=`<!-- identity:footer:start -->\n<div class="mg-footer" role="contentinfo"><button type="button" data-mg-theme-reset>Use system appearance</button><nav aria-label="Elsewhere"><a href="${personal}/about">About</a><a href="${personal}/bookshelf">Bookshelf</a><a href="https://github.com/MatthewGarner/tools">Source on GitHub</a></nav></div>\n<!-- identity:footer:end -->`;
  const head=`<!-- identity:head:start -->\n<script src="/assets/identity/theme-init.js"></script>\n<link rel="stylesheet" href="/assets/identity/identity.css">\n<link rel="stylesheet" href="/assets/identity-tools.css">\n<script type="module" src="/assets/identity/appearance.js"></script>\n<!-- identity:head:end -->`;
  html=html.replace(/<html([^>]*)>/,(_,attrs)=>`<html${attrs.replace(/ data-mg-section="[^"]*"/,'')} data-mg-section="${section}">`);
  html=html.replace(/<body([^>]*)>/,(_,attrs)=>`<body${/class="/.test(attrs)?attrs.replace(/class="([^"]*)"/,(_,c)=>`class="${[...new Set([...c.split(' '),'mg-site'])].join(' ')}"`):attrs+' class="mg-site"'}>`);
  if(!/<main\b[^>]*\bid=/.test(html))html=html.replace(/<main\b/,'<main id="main" tabindex="-1"');
  // Tool authoring controls have a named owner, separate from global navigation.
  if(!catalogue&&!html.includes('data-tool-header'))html=html.replace(/<header\b/,'<header data-tool-header');
  if(energy&&!catalogue)html=html.replace(/\s*<div class="masthead">[\s\S]*?<\/div>/,'');
  for(const [name,block] of [['head',head],['header',header],['footer',footer]]){
    const pattern=new RegExp(`<!-- identity:${name}:start -->[\\s\\S]*?<!-- identity:${name}:end -->`);
    if(pattern.test(html))html=html.replace(pattern,block);
    else if(html.includes(`<!-- identity:${name} -->`))html=html.replace(`<!-- identity:${name} -->`,block);
    else if(name==='head')html=html.replace('</head>',block+'\n</head>');
    else if(name==='header')html=html.replace(/<body[^>]*>/,m=>m+'\n'+block);
    else html=html.replace('</body>',footer+'\n</body>');
  }
  html=html.replace(/(<meta name="theme-color"[^>]*content=")#FBFBFA/g,'$1#faf8f2').replace(/(<meta name="theme-color"[^>]*content=")#121212/g,'$1#24212c');
  save(path,html);
}
console.log(check?'Identity snapshot and all static mastheads are current.':'Updated identity snapshot and static mastheads.');
