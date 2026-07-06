/* Every golden is the raw export string. Browsers' HTML parser forgives what the
   XML/image decoder will not (bare attributes, stray quotes) — twice now that gap
   has shipped broken SVG/PNG exports (quoted font stacks 2026-07-06 am, bare
   data-today pm). This scans every tag in every golden for strict attribute form. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync, readFileSync} from 'node:fs';

const dir = new URL('./golden/', import.meta.url);
const TAG = /^<[a-zA-Z][\w:-]*((\s+[\w:-]+=("[^"<]*"|'[^'<]*'))*)\s*\/?>$/;

test('all golden SVGs are strictly well-formed at the tag level', () => {
  for(const file of readdirSync(dir).filter(f => f.endsWith('.svg'))){
    const svg = readFileSync(new URL(file, dir), 'utf8');
    for(const tag of svg.match(/<[^!/][^>]*>/g) || []){
      assert.match(tag, TAG, file + ': malformed tag ' + tag.slice(0, 120));
    }
  }
});
