import {test} from 'node:test';
import assert from 'node:assert/strict';

// Minimal DOM stubs so exports.js (via app-common.js, which touches `document`
// at import time) loads in node. Canvas decoding stays a browser concern; the
// synchronous raster preflight and export contract are exercised here.
globalThis.document = globalThis.document || {
  createElement: () => ({getContext: () => ({}), appendChild() {}, click() {}}),
};

/* Copy PNG is the action that carries the deck-shaped render (2026-07-31, when
   the separate slide and poster downloads went): a tool with a distinct deck
   render passes getCopy, one without falls back to the plain chart. Getting
   that fallback wrong would silently copy nothing on half the suite. */
async function clickCopy(opts){
  const {wireExports} = await import('../exports.js');
  const handlers = {};
  const btn = {addEventListener: (ev, fn) => { handlers[ev] = fn; }, textContent: ''};
  wireExports({buttons: {copypng: btn}, slug: () => 'x', ...opts});
  handlers.click();
}

test('Copy PNG prefers getCopy — the deck-shaped render, not the plain chart', async () => {
  let copied = false, plain = false;
  await clickCopy({
    getCopy: () => { copied = true; return null; },   // null → handler returns before svgToCanvas
    getSvg: () => { plain = true; return null; },
  });
  assert.equal(copied, true);
  assert.equal(plain, false);
});

test('Copy PNG falls back to getSvg when the tool has no separate deck render', async () => {
  let plain = false;
  await clickCopy({getSvg: () => { plain = true; return null; }});
  assert.equal(plain, true);
});

test('export buttons expose native versus presentation semantics accessibly', async () => {
  const {wireExports} = await import('../exports.js');
  const makeButton = label => ({
    textContent: label,
    addEventListener() {},
    setAttribute(name, value){ this[name] = value; },
  });
  const buttons = {
    copypng: makeButton('Copy PNG'), copymd: makeButton('Copy as markdown'),
    dlpng: makeButton('PNG'), dlsvg: makeButton('SVG'),
  };
  wireExports({buttons, getSvg: () => null, getCopy: () => null,
    getMarkdown: () => null, slug: () => 'x'});
  assert.equal(buttons.copypng['aria-label'], 'Copy PNG — presentation summary');
  assert.match(buttons.dlpng['aria-label'], /full-detail PNG.*raster limit/);
  assert.match(buttons.dlsvg['aria-label'], /full-detail SVG.*exhaustive/);
  assert.equal(buttons.dlpng['aria-live'], 'polite');
});

test('Download PNG reports an over-budget native artboard without constructing a canvas', async () => {
  const {wireExports} = await import('../exports.js');
  const handlers = {};
  const btn = {textContent: 'PNG',
    addEventListener: (ev, fn) => { handlers[ev] = fn; },
    setAttribute(name, value){ this[name] = value; }};
  const previousTimeout = globalThis.setTimeout;
  globalThis.setTimeout = () => 0;
  try {
    wireExports({buttons: {dlpng: btn}, getSvg: () => '<svg width="2000" height="2000"/>',
      slug: () => 'large'});
    handlers.click();
    assert.equal(btn.textContent, 'PNG exceeds 3M-unit area — download SVG');
    assert.equal(btn['aria-label'], 'PNG exceeds 3M-unit area — download SVG');
  }finally {
    globalThis.setTimeout = previousTimeout;
  }
});

test('Copy PNG rejects an oversized render before ClipboardItem or clipboard.write', async () => {
  const {wireExports} = await import('../exports.js');
  const handlers = {};
  const btn = {textContent: 'Copy PNG', addEventListener: (ev, fn) => { handlers[ev] = fn; }};
  let items = 0, writes = 0;
  const previous = {
    navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
    window: Object.getOwnPropertyDescriptor(globalThis, 'window'),
    ClipboardItem: Object.getOwnPropertyDescriptor(globalThis, 'ClipboardItem'),
    setTimeout: globalThis.setTimeout,
  };
  class ClipboardItemStub { constructor(){ items += 1; } }
  Object.defineProperty(globalThis, 'navigator', {configurable: true, value: {
    clipboard: {write(){ writes += 1; return Promise.resolve(); }},
  }});
  Object.defineProperty(globalThis, 'ClipboardItem', {configurable: true, value: ClipboardItemStub});
  Object.defineProperty(globalThis, 'window', {configurable: true, value: {ClipboardItem: ClipboardItemStub}});
  globalThis.setTimeout = () => 0;
  try {
    wireExports({buttons: {copypng: btn}, getSvg: () => '<svg width="4097" height="1"/>',
      slug: () => 'wide'});
    handlers.click();
    assert.equal(btn.textContent, 'PNG exceeds 4,096px side — download SVG');
    assert.equal(items, 0);
    assert.equal(writes, 0);
  }finally {
    for(const name of ['navigator', 'window', 'ClipboardItem']){
      const descriptor = previous[name];
      if(descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
    globalThis.setTimeout = previous.setTimeout;
  }
});

test('valid Copy PNG calls clipboard.write in the originating click turn', async () => {
  const {wireExports} = await import('../exports.js');
  const handlers = {};
  const btn = {textContent: 'Copy PNG', addEventListener: (ev, fn) => { handlers[ev] = fn; }};
  let inClick = false, writes = 0;
  const previous = {
    navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
    window: Object.getOwnPropertyDescriptor(globalThis, 'window'),
    ClipboardItem: Object.getOwnPropertyDescriptor(globalThis, 'ClipboardItem'),
    Image: Object.getOwnPropertyDescriptor(globalThis, 'Image'),
  };
  class ClipboardItemStub { constructor(value){ this.value = value; } }
  class DeferredImage { set src(_){ /* decode deliberately remains pending */ } }
  Object.defineProperty(globalThis, 'navigator', {configurable: true, value: {
    clipboard: {write(){ assert.equal(inClick, true); writes += 1; return new Promise(() => {}); }},
  }});
  Object.defineProperty(globalThis, 'ClipboardItem', {configurable: true, value: ClipboardItemStub});
  Object.defineProperty(globalThis, 'window', {configurable: true, value: {ClipboardItem: ClipboardItemStub}});
  Object.defineProperty(globalThis, 'Image', {configurable: true, value: DeferredImage});
  try {
    wireExports({buttons: {copypng: btn}, getSvg: () => '<svg width="960" height="540"/>',
      slug: () => 'valid'});
    inClick = true;
    handlers.click();
    inClick = false;
    assert.equal(writes, 1);
  }finally {
    for(const name of ['navigator', 'window', 'ClipboardItem', 'Image']){
      const descriptor = previous[name];
      if(descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
});
