/* Rank's Markdown copy: one escaping rule, and everything the page shows (XR-1, XR-2, XR-3). */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mdEscape, mdCell, rankMarkdown} from '../md.js';

test('the escaping rule: a backslash before each of \\ | * _ ` [ ] < >, no HTML entities', () => {
  assert.equal(mdEscape('a|b *c* _d_ <b>e</b> [f] \\ & "g"'), 'a\\|b \\*c\\* \\_d\\_ \\<b\\>e\\</b\\> \\[f\\] \\\\ & "g"');
  assert.equal(mdEscape('`code`'), '\\`code\\`');
  assert.equal(mdEscape('plain words, 3 > 2'), 'plain words, 3 \\> 2');
});
test('a table cell is the same rule with line breaks folded', () => {
  assert.equal(mdCell('two\nlines | <i>'), 'two lines \\| \\<i\\>');
});

const base = {
  criteria: [{name: 'Value', w: 3}, {name: 'Time <crit>', w: 2}], effort: {name: 'Effort', w: 1},
  items: [{name: 'Alpha *one*', s: [8, 7], e: 4}, {name: 'Beta', s: [5, 9], e: 5}, {name: 'Gamma', s: [2, 3], e: 6}],
  k: 2, ww: 50, sw: 1, runs: '16,000 simulations',
  rows: [
    {pos: 1, name: 'Alpha *one*', med: 1, p10: 1, p90: 2, ptop: '100%', knife: false},
    {pos: 2, name: 'Beta', med: 2, p10: 1, p90: 3, ptop: '71%', knife: true},
    {pos: 3, name: 'Gamma', med: 3, p10: 2, p90: 3, ptop: '29%', knife: false}],
  verdict: 'The top 2 is mostly settled around Alpha *one*.', flip: '', link: 'https://x.test/rank/#z:abc',
};
test('the heading states the capacity, the criteria carry their weights, every initiative its scores and effort', () => {
  const md = rankMarkdown(base);
  assert.match(md.split('\n')[0], /^\*\*Prioritisation — top 2 of 3 initiatives/);
  assert.match(md, /Value 3 · Time \\<crit\\> 2 · ÷ Effort 1/);
  assert.match(md, /\| Initiative \| Value \| Time \\<crit\\> \| Effort \|/);
  assert.match(md, /\| Alpha \\\*one\\\* \| 8 \| 7 \| 4 \|/);
  assert.match(md, /\| Gamma \| 2 \| 3 \| 6 \|/);
});
test('the knife-edge flag the page shows reaches the table', () => {
  const md = rankMarkdown(base);
  const row = md.split('\n').find(l => /^\| 2 \|/.test(l));
  assert.match(row, /knife-edge/);
  assert.doesNotMatch(md.split('\n').find(l => /^\| 1 \|/.test(l)), /knife-edge/);
  assert.match(md, /\| # \| Initiative \| Median rank \| 90% rank range \| P\(top-2\) \| Flag \|/);
});
test('names are escaped everywhere, including inside the verdict sentence; nothing is raw HTML', () => {
  const md = rankMarkdown({...base, items: base.items.map((i, n) => n ? i : {...i, name: '<b>x</b> & <script>'}), rows: base.rows.map((r, n) => n ? r : {...r, name: '<b>x</b> & <script>'}), verdict: 'Settled around <b>x</b>.'});
  assert.ok(!/<(?!https?:)[a-z\/][^>]*>/i.test(md.replace(/\\</g, '')), md);
  assert.match(md, /Settled around \\<b\\>x\\<\/b\\>\./);
});
