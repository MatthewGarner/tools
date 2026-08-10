/* Meta-test (E7): every roadmap config key edit-targets.js knows about
   (CONFIG_KEYS — the collision list every setConfigKey-style rewrite guards
   against) must also be a keyword the syntax-highlighter's own regex
   recognises (roadmap/editor.js:13). The two lists drifted once (verdict/
   group were added to CONFIG_KEYS but never to the highlighter) before this
   test existed — self-enforcing now, so the class can't recur silently. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CONFIG_KEYS} from '../edit-targets.js';

const ROOT = new URL('../..', import.meta.url).pathname;

test('editor.js keyword regex covers every CONFIG_KEYS entry', () => {
  const src = readFileSync(ROOT + 'roadmap/editor.js', 'utf8');
  const m = src.match(/if\(\/\^\(([^)]+)\)\\s\*:\/i\.test\(line\)\)/);
  assert.ok(m, 'editor.js no longer has the expected keyword-regex shape — update this test\'s pattern');
  const highlighted = new Set(m[1].split('|'));
  // CONFIG_KEYS is a single alternation /^(a|b|c)$/i — pull out the same list
  const keysSrc = CONFIG_KEYS.source.match(/^\^\(([^)]+)\)\$$/)[1];
  const keys = keysSrc.split('|');
  const missing = keys.filter(k => !highlighted.has(k));
  assert.deepEqual(missing, [], 'editor.js keyword regex is missing: ' + missing.join(', '));
});

/* The other half of the drift class: a config key that parses but has no row
   in the ON-PAGE syntax reference. Shipped three times (date: absent as a row,
   group: 2026-08-10, deck: 2026-08-10 — "this is constantly missed", Matt).
   Every CONFIG_KEYS key must appear as `key:` inside a <code> somewhere in the
   syntax section, as a dt row or in prose (date: lives in title's dd). */
test('every config key appears in the on-page syntax reference', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const syntax = html.slice(html.indexOf('class="syntax"'), html.indexOf('</details>'));
  const keys = CONFIG_KEYS.source.match(/[a-z]+/g).filter(k => k !== 'i');
  for(const k of keys)
    assert.ok(new RegExp('<code[^>]*>[^<]*' + k + ':').test(syntax),
      'config key "' + k + ':" is missing from the syntax reference');
});
