/* Edit-in-place browser checks (tree). */
import {chromium, devices} from 'playwright';
const BASE = (process.env.BASE || 'http://localhost:8087') + '/tree/';
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1500, height: 1000}});
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const results = [];
const check = (name, ok) => results.push((ok ? 'PASS ' : 'FAIL ') + name);

/* Mobile-emulated contexts: locator.click() scrolls-then-clicks as one step, and a
   trailing scroll-settle event can still land AFTER the click dispatches — racing
   edit-in-place's own scroll-closes-the-popover guard shut before we ever act on it.
   Scrolling first and waiting it out, then clicking raw coordinates, avoids the race
   (real touches never fight their own just-finished scroll this way). */
async function settledTap(page, loc){
  await loc.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const box = await loc.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  return box;
}

await page.goto(BASE, {waitUntil: 'networkidle'});
await page.getByRole('button', {name: 'Bid or no bid'}).click();
await page.waitForTimeout(500);
const before = await page.evaluate(() => localStorage.getItem('tree-src'));
const rec0 = (await page.locator('#preview svg').innerHTML()).includes('Submit bid');

// click the probability, replace with a value that flips the recommendation
await page.locator('[data-edit="prob"]').first().click();
await page.waitForTimeout(200);
check('overlay opens prefilled', await page.locator('.eip-input').inputValue() === '0.3-0.45');
await page.locator('.eip-input').fill('0.02');
await page.keyboard.press('Enter');
await page.waitForTimeout(600);
const after = await page.evaluate(() => localStorage.getItem('tree-src'));
check('editor text updated', after.includes('(p=0.02)') && !after.includes('0.3-0.45'));
const svg = await page.locator('#preview svg').innerHTML();
check('recommendation flipped to No bid', svg.includes('RECOMMENDED') && /RECOMMENDED[\s\S]{0,200}No bid/.test(svg));
check('one undo reverts the edit', await (async () => {
  await page.locator('.cm-content').click();
  await page.keyboard.press('Meta+z');
  await page.waitForTimeout(500);
  return (await page.evaluate(() => localStorage.getItem('tree-src'))) === before;
})());

// invalid input shakes and stays open
await page.locator('[data-edit="prob"]').first().click();
await page.waitForTimeout(200);
await page.locator('.eip-input').fill('7');
await page.keyboard.press('Enter');
await page.waitForTimeout(200);
check('invalid input stays open with .invalid', await page.locator('.eip-input.invalid').count() === 1);
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
check('escape closes', await page.locator('.eip-input').count() === 0);

// label edit
await page.locator('[data-edit="label"]', {hasText: 'No bid'}).click();
await page.waitForTimeout(200);
await page.locator('.eip-input').fill('Walk away');
await page.keyboard.press('Enter');
await page.waitForTimeout(600);
check('label rename lands in text and diagram',
  (await page.evaluate(() => localStorage.getItem('tree-src'))).includes('Walk away') &&
  (await page.locator('#preview svg').innerHTML()).includes('Walk away'));

/* node popovers: add a child branch, remove a subtree, one undo restores it */
{
  const t0 = await page.evaluate(() => localStorage.getItem('tree-src'));
  const dec = page.locator('[data-edit="node-decision"]').first();
  const b = await dec.boundingBox();
  await page.mouse.click(b.x + b.width/2, b.y + b.height/2);
  await page.waitForTimeout(200);
  check('tree: node popover opens with add + remove',
    (await page.locator('.eip-pop button').allInnerTexts()).join('|') === '＋ Add option|Remove branch');
  await page.locator('.eip-pop button', {hasText: 'Add option'}).click();
  await page.waitForTimeout(600);
  check('tree: add inserts a child option', (await page.evaluate(() => localStorage.getItem('tree-src'))).includes('New option: 0'));
  await page.keyboard.type('Renamed inline');   // placeholder is pre-selected in the editor
  await page.waitForTimeout(600);
  check('tree: placeholder pre-selected for rename',
    (await page.evaluate(() => localStorage.getItem('tree-src'))).includes('Renamed inline: 0'));
  const chance = page.locator('[data-edit="node-chance"]').first();
  const cb = await chance.boundingBox();
  await page.mouse.click(cb.x + cb.width/2, cb.y + cb.height/2);
  await page.waitForTimeout(200);
  await page.locator('.eip-pop button', {hasText: 'Remove branch'}).click();
  await page.waitForTimeout(600);
  const tRm = await page.evaluate(() => localStorage.getItem('tree-src'));
  check('tree: remove branch drops the whole subtree', !tRm.includes('Win') && !tRm.includes('Lose'));
  await page.locator('.cm-content').click();
  await page.keyboard.press('Meta+z');
  await page.waitForTimeout(500);
  check('tree: one undo restores the subtree',
    (await page.evaluate(() => localStorage.getItem('tree-src'))).includes('Lose'));
}

check('no page errors', errors.length === 0);

/* ---- why: popover status + cycle assumption ---- */
{
  const p = await browser.newPage({viewport: {width: 1500, height: 1000}});
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE.replace('/tree/', '/why/'), {waitUntil: 'networkidle'});
  await p.getByRole('button', {name: 'Habit retention'}).click();
  await p.waitForTimeout(500);
  await p.locator('text[data-edit="status"][data-raw="testing"]').first().click();
  await p.waitForTimeout(200);
  check('why: status popover opens', await p.locator('.eip-pop').count() === 1);
  await p.locator('.eip-pop button', {hasText: 'delivering'}).click();
  await p.waitForTimeout(600);
  const t1 = await p.evaluate(() => localStorage.getItem('why-src'));
  check('why: popover commit rewrites tag', t1.includes('Smart reminders [delivering]'));
  const a0 = await p.locator('[data-edit="astatus"][data-raw="untested"]').first();
  await a0.click();
  await p.waitForTimeout(600);
  const t2 = await p.evaluate(() => localStorage.getItem('why-src'));
  check('why: assumption cycles untested→testing', t2.includes('? users will invite friends [testing]'));

  /* card popovers: add a child, remove a branch; × removes an assumption */
  const opp = p.locator('[data-edit="card-opportunity"]').first();
  const ob = await opp.boundingBox();
  await p.mouse.click(ob.x + 6, ob.y + ob.height - 5);   // card padding, off the label text
  await p.waitForTimeout(200);
  check('why: opportunity card popover opens',
    (await p.locator('.eip-pop button').allInnerTexts()).join('|') === '＋ Add solution|Remove branch');
  await p.locator('.eip-pop button', {hasText: 'Add solution'}).click();
  await p.waitForTimeout(600);
  const t3 = await p.evaluate(() => localStorage.getItem('why-src'));
  check('why: add solution inserts a candidate line', t3.includes('New solution [candidate]'));
  const ax = p.locator('[data-edit="removeassump"]').first();
  const ab = await ax.boundingBox();
  await p.mouse.click(ab.x + ab.width/2, ab.y + ab.height/2);
  await p.waitForTimeout(600);
  const t4 = await p.evaluate(() => localStorage.getItem('why-src'));
  check('why: assumption × removes its line', t4.split('\n').length === t3.split('\n').length - 1);
  const sol = p.locator('[data-edit="card-solution"]').first();
  const sb = await sol.boundingBox();
  await p.mouse.click(sb.x + 6, sb.y + sb.height - 5);
  await p.waitForTimeout(200);
  await p.locator('.eip-pop button', {hasText: 'Remove branch'}).click();
  await p.waitForTimeout(600);
  const t5 = await p.evaluate(() => localStorage.getItem('why-src'));
  check('why: card Remove branch drops the solution', !t5.includes('Smart reminders'));
  check('why: export render has no edit affordances', await p.evaluate(async () => {
    const [{parse}, {project}, {renderOst}] = await Promise.all([
      import('/why/parse.js'), import('/why/project.js'), import('/why/render-ost.js')]);
    const m = parse(localStorage.getItem('why-src'));
    const svg = renderOst(m, project(m), {colors: {}, measure: () => 50, dark: false});
    return !svg.includes('card-') && !svg.includes('removeassump');
  }));
  check('why: no page errors', errs.length === 0);
  await p.close();
}

/* ---- roadmap: title edit + status popover ---- */
{
  const p = await browser.newPage({viewport: {width: 1500, height: 1000}});
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE.replace('/tree/', '/roadmap/'), {waitUntil: 'networkidle'});
  await p.getByRole('button', {name: 'Habit app roadmap'}).click();
  await p.waitForTimeout(500);
  await p.locator('[data-edit="title"]', {hasText: 'Streak freeze'}).first().click();
  await p.waitForTimeout(200);
  await p.locator('.eip-input').fill('Streak shield');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(600);
  const t = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  check('roadmap: title rename lands', t.includes('Streak shield [doing]'));
  await p.locator('[data-edit="status"][data-raw="risk"]').first().click();
  await p.waitForTimeout(200);
  await p.locator('.eip-pop button', {hasText: 'blocked'}).click();
  await p.waitForTimeout(600);
  const t2 = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  check('roadmap: status popover rewrites tag', t2.includes('[blocked]'));

  /* add via the cell ghost, remove via the status-popover action */
  await p.locator('[data-edit="additem"][data-lane="Growth"][data-col="Next"]').click();
  await p.waitForTimeout(200);
  await p.locator('.eip-input').fill('EIP suite added');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(600);
  const t3 = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  check('roadmap: cell ghost adds a lane-prefixed item', t3.includes('Growth: EIP suite added'));
  await p.locator('[data-edit="status"]').first().click();
  await p.waitForTimeout(200);
  await p.locator('.eip-pop button.danger', {hasText: 'Remove item'}).click();
  await p.waitForTimeout(600);
  const t4 = await p.evaluate(() => localStorage.getItem('roadmap-src'));
  check('roadmap: popover Remove deletes the line', t4.split('\n').length === t3.split('\n').length - 1);
  check('roadmap: no page errors', errs.length === 0);
  await p.close();
}

/* ---- risk (energy) ---- */
{
  const p = await browser.newPage({viewport: {width: 1500, height: 1000}});
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto((process.env.BASE || 'http://localhost:8087') + '/energy/risk/', {waitUntil: 'networkidle'});
  await p.getByRole('button', {name: 'Route to market'}).click();
  await p.waitForTimeout(600);
  const before = await p.evaluate(() => localStorage.getItem('risk-src'));
  await p.locator('[data-field="level"]').first().click();
  await p.waitForTimeout(200);
  check('risk: overlay opens prefilled', await p.locator('.eip-input').inputValue() === '70');
  await p.locator('.eip-input').fill('90');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(600);
  const after = await p.evaluate(() => localStorage.getItem('risk-src'));
  check('risk: floor level rewrite lands', after.includes('floor: 90') && !after.includes('floor: 70'));
  check('risk: diagram re-rendered', (await p.locator('#preview svg').innerHTML()).includes('Floor 90'));
  await p.locator('.cm-content').click();
  await p.keyboard.press('Meta+z');
  await p.waitForTimeout(500);
  check('risk: one undo reverts', (await p.evaluate(() => localStorage.getItem('risk-src'))) === before);
  check('risk: no page errors', errs.length === 0);
  await p.close();
}

/* ---- cycles (energy) ---- */
{
  const p = await browser.newPage({viewport: {width: 1500, height: 1000}});
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto((process.env.BASE || 'http://localhost:8087') + '/energy/cycles/', {waitUntil: 'networkidle'});
  await p.getByRole('button', {name: 'Wexcombe base case'}).click();
  await p.waitForTimeout(1000);
  const before = await p.evaluate(() => localStorage.getItem('cycles-src'));
  await p.locator('[data-field="budget"]').first().click();
  await p.waitForTimeout(200);
  check('cycles: overlay prefilled', await p.locator('.eip-input').inputValue() === '6000');
  await p.locator('.eip-input').fill('3000');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(1000);
  check('cycles: budget rewrite lands', (await p.evaluate(() => localStorage.getItem('cycles-src'))).includes('cycles: 3000 over 15yr'));
  await p.locator('.cm-content').click();
  await p.keyboard.press('Meta+z');
  await p.waitForTimeout(700);
  check('cycles: one undo reverts', (await p.evaluate(() => localStorage.getItem('cycles-src'))) === before);
  check('cycles: no page errors', errs.length === 0);
  await p.close();
}

/* ---- wardley: name edit, stage cycle, drag writes text, vertical no-op ---- */
{
  const wpage = await browser.newPage({viewport: {width: 1500, height: 1000}});
  const werrors = [];
  wpage.on('pageerror', e => werrors.push(e.message));
  await wpage.goto((process.env.BASE || 'http://localhost:8087') + '/wardley/', {waitUntil: 'networkidle'});
  await wpage.waitForTimeout(500);

  // name edit commits to the editor text and every edge mention
  await wpage.locator('text[data-edit="name"]', {hasText: 'User DB'}).first().click();
  await wpage.waitForTimeout(200);
  check('wardley: name editor opens prefilled', await wpage.locator('.eip-input').inputValue() === 'User DB');
  await wpage.locator('.eip-input').fill('Postgres');
  await wpage.keyboard.press('Enter');
  await wpage.waitForTimeout(500);
  const wsrc = await wpage.evaluate(() => localStorage.getItem('wardley-src'));
  check('wardley: rename hits declaration + edges', wsrc.includes('Postgres @ commodity') && wsrc.includes('-> Postgres') && !wsrc.includes('User DB'));

  // stage cycle: click the pill rect steps custom -> product
  // the text element covers the pill centre (that's the name target) — cycle stage from the capsule's edge
  await wpage.locator('rect[data-edit="stage"][data-raw="custom"]').first().click({position: {x: 8, y: 13}});
  await wpage.waitForTimeout(400);
  const wsrc2 = await wpage.evaluate(() => localStorage.getItem('wardley-src'));
  check('wardley: stage cycle writes the next stage word', wsrc2.includes('Streak engine @ product'));

  // real mouse drag writes a numeric position; Cmd+Z restores it
  const pill = wpage.locator('#preview svg g[data-drag="evo"]', {hasText: 'Habit builder'}).first();
  const box = await pill.boundingBox();
  await wpage.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await wpage.mouse.down();
  await wpage.mouse.move(box.x + box.width / 2 - 180, box.y + box.height / 2, {steps: 8});
  await wpage.mouse.up();
  await wpage.waitForTimeout(500);
  const wsrc3 = await wpage.evaluate(() => localStorage.getItem('wardley-src'));
  check('wardley: drag writes @ 0.NN', /Habit builder @ 0\.\d+/.test(wsrc3));
  await wpage.keyboard.press('Meta+z');
  await wpage.waitForTimeout(400);
  const wsrc4 = await wpage.evaluate(() => localStorage.getItem('wardley-src'));
  check('wardley: Cmd+Z undoes the drag', wsrc4.includes('Habit builder @ product'));

  // vertical drag leaves the text untouched
  const pill2 = wpage.locator('#preview svg g[data-drag="evo"]', {hasText: 'Streak engine'}).first();
  const box2 = await pill2.boundingBox();
  await wpage.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2);
  await wpage.mouse.down();
  await wpage.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2 + 140, {steps: 6});
  await wpage.mouse.up();
  await wpage.waitForTimeout(400);
  const wsrc5 = await wpage.evaluate(() => localStorage.getItem('wardley-src'));
  check('wardley: vertical drag is a no-op on the text', wsrc5 === wsrc4);

  // add zone: tap the CUSTOM stage's ghost "+" → eip-input opens empty → type Cache → Enter
  await wpage.locator('[data-edit="additem"][data-stage="custom"]').first().click();
  await wpage.waitForTimeout(200);
  check('wardley: add zone opens the eip-input', await wpage.locator('.eip-input').count() === 1);
  await wpage.locator('.eip-input').fill('Cache');
  await wpage.keyboard.press('Enter');
  await wpage.waitForTimeout(500);
  const wsrc7 = await wpage.evaluate(() => localStorage.getItem('wardley-src'));
  const lines7 = wsrc7.split(/\r?\n/);
  const cacheIdx = lines7.findIndex(l => l.trim() === 'Cache @ custom');
  const firstEdgeIdx7 = lines7.findIndex(l => l.includes('->'));
  check('wardley: add zone inserts the component before the edge block (only blanks between)',
    cacheIdx >= 0 && firstEdgeIdx7 > cacheIdx &&
    lines7.slice(cacheIdx + 1, firstEdgeIdx7).every(l => l.trim() === ''));
  check('wardley: added component renders in the map',
    (await wpage.locator('#preview svg').innerHTML()).includes('Cache'));
  check('wardley: fine-pointer add focuses the editor', await wpage.evaluate(() =>
    !!document.activeElement && !!document.activeElement.closest('.cm-editor')));

  // component menu: tap Cache's ⋯ → danger row removes the declaration + any edge mentions
  await wpage.locator('[data-edit="componentmenu"][data-raw="Cache"]').first().click();
  await wpage.waitForTimeout(200);
  check('wardley: component menu shows the danger row',
    (await wpage.locator('.eip-pop button').allInnerTexts()).join('|') === 'Remove component');
  await wpage.locator('.eip-pop button.danger', {hasText: 'Remove component'}).click();
  await wpage.waitForTimeout(500);
  const wsrc8 = await wpage.evaluate(() => localStorage.getItem('wardley-src'));
  check('wardley: remove component drops the declaration', !wsrc8.includes('Cache @ custom'));
  check('wardley: remove component leaves no edge remnant', !wsrc8.includes('-> Cache'));

  // CM keymaps need focus first (this section's existing pattern); ONE undo
  // must round-trip the whole removal (applyLineOps' single-dispatch proof)
  await wpage.locator('.cm-content').click();
  await wpage.keyboard.press('Meta+z');
  await wpage.waitForTimeout(500);
  const wsrc9 = await wpage.evaluate(() => localStorage.getItem('wardley-src'));
  check('wardley: one undo restores the full pre-removal text (applyLineOps one history event)', wsrc9 === wsrc7);

  // remove a LINKED component (Streak engine sits in two chains) — this is the
  // multi-op removal (declaration delete + edge splices/deletes) that
  // applyLineOps exists for; the earlier Cache remove was single-op
  await wpage.locator('[data-edit="componentmenu"][data-raw="Streak engine"]').first().click();
  await wpage.waitForTimeout(200);
  await wpage.locator('.eip-pop button.danger', {hasText: 'Remove component'}).click();
  await wpage.waitForTimeout(500);
  const wsrc10 = await wpage.evaluate(() => localStorage.getItem('wardley-src'));
  check('wardley: linked remove splices the chains (no -> Streak engine, no Streak engine ->, no declaration)',
    !/->\s*streak engine|streak engine\s*->|streak engine\s*@/i.test(wsrc10));
  // the 3-chain "… -> Habit builder -> Streak engine -> <end>" must splice to
  // "… -> Habit builder -> <end>" — endpoint name is whatever earlier steps
  // renamed it to, so assert the join, not the name
  check('wardley: the 3-chain kept its ends after the splice', /habit tracking\s*->\s*habit builder\s*->\s*\S/i.test(wsrc10));
  await wpage.locator('.cm-content').click();
  await wpage.keyboard.press('Meta+z');
  await wpage.waitForTimeout(500);
  check('wardley: one undo restores the multi-op removal (single dispatch)',
    (await wpage.evaluate(() => localStorage.getItem('wardley-src'))) === wsrc9);

  // narrow: a TAP on the ghost's strip places it, comment kept before //
  await wpage.setViewportSize({width: 430, height: 900});
  await wpage.waitForTimeout(600);
  const ghostTrack = wpage.locator('#preview svg g[data-strip=""]', {has: wpage.locator('circle[stroke-dasharray]')}).first().locator('[data-track]');
  const gb = await ghostTrack.boundingBox();
  await wpage.mouse.click(gb.x + gb.width * 0.6, gb.y + 4);
  await wpage.waitForTimeout(500);
  const wsrc6 = await wpage.evaluate(() => localStorage.getItem('wardley-src'));
  check('wardley: tap-to-place writes @ before the trailing comment', /Analytics pipeline @ 0\.\d+\s+\/\//.test(wsrc6));
  check('wardley: no page errors', werrors.length === 0);
  await wpage.close();
}

/* ---- wardley narrow (mobile-emulated): add-card, focus opt-out, tap-to-place,
   remove — a 430px DESKTOP viewport (above) still reports pointer:fine, so the
   focus-opt-out assertion needs a real touch-emulated context. ---- */
{
  const mctx = await browser.newContext({...devices['iPhone 13']});
  const mpage = await mctx.newPage();
  const merrors = [];
  mpage.on('pageerror', e => merrors.push(e.message));
  await mpage.goto((process.env.BASE || 'http://localhost:8087') + '/wardley/', {waitUntil: 'networkidle'});
  await mpage.waitForTimeout(600);

  // tap the "+ Add component" card (no data-stage on narrow) → type Inbox → Enter
  await settledTap(mpage, mpage.locator('[data-edit="additem"]').first());
  await mpage.waitForTimeout(200);
  await mpage.locator('.eip-input').fill('Inbox');
  await mpage.keyboard.press('Enter');
  await mpage.waitForTimeout(600);
  const msrc = await mpage.evaluate(() => localStorage.getItem('wardley-src'));
  check('wardley narrow: add-card inserts Inbox as an unplaced ghost (no stage)', /^Inbox$/m.test(msrc));
  check('wardley narrow: coarse-pointer add opts OUT of editor focus', await mpage.evaluate(() =>
    !document.activeElement || !document.activeElement.closest('.cm-editor')));

  // tap Inbox's ghost strip at ~70% along its track
  const inboxTrack = mpage.locator('#preview svg g[data-strip=""][data-name="Inbox"] [data-track]');
  await inboxTrack.scrollIntoViewIfNeeded();
  await mpage.waitForTimeout(300);
  const itb = await inboxTrack.boundingBox();
  await mpage.mouse.click(itb.x + itb.width * 0.7, itb.y + itb.height / 2);
  await mpage.waitForTimeout(600);
  const msrc2 = await mpage.evaluate(() => localStorage.getItem('wardley-src'));
  check('wardley narrow: tap-to-place at ~70% writes @ 0.68-0.71', /Inbox @ 0\.(6[89]|7[01]?)\b/.test(msrc2));

  // remove Inbox via the card's ⋯ menu
  await settledTap(mpage, mpage.locator('[data-edit="componentmenu"][data-raw="Inbox"]').first());
  await mpage.waitForTimeout(200);
  await settledTap(mpage, mpage.locator('.eip-pop button.danger', {hasText: 'Remove component'}));
  await mpage.waitForTimeout(600);
  const msrc3 = await mpage.evaluate(() => localStorage.getItem('wardley-src'));
  check('wardley narrow: remove via the card menu drops Inbox', !/\bInbox\b/.test(msrc3));
  check('wardley narrow: no page errors', merrors.length === 0);

  /* ---- clamp check (same mobile context): a milestone label near the right
     screen edge on /timeline/ — its eip-input must stay inside the viewport.
     Scroll to bring the RIGHTMOST label's right edge near the pane's right
     edge (not to scrollWidth — the plot has trailing margin past the last
     label, which would scroll every label off the left of the view). ---- */
  await mpage.goto((process.env.BASE || 'http://localhost:8087') + '/timeline/', {waitUntil: 'networkidle'});
  await mpage.waitForTimeout(700);
  const edgeLabel = await mpage.evaluate(() => {
    const prev = document.getElementById('preview');
    prev.scrollLeft = 0;
    const pr0 = prev.getBoundingClientRect();
    const labels = [...prev.querySelectorAll('svg [data-edit="label"]')];
    let best = null, bestRight = -Infinity;
    for(const el of labels){
      const r = el.getBoundingClientRect();
      const right = (r.left - pr0.left) + r.width;
      if(right > bestRight){ bestRight = right; best = el; }
    }
    if(!best) return null;
    const r0 = best.getBoundingClientRect();
    prev.scrollLeft = Math.max(0, (r0.left - pr0.left) + r0.width - prev.clientWidth + 40);
    const r1 = best.getBoundingClientRect();
    return {x: r1.left, y: r1.top, w: r1.width, h: r1.height};
  });
  check('timeline narrow: a milestone label sits near the scrolled-right edge', !!edgeLabel);
  if(edgeLabel){
    const vp = mpage.viewportSize();
    await mpage.mouse.click(edgeLabel.x + edgeLabel.w / 2, edgeLabel.y + edgeLabel.h / 2);
    await mpage.waitForTimeout(300);
    const ib = await mpage.locator('.eip-input').boundingBox();
    check('timeline narrow: eip-input clamps within the viewport', !!ib &&
      ib.x >= 0 && ib.x + ib.width <= vp.width + 1 && ib.y >= 0 && ib.y + ib.height <= vp.height + 1);
    await mpage.keyboard.press('Escape');
    await mpage.waitForTimeout(200);
  }
  await mctx.close();
}

/* ---- timeline desktop: per-lane add zone opens empty, typed value replaces
   the dated placeholder (not "New milestone" — that would test nothing) ---- */
{
  const p = await browser.newPage({viewport: {width: 1500, height: 1000}});
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  const seed = {t: 'title: Pen test doc\nGrid: Existing item 2026-08 .. 2026-10\n'};
  const hash = Buffer.from(unescape(encodeURIComponent(JSON.stringify(seed))), 'binary').toString('base64');
  await p.goto((process.env.BASE || 'http://localhost:8087') + '/timeline/#' + hash, {waitUntil: 'networkidle'});
  await p.waitForTimeout(500);
  await p.locator('[data-edit="additem"][data-lane="Grid"]').first().click();
  await p.waitForTimeout(200);
  check('timeline: lane zone opens the eip-input empty', await p.locator('.eip-input').inputValue() === '');
  await p.locator('.eip-input').fill('Pen test');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(600);
  const t = await p.evaluate(() => localStorage.getItem('timeline-src'));
  check('timeline: lane add writes a lane-prefixed dated placeholder, typed value in',
    /^Grid: Pen test \d{4}-\d{2} \.\. \d{4}-\d{2}$/m.test(t));
  check('timeline: no page errors', errs.length === 0);
  await p.close();
}

console.log(results.join('\n'));
await browser.close();
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
