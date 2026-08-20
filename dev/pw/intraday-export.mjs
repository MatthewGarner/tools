/* Intraday's portable artefact is deliberately composite: a full day is only
   useful with the selected-hour stack that explains it. Prove the three export
   actions use that one snapshot, in both real themes, including the browser's
   native SVG→canvas→PNG decode path rather than a string-only imitation. */
import {chromium} from 'playwright';
import {trackErrors, report, tally} from './_harness.mjs';

const BASE = process.env.BASE || 'http://localhost:8087';
const browser = await chromium.launch();
const results = [];
const check = (name, ok) => results.push((ok ? 'PASS ' : 'FAIL ') + name);

async function downloadBytes(page, selector){
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator(selector).click(),
  ]);
  const stream = await download.createReadStream();
  if(!stream) throw new Error(`download ${selector} has no readable stream`);
  const chunks = [];
  for await(const chunk of stream) chunks.push(chunk);
  return {name: download.suggestedFilename(), bytes: Buffer.concat(chunks)};
}

async function nativePngDetails(page, bytes){
  return page.evaluate(async base64 => {
    const data = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([data], {type: 'image/png'}));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d', {willReadFrequently: true});
    ctx.drawImage(bitmap, 0, 0);
    const pixels = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
    const inkIn = (from, to) => {
      let count = 0;
      for(let y = Math.floor(bitmap.height * from); y < Math.floor(bitmap.height * to); y += 16)
        for(let x = 0; x < bitmap.width; x += 16){
          const i = (y * bitmap.width + x) * 4, r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
          if(Math.min(r, g, b) < 205 || Math.max(r, g, b) - Math.min(r, g, b) > 40) count++;
        }
      return count;
    };
    return {width: bitmap.width, height: bitmap.height, priceInk: inkIn(.10, .51), stackInk: inkIn(.55, .96)};
  }, bytes.toString('base64'));
}

for(const theme of ['light', 'dark']){
  const page = await browser.newPage({colorScheme: theme, reducedMotion: 'reduce'});
  const errors = trackErrors(page);
  try{
    await page.goto(BASE + '/energy/intraday/', {waitUntil: 'networkidle'});
    await page.locator('#fleetGW').fill('6');
    await page.locator('#fleetGW').dispatchEvent('input');
    await page.locator('#scrub').fill('18');
    await page.locator('#scrub').dispatchEvent('input');
    await page.waitForFunction(() => document.querySelector("[data-cursor='18']"));

    check(`intraday export(${theme}): Copy PNG names the day + stack handoff`,
      await page.locator('#copypng').textContent() === 'Copy PNG — day + stack summary');
    check(`intraday export(${theme}): Copy PNG explains the composite`,
      await page.locator('#copypng').getAttribute('aria-label') === 'Copy PNG — day + stack summary');

    const svgDownload = await downloadBytes(page, '#dlsvg');
    const svg = svgDownload.bytes.toString('utf8');
    const root = svg.match(/^<svg[^>]*\bwidth="(\d+)"\s+height="(\d+)"[^>]*data-tool="intraday-day-stack"/);
    const header = svg.match(/SELECTED HOUR · (\d\d):00/);
    const cursor = svg.match(/data-cursor='(\d+)'/);
    check(`intraday export(${theme}): SVG download has the composite filename`, svgDownload.name === 'intraday-day-stack.svg');
    check(`intraday export(${theme}): SVG carries the full day, selected stack and verdict`,
      !!root && svg.includes('INTRADAY PRICE') && svg.includes('MERIT ORDER') && svg.includes('THE TAKEAWAY'));
    check(`intraday export(${theme}): SVG snapshot does not mix the selected hour`,
      !!header && !!cursor && Number(header[1]) === Number(cursor[1]));

    const pngDownload = await downloadBytes(page, '#dlpng');
    const png = pngDownload.bytes;
    const pngDetails = await nativePngDetails(page, png);
    check(`intraday export(${theme}): PNG download has the composite filename`, pngDownload.name === 'intraday-day-stack.png');
    check(`intraday export(${theme}): PNG has a native image signature`,
      png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
    check(`intraday export(${theme}): PNG decodes at the shared 2× export size`,
      !!root && pngDetails.width === Number(root[1]) * 2 && pngDetails.height === Number(root[2]) * 2);
    check(`intraday export(${theme}): PNG paints both the day and selected stack panels`,
      pngDetails.priceInk > 40 && pngDetails.stackInk > 40);

    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.locator('#copypng').click();
    await page.waitForFunction(() => document.getElementById('copypng').textContent.startsWith('Copied'), null, {timeout: 6000});
    check(`intraday export(${theme}): Copy PNG completes after native rasterisation`, true);

    await page.locator('#play').click();
    await page.waitForFunction(() => document.querySelector("[data-cursor='1']"), null, {timeout: 3000});
    const raced = (await downloadBytes(page, '#dlsvg')).bytes.toString('utf8');
    const racedHour = raced.match(/SELECTED HOUR · (\d\d):00/)?.[1];
    const racedCursor = raced.match(/data-cursor='(\d+)'/)?.[1];
    check(`intraday export(${theme}): playback-adjacent export remains one hour snapshot`,
      racedHour !== undefined && racedCursor !== undefined && Number(racedHour) === Number(racedCursor));
    check(`intraday export(${theme}): no console errors`, errors.length === 0);
  }catch(error){
    check(`intraday export(${theme}): complete flow reports instead of crashing (${error.message})`, false);
  }finally{
    await page.close();
  }
}

console.log(results.join('\n'));
await browser.close();
report('intraday-export', {...tally(results), min: 22});
