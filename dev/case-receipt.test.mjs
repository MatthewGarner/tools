/* The /case example embeds live tool URLs as exhibits, and one of them is a COMPRESSED
   roadmap model (`-> /roadmap/#z:…`) whose decoded text is shown back as a receipt. That
   payload is opaque in review: a rename can update the surrounding example and leave the
   hash carrying the old model, and every other gate would stay green — the string is just
   a URL to them. So decode it here, parse it through roadmap's REAL parser, and assert it
   still agrees with the case it belongs to. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateRawSync} from 'node:zlib';
import {parse as parseRoadmap} from '../roadmap/parse.js';

const SRC = readFileSync(new URL('../case/app.js', import.meta.url), 'utf8');

const decode = hash => {
  const b = Buffer.from(hash.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  return JSON.parse(inflateRawSync(b).toString('utf8')).t;
};

/* every compressed roadmap exhibit in the case examples */
const receipts = [...SRC.matchAll(/-> \/roadmap\/#z:([A-Za-z0-9\-_]+)/g)].map(m => m[1]);

test('the case example embeds at least one compressed roadmap receipt', () => {
  assert.ok(receipts.length >= 1, 'no `-> /roadmap/#z:…` exhibit found in case/app.js');
});

for(const [i, hash] of receipts.entries()){
  test(`case roadmap receipt ${i}: decodes and parses clean through roadmap`, () => {
    const text = decode(hash);
    assert.ok(typeof text === 'string' && text.trim().length > 0, 'payload carries model text');
    const model = parseRoadmap(text);
    assert.deepEqual(model.warnings ?? [], [],
      `receipt warns:\n${(model.warnings ?? []).join('\n')}`);
    assert.ok(model.items.length > 0, 'receipt carries plan items');
  });

  test(`case roadmap receipt ${i}: names the same product as the case it sits in`, () => {
    const text = decode(hash);
    /* the title of the example block this exhibit lives in: the nearest `title:` ABOVE
       the hash in the source. This is the pairing a rename silently breaks — the hash is
       opaque to a find-and-replace, so the example can move on without its own receipt. */
    const upto = SRC.slice(0, SRC.indexOf(hash));
    const titles = [...upto.matchAll(/^`?title: (.+)$/gm)].map(m => m[1]);
    const caseTitle = titles.at(-1);
    assert.ok(caseTitle, 'found the enclosing case example title');
    const product = caseTitle.split(/[\s—]+/)[0];
    assert.ok(text.includes(product),
      `receipt reads "${text.split('\n')[0]}" but its case is "${caseTitle}"`);
  });
}
