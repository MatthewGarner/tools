import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {TOOL_DIRS,ENERGY_TOOL_DIRS} from './tool-dirs.mjs';
import {SUITE_PAGES} from './suite-pages.mjs';

test('every shipped page has the maintained static identity without a runtime dependency',()=>{
  execFileSync(process.execPath,['dev/sync-identity.mjs','--check'],{cwd:new URL('..',import.meta.url)});
  for(const {page:dir,file} of SUITE_PAGES){
    const html=readFileSync(new URL('../'+dir+(file?'':'/index.html'),import.meta.url),'utf8');
    assert.equal((html.match(/class="mg-masthead"/g)||[]).length,1,dir);
    assert.match(html,/<script src="\/assets\/identity\/theme-init.js"><\/script>/,dir);
    const nav=html.match(/<nav class="mg-nav"[\s\S]*?<\/nav>/)?.[0];
    assert.deepEqual([...nav.matchAll(/>(Writing|Tools Lab|All tools|Now)<\/a>/g)].map(m=>m[1]),['Writing','Tools Lab','Now'],dir+': one name for the suite link on every page');
    if(dir==='home')assert.match(nav,/<a data-suite-link="explore" href="\/" aria-current="page">Tools Lab<\/a>/,'the front door is the one current item');
    else assert.doesNotMatch(nav,/aria-current/);
    if(TOOL_DIRS.includes(dir)||dir.startsWith('energy/')) assert.match(html,/<header data-tool-header/,dir);
  }
});

test('catalogue rows preserve the complete tool inventory',()=>{
  // The front door's inventory is held by dev/front-door.test.mjs (every current entry within one click).
  for(const [file,dirs] of [['energy/index.html',ENERGY_TOOL_DIRS]]){
    const html=readFileSync(new URL('../'+file,import.meta.url),'utf8');
    const links=[...html.matchAll(/<a class="tool catalogue-row" href="\/?([a-z-]+)\/"/g)].map(m=>m[1]);
    assert.deepEqual(links.sort(),[...dirs].sort(),file);
  }
});
