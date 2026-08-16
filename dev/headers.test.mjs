/* The response headers are the security posture, and until now nothing in the gate
   read them. vercel.json's headers block could be loosened — `script-src 'self'
   'unsafe-inline'`, say — and every check stayed green: the node suite never opened
   the file, and the browser suites make it WEAKER-passing, because dev/serve.mjs
   applies whatever is in vercel.json, so a looser policy produces FEWER CSP
   violations for webkit.mjs to count. The one post-deploy probe that does look
   (dev/prod-check.mjs) asserts with .includes("script-src 'self'"), a substring that
   `script-src 'self' 'unsafe-inline'` also satisfies.

   So the block is pinned by value. Changing it is then a deliberate, reviewed diff
   rather than something that can drift in unnoticed — the same trade origins.test.mjs
   makes for the rewrite rows. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const vercel = JSON.parse(readFileSync(ROOT + 'vercel.json', 'utf8'));

const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; " +
  "base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

const EXPECTED = [{
  source: '/(.*)',
  headers: [
    {key: 'Content-Security-Policy', value: CSP},
    {key: 'X-Content-Type-Options', value: 'nosniff'},
    {key: 'Referrer-Policy', value: 'no-referrer'},
  ],
}];

test('vercel.json ships exactly the expected headers, on every path', () => {
  assert.deepEqual(vercel.headers, EXPECTED);
});

/* Pinning by value already catches a loosened policy, but only as an opaque diff.
   These name the two properties that actually matter, so a failure says WHICH
   guarantee was given up rather than just "the string changed". */
test('script-src stays exactly self — no unsafe-inline, no unsafe-eval, no host', () => {
  const directive = CSP.split(';').map(d => d.trim()).find(d => d.startsWith('script-src'));
  assert.equal(directive, "script-src 'self'",
    'script-src is the repo\'s primary defence and no inline script ships anywhere ' +
    '(the service worker registers via assets/pwa.js); widening it needs its own argument');
});

test('the inline-style allowance is confined to style-src', () => {
  for(const directive of CSP.split(';').map(d => d.trim())){
    if(directive.startsWith('style-src')) continue;   // tool CSS is inlined by design
    assert.ok(!/unsafe-inline|unsafe-eval/.test(directive),
      'unsafe-* escaped into ' + directive.split(' ')[0] + ' — style-src is the only ' +
      'directive allowed to carry it');
  }
});
