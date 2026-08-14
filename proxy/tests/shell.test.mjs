import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');

test('shell keeps the suite scaffold, local URL model and PWA head', () => {
  for(const file of ['/assets/tokens.css', '/assets/page.css', '/assets/controls.css',
    '/assets/workspace.css', '/manifest.webmanifest', '/assets/pwa.js'])
    assert.ok(html.includes(file), file);
  assert.match(app, /readHashState/);
  assert.match(app, /writeHashState/);
  assert.match(app, /parse\(text\)/);
  assert.match(app, /project\(model, selectedTheoryId\)/);
  assert.match(app, /renderHuntNarrow/);
});

test('full and scoped exports state their different scope in the interface', () => {
  assert.match(html, /Full hunt · all theories/);
  assert.match(html, /Selected theory · scoped receipt/);
  assert.match(app, /renderHunt\(fullHuntProjection\(model\),/);
  assert.match(app, /renderHuntReceipt/);
});

test('shell keeps causal caveats visible outside the SVG and supports keyboard selection', () => {
  assert.match(html, /id="causalnote"[^>]+aria-live="polite"/);
  assert.match(html, /id="viewreceipt"[^>]+disabled>View selected receipt/);
  assert.match(app, /Causal limit —/);
  assert.match(app, /event\.key !== 'Enter' && event\.key !== ' '/);
  assert.match(app, /function focusReceipt/);
  assert.match(app, /scrollIntoView/);
  assert.match(app, /focusReceiptAfter:true/);
});

test('shell documents and wires the author-stated verdict without replacing the computed review state', () => {
  const shell = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(shell, /verdict: Keep the measure paired with the guardrail/);
  assert.match(shell, /authorverdict/);
  assert.match(app, /Author-stated verdict/);
  assert.match(app, /verdictMenuRows/);
  assert.match(app, /REVIEW state/i);
});
