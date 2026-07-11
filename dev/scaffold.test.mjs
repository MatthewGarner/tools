/* Scaffold-parity gate: every tool page must carry the PWA head block. CLAUDE.md
   states this in prose ("new pages copy the PWA head block") after a tool once
   shipped without it (unstyled, the "wardley shipped unstyled" class of bug) —
   this makes the invariant self-enforcing at node-test time instead of relying
   on a Playwright pass to catch it. Reference shape: timeline/index.html for the
   tools origin, energy/merit-order/index.html for the energy origin (own
   manifest link, apple-touch-icon, ../ prefixed on energy). Kept to what's
   genuinely required of every tool — not over-fit to any one tool's extras. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {TOOL_DIRS, ENERGY_TOOL_DIRS} from './tool-dirs.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const read = p => readFileSync(join(ROOT, p), 'utf8');

function assertScaffold(html, who, manifestHref){
  assert.match(html, new RegExp('<link rel="manifest" href="' + manifestHref.replace(/\./g, '\\.') + '"'),
    who + ': missing rel="manifest" href="' + manifestHref + '"');
  assert.match(html, /<link rel="apple-touch-icon" href="[^"]+">/, who + ': missing apple-touch-icon');
  assert.match(html, /<meta name="theme-color"[^>]*>/, who + ': missing at least one theme-color meta');
  assert.match(html, /<meta name="apple-mobile-web-app-capable" content="yes">/,
    who + ': missing apple-mobile-web-app-capable');
  assert.match(html, /<script src="[^"]*\/pwa\.js" defer><\/script>/, who + ': missing the SW registration (pwa.js)');
}

test('every tools-origin page carries the PWA head block', () => {
  for(const dir of TOOL_DIRS)
    assertScaffold(read(dir + '/index.html'), dir, '/manifest.webmanifest');
});

test('every energy-origin page carries the PWA head block', () => {
  for(const dir of ENERGY_TOOL_DIRS)
    assertScaffold(read('energy/' + dir + '/index.html'), 'energy/' + dir, '../manifest.webmanifest');
});
