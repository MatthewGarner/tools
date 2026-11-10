import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,readdirSync,existsSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {frozenGraph} from './embed-graph.mjs';
import {experiments} from '../lab/dist/shared/catalog.js';
const root=new URL('../',import.meta.url);
test('the original Lab package contains a closed current receiver graph without the wider tools applications',t=>{
 const temporary=mkdtempSync(join(tmpdir(),'lab-article-package-'));t.after(()=>rmSync(temporary,{recursive:true,force:true}));const site=join(temporary,'site');
 execFileSync(process.execPath,['dev/package-lab.mjs',site],{cwd:root});
 const entries=['embed/core/codec.js',...experiments.map(x=>'embed/definitions/lab-'+x.route+'.js')],graph=frozenGraph(site,entries);
 for(const x of experiments){assert.ok(existsSync(join(site,x.route,'app.js')));assert.ok(graph.has('embed/definitions/lab-'+x.route+'.js'));}
 assert.deepEqual(readdirSync(join(site,'embed')).sort(),['core','definitions']);
 assert.deepEqual(readdirSync(join(site,'embed/definitions')).sort(),['_lab.js',...experiments.map(x=>'lab-'+x.route+'.js')].sort());
 assert.ok(!existsSync(join(site,'lab')),'flattened native models are reused, not duplicated');
 for(const directory of ['energy','flow','tree','dev','embed/runtime','embed/releases'])assert.ok(!existsSync(join(site,directory)),directory+' must not ship');
 const receiver=readFileSync(join(site,'shared/article-import.js'),'utf8');assert.match(receiver,/from '\.\.\/embed\/core\/codec\.js'/);assert.match(receiver,/import\(`\.\.\/embed\/definitions\/lab-\$\{route\}\.js`\)/);
 assert.ok([...graph.keys()].some(file=>file==='knowledge/engine.js'),'definitions still reuse the native Lab engine');
 assert.ok(![...graph.keys()].some(file=>file.endsWith('/app.js')),'the article model graph excludes app entry points');
 assert.match(readFileSync(join(site,'authority/view.js'),'utf8'),/from '\.\.\/embed\/definitions\/_lab\.js'/);
 assert.match(readFileSync(join(site,'model-kit/session.js'),'utf8'),/from '\.\.\/embed\/core\/schema\.js'/);
 assert.match(readFileSync(join(site,'authority/app.js'),'utf8'),/from '\.\.\/embed\/definitions\/lab-authority\.js'/);
});
