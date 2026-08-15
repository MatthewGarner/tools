/* Signal vs Noise interaction contract: the teaching grid is an input surface,
   not a decorative image. Keep its choice semantics and coarse targets honest. */
import {chromium} from 'playwright';
import {report, tally, trackErrors} from './_harness.mjs';

const BASE = process.env.BASE || 'http://localhost:8087';
const browser = await chromium.launch();
const results = [];
const check = (name, ok) => results.push((ok ? 'PASS ' : 'FAIL ') + name);

async function open(contextOptions = {}){
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const errors = trackErrors(page);
  await page.goto(BASE + '/signal-vs-noise/', {waitUntil: 'networkidle'});
  await page.waitForTimeout(250);
  return {context, page, errors};
}

try{
  {
    const {context, page, errors} = await open();
    const semantics = await page.locator('#stage svg').evaluate(svg => ({
      rootRole: svg.getAttribute('role'),
      choices: [...svg.querySelectorAll('[data-act]')].map(el => ({
        role: el.getAttribute('role'), checked: el.getAttribute('aria-checked'),
      })),
    }));
    check('Signal choices are not descendants of a leaf image and expose radio state',
      semantics.rootRole !== 'img' && semantics.choices.length > 0 &&
      semantics.choices.every(c => c.role === 'radio' && c.checked !== null));
    check('Signal keeps the learning loop visible from the first decision',
      (await page.locator('#learningTrace [data-step]').allTextContents()).join(' → ') === 'Observe → Choose → Reveal → Repeat' &&
      await page.locator('#learningTrace [aria-current="step"]').getAttribute('data-step') === 'observe');

    const firstTalk = page.locator('#stage [data-act="talk"]').first();
    const firstLeave = page.locator('#stage [data-act="leave"]').first();
    await firstTalk.click();
    check('Signal choice exposes its selected state',
      await firstTalk.getAttribute('aria-checked') === 'true' &&
      await firstLeave.getAttribute('aria-checked') === 'false');
    check('Signal trace records choosing without adding a second instruction panel',
      await page.locator('#learningTrace [aria-current="step"]').getAttribute('data-step') === 'choose');
    check('Signal choice announces the action without revealing truth',
      /investigat/i.test(await page.locator('#phaseStatus').innerText()) &&
      !/noise|signal|real decline/i.test(await page.locator('#phaseStatus').innerText()));
    await firstTalk.focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(20);
    check('Signal Arrow keys select the paired choice and retain focus',
      await firstLeave.getAttribute('aria-checked') === 'true' &&
      await firstLeave.evaluate(el => document.activeElement === el));
    check('Signal choice retains a visible neutral label',
      /INVESTIGATE/i.test(await firstTalk.textContent()) &&
      /LEAVE AS IS/i.test(await page.locator('#stage [data-act="leave"]').first().textContent()));
    check('Signal choice flow has no console errors', errors.length === 0);

    await page.locator('#next').click();
    check('Signal trace advances to reveal without exposing ground truth',
      await page.locator('#learningTrace [aria-current="step"]').getAttribute('data-step') === 'reveal' &&
      !/noise|signal|real decline/i.test(await page.locator('#reveal').innerText()));
    for(let i = 0; i < 14; i++) await page.locator('#next').click();
    check('Signal joins the personal receipt to its collapse artefact and leaves utilities quiet',
      await page.locator('#receipt').evaluate(el => !el.hidden && el.previousElementSibling?.id === 'stage' &&
        el.closest('.card') !== null && /What this run taught you/i.test(el.textContent)) &&
      await page.locator('#endcard').evaluate(el => !el.hidden && el.classList.contains('utility-band') &&
        !el.classList.contains('card')));
    await context.close();
  }

  for(const [name, viewport] of [
    ['portrait phone', {width: 390, height: 844}],
    ['landscape phone', {width: 844, height: 390}],
    ['tablet', {width: 1024, height: 768}],
  ]){
    const {context, page, errors} = await open({viewport, isMobile: true, hasTouch: true});
    const heights = await page.locator('#stage [data-act]').evaluateAll(els => els.map(el => el.getBoundingClientRect().height));
    check('Signal ' + name + ' choices are all >=44px', heights.length > 0 && heights.every(h => h >= 44));
    check('Signal ' + name + ' has no console errors', errors.length === 0);
    await context.close();
  }
}finally{
  await browser.close();
}

report('signal', {...tally(results), min: 16});
