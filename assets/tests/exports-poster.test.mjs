import {test} from 'node:test';
import assert from 'node:assert/strict';

// Minimal DOM stubs so exports.js (via app-common.js, which touches `document`
// at import time) loads in node. We only exercise the branch selection — the
// PNG plumbing (svgToCanvas/download) is covered by the browser smoke.
globalThis.document = globalThis.document || {
  createElement: () => ({getContext: () => ({}), appendChild() {}, click() {}}),
};

test('wireExports invokes getPoster when the poster button is clicked', async () => {
  const {wireExports} = await import('../exports.js');
  let called = false;
  const handlers = {};
  const btn = {addEventListener: (ev, fn) => { handlers[ev] = fn; }, textContent: ''};
  wireExports({
    buttons: {dlposter: btn},
    getPoster: () => { called = true; return null; },   // null → handler returns before svgToCanvas
    slug: () => 'x',
  });
  handlers.click();
  assert.equal(called, true);
});
