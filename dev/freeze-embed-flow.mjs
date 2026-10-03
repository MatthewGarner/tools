/* Reproduce the v1 snapshot from its recorded Git commit, never current Flow.
   --check validates; --write restores exact pinned bytes. Publish model changes
   under a new version rather than updating this manifest after release. */
import {readFileSync, writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const dir = new URL('embed/v1/flow/model/', root);
const provenance = JSON.parse(readFileSync(new URL('provenance.json', dir), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
for(const entry of provenance.files){
  const original = execFileSync('git', ['show', provenance.sourceCommit + ':' + entry.source], {cwd:root});
  assert.equal(hash(original), entry.sourceSha256, 'pinned source hash: ' + entry.source);
  const frozen = entry.file === 'engine.js' ? Buffer.from(original.toString().replace("'../assets/series.js'", "'./series.js'")) : original;
  assert.equal(hash(frozen), entry.sha256, 'pinned snapshot hash: ' + entry.file);
  if(process.argv.includes('--write')) writeFileSync(new URL(entry.file, dir), frozen);
  else assert.equal(hash(readFileSync(new URL(entry.file, dir))), entry.sha256, entry.file + ' drifted');
}
console.log('Flow article v1 matches ' + provenance.sourceCommit);
