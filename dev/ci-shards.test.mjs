/* The CI shard partition (dev/pw/shards.mjs) must cover EXACTLY the suites the local
   gate runs (the `verify` chain in dev/pw/package.json). Without this guard a new
   suite added to `verify` but forgotten in a shard runs on the laptop yet silently
   never runs in CI — a hole in the post-merge gate. This is the same drift class the
   repo already guards for tool-dirs, the renderer/injection corpus and the scaffold.
   Runs in the fast node job, so it fails at test time, not in production. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {SHARDS, ALL_SUITES} from './pw/shards.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, 'pw', 'package.json'), 'utf8'));
/* the canonical suite list = every `node X.mjs` the `verify` chain invokes */
const verifySuites = [...pkg.scripts.verify.matchAll(/node\s+(\S+\.mjs)/g)].map(m => m[1]);

test('the shards cover exactly the verify chain — no suite skips CI, none is a phantom', () => {
  assert.deepEqual([...ALL_SUITES].sort(), [...verifySuites].sort(),
    'dev/pw/shards.mjs and package.json "verify" have drifted — a suite runs locally but not in CI, or vice versa');
});

test('no suite is assigned to two shards', () => {
  assert.equal(new Set(ALL_SUITES).size, ALL_SUITES.length, 'a suite is duplicated across shards');
});

test('every sharded suite file exists', () => {
  for(const s of ALL_SUITES) assert.ok(existsSync(join(here, 'pw', s)), 'missing suite file: ' + s);
});

test('each shard declares chromium (optionally + webkit), nothing else', () => {
  for(const s of SHARDS){
    assert.match(s.browsers, /^chromium( webkit)?$/, s.name + ' has an unexpected browser set: ' + s.browsers);
    assert.ok(s.name && s.suites.length, s.name + ' shard is malformed');
  }
});
