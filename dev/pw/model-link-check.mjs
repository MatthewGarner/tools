import assert from 'node:assert/strict';

/* The link behaviour (click-time state, denied-clipboard fallback, oversize guard)
   lives in shareModel, shared by the injected "Copy model link" button and the
   shell's Share. This drives it on a synthetic host so it works on any page,
   including stamped-shell pages, where mountModelLink hands off to the shell. */
export async function checkModelLink(page){
  await page.evaluate(async () => {
    const {shareModel} = await import('/assets/model-link.js');
    const host = document.createElement('div'); host.id = 'link-check'; document.body.prepend(host);
    window.mountLink = maxLength => {
      host.replaceChildren();
      const button = document.createElement('button'), status = document.createElement('span');
      status.setAttribute('role', 'status'); host.append(button, status);
      button.addEventListener('click', () => shareModel({getState:() => window.linkState, maxLength, status, button}));
    };
    window.linkState = {t:'Old model'};
    Object.defineProperty(navigator, 'clipboard', {configurable:true, value:{writeText:async text => {window.copiedModel=text;}}});
    window.mountLink(6000);
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
  await page.evaluate(() => {
    window.copiedModel=null;
    navigator.clipboard.writeText=async text => {window.copiedModel=text;};
    window.mountLink(1);
  });
  await page.locator('#link-check button').click();
  await page.waitForFunction(() => document.querySelector('#link-check [role=status]').textContent.includes('too large'));
  assert.equal(await page.evaluate(() => window.copiedModel), null, 'oversized models never copy an older URL');
  await page.evaluate(() => {document.querySelector('#link-check').remove();delete navigator.clipboard;});
  console.log('model link: fresh state, denied clipboard fallback, oversized guard');
}

/* The injected "Copy model link" path (mountModelLink on a page with no stamped shell):
   click-time state, denied-clipboard fallback, oversize guard. Run it on an unmigrated page. */
export async function checkInjectedModelLink(page){
  await page.evaluate(async () => {
    const {mountModelLink} = await import('/assets/model-link.js');
    const host = document.createElement('div'); host.id = 'link-check'; document.body.prepend(host);
    window.linkState = {t:'Old model'};
    Object.defineProperty(navigator, 'clipboard', {configurable:true, value:{writeText:async text => {window.copiedModel=text;}}});
    window.injected = mountModelLink(host, {getState:() => window.linkState});
    window.linkState = {t:'Latest unsynchronised edit'};
  });
  assert.ok(await page.evaluate(() => window.injected instanceof HTMLButtonElement), 'an unmigrated page still gets its own button back');
  await page.locator('#link-check button').click();
  await page.waitForFunction(() => window.copiedModel);
  const state = await page.evaluate(async () => {
    const {decodeHash} = await import('/assets/series.js');
    return decodeHash(new URL(window.copiedModel).hash.slice(1));
  });
  assert.equal(state.t, 'Latest unsynchronised edit', 'injected button snapshots current state at click time');
  assert.equal(await page.locator('#link-check [role=status]').textContent(), 'Model link copied — opens a separate copy.', 'injected button keeps its own wording');
  await page.evaluate(() => {navigator.clipboard.writeText=async () => {throw Error('Denied');};});
  await page.locator('#link-check button').click();
  const dialog = page.getByRole('dialog', {name:'Copy model link'});
  await dialog.waitFor();
  assert.equal(await dialog.getByRole('heading', {name:'Copy model link'}).count(), 1, 'injected fallback keeps its own heading');
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
  assert.equal(await page.evaluate(() => window.copiedModel), null, 'injected button: oversized models never copy an older URL');
  await page.evaluate(() => {document.querySelector('#link-check').remove();delete navigator.clipboard;});
}
