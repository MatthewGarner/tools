/* Edit-in-place browser checks (tree). */
import {chromium} from 'playwright';
const BASE = (process.env.BASE || 'http://localhost:8087') + '/tree/';
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1500, height: 1000}});
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const results = [];
const check = (name, ok) => results.push((ok ? 'PASS ' : 'FAIL ') + name);

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

console.log(results.join('\n'));
await browser.close();
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
