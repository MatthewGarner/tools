import assert from 'node:assert/strict';

async function openToolsWork(page){
 const disclosure=page.locator('.work-disclosure');
 if(await disclosure.count()&&!await disclosure.evaluate(node=>node.open))await disclosure.locator(':scope > summary').click();
}

export async function verifyLabWorkspaceLinks(browser,base,out){
 // Each bespoke workbench must consume the catalogue pointer, as the shared kits do.
 for(const route of ['constraints','analogy']){
  const ctx=await browser.newContext({serviceWorkers:'block',reducedMotion:'reduce'}),page=await ctx.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  try{
   const key=`thinking-lab:${route}:v1`,first=`${route} saved workspace one`,second=`${route} saved workspace two`;
   await page.goto(`${base}/lab/${route}/`);await page.locator('#problem').fill(first);
   await page.getByRole('button',{name:'New',exact:true}).click();await page.locator('#problem').fill(second);
   await page.waitForFunction(({key,second})=>JSON.parse(localStorage.getItem(key))?.workspaces.some(w=>w.problem===second),{key,second});
   const before=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
   await page.goto(base+'/');await openToolsWork(page);await page.getByLabel('Find saved work',{exact:true}).fill(first);
   await page.locator('[data-work-kind=workspace]').filter({hasText:first}).click();
   assert.equal(await page.locator('#problem').inputValue(),first,route+' catalogue link resumes the selected workspace');
   assert.equal(new URL(page.url()).search,'',route+' workspace pointer is consumed');
   if(out)for(const width of [1440,390])for(const theme of ['light','dark']){
    await page.setViewportSize({width,height:width===390?844:1000});await page.emulateMedia({colorScheme:theme});await page.evaluate(()=>document.fonts.ready);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,route+' resumed work overflow');
    await page.screenshot({path:`${out}/regular-resume-${route}-${width}-${theme}.png`});
   }
   await page.locator('#problem').fill(first+' edited');
   await page.waitForFunction(({key,first})=>JSON.parse(localStorage.getItem(key))?.workspaces.some(w=>w.problem===first+' edited'),{key,first});
   const after=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
   assert.equal(after.workspaces.length,before.workspaces.length);
   assert.deepEqual(after.workspaces.find(w=>w.id===before.activeId),before.workspaces.find(w=>w.id===before.activeId),route+' other workspace stays unchanged');
   await page.getByRole('button',{name:'New',exact:true}).click();await page.locator('#problem').fill('A later workspace');await page.reload();
   assert.equal(await page.locator('#problem').inputValue(),'A later workspace',route+' consumed pointer cannot replace later work');
   await page.goto(`${base}/lab/${route}/?work=missing`);
   await page.getByText('That workspace is no longer available here. Your current work is open.',{exact:true}).waitFor();
   assert.equal(await page.locator('#problem').inputValue(),'A later workspace');assert.equal(new URL(page.url()).search,'');
   assert.deepEqual(errors,[],route+' page errors');
  }finally{await ctx.close();}
 }
 console.log('PASS Constraints and Analogy catalogue resume, isolation, consumed and missing pointers');
}

export async function verifyRegularWork(browser,base,out){
 await verifyLabWorkspaceLinks(browser,base,out);
 const ctx=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',serviceWorkers:'block'}),page=await ctx.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  // Use the actual controls to create two independently saved workspaces.
  await page.goto(base+'/lab/reframe/');await page.locator('#problem').fill('Review the weekly intake');
  await page.getByRole('button',{name:'New',exact:true}).click();await page.locator('#problem').fill('Decide the launch scope');
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('thinking-lab:reframe:v1'))?.sessions.some(s=>s.problem==='Decide the launch scope'));
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('thinking-lab:reframe:v1')));
  await page.goto(base+'/');
  await page.getByRole('button',{name:'Add Roadmap to favourites',exact:true}).click();
  await page.getByRole('button',{name:'Add Intervention workbench to favourites',exact:true}).click();
  await page.locator('[data-favourites-only]').click();assert.equal(await page.locator('[data-catalog-id]:visible').count(),2);
  await page.locator('[data-explore-form]').getByRole('searchbox').fill('test hypothesis');assert.equal(await page.locator('[data-catalog-id]:visible').count(),1);
  await page.reload();await page.locator('[data-favourites-only][aria-pressed=true]').waitFor();assert.equal(await page.locator('[data-catalog-id]:visible').count(),1);
  await page.locator('[data-clear-filters]').click();
  const other=await ctx.newPage();await other.goto(base+'/');await other.getByRole('button',{name:'Remove Roadmap from favourites',exact:true}).click();
  await page.getByRole('button',{name:'Add Roadmap to favourites',exact:true}).waitFor();await other.close();
  await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('Full','QuotaExceededError');};});
  await page.getByRole('button',{name:'Add Roadmap to favourites',exact:true}).click();assert.match(await page.locator('[data-favourite-status]').textContent(),/only in this tab/);
  await page.reload();await page.getByRole('button',{name:'Add Roadmap to favourites',exact:true}).waitFor();await openToolsWork(page);
  await page.getByLabel('Find saved work',{exact:true}).fill('weekly intake');
  const link=page.locator('[data-work-kind=workspace]').filter({hasText:'Review the weekly intake'});await link.click();
  assert.equal(await page.locator('#problem').inputValue(),'Review the weekly intake');assert.equal(new URL(page.url()).search,'');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('thinking-lab:reframe:v1')).sessions.length),before.sessions.length);
  await page.getByRole('button',{name:'New',exact:true}).click();await page.locator('#problem').fill('A third problem');await page.reload();
  assert.equal(await page.locator('#problem').inputValue(),'A third problem','consumed pointer cannot override later work');
  // A baseline opens as a comparison against the current draft, without replacing it.
  await page.goto(base+'/roadmap/');await page.getByText('History',{exact:true}).click();await page.getByRole('button',{name:'Save baseline',exact:true}).click();
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('roadmap-snaps'))[0]);
  const currentSource=saved.src.replace(/^title:.*$/m,'title: Revised plan after baseline');
  // Seed only after leaving the autosaving tool, so pagehide cannot overwrite it.
  await page.goto(base+'/');await page.evaluate(src=>localStorage.setItem('roadmap-src',src),currentSource);await page.reload();await openToolsWork(page);
  await page.getByRole('combobox',{name:'Work type',exact:true}).selectOption('baseline');await page.locator('[data-work-kind=baseline]').click();
  await page.waitForFunction(()=>document.querySelector('#snapsel')?.value==='0');
  assert.equal(await page.evaluate(()=>localStorage.getItem('roadmap-src')),currentSource);
  assert.equal(new URL(page.url()).search,'');
  // Native Premortem is continued; saved-copy URL imports still mint a separate ID.
  await page.goto(base+'/premortem/');await page.locator('.recent-save').waitFor();await page.goto(base+'/');await openToolsWork(page);
  await page.getByLabel('Find saved work',{exact:true}).fill('Premortem');await page.locator('[data-work-kind=workspace]').click();
  await page.locator('#workspace').waitFor();
  assert.equal(await page.locator('#importstrip').isVisible(),false);
  assert.equal(await page.locator('#workspace').isVisible(),true);
  await page.goto(base+'/');
  const gaugeDraft='title: Current draft\nWill the launch be ready? :: prob';
  await page.evaluate(draft=>{localStorage.setItem('gauge-src',draft);localStorage.setItem('gauge-saved',JSON.stringify([{name:'Weekly question set',src:'title: Weekly questions\nWill requests arrive on time? :: prob'}]));},gaugeDraft);
  await page.reload();await openToolsWork(page);await page.getByLabel('Find saved work',{exact:true}).fill('Weekly question set');await page.locator('[data-work-kind=workspace]').click();
  await page.getByRole('button',{name:'Edit question source',exact:true}).click();
  await page.locator('.saved-disclosure summary').click();await page.locator('.saved-disclosure button[aria-current=true]').waitFor();await page.locator('.saved-disclosure summary').click();
  await page.locator('#cmhost .cm-content').click();await page.keyboard.press('ControlOrMeta+a');await page.keyboard.insertText('title: Edited weekly questions\nWill requests arrive on time? :: prob');
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('gauge-saved'))[0].src.includes('Edited weekly questions'));
  assert.equal(await page.evaluate(()=>localStorage.getItem('gauge-src')),gaugeDraft,'editing the named set leaves the current draft alone');
  // Exercise both new thinking mechanisms with keyboard-native controls.
  await page.goto(base+'/lab/objections/');await page.locator('[data-action=view][data-view=compare]').first().click();
  await page.locator('[data-action=assess-criterion]').first().click();
  await page.getByLabel('Your judgement',{exact:true}).selectOption('meets');await page.getByLabel('Reason, evidence or what is still unknown',{exact:true}).fill('One rehearsal took four minutes.');
  await page.getByRole('button',{name:'Record assessment',exact:true}).click();
  await page.locator('[data-action=edit-criterion]').first().click();await page.getByLabel('What must an option satisfy?',{exact:true}).fill('Fits a three-minute rehearsal');await page.getByRole('button',{name:'Done',exact:true}).click();
  // Closing a native dialog dispatches the repaint asynchronously.
  await page.locator('.criterion-cell').first().getByText('Reassessment needed',{exact:true}).waitFor();
  assert.match(await page.locator('.criterion-cell').first().textContent(),/four minutes/);
  await page.getByRole('button',{name:/Undo/}).click();assert.match(await page.locator('.criterion-table').textContent(),/five-minute/);
  await page.goto(base+'/lab/interventions/');await page.locator('[data-act=choose]').click();await page.getByRole('button',{name:'Start chosen test',exact:true}).click();await page.getByRole('button',{name:'Start test',exact:true}).click();
  await page.getByRole('button',{name:'Review result',exact:true}).click();await page.getByLabel('What did you actually observe?',{exact:true}).fill('Four requests arrived with a concrete question.');
  await page.getByLabel('Decision',{exact:true}).selectOption('revise');await page.getByLabel('Why this decision?',{exact:true}).fill('Repeat with a quieter intake period.');await page.getByLabel('Next check',{exact:true}).fill('Check the next weekly intake.');await page.getByRole('button',{name:'Record review',exact:true}).click();
  assert.match(await page.locator('.test-attempt').textContent(),/Four requests/);
  await page.locator('#option-expected').fill('A changed expectation after the test.');
  assert.match(await page.locator('[data-attempt-source]').textContent(),/changed/i);
  await page.reload();assert.match(await page.locator('.test-attempt').textContent(),/Four requests/);
  assert.doesNotMatch(await page.locator('.attempt-record').first().textContent(),/changed expectation/);
  if(out)for(const width of [1440,390])for(const theme of ['light','dark']){
   await page.setViewportSize({width,height:width===390?844:1000});await page.emulateMedia({colorScheme:theme});
   for(const route of ['','lab/reframe/','lab/mixer/','lab/objections/','lab/interventions/']){
    await page.goto(base+'/'+route);await page.evaluate(()=>document.fonts.ready);await page.locator(route?'#lab-experiment':'[data-explore-form]').waitFor();
    if(route==='lab/objections/')await page.locator('[data-action=view][data-view=compare]').first().click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,route+' overflow');
    await page.screenshot({path:`${out}/regular-${route.split('/')[1]||'catalogue'}-${width}-${theme}.png`,fullPage:false});
    if(route==='lab/interventions/'){await page.locator('.test-attempts').scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/regular-attempt-${width}-${theme}.png`});}
    if(route==='lab/objections/'){await page.locator('.criterion-comparison').scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/regular-criteria-${width}-${theme}.png`});}
   }
  }
  assert.deepEqual(errors,[]);console.log('PASS native work resume, baseline identity, criteria reassessment and dated test history');
 }finally{await ctx.close();}
}
