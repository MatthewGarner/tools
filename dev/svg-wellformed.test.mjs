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

/* The tag scan above cannot see this one, and it shipped broken too: the export
   path reads the LIVE SVG's outerHTML — HTML serialisation — so any character
   the HTML serialiser writes as a NAMED entity comes back out as an entity that
   XML does not define, and the image decoder rejects the whole file. In practice
   that is U+00A0: a non-breaking space in a renderer becomes `&nbsp;` in the
   export, and the PNG silently fails to decode. Use an ordinary space held by
   xml:space="preserve" instead (assets/verdict-svg.js does). */
test('no golden carries a character that HTML-serialises to an XML-undefined entity', () => {
  for(const file of readdirSync(dir).filter(f => f.endsWith('.svg'))){
    const svg = readFileSync(new URL(file, dir), 'utf8');
    const at = svg.indexOf(' ');
    assert.equal(at, -1, file + ': non-breaking space at ' + at +
      ' — HTML-serialises to &nbsp;, which XML does not define (…' +
      svg.slice(Math.max(0, at - 40), at + 20) + '…)');
  }
});
