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

/* Third gap, same family, found 2026-07-31 when Copy PNG inherited the
   deck-shaped render: app-common's svgToCanvas sizes the PNG by reading integer
   width/height off the ROOT <svg>. Its pattern was double-quote-only, so the
   single-quoted roots that cycles and risk emit for their slide renders matched
   null and threw — those renders could not rasterize at all, and only the
   poster frame (which re-wrapped them in a root of its own) hid it. The pattern
   is now quote-agnostic; this pins the other half of the contract, that every
   golden actually carries dimensions it can find. */
const ROOT_DIMS = /width=['"](\d+)['"] height=['"](\d+)['"]/;
test('every golden root <svg> exposes integer dimensions svgToCanvas can read', () => {
  for(const file of readdirSync(dir).filter(f => f.endsWith('.svg'))){
    const svg = readFileSync(new URL(file, dir), 'utf8');
    const m = svg.match(ROOT_DIMS);
    assert.ok(m, file + ': no integer width/height pair on the root — svgToCanvas cannot size the PNG');
    assert.ok(+m[1] > 0 && +m[2] > 0, file + ': zero-sized root (' + m[1] + '×' + m[2] + ')');
  }
});

/* A hex colour of the wrong LENGTH is not malformed XML — it's a valid attribute
   holding an invalid value, and rasterisers disagree on the fallback (some paint
   BLACK). Shipped once, 2026-08-10: a 3-digit ink token + '05' alpha suffix made
   fill="#22205" and the deck-spread centre panel rendered as a black slab. Valid
   forms: #rgb, #rrggbb, #rrggbbaa (and #rgba). Scan every fill/stroke in every
   golden so no renderer can concat its way into an invalid colour again. */
test('every golden fill/stroke hex colour has a valid length', () => {
  const OK = new Set([3, 4, 6, 8]);
  for(const file of readdirSync(dir).filter(f => f.endsWith('.svg'))){
    const svg = readFileSync(new URL(file, dir), 'utf8');
    for(const m of svg.matchAll(/(?:fill|stroke)="#([0-9a-fA-F]+)"/g)){
      assert.ok(OK.has(m[1].length), file + ': invalid hex colour #' + m[1]);
    }
  }
});
