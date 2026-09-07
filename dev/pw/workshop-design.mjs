/* Design-bar regressions. Uses a separate local, ephemeral Gauge relay. */
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const OUT = process.env.WORKSHOP_CAPTURE || '/tmp/workshop-design-evidence';
const PORT = 8096, BASE = 'http://localhost:' + PORT;
await mkdir(OUT, {recursive:true});
const server = spawn('node', ['../../dev/gauge-dev.mjs', String(PORT)], {stdio:['ignore','pipe','inherit']});
let browser;
try{
  await new Promise((resolve,reject)=>{server.stdout.on('data',d=>{if(String(d).includes('listening')) resolve();});server.once('error',reject);server.once('exit',()=>reject(new Error('relay server exited')));});
  browser = await chromium.launch();
  for(const width of [1440,390]) for(const colorScheme of ['light','dark']){
    const ctx=await browser.newContext({viewport:{width,height:width===390?844:1000},isMobile:width===390,hasTouch:width===390,colorScheme,reducedMotion:'reduce',acceptDownloads:true});
    const p=await ctx.newPage(), errors=[]; p.on('pageerror',e=>errors.push(e.message));
    const shot=async name=>{await p.screenshot({path:OUT+'/'+name+'-'+width+'-'+colorScheme+'.png',fullPage:true});const target={flow:'#verdictwrap',premortem:'#phasepanel',duel:'#readoutcard',gauge:'#coverlay'}[name];if(target) await p.locator(target).screenshot({path:OUT+'/'+name+'-artefact-'+width+'-'+colorScheme+'.png'});};
    await p.goto(BASE+'/flow/');
    await p.locator('[data-preset="overloaded"]').click();
    await p.locator('#demand').focus(); await p.keyboard.press('ArrowLeft');
    await p.waitForFunction(()=>document.querySelector('#demandout').textContent==='5.5/week');
    assert.match((await p.locator('#verdictwrap').innerText()).replace(/\s+/g,' '),/demand exceeds capacity/);
    assert.match(await p.locator('#core-transfer').innerText(),/lower intake/);
    if(width===390) assert.ok(await p.locator('#verdictwrap').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
    await shot('flow');
    await p.goto(BASE+'/premortem/'); await p.getByRole('button',{name:'Risk register',exact:true}).click(); await p.locator('.register').waitFor();
    if(width===390) assert.ok(await p.locator('.rtext').first().evaluate(e=>e.clientWidth)>250);
    await shot('premortem');
    const duel={q:'Which library improvement first?',items:['Search','Borrowing','Returns'],duels:[{a:0,b:1,w:0},{a:0,b:2,w:2},{a:1,b:2,w:1}],finished:false};
    await p.goto(BASE+'/duel/#'+Buffer.from(JSON.stringify(duel)).toString('base64'));
    await p.getByRole('button',{name:'Why Search over Borrowing?',exact:true}).waitFor();
    assert.match(await p.locator('#duelwrap').innerText(),/resolve the loop/);
    assert.equal(await p.locator('.tagbtn').count(),3);
    await shot('duel');
    await p.goto(BASE+'/alarm/'); await p.locator('#distwrap svg').waitFor();
    await shot('alarm');
    if(width===1440){
      await p.getByText('Export',{exact:true}).click();
      const download=p.waitForEvent('download'); await p.locator('#dlpng').click();
      await (await download).saveAs(OUT+'/alarm-export-'+colorScheme+'.png');
    }
    await p.goto(BASE+'/gauge/',{waitUntil:'networkidle'});
    await p.locator('#preview svg').waitFor();
    await p.locator('#startbtn').click(); await p.waitForFunction(()=>document.getElementById('joinlink').value.includes('#'));
    const link=await p.locator('#joinlink').inputValue();
    const participant=await ctx.newPage(); await participant.goto(link);
    await participant.locator('.q[data-q="0"] input[type=range]').focus(); await participant.keyboard.press('ArrowRight');
    for(const [q,lo,hi] of [[1,12,20],[2,100,200]]){await participant.locator(`.q[data-q="${q}"] input[data-part=low]`).fill(String(lo));await participant.locator(`.q[data-q="${q}"] input[data-part=high]`).fill(String(hi));}
    await participant.locator('#psubmit').click(); await participant.waitForFunction(()=>document.getElementById('pstatus').textContent.includes('Submitted'));
    await p.locator('#creveal').click(); await p.locator('#creveal').click();
    await p.locator('.discussion-queue').waitFor();
    assert.match(await p.locator('.discussion-queue').innerText(),/not enough evidence/);
    assert.doesNotMatch(await p.locator('.discussion-queue').innerText(),/aligned enough/);
    await shot('gauge');
    await participant.locator('#pview').click(); await participant.locator('#presult svg').waitFor();
    assert.ok(await participant.locator('#psubmit').isDisabled());
    assert.equal(await participant.locator('#pform input:enabled').count(),0);
    assert.match(await participant.locator('#pintro').innerText(),/read-only/);
    await participant.screenshot({path:OUT+'/gauge-participant-'+width+'-'+colorScheme+'.png',fullPage:true});
    await p.locator('#cround2').click(); await p.locator('#cround2').click();
    await p.waitForFunction(()=>document.getElementById('crole').textContent.includes('gathering · round 2'));
    await participant.locator('#pview').click(); await participant.waitForFunction(()=>!document.getElementById('psubmit').disabled);
    assert.ok(await participant.locator('#pform input:enabled').count()>0);
    await p.locator('#cend').click(); await p.locator('#cend').click();
    await p.waitForFunction(()=>document.getElementById('csessionstatus').textContent.includes('Responses deleted'));
    assert.deepEqual(errors,[]);
    console.log('PASS workshop design '+width+' '+colorScheme);
    await ctx.close();
  }
}finally{await browser?.close();server.kill();}
