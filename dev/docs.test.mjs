/* Meta-test: every repo-relative file path named in a COMMITTED doc must exist.
   CLAUDE.md is deliberately NOT scanned — it's gitignored and absent on CI's clean
   checkout, so scanning it would break CI. Same self-enforcing spirit as
   dev/renderer-coverage.test.mjs: a doc can't quietly rot past a rename.

   Extraction rule (tuned so the docs' own prose doesn't false-positive): consider
   only backtick-quoted tokens and relative markdown-link targets; require a '/';
   reject anything with whitespace, one of <>*:` , or an ellipsis '…' (globs,
   placeholders like <tool>/index.html, config keys like title:, URLs, and
   illustrative paths like `../../assets/…` all carry one of those); and reject a
   dotted first path-segment, which marks a hostname (`energy.matthewgarner.me/…`)
   rather than a repo directory (repo dirs don't have dots). A path resolves if it
   exists relative to the repo root OR to the doc's own directory (energy/README.md
   names paths relative to energy/). Un-backticked prose paths are allowed to slip —
   acceptable false negatives. These filter rules cover whole categories; ALLOW is
   only for a genuine one-off exception, each with a written reason. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {join, dirname} from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

/* docs to scan: [repo-relative doc path]. Committed docs only. */
const DOCS = ['ARCHITECTURE.md', 'README.md', 'energy/README.md'];

/* Tokens that survive the filter but are intentionally not real files.
   Each entry needs a reason. Empty today. */
const ALLOW = new Set([
  // 'some/token' — reason required before adding
]);

const dottedHost = t => {
  const first = t.split('/')[0];
  return first !== '.' && first !== '..' && first.includes('.');
};
const looksLikePath = t =>
  t.includes('/') && !/[\s<>*:`…]/.test(t) && !dottedHost(t) && !ALLOW.has(t);

/* strip trailing sentence punctuation a backtick/link token might carry */
const clean = t => t.replace(/[.,;)]+$/, '');

function candidatesIn(text){
  const out = new Set();
  for(const m of text.matchAll(/`([^`]+)`/g)) out.add(clean(m[1]));
  for(const m of text.matchAll(/\]\(([^)]+)\)/g)) out.add(clean(m[1]));
  return [...out].filter(looksLikePath);
}

function resolves(docPath, token){
  const docDir = dirname(join(ROOT, docPath));
  return existsSync(join(ROOT, token)) || existsSync(join(docDir, token));
}

for(const doc of DOCS){
  test(`every file path named in ${doc} exists`, () => {
    const abs = join(ROOT, doc);
    assert.ok(existsSync(abs), `${doc} itself is missing`);
    const text = readFileSync(abs, 'utf8');
    const missing = candidatesIn(text).filter(t => !resolves(doc, t));
    assert.deepEqual(missing, [],
      `${doc} names path(s) that don't exist: ${missing.join(', ')}`);
  });
}
