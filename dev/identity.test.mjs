import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {TOOL_DIRS,ENERGY_TOOL_DIRS} from './tool-dirs.mjs';

test('every shipped page has the maintained static identity without a runtime dependency',()=>{
  execFileSync(process.execPath,['dev/sync-identity.mjs','--check'],{cwd:new URL('..',import.meta.url)});
  for(const dir of ['home',...TOOL_DIRS,'energy',...ENERGY_TOOL_DIRS.map(d=>'energy/'+d)]){
    const html=readFileSync(new URL('../'+dir+'/index.html',import.meta.url),'utf8');
    assert.equal((html.match(/class="mg-masthead"/g)||[]).length,1,dir);
    assert.match(html,/<script src="\/assets\/identity\/theme-init.js"><\/script>/,dir);
    const nav=html.match(/<nav class="mg-nav"[\s\S]*?<\/nav>/)?.[0];
    assert.deepEqual([...nav.matchAll(/>(Writing|Tools|Energy|Now)<\/a>/g)].map(m=>m[1]),['Writing','Tools','Energy','Now'],dir);
    if(TOOL_DIRS.includes(dir)||dir.startsWith('energy/')) assert.match(html,/<header data-tool-header/,dir);
  }
});

test('catalogue rows preserve the complete tool inventory',()=>{
  for(const [file,dirs] of [['home/index.html',TOOL_DIRS],['energy/index.html',ENERGY_TOOL_DIRS]]){
    const html=readFileSync(new URL('../'+file,import.meta.url),'utf8');
    const links=[...html.matchAll(/<a class="tool catalogue-row" href="\/?([a-z-]+)\/"/g)].map(m=>m[1]);
    if(file.startsWith('home')) links.push(...[...html.matchAll(/<a class="[^\"]*binder[^\"]*" href="\/case\/"/g)].map(()=>'case'));
    assert.deepEqual(links.sort(),[...dirs].sort(),file);
  }
});
