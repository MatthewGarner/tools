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
import {matchingHeaderRows, responseHeaders} from './response-headers.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const vercel = JSON.parse(readFileSync(ROOT + 'vercel.json', 'utf8'));

const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; " +
  "base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

const EXPECTED = [{
  source: '/(.*)',
  headers: [
    {key: 'X-Content-Type-Options', value: 'nosniff'},
    {key: 'Referrer-Policy', value: 'no-referrer'},
  ],
}, {
  source: '/((?!embed/).*)',
  headers: [{key:'Content-Security-Policy', value:CSP}],
}, {
  source: '/embed/(.*)',
  headers: [{key:'Content-Security-Policy', value:CSP.replace("frame-ancestors 'none'", 'frame-ancestors https://www.matthewgarner.me https://matthewgarner.me')}],
}];

/* The CSP as SHIPPED — read back out of the parsed file. The two tests below used to
   re-parse the CSP constant above, which is a string this file wrote itself: they were
   internally consistent by construction and could not fail from any edit to
   vercel.json. Caught in review, and it is the exact defect this branch exists to
   remove — a check that reads as a named guarantee while asserting nothing. */
const shippedCsp = () => {
  const row = (vercel.headers || []).find(r => r.source === '/((?!embed/).*)');
  return ((row && row.headers) || []).find(h => h.key === 'Content-Security-Policy')?.value || '';
};
const directives = () => shippedCsp().split(';').map(d => d.trim()).filter(Boolean);

test('vercel.json ships exactly the expected headers, on every path', () => {
  assert.deepEqual(vercel.headers, EXPECTED);
});

test('embed CSP never intersects the default deny policy, including the redirect', () => {
  for(const path of ['/flow/', '/', '/embed', '/embedded/', '/embed/v1/flow', '/embed/v1/flow/', '/embed/v1/flow/app.js']){
    const policies = matchingHeaderRows(path).flatMap(row => row.headers.filter(header => header.key === 'Content-Security-Policy'));
    assert.equal(policies.length, 1, path + ' has exactly one CSP');
    assert.equal(policies[0].value.includes("frame-ancestors 'none'"), !path.startsWith('/embed/'), path);
    assert.ok(!policies[0].value.includes('localhost'), 'production must not allow local framing');
    assert.equal(responseHeaders(path)['X-Content-Type-Options'], 'nosniff');
  }
  assert.match(responseHeaders('/embed/v1/flow/', {local:true})['Content-Security-Policy'], /http:\/\/127\.0\.0\.1:4321/);
  assert.equal(responseHeaders('/flow/', {local:true})['Content-Security-Policy'], CSP);
});

/* Pinning by value already catches a loosened policy, but only as an opaque diff.
   These name the two properties that actually matter, so a failure says WHICH
   guarantee was given up rather than just "the string changed". */
test('script-src stays exactly self — no unsafe-inline, no unsafe-eval, no host', () => {
  assert.equal(directives().find(d => d.startsWith('script-src')), "script-src 'self'",
    'script-src is the repo\'s primary defence and no inline script ships anywhere ' +
    '(the service worker registers via assets/pwa.js); widening it needs its own argument');
});

test('the inline-style allowance is confined to style-src', () => {
  const found = directives();
  assert.ok(found.length >= 5, 'no CSP directives found in vercel.json — this test would ' +
    'otherwise pass by iterating nothing');
  for(const directive of found){
    if(directive.startsWith('style-src')) continue;   // tool CSS is inlined by design
    assert.ok(!/unsafe-inline|unsafe-eval/.test(directive),
      'unsafe-* escaped into ' + directive.split(' ')[0] + ' — style-src is the only ' +
      'directive allowed to carry it');
  }
});
