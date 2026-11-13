/* The Paths → Roadmap hand-off ("Create Roadmap with this basis"): for each exact outcome offered,
   create the Roadmap and compare what arrives with the Paths items, then follow the return link.
     node dev/export-audit-instruments/handoff.mjs [--doc a-example] [--out <dir>] */
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {inflateRawSync, constants} from 'node:zlib';
import {arg, asList, boot, newContext, loadDocs, ensure, sleep, normText} from './lib.mjs';
import {TOOLS} from './tools.mjs';
import {knownFor} from './known.mjs';

const OUT = arg('out', '/Users/matthew/repos/tools/docs/superpowers/specs/export-audit-instruments');
const docFilter = asList(arg('doc')) || ['a-example', 'c-reference', 'e-awkward', 'f-long', 'g-many'];
const decode = url => { const h = new URL(url).hash.slice(1); return JSON.parse(inflateRawSync(Buffer.from(h.slice(2), 'base64url'), {finishFlush: constants.Z_SYNC_FLUSH}).toString()); };
const env = await boot();
const T = TOOLS.paths, lines = [], results = [];
const add = (ctx, check, pass, values) => { const known = pass === false ? knownFor({...ctx, check, values}) : null; results.push({...ctx, check, pass, values, known});
  lines.push(`${pass ? 'PASS' : 'FAIL'} paths/${ctx.doc}/light/plans handoff#${ctx.choice} ${check}${pass ? '' : known ? ' [known ' + known + ']' : ' [NEW]'}${pass ? '' : ' ' + JSON.stringify(values).slice(0, 300)}`); };
try{
  for(const doc of loadDocs('paths')){
    if(!docFilter.some(f => doc.name.includes(f))) continue;
    const ctx = await newContext(env.browser, env.srv.base, 'light');
    const page = await ctx.newPage();
    await page.goto(env.srv.base + '/paths/#' + T.hash(doc), {waitUntil: 'load'});
    await T.ready(page);
    await T.select(page, 'plans');
    const choices = await page.evaluate(() => [...document.querySelectorAll('input[name="roadmap-projection-world"]')].map((r, i) => ({i, value: r.value, disabled: r.disabled, label: r.closest('label').innerText.replace(/\s+/g, ' ')})));
    lines.push(`# ${doc.name}: ${choices.length} outcomes offered, ${choices.filter(c => !c.disabled).length} ready`);
    const dir = ensure(join(OUT, 'handoff', doc.name));
    for(const choice of choices.filter(c => !c.disabled).slice(0, 3)){
      const c = {tool: 'paths', doc: doc.name, view: 'plans', export: 'handoff', choice: choice.i};
      await page.goto(env.srv.base + '/paths/#' + T.hash(doc), {waitUntil: 'load'});
      await T.ready(page); await T.select(page, 'plans');
      await page.locator('input[name="roadmap-projection-world"]').nth(choice.i).check();
      await sleep(300);
      for(const box of await page.locator('.projection-assumption input[type="checkbox"]').all()) await box.check();
      await sleep(200);
      const paths = await page.evaluate(() => ({source: window.__src || null, ledger: document.querySelector('.projection-confirmation')?.innerText}));
      const nav = page.waitForURL(/\/roadmap\//, {timeout: 15000}).then(() => true, () => false);
      await page.locator('#createroadmap').click();
      const arrived = await nav;
      add(c, 'handoff:arrives', arrived, {label: choice.label, message: await page.evaluate(() => document.querySelector('.projection-message')?.textContent).catch(() => null)});
      if(!arrived) continue;
      await page.waitForFunction(() => document.querySelector('#preview svg'), null, {timeout: 15000}).catch(() => {});
      await sleep(800);
      const sent = await page.evaluate(async () => (await import('/assets/series.js')).decodeHash(location.hash.slice(1))) || {};
      sent.url = page.url().slice(0, 120);
      writeFileSync(join(dir, `roadmap-${choice.i}.txt`), sent.t || '');
      await page.screenshot({path: join(dir, `roadmap-${choice.i}.png`), fullPage: true});
      /* every Roadmap item came from a Paths item, verbatim */
      const pathsItems = doc.source.split('\n').filter(l => /^ {2}[^:]+: /.test(l) && !/^ {2}(question|signal|owner|answer-by|learn|enough|reading|answer|assume|when|close-out|basis-kind|carry-forward|decision-use|claim|scope|review-by|reconsider-if|next-check):/.test(l))
        .map(l => normText(l.replace(/^ {2}[^:]+:\s*/, '').replace(/\s*\[[^\]]*\]/g, '').replace(/\s*--.*$/, '').replace(/\s*->.*$/, '')));
      const rmItems = (sent.t || '').split('\n').filter(l => /^ {2}\S[^:]*: /.test(l)).map(l => normText(l.replace(/^ {2}[^:]+:\s*/, '').replace(/\s*\[[^\]]*\]/g, '').replace(/\s*--.*$/, '').replace(/\s*->.*$/, '').replace(/\s+x\d+$/, '')));
      const invented = rmItems.filter(t => !pathsItems.includes(t));
      add(c, 'handoff:items-verbatim', invented.length === 0 && rmItems.length > 0, {roadmapItems: rmItems.length, pathsItems: pathsItems.length, notInPaths: invented.slice(0, 6)});
      const warns = await page.evaluate(() => [...document.querySelectorAll('#warns li')].map(l => l.textContent));
      add(c, 'handoff:no-roadmap-warnings', warns.length === 0, {warnings: warns.slice(0, 6)});
      const ret = await page.evaluate(() => { const a = document.querySelector('#handoffreturn'); return a && a.getAttribute('href') && a.getClientRects().length ? a.href : null; });
      add(c, 'handoff:return-link', !!ret, {ret: ret && ret.slice(0, 80)});
      if(ret){
        const back = await page.evaluate(async h => (await import('/assets/series.js')).decodeHash(h), new URL(ret).hash.slice(1)) || {};
        add(c, 'handoff:return-reopens-same-paths', normText((back.t || '').replace(/^style:.*$/mg, '')) === normText(doc.source.replace(/^style:.*$/mg, '')), {sameLength: (back.t || '').length === doc.source.length, backHead: (back.t || '').slice(0, 160), docHead: doc.source.slice(0, 120), backKeys: Object.keys(back)});
      }
    }
    await ctx.close();
  }
}finally{ await env.close(); }
lines.push(`\nhandoff checks ${results.length}  fail ${results.filter(r => !r.pass).length}`);
console.log(lines.join('\n'));
writeFileSync(join(OUT, 'handoff-output.txt'), lines.join('\n'));
writeFileSync(join(OUT, 'handoff-results.json'), JSON.stringify(results, null, 1));
