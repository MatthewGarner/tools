/* Exercise the original-origin package and move real saved work to /lab/. */
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,extname} from 'node:path';
import {createServer} from 'node:http';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
import {initialState,activeSession} from '../../lab/dist/reframe/state.js';
const root=new URL('../../',import.meta.url),base=process.env.BASE||'http://localhost:8087';
const temporary=mkdtempSync(join(tmpdir(),'lab-migration-')),site=join(temporary,'site');
execFileSync(process.execPath,['dev/package-lab.mjs',site],{cwd:root});
const server=createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  const path=join(site,decodeURIComponent(url.pathname)+(url.pathname.endsWith('/')?'index.html':''));
  try{const body=url.pathname==='/knowledge/' ? readFileSync(new URL('../fixtures/lab-legacy-knowledge.html',import.meta.url)) : readFileSync(path);res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.svg':'image/svg+xml'}[extname(path)]||'application/octet-stream'});res.end(body);}
  catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const old='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch();
try{
  const context=await browser.newContext({acceptDownloads:true,serviceWorkers:'block',reducedMotion:'reduce'});
  const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(old+'/knowledge/');
  await page.locator('.lab-header').waitFor();
  await page.getByRole('heading',{name:'Who else can do the work?'}).waitFor();
  await page.locator('.lab-appearance[title]').waitFor();
  await page.locator('.lab-appearance').click();
  await page.locator('html[data-theme="dark"]').waitFor();
  assert.equal(await page.locator('.mg-masthead').count(),0,'cached HTML retains its compatible shell');
  const work=initialState();activeSession(work).problem='A commissioning decision worth carrying forward';
  // Seed on the backup page, before opening a model. An open Reframe tab
  // flushes its in-memory state on pagehide and must not be used as a fixture writer.
  await page.goto(old+'/backup/');
  await page.evaluate(value=>{localStorage.setItem('thinking-lab:reframe:v1',JSON.stringify(value));localStorage.setItem('thinking-lab:appearance','dark');localStorage.removeItem('thinking-lab:appearance-migrated');},work);
  await page.goto(old+'/reframe/');await page.locator('html[data-theme="dark"]').waitFor();
  assert.equal(await page.locator('.mg-masthead').count(),1);
  await page.getByRole('button',{name:/^Appearance:/}).click();await page.locator('html[data-theme="light"]').waitFor();
  await page.locator('[data-mg-theme-reset]').click();await page.reload();
  assert.equal(await page.evaluate(()=>localStorage.getItem('mg:appearance')),null,'system reset does not resurrect the old preference');
  await page.getByRole('link',{name:'Backup & restore'}).click();
  assert.equal(new URL(page.url()).origin,old,'backup stays with the old origin storage');
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download saved work',exact:true}).click();
  const file=await (await download).path();const archive=JSON.parse(readFileSync(file,'utf8'));
  assert.equal(archive.origin,old);
  // Changed-save dates travel with native work; appearance remains excluded.
  assert.deepEqual(archive.entries.filter(item=>!item.key.startsWith('mg:work-meta:v1:lab:')).map(item=>item.key),['thinking-lab:knowledge:v1','thinking-lab:reframe:v1']);
  const metadata=archive.entries.filter(item=>item.key.startsWith('mg:work-meta:v1:lab:'));
  assert.deepEqual(metadata.map(item=>JSON.parse(item.value).ref).sort(),['thinking-lab:knowledge:v1:current','thinking-lab:reframe:v1:'+work.activeId].sort());
  await page.goto(base+'/backup/');await page.locator('#backup-file').setInputFiles(file);
  await page.getByRole('button',{name:`Import ${archive.entries.length} new items`,exact:true}).click();
  for(const item of metadata)assert.equal(await page.evaluate(key=>localStorage.getItem(key),item.key),item.value,'saved-change metadata survives the origin change');
  await page.goto(base+'/lab/reframe/');await page.locator('#workbench').waitFor();
  const imported=await page.evaluate(()=>JSON.parse(localStorage.getItem('thinking-lab:reframe:v1')));
  assert.deepEqual(imported,work,'full workspace survives the origin change');
  assert.equal(await page.getByRole('textbox',{name:'The problem, in your words',exact:true}).inputValue(),activeSession(work).problem,'actual tool opens imported workspace');
  const oldPage=await context.newPage();await oldPage.goto(old+'/reframe/');
  assert.deepEqual(await oldPage.evaluate(()=>JSON.parse(localStorage.getItem('thinking-lab:reframe:v1'))),work,'original work remains in place');
  assert.deepEqual(errors,[]);await context.close();
  console.log('PASS original Lab package, cached old HTML with current assets, preserved paths, appearance migration/reset, actual cross-origin workspace download/import and old copy retained');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));rmSync(temporary,{recursive:true,force:true});}
