/* Frequency's live canvas is intentionally not a miniature SVG export. This
   browser path checks its time-based reveal, reduced/hidden completion rules,
   and the actual downloadable SVG's shared semantic teaching set. */
import {chromium} from 'playwright';
import {trackErrors, report, tally} from './_harness.mjs';

const BASE = process.env.BASE || 'http://localhost:8087';
const browser = await chromium.launch();
const results = [];
const check = (name, ok) => results.push((ok ? 'PASS ' : 'FAIL ') + name);

async function open(opts = {}){
  const page = await browser.newPage(opts);
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    window.__frequencyPaint = {paints: 0, frames: [], labels: []};
    HTMLCanvasElement.prototype.getContext = function(...args){
      const context = getContext.apply(this, args);
      if(this.id !== 'trace' || !context || context.__frequencyPainted) return context;
      context.__frequencyPainted = true;
      const clear = context.clearRect.bind(context), text = context.fillText.bind(context);
      context.clearRect = (...a) => {
        const paint = window.__frequencyPaint;
        paint.paints++; paint.frames.push([]);
        return clear(...a);
      };
      context.fillText = (...a) => {
        const paint = window.__frequencyPaint, label = String(a[0]);
        paint.labels.push(label); paint.frames.at(-1)?.push(label);
        return text(...a);
      };
      return context;
    };
  });
  await page.goto(BASE + '/energy/frequency/', {waitUntil: 'networkidle'});
  return {page, errors};
}

async function downloadSvg(page){
  await page.locator('details.action-disclosure > summary').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#dlsvg').click()]);
  const stream = await download.createReadStream();
  const chunks = [];
  for await(const chunk of stream) chunks.push(chunk);
  return {name: download.suggestedFilename(), svg: Buffer.concat(chunks).toString('utf8')};
}

{
  const {page, errors} = await open({viewport: {width: 1200, height: 860}, reducedMotion: 'no-preference'});
  try{
    await page.evaluate(() => { window.__frequencyPaint = {paints: 0, frames: [], labels: []}; });
    await page.locator('#tripbtn').click();
    await page.waitForFunction(() => window.__frequencyPaint.labels.includes('48.8 Hz — load shed'));
    const initial = await page.locator('#trace').evaluate(canvas => canvas.toDataURL());
    const first = await page.evaluate(() => window.__frequencyPaint);
    check('frequency live: initial frame paints static nominal and load-shed teaching labels',
      first.paints > 0 && first.labels.includes('50 Hz') && first.labels.includes('48.8 Hz — load shed'));
    check('frequency live: initial frame withholds the progressive nadir marker',
      !first.frames.find(frame => frame.includes('48.8 Hz — load shed'))?.some(label => label.startsWith('nadir ')));

    await page.waitForFunction(() => window.__frequencyPaint.paints >= 20);
    const middle = await page.locator('#trace').evaluate(canvas => canvas.toDataURL());
    check('frequency live: mid-animation trace differs from its opening frame', initial !== middle);

    await page.waitForFunction(() => window.__frequencyPaint.labels.some(label => label.startsWith('nadir ')), null, {timeout: 5000});
    const completed = await page.evaluate(() => window.__frequencyPaint);
    check('frequency live: completed animation reveals the nadir marker', completed.labels.some(label => label.startsWith('nadir ')));

    await page.locator('button', {hasText: 'Battery stack'}).click();
    await page.waitForFunction(() => window.__frequencyPaint.labels.includes('same grid, no battery'));
    const stack = await page.evaluate(() => window.__frequencyPaint.labels);
    check('frequency live: a service-enabled scene draws its static counterfactual immediately',
      stack.includes('same grid, no battery'));
    const exportFile = await downloadSvg(page);
    const exportState = await page.evaluate(svg => ({
      parseError: new DOMParser().parseFromString(svg, 'image/svg+xml').querySelector('parsererror') !== null,
      labels: ['50 Hz', '48.8 Hz — load shed', 'same grid, no battery'].every(label => svg.includes(label)),
      tiles: [...document.querySelectorAll('#t-rocof, #t-nadir, #t-shed')].map(el => el.textContent.trim()),
    }), exportFile.svg);
    check('frequency export: SVG download names the trace artefact', exportFile.name === 'frequency-inertia.svg');
    check('frequency export: XML decodes and carries the live scene labels', !exportState.parseError && exportState.labels);
    check('frequency live: screen-reader summary remains in the RoCoF, nadir and shedding tiles',
      /Hz\/s/.test(exportState.tiles[0]) && /Hz/.test(exportState.tiles[1]) && exportState.tiles[2].length > 0);
    check('frequency live: no console errors', errors.length === 0);
  }catch(error){
    check('frequency live: complete motion and export flow reports instead of crashing (' + error.message + ')', false);
  }finally{ await page.close(); }
}

{
  const {page, errors} = await open({reducedMotion: 'reduce'});
  try{
    await page.locator('button', {hasText: 'Battery stack'}).click();
    await page.waitForFunction(() => window.__frequencyPaint.labels.includes('same grid, no battery'));
    const state = await page.evaluate(() => window.__frequencyPaint);
    check('frequency reduced-motion: a service-enabled first paint is complete',
      state.labels.some(label => label.startsWith('nadir ')) && state.labels.includes('same grid, no battery'));
    check('frequency reduced-motion: no console errors', errors.length === 0);
  }catch(error){
    check('frequency reduced-motion: completed first frame reports instead of crashing (' + error.message + ')', false);
  }finally{ await page.close(); }
}

{
  const {page, errors} = await open({reducedMotion: 'no-preference'});
  try{
    await page.evaluate(() => { window.__frequencyPaint = {paints: 0, frames: [], labels: []}; });
    await page.locator('button', {hasText: 'Battery stack'}).click();
    await page.locator('#tripbtn').click();
    await page.waitForFunction(() => window.__frequencyPaint.labels.includes('same grid, no battery'));
    await page.evaluate(() => {
      window.__frequencyHidden = true;
      Object.defineProperty(document, 'hidden', {configurable: true, get: () => window.__frequencyHidden});
      document.dispatchEvent(new Event('visibilitychange'));
      window.__frequencyHidden = false;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const restored = await page.evaluate(() => window.__frequencyPaint);
    check('frequency hidden-tab restore: paints the completed service scene immediately',
      restored.labels.some(label => label.startsWith('nadir ')) && restored.labels.includes('same grid, no battery'));
    check('frequency hidden-tab restore: no console errors', errors.length === 0);
  }catch(error){
    check('frequency hidden-tab restore: completed restore reports instead of crashing (' + error.message + ')', false);
  }finally{ await page.close(); }
}

console.log(results.join('\n'));
await browser.close();
report('frequency', {...tally(results), min: 12});
