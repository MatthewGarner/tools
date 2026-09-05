/* Execute the examples rather than scrape their module layout: refactoring the
   fixture file must not detach a product from its opaque captured roadmap. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EXAMPLES} from '../case/examples.js';
import {parse} from '../case/parse.js';
import {parse as parseRoadmap} from '../roadmap/parse.js';
import {decodeHash} from '../assets/series.js';
const receipts=EXAMPLES.flatMap(ex=>parse(ex.text).claims.filter(c=>/\/roadmap\/#z:/.test(c.url)).map(c=>({ex,url:c.url})));
test('Case examples include a captured roadmap',()=>assert.ok(receipts.length>0));
for(const [i,{ex,url}] of receipts.entries())test('Case roadmap '+i+' parses cleanly and belongs to its product',async()=>{
 const {t}=await decodeHash(url.split('#')[1]);const roadmap=parseRoadmap(t);
 assert.deepEqual(roadmap.warnings,[]);assert.ok(roadmap.items.length>0);
 assert.ok(t.includes(ex.name.split(' · ')[0]),'captured roadmap belongs to '+ex.name);
});
