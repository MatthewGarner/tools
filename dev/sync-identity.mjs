/* Website-owned assets stay pinned; suite markup is maintained here offline. */
import {readFileSync,writeFileSync,cpSync,existsSync,readdirSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {SUITE_PAGES} from './suite-pages.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),check=args.includes('--check'),from=args.indexOf('--from');
const bundle=join(root,'assets/identity');
if(from>=0){
  if(check)throw Error('--from cannot be used with --check');
  const source=resolve(args[from+1]||'');
  if(!existsSync(join(source,'identity.css')))throw Error('Expected website/site/src/identity');
  cpSync(source,bundle,{recursive:true});
}
const files=directory=>readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(join(directory,entry.name)):[join(directory,entry.name)]);
const hashes=Object.fromEntries(files(bundle).filter(f=>!f.endsWith('/manifest.json')).sort().map(f=>[f.slice(bundle.length+1),createHash('sha256').update(readFileSync(f)).digest('hex')]));
function save(file,content){
  if(check){if(readFileSync(file,'utf8')!==content)throw Error(`${file}: identity snapshot/markup drift; run node dev/sync-identity.mjs`);}
  else writeFileSync(file,content);
}
save(join(bundle,'manifest.json'),JSON.stringify({version:1,source:'MatthewGarner/website:site/src/identity',files:hashes},null,2)+'\n');
// Phosphor circle-half-fill, MIT; copied from the website's installed icon library.
const icon='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24ZM40,128a88.1,88.1,0,0,1,88-88V216A88.1,88.1,0,0,1,40,128Z"/></svg>';
const personal='https://www.matthewgarner.me';
for(const {page,section,catalogue,file} of SUITE_PAGES){
  const path=join(root,page,file?'':'index.html');
  if(!existsSync(path)){if(check)throw Error('Missing suite page: '+page);continue;}
  let html=readFileSync(path,'utf8');
  const energy=section==='energy',lab=section==='lab';
  const isCatalogueHome=page==='explore';
  const toolsLink=isCatalogueHome?'Tools Lab':'All tools';
  const toolsCurrent=isCatalogueHome?' aria-current="page"':'';
  const local=catalogue?'./':'../';
  const main=html.match(/<main\b[^>]*\bid="([^"]+)"/)?.[1]||'main';
  const header=`<!-- identity:header:start -->
<a class="mg-skip" href="#${main}">Skip to content</a>
<div class="mg-masthead" role="banner">
  <a class="mg-identity" href="${personal}/">Matthew Garner</a>
  <nav class="mg-nav" aria-label="Main navigation"><a href="${personal}/writing">Writing</a><a data-suite-link="explore" href="${energy?'https://tools.matthewgarner.me/':'/'}"${toolsCurrent}>${toolsLink}</a><a href="${personal}/now">Now</a></nav>
  <button class="mg-appearance" type="button" aria-label="Appearance: toggle light and dark mode"><span class="mg-icon" aria-hidden="true">${icon}</span></button>
</div>
<!-- identity:header:end -->`;
  const footer=`<!-- identity:footer:start -->
<div class="mg-footer" role="contentinfo"><button type="button" data-mg-theme-reset hidden>Use system appearance</button><nav aria-label="Elsewhere">${!catalogue&&!lab?`<a href="${energy?'../':'/'}#recent-work">Your work</a>`:''}<a data-suite-link="backup" href="/backup/">Backup &amp; restore</a>${lab?`<a href="${local}about.html">Model limits</a>`:''}<a href="${personal}/about">About</a><a href="https://github.com/MatthewGarner/tools">Source on GitHub</a></nav></div>
<!-- identity:footer:end -->`;
  const head=`<!-- identity:head:start -->
<script src="/assets/identity/theme-init.js"></script>
<link rel="stylesheet" href="/assets/identity/identity.css">
<link rel="stylesheet" href="/assets/identity-${lab?'lab':'tools'}.css">
<script type="module" src="/assets/identity/appearance.js"></script>
<script type="module" src="/assets/suite-navigation.js"></script>
<!-- identity:head:end -->`;
  html=html.replace(/<html([^>]*)>/,(_,attrs)=>`<html${attrs.replace(/ data-mg-section="[^"]*"/,'')} data-mg-section="${section}">`);
  html=html.replace(/<body([^>]*)>/,(_,attrs)=>`<body${/class="/.test(attrs)?attrs.replace(/class="([^"]*)"/,(_,c)=>`class="${[...new Set([...c.split(' '),'mg-site'])].join(' ')}"`):attrs+' class="mg-site"'}>`);
  if(!/<main\b[^>]*\bid=/.test(html))html=html.replace(/<main\b/,'<main id="main" tabindex="-1"');
  html=html.replace(/<section data-recent-work/, '<section id="recent-work" data-recent-work');
  if(!catalogue&&!lab&&!html.includes('data-tool-header'))html=html.replace(/<header\b/,'<header data-tool-header');
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
