import { chromium, devices } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {LAB_ROUTES} from '../suite-pages.mjs';
const base=process.env.BASE||'http://localhost:8087';
const out=process.env.SUITE_SCREENSHOTS;if(out)fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
const errors=[];
try {
  for(const phone of [false,true]) for(const colorScheme of ['light','dark']) {
    const context=await browser.newContext({ ...(phone?devices['iPhone 13']:{viewport:{width:1440,height:1000}}), colorScheme,reducedMotion:'reduce',serviceWorkers:'block' });
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+'/');
    await page.locator('[data-explore-form]').waitFor({state:'visible'});
    await page.evaluate(()=>document.fonts.ready);
    assert.equal(await page.locator('[data-result-count]').textContent(),'40 tools');
    assert.equal(await page.locator('[data-catalog-id]:visible').count(),40);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    if(out)await page.screenshot({path:`${out}/${phone?'phone':'desktop'}-${colorScheme}.png`});
    const targets=await page.locator('.explore-filters button, .explore-filters input, .explore-filters select, .mg-nav a').evaluateAll(els=>els.filter(e=>{const r=e.getBoundingClientRect();return r.height<44 || r.width<44}).map(e=>({text:e.textContent,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})));
    assert.deepEqual(targets,[]);
    const overlaps=await page.locator('.explore-filters button, .explore-filters input, .explore-filters select').evaluateAll(els=>{const boxes=els.map(e=>({name:e.getAttribute('name')||e.textContent,rect:e.getBoundingClientRect()}));return boxes.flatMap((a,i)=>boxes.slice(i+1).filter(b=>Math.min(a.rect.right,b.rect.right)-Math.max(a.rect.left,b.rect.left)>1&&Math.min(a.rect.bottom,b.rect.bottom)-Math.max(a.rect.top,b.rect.top)>1).map(b=>[a.name,b.name]))});
    assert.deepEqual(overlaps,[]);
    if(!phone && colorScheme==='light') {
      await page.getByRole('searchbox').fill('BÁTTÉRY');
      assert.equal(await page.locator('[data-catalog-id]:visible').count(),6);
      const typedURL=page.url();
      await page.getByLabel('Maturity',{exact:true}).selectOption('experimental');
      assert.equal(await page.locator('[data-catalog-id]:visible').count(),2);
      await page.goBack();assert.equal(page.url(),typedURL);assert.equal(await page.locator('[data-catalog-id]:visible').count(),6);
      await page.goBack();assert.equal(await page.locator('[data-result-count]').textContent(),'40 tools');
      await page.goForward();assert.equal(await page.getByRole('searchbox').inputValue(),'BÁTTÉRY');
      await page.reload();assert.equal(await page.locator('[data-catalog-id]:visible').count(),6);
      await page.getByRole('button',{name:'Clear filters',exact:true}).first().click();
      await page.getByLabel('Maturity',{exact:true}).selectOption('archived');
      assert.equal(await page.locator('[data-catalog-id]:visible').count(),7);
      await page.getByRole('searchbox').fill('<img src=x onerror=alert(1)>');
      assert.equal(await page.locator('[data-empty-results]').isVisible(),true);
      assert.equal(await page.locator('.explore img').count(),0);
      await page.locator('[data-empty-clear]').click();
      assert.equal(await page.locator('[data-result-count]').textContent(),'40 tools');
      await page.getByLabel('Type',{exact:true}).selectOption('calculator');
      assert.equal(await page.locator('[data-catalog-id]:visible').count(),3);
    }
    await context.close();
  }
  // Every original Lab route still runs under the consolidated CSP and prefix.
  // No model is replaced or silently omitted merely because it was archived.
  for(const phone of [false,true])for(const theme of ['light','dark']){
    const context=await browser.newContext({viewport:{width:phone?390:1440,height:phone?844:1000},colorScheme:theme,reducedMotion:'reduce',serviceWorkers:'block'});
    const page=await context.newPage();const broken=[];
    page.on('pageerror',e=>broken.push(e.message));
    page.on('response',r=>{if(r.status()>=400)broken.push(r.status()+' '+r.url());});
    for(const route of LAB_ROUTES){
      await page.goto(base+'/lab/'+route+'/');
      await page.locator('html[data-mg-ready]').waitFor();
      await page.locator('#lab-experiment').waitFor();
      await page.evaluate(()=>document.fonts.ready);
      assert.equal(await page.locator('#lab-experiment').inputValue(),route);
      assert.equal(await page.locator('.mg-masthead').count(),1);
      assert.equal(await page.locator('.lab-header').count(),0,'no duplicate shell');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,route+' '+phone+' '+theme+' page overflow');
      if(out&&['knowledge','reframe','flexibility','accuracy'].includes(route))await page.screenshot({path:`${out}/lab-${route}-${phone?'phone':'desktop'}-${theme}.png`});
    }
    assert.deepEqual(broken,[], 'Lab routes, assets and CSP '+phone+' '+theme);
    await context.close();
  }
  console.log('PASS all 24 Lab routes on desktop/phone in both themes, real assets and CSP');
  const routes=await browser.newContext({serviceWorkers:'block'}),rp=await routes.newPage();
  const response=await rp.request.get(base+'/lab/knowledge?entry=old',{maxRedirects:0});
  assert.equal(response.status(),308);assert.equal(response.headers().location,'/lab/knowledge/?entry=old');
  await rp.goto(base+'/lab/dist/knowledge/?entry=old#saved');
  assert.equal(new URL(rp.url()).pathname,'/lab/knowledge/');assert.equal(new URL(rp.url()).hash,'#saved');assert.equal(new URL(rp.url()).search,'?entry=old');
  await rp.locator('.mg-nav').getByRole('link',{name:'Tools Lab',exact:true}).click();
  assert.equal(new URL(rp.url()).pathname,'/');
  await rp.getByLabel('Domain',{exact:true}).selectOption('energy');
  assert.equal(new URL(rp.url()).search,'?domain=energy');
  assert.equal(await rp.locator('[data-catalog-id]:visible').count(),7);
  await rp.getByLabel('Domain',{exact:true}).selectOption('teams');
  assert.ok(await rp.locator('[data-catalog-id="lab:knowledge"]').isVisible());
  assert.equal(await rp.locator('[data-catalog-id="lab:flexibility"]').isVisible(),false);
  const missing=await rp.goto(base+'/a-tool-that-does-not-exist/');
  assert.equal(missing.status(),404);await rp.getByRole('heading',{name:'This page isn’t here'}).waitFor();
  await rp.locator('.mg-nav').getByRole('link',{name:'Tools Lab',exact:true}).click();
  assert.equal(new URL(rp.url()).pathname,'/');
  await routes.close();
  const context=await browser.newContext({javaScriptEnabled:false,serviceWorkers:'block'});const page=await context.newPage();
  await page.goto(base+'/?q=battery');
  assert.equal(await page.locator('[data-catalog-id]:visible').count(),40);
  assert.equal(await page.locator('[data-explore-form]').isVisible(),false);
  await page.locator('[data-archive-list] summary').click();assert.equal(await page.locator('[data-catalog-id]:visible').count(),47);
  await context.close();assert.deepEqual(errors,[]);
  console.log('PASS: light/dark desktop/phone; 44px targets; no horizontal overflow; search/filter/history/reload; archive and no-JS discovery; hostile query inert; no page errors.');
} finally {await browser.close()}
