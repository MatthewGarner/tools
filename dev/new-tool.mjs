/* A runnable tool and article view share one definition from the first commit. */
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const escape=value=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createTool({root,id,title}){
  if(typeof id!=='string'||! /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id)||id.length>64)throw Error('Use a lowercase, hyphenated tool id.');
  if(typeof title!=='string'||!title.trim()||title.length>100)throw Error('Provide a title of 1–100 characters.');
  const directory=path.join(root,id),definitionPath=path.join(root,'embed/definitions',id+'.js');
  for(const file of [directory,definitionPath])if(fs.existsSync(file))throw Error('Refusing to replace '+file);
  const definitions=path.dirname(definitionPath);
  fs.mkdirSync(definitions,{recursive:true});
  if(fs.lstatSync(definitions).isSymbolicLink())throw Error('The definitions directory cannot be a symlink.');
  fs.mkdirSync(directory);
  const files={
    [id+'/model.js']:`// Replace this starter calculation with the tool's actual pure model and view.\nexport const project=state=>({total:state.quantity*state.rate});\nexport function render(state,context){\n  const {total}=project(state),width=Math.max(260,Math.min(context.width,900));\n  const colors=context.colors;\n  return {svg:\`<svg xmlns="http://www.w3.org/2000/svg" width="\${width}" height="220" viewBox="0 0 \${width} 220" role="img" aria-label="Illustrative total"><rect width="100%" height="100%" fill="\${colors.card}"/><text x="24" y="52" font-family="system-ui" font-size="16" fill="\${colors.muted}">ILLUSTRATIVE TOTAL</text><text x="24" y="120" font-family="system-ui" font-size="48" fill="\${colors.ink}">\${total.toLocaleString('en-GB')}</text><text x="24" y="174" font-family="system-ui" font-size="16" fill="\${colors.muted}">\${state.quantity} units × \${state.rate} per unit</text></svg>\`,summary:\`\${state.quantity} units at \${state.rate} per unit gives \${total}.\`};\n}\n`,
    ['embed/definitions/'+id+'.js']:`import {render} from '../../${id}/model.js';\nexport const definition={\n  draft:true, // Remove only after replacing the starter model and completing registration/checks.\n  id:${JSON.stringify(id)},version:1,title:${JSON.stringify(title)},description:'Replace this with the decision this tool helps a reader make.',status:'active',defaultView:'result',\n  initialState:{quantity:10,rate:25},\n  stateSchema:{type:'object',properties:{quantity:{type:'integer',minimum:1,maximum:100},rate:{type:'integer',minimum:1,maximum:1000}},required:['quantity','rate'],additionalProperties:false},\n  controls:{quantity:{label:'Units',type:'range',path:['quantity'],min:1,max:100,step:1},rate:{label:'Per unit',type:'number',path:['rate'],min:1,max:1000,step:1}},\n  views:{result:{title:'Illustrative total',description:'Replace this starter view with a useful reading outcome.',controls:['quantity','rate'],defaultControls:['quantity'],render}},\n  fullTool:{url:'https://tools.matthewgarner.me/${id}/',encoding:'article-json-base64url'}\n};\n`,
    [id+'/app.js']:`import {definition} from '../embed/definitions/${id}.js';\nimport {mount} from '../embed/runtime/mount.js';\nmount(definition,undefined,{mode:'tool',moduleURL:new URL('../embed/definitions/${id}.js',import.meta.url).href});\n`,
    [id+'/index.html']:`<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/assets/icons/apple-touch-icon.png"><meta name="theme-color" content="#fafafa"><meta name="apple-mobile-web-app-capable" content="yes"><link rel="stylesheet" href="../embed/runtime/style.css"><script src="/pwa.js" defer></script><script type="module" src="./app.js"></script></head><body><main id="embed"><h1>${escape(title)}</h1><noscript>This tool needs JavaScript.</noscript></main></body></html>\n`,
    [id+'/README.md']:`# ${title}\n\nThis is an unregistered, runnable starter. Replace the model, example, labels and view with the approved product design; remove definition.draft only when ready. Both the full app and article host already consume the same definition.\n\nPreview: node dev/preview-embed.mjs ${id}, then node dev/serve.mjs 8089. Visit /${id}/ and /embed/current/${id}/.\n\nFollow docs/agent/NEW_TOOL.md and embed/README.md for registration, native design requirements, tests and release. Register the tool in the executable directory/family/numbering/origin sources and landing catalogue; the embed registration gate derives its required ids from that inventory. Add semantic model tests and a native browser journey.\n`
  };
  for(const [file,contents] of Object.entries(files))fs.writeFileSync(path.join(root,file),contents,{flag:'wx'});
  return Object.keys(files);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const [id,...words]=process.argv.slice(2);
  if(!id||!words.length)throw Error('Usage: node dev/new-tool.mjs <id> <title>');
  console.log(createTool({root:path.resolve(import.meta.dirname,'..'),id,title:words.join(' ')}).join('\n'));
}
