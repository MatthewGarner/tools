/* Fermi's Markdown copy: one escaping rule, and a variable named as the page shows it (XF-8). */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mdEscape, estimateMarkdown} from '../md.js';

test('the escaping rule: a backslash before each of \\ | * _ ` [ ] < >, no HTML entities', () => {
  assert.equal(mdEscape('a|b *c* _d_ <b>e</b> [f] \\ & "g"'), 'a\\|b \\*c\\* \\_d\\_ \\<b\\>e\\</b\\> \\[f\\] \\\\ & "g"');
});
test('the rule is the same function as Rank has (no cross-tool import: two copies that must agree)', async () => {
  const rank = await import('../../rank/md.js');
  for(const s of ['a|b *c* _d_ <b>e</b> [f] \\ & "g"', 'R&D <alpha> `x` [y](z)', 'plain']) assert.equal(mdEscape(s), rank.mdEscape(s));
});
const data = {question: 'R&D <alpha> share?', unit: 'units *per* year', formula: 'share_with_piano * tunings', p10: '78.1', p50: '183', p90: '430', ratio: '5.5',
  threshold: null, vars: [{name: 'share_with_piano', lo: '0.02', hi: '0.08', uniform: false, receipt: 'Stated here'}, {name: 'tunings', lo: '1', hi: '2', uniform: false, receipt: 'Stated here'}],
  lever: 'Most of the spread is born at share_with_piano.', pour: '', confession: '', compare: null, method: '20,000 samples', link: 'https://x.test/fermi/#z:abc'};
test('authored text is escaped, and a variable is named as the page shows it (underscores kept, not turned into spaces)', () => {
  const md = estimateMarkdown(data);
  assert.match(md, /R&D \\<alpha\\> share\?/);
  assert.match(md, /Results in units \\\*per\\\* year/);
  assert.match(md, /^- share\\_with\\_piano: 0\.02 – 0\.08 — Stated here$/m);
  assert.doesNotMatch(md, /share with piano/);
  assert.match(md, /\*\*Estimate — `share_with_piano \* tunings`\*\*/);
});
test('the figures read as the page shows them', () => {
  const md = estimateMarkdown(data);
  assert.match(md, /P50 ≈ \*\*183\*\* · 80% range 78\.1 – 430 \(spread ×5\.5\)/);
});
