import assert from 'node:assert/strict';

export async function checkModelLink(page){
  await page.evaluate(async () => {
    const {mountModelLink} = await import('/assets/model-link.js');
    const host = document.createElement('div'); host.id = 'link-check'; document.body.prepend(host);
    window.linkState = {t:'Old model'};
    Object.defineProperty(navigator, 'clipboard', {configurable:true, value:{writeText:async text => {window.copiedModel=text;}}});
    mountModelLink(host, {getState:() => window.linkState});
    window.linkState = {t:'Latest unsynchronised edit'};
  });
  await page.locator('#link-check button').click();
  await page.waitForFunction(() => window.copiedModel);
  const state = await page.evaluate(async () => {
    const {decodeHash} = await import('/assets/series.js');
    return decodeHash(new URL(window.copiedModel).hash.slice(1));
  });
  assert.equal(state.t, 'Latest unsynchronised edit', 'copy snapshots current state, independently of the URL debounce');
  await page.evaluate(() => {navigator.clipboard.writeText=async () => {throw Error('Denied');};});
  await page.locator('#link-check button').click();
  const dialog = page.getByRole('dialog', {name:'Copy model link'});
  await dialog.waitFor();
  assert.equal(await dialog.locator('textarea').inputValue(), await page.evaluate(() => window.copiedModel));
  await dialog.getByRole('button', {name:'Done'}).click();
  await page.evaluate(async () => {
    const {mountModelLink} = await import('/assets/model-link.js');
    const host=document.querySelector('#link-check'); host.replaceChildren();
    window.copiedModel=null;
    navigator.clipboard.writeText=async text => {window.copiedModel=text;};
    mountModelLink(host, {getState:() => window.linkState, maxLength:1});
  });
  await page.locator('#link-check button').click();
  await page.waitForFunction(() => document.querySelector('#link-check [role=status]').textContent.includes('too large'));
  assert.equal(await page.evaluate(() => window.copiedModel), null, 'oversized models never copy an older URL');
  await page.evaluate(() => {document.querySelector('#link-check').remove();delete navigator.clipboard;});
  console.log('model link: fresh state, denied clipboard fallback, oversized guard');
}
