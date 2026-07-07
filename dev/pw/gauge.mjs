/* Gauge relay flow: facilitator + two participants against dev/gauge-dev.mjs.
   Run from dev/pw:  node gauge.mjs */
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';

const PORT = 8091;
const BASE = 'http://localhost:' + PORT;
const server = spawn('node', ['../../dev/gauge-dev.mjs', String(PORT)], {stdio: ['ignore', 'pipe', 'inherit']});
await new Promise((res, rej) => {
  const to = setTimeout(() => rej(new Error('dev server timeout')), 5000);
  server.stdout.on('data', d => { if(String(d).includes('listening')){ clearTimeout(to); res(); } });
  server.on('exit', () => rej(new Error('dev server died')));
});

const browser = await chromium.launch();
const results = [];
const check = (name, ok) => results.push((ok ? 'PASS ' : 'FAIL ') + name);
const watchErrors = page => {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  /* non-2xx fetches (the deliberate post-reveal 409) log as resource errors — not JS errors */
  page.on('console', m => {
    if(m.type() === 'error' && !m.text().includes('Failed to load resource'))
      errors.push('console: ' + m.text());
  });
  return errors;
};

try{
  /* facilitator composes and starts a session */
  const pageF = await (await browser.newContext()).newPage();
  const errF = watchErrors(pageF);
  await pageF.goto(BASE + '/gauge/', {waitUntil: 'networkidle'});
  await pageF.getByRole('button', {name: 'Q3 commitment review'}).click();
  await pageF.waitForTimeout(400);
  await pageF.locator('#startbtn').click();
  await pageF.waitForSelector('#console:not([hidden])', {timeout: 10000});
  check('facilitator: console mode after start', true);

  const joinUrl = await pageF.locator('#joinlink').inputValue();
  const decoded = JSON.parse(Buffer.from(joinUrl.split('#')[1], 'base64').toString('utf8'));
  check('join link: session id but no facilitator key', /^[0-9a-f]{32}$/.test(decoded.id) && !('key' in decoded));

  /* two participants in isolated contexts (B runs the dark theme) */
  async function participant(colorScheme, prob, low, high){
    const page = await (await browser.newContext({colorScheme})).newPage();
    const errors = watchErrors(page);
    await page.goto(joinUrl, {waitUntil: 'networkidle'});
    await page.locator('.q[data-q="0"] input[type=range]').evaluate((el, v) => {
      el.value = String(v);
      el.dispatchEvent(new Event('input', {bubbles: true}));
    }, prob);
    await page.locator('.q[data-q="1"] input[data-part=low]').fill(String(low));
    await page.locator('.q[data-q="1"] input[data-part=high]').fill(String(high));
    await page.locator('#psubmit').click();
    await page.waitForFunction(() => document.getElementById('pstatus').textContent.includes('Submitted'));
    return {page, errors};
  }
  const A = await participant('light', 80, 4, 8);
  const B = await participant('dark', 20, 30, 50);
  check('participants: both submitted', true);

  /* facilitator poll picks the count up (5s ± jitter cadence) */
  await pageF.waitForFunction(() => document.getElementById('ccount').textContent.includes('2'),
    null, {timeout: 20000});
  check('facilitator: poll shows 2 responses', true);

  check('facilitator: exports hidden before reveal', !(await pageF.locator('#cexports').isVisible()));
  check('facilitator: round-2 button hidden before reveal', !(await pageF.locator('#cround2wrap').isVisible()));

  /* pre-reveal independence on a participant device */
  await A.page.locator('#pview').click();
  await A.page.waitForFunction(() =>
    document.getElementById('pstatus').textContent.includes('Not revealed yet'));
  check('participant: pre-reveal shows only a count', await A.page.locator('#presult svg').count() === 0);
  check('participant: no add/remove affordances', await A.page.locator('.addq, .qdel').count() === 0);

  /* reveal: two-step arm, then overlay */
  await pageF.locator('#creveal').click();
  await pageF.locator('#creveal').click();
  await pageF.waitForSelector('#coverlay svg', {timeout: 10000});
  const overlay = await pageF.locator('#coverlay svg').innerHTML();
  check('facilitator: overlay has a headline', /median|Split room|agreement|wider than/i.test(overlay));
  check('facilitator: exports offered', await pageF.locator('#cexports').isVisible());

  /* actually click the exports — the quoted-font-stack bug (fixed 2026-07-06) made
     PNG export silently dead while 'exports offered' still passed */
  {
    const [svgDl] = await Promise.all([pageF.waitForEvent('download', {timeout: 5000}),
      pageF.locator('#dlsvg2').click()]);
    check('facilitator: Download SVG produces a file', /\.svg$/.test(svgDl.suggestedFilename()));
    const [pngDl] = await Promise.all([pageF.waitForEvent('download', {timeout: 8000}),
      pageF.locator('#dlpng2').click()]);
    check('facilitator: Download PNG produces a file (SVG decoded)', /\.png$/.test(pngDl.suggestedFilename()));
  }

  /* post-reveal edit rejected by the server */
  await B.page.locator('#psubmit').click();
  await B.page.waitForFunction(() => document.getElementById('pstatus').textContent.includes('locked'));
  check('participant: post-reveal edit rejected', true);

  /* participant pulls the overlay on demand */
  await B.page.locator('#pview').click();
  await B.page.waitForSelector('#presult svg', {timeout: 5000});
  check('participant: results pulled on demand', true);

  await pageF.screenshot({path: 'gauge-console-light.png', fullPage: true});
  await B.page.screenshot({path: 'gauge-participant-dark.png', fullPage: true});

  /* #93: revealed ranges hand off to fermi as prefilled variables */
  check('facilitator: → Fermi appears after reveal', await pageF.locator('#tofermi').isVisible());
  {
    const target = await pageF.evaluate(() => {
      // read the destination without navigating the console away
      return document.getElementById('tofermi') ? 'ok' : 'missing';
    });
    const [nav] = await Promise.all([
      pageF.waitForNavigation({timeout: 8000}),
      pageF.locator('#tofermi').click(),
    ]);
    check('facilitator: → Fermi lands on fermi with the range prefilled', await (async () => {
      if(!pageF.url().includes('/fermi/')) return false;
      await pageF.waitForTimeout(600);
      const formula = await pageF.locator('#formula').inputValue();
      const p50 = await pageF.locator('#p50').innerText();
      return formula.includes('weeks_to_migrate') && p50.length > 0 && p50 !== '—';
    })());
    await pageF.goBack();
    await pageF.waitForTimeout(800);
    check('facilitator: console restores after the hop', await pageF.locator('#coverlay svg').count() === 1);
  }

  /* Delphi round 2: open (two-step arm), A revises, B stands pat, reveal both rounds */
  await pageF.locator('#cround2').click();
  await pageF.locator('#cround2').click();
  await pageF.waitForFunction(() => document.getElementById('creveal').textContent === 'Reveal round 2');
  check('facilitator: round 2 opens and reveal re-arms', true);

  await A.page.locator('.q[data-q="0"] input[type=range]').evaluate(el => {
    el.value = '40';
    el.dispatchEvent(new Event('input', {bubbles: true}));
  });
  await A.page.locator('#psubmit').click();
  await A.page.waitForFunction(() => document.getElementById('pstatus').textContent.includes('Submitted'));
  check('participant: round-2 resubmission accepted', true);

  await B.page.locator('#pview').click();
  await B.page.waitForFunction(() => document.getElementById('pstatus').textContent.includes('Round 2'));
  check('participant: round-2 notice on view', true);

  await pageF.waitForFunction(() => document.getElementById('ccount').textContent.includes('1 of 2'),
    null, {timeout: 20000});
  check('facilitator: round-2 count shows revisions vs carry-forward', true);

  /* Bug-2 regression: a newcomer who skipped round 1 submits in round 2. The
     denominator is the whole final room (A,B,C = 3), never the round-1 count — it
     must read "2 of 3", never "2 of 2" (pre-fix) or the "2 of 1" nonsense. */
  const C = await participant('light', 55, 10, 14);
  check('participant C: newcomer submits in round 2', true);
  await pageF.waitForFunction(() => document.getElementById('ccount').textContent.includes('2 of 3'),
    null, {timeout: 20000});
  check('facilitator: round-2 newcomer counts into the final room (no "N of fewer")', true);

  await pageF.locator('#creveal').click();
  await pageF.locator('#creveal').click();
  await pageF.waitForFunction(() => document.getElementById('coverlay').innerHTML.includes('DELPHI'),
    null, {timeout: 10000});
  const dOverlay = await pageF.locator('#coverlay svg').innerHTML();
  check('facilitator: delphi overlay carries pooled + round-1 strip',
    /pooled/i.test(dOverlay) && /round 1/i.test(dOverlay));
  check('facilitator: no NaN in delphi overlay', !/NaN|undefined/.test(dOverlay));

  await B.page.locator('#pview').click();
  await B.page.waitForFunction(() => document.getElementById('presult').innerHTML.includes('DELPHI'));
  check('participant: delphi results pulled on demand', true);
  check('facilitator: round-2 button gone once round 2 is open',
    !(await pageF.locator('#cround2wrap').isVisible()));

  await pageF.screenshot({path: 'gauge-console-delphi-light.png', fullPage: true});

  /* facilitator ends the session early: relay entry deleted, exports keep working */
  await pageF.locator('#cend').click();
  await pageF.locator('#cend').click();
  await pageF.waitForFunction(() => document.getElementById('cend').textContent === 'Session ended');
  check('facilitator: end session deletes relay entry', true);
  await A.page.locator('#pview').click();
  await A.page.waitForFunction(() => document.getElementById('pstatus').textContent.includes('ended'));
  check('participant: view after end says session ended', true);
  check('facilitator: exports still offered after end', await pageF.locator('#cexports').isVisible());

  check('no console errors (facilitator)', errF.length === 0);
  check('no console errors (participant A)', A.errors.length === 0);
  check('no console errors (participant B)', B.errors.length === 0);
  check('no console errors (participant C)', C.errors.length === 0);
}finally{
  await browser.close();
  server.kill();
}
console.log(results.join('\n'));
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
