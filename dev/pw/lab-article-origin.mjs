/* A real original-origin package must load articles without touching old work. */
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,extname} from 'node:path';
import {createServer} from 'node:http';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
import {encodeArticleFragment,decodeArticleFragment} from '../../embed/core/codec.js';
import {definition as knowledge} from '../../embed/definitions/lab-knowledge.js';
import {definition as reframe} from '../../embed/definitions/lab-reframe.js';
import {initialState,activeSession} from '../../lab/dist/reframe/state.js';
const temporary=mkdtempSync(join(tmpdir(),'lab-article-origin-')),site=join(temporary,'site');
execFileSync(process.execPath,['dev/package-lab.mjs',site],{cwd:new URL('../../',import.meta.url)});
const server=createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost'),path=join(site,decodeURIComponent(url.pathname)+(url.pathname.endsWith('/')?'index.html':''));
 try{const body=readFileSync(path);res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.svg':'image/svg+xml'}[extname(path)]||'application/octet-stream'});res.end(body);}catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch();
try{
 const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),errors=[],missing=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)missing.push(r.url());});page.setDefaultTimeout(8000);
 const personal=structuredClone(knowledge.initialState);personal.decision='Existing personal plan';personal.sessions[0].start=4;const oldWork=initialState();activeSession(oldWork).problem='Existing original-origin workspace';
 // Seed on a quiet native page: leaving an open model flushes its current work.
 await page.goto(origin+'/backup/');await page.evaluate(({personal,oldWork})=>{localStorage.setItem('thinking-lab:knowledge:v1',JSON.stringify(personal));localStorage.setItem('thinking-lab:reframe:v1',JSON.stringify(oldWork));},{personal,oldWork});
 const original=await page.evaluate(()=>localStorage.getItem('thinking-lab:knowledge:v1'));
 await page.goto(origin+'/knowledge/');await page.locator('#start').waitFor();assert.equal(await page.locator('#start').inputValue(),'4','an ordinary original-origin model still reads its saved native input');
 const article=structuredClone(knowledge.initialState);article.sessions[0].start=10;
 // Full-tool article links open a new document. A same-page hash-only navigation
 // does not rerun a module entry point, so leave the model before opening it.
 await page.goto('about:blank');
 await page.goto(origin+'/knowledge/#'+encodeArticleFragment({tool:knowledge.id,version:1,state:article}));await page.locator('[data-article-example]').waitFor();assert.equal(await page.locator('#start').inputValue(),'10');assert.equal(await page.evaluate(()=>localStorage.getItem('thinking-lab:knowledge:v1')),original);
 await page.locator('#period-first').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#start').inputValue(),'11');assert.equal(decodeArticleFragment(new URL(page.url()).hash,{tool:knowledge.id}).sessions[0].start,11);assert.equal(await page.evaluate(()=>localStorage.getItem('thinking-lab:knowledge:v1')),original);
 const example=structuredClone(reframe.initialState);example.problem='An article workspace at the original origin';
 await page.goto(origin+'/reframe/#'+encodeArticleFragment({tool:reframe.id,version:1,state:example}));await page.locator('#workbench').waitFor();assert.equal(await page.getByRole('textbox',{name:'The problem, in your words',exact:true}).inputValue(),example.problem);assert.equal(new URL(page.url()).hash,'');
 const imported=await page.evaluate(()=>JSON.parse(localStorage.getItem('thinking-lab:reframe:v1')));assert.equal(imported.sessions.length,oldWork.sessions.length+1);assert.deepEqual(imported.sessions[0],oldWork.sessions[0]);await page.reload();await page.locator('#workbench').waitFor();assert.equal((await page.evaluate(()=>JSON.parse(localStorage.getItem('thinking-lab:reframe:v1')))).sessions.length,imported.sessions.length,'consumed fragment cannot duplicate the example');
 await page.goto(origin+'/knowledge/#'+encodeArticleFragment({tool:knowledge.id,version:2,state:article}));await page.locator('[data-article-example][role=alert]').waitFor();assert.match(await page.locator('[data-article-example]').innerText(),/unsupported version/);assert.equal(await page.evaluate(()=>localStorage.getItem('thinking-lab:knowledge:v1')),original);assert.ok(new URL(page.url()).hash.startsWith('#article:'));
 // Unsupported scaffold versions must likewise retain the native collection.
 const saved=await page.evaluate(()=>localStorage.getItem('thinking-lab:reframe:v1'));await page.goto(origin+'/reframe/#'+encodeArticleFragment({tool:reframe.id,version:2,state:example}));await page.locator('#workbench').waitFor();assert.equal(await page.evaluate(()=>localStorage.getItem('thinking-lab:reframe:v1')),saved);assert.ok(new URL(page.url()).hash.startsWith('#article:'));
 assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);await context.close();
 console.log('PASS original-origin native read, transient article editing, additive workspace/reload, unsupported-version preservation and complete packaged module requests');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));rmSync(temporary,{recursive:true,force:true});}
