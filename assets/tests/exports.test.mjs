import {test} from 'node:test';
import assert from 'node:assert/strict';

// Minimal DOM stubs so exports.js (via app-common.js, which touches `document`
// at import time) loads in node. We only exercise the branch selection — the
// PNG plumbing (svgToCanvas/download) is covered by the browser smoke.
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
