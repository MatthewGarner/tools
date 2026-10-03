/* Generate a development-only entry using the same definition and host as releases. */
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {FONT_FACES} from '../assets/chapter-fonts.js';
import {definitionMetadata} from '../embed/core/definition.js';
const root=path.resolve(import.meta.dirname,'..');
const id=process.argv[2];
if(!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id??''))throw Error('Usage: node dev/preview-embed.mjs <tool-id>');
const {definition}=await import(pathToFileURL(path.join(root,'embed/definitions',id+'.js')));
definitionMetadata(definition);
const fonts=FONT_FACES.map(face=>({...face,url:'/assets/fonts/'+face.file}));
const directory=path.join(root,'embed/current',id);
fs.mkdirSync(directory,{recursive:true});
const escape=text=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
fs.writeFileSync(path.join(directory,'index.html'),`<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escape(definition.title)} · article example</title><link rel="stylesheet" href="../../runtime/style.css"><script type="module" src="./entry.js"></script></head><body><main id="embed"><p>Loading example…</p><noscript>This example needs JavaScript. <a href="${escape(definition.fullTool.url)}">Open the full tool</a>.</noscript></main></body></html>\n`);
fs.writeFileSync(path.join(directory,'entry.js'),`import {definition} from '../../definitions/${id}.js';\nimport {mount} from '../../runtime/mount.js';\nmount(definition,undefined,{moduleURL:new URL('../../definitions/${id}.js',import.meta.url).href,fonts:${JSON.stringify(fonts)}});\n`);
console.log('/embed/current/'+id+'/');
