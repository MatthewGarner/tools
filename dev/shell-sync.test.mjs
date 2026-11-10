/* The stamped header (dev/sync-shell.mjs) must be current, and what it stamps must
   be exactly what each manifest entry grants. These read the shipped HTML, not the
   generator's output, so a hand edit or a drifted generator both fail here. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {SHELL_MANIFEST} from './shell-manifest.mjs';
import {TOOL_DIRS} from './tool-dirs.mjs';

const page = dir => readFileSync(new URL('../' + (TOOL_DIRS.includes(dir) ? dir : 'energy/' + dir) + '/index.html', import.meta.url), 'utf8');
const region = html => html.match(/<!-- shell:start -->([\s\S]*?)<!-- shell:end -->/)?.[1];
const acts = html => [...html.matchAll(/data-act="([a-z-]+)"(?: data-item="([a-z-]+)")?/g)].map(m => m[2] ? 'item:' + m[2] : m[1]);

test('sync-shell --check is clean', () => {
  execFileSync(process.execPath, ['dev/sync-shell.mjs', '--check'], {cwd: new URL('..', import.meta.url)});
});

test('every shell page stamps exactly the controls its manifest entry grants', () => {
  const shells = Object.entries(SHELL_MANIFEST).filter(([, entry]) => entry.shell);
  assert.ok(shells.length >= 3);
  for(const [dir, entry] of shells){
    const html = page(dir), stamped = region(html);
    assert.ok(stamped, dir + ': no shell region');
    assert.match(html, /<header data-tool-header data-shell>/, dir);
    assert.match(html, /<link rel="stylesheet" href="\/assets\/tool-shell.css">/, dir);
    const want = [
      ...(entry.new ? ['new'] : entry.templates ? ['new-template'] : []),
      ...(entry.examples ? ['examples'] : []),
      'work', 'save',
      ...(entry.templates ? ['template'] : []),
      ...entry.items.map(item => 'item:' + item.id),
      'backup',
      ...(entry.share ? ['share'] : []),
    ];
    assert.deepEqual(acts(stamped), want, dir + ': File menu items differ from the manifest');
    assert.equal(/Draft saved in this browser/.test(stamped), ['roadmap', 'cycles', 'risk', 'bets', 'case', 'gauge', 'map', 'paths', 'proxy', 'timeline', 'tree', 'wardley', 'why'].includes(dir), dir + ': draft line');
    assert.equal((stamped.match(/<h1>/g) || []).length, 1, dir);
    for(const leftover of ['class="tagline"', 'class="crumb"', 'planning-boundary', 'chapter-wordmark'])
      assert.ok(!html.match(/<header data-tool-header[\s\S]*?<\/header>/)[0].includes(leftover), dir + ': header still carries ' + leftover);
  }
});

test('pages that are not shell pages carry no shell markers', () => {
  for(const [dir, entry] of Object.entries(SHELL_MANIFEST)){
    if(entry.shell) continue;
    assert.ok(!/shell:(?:head:)?(?:start|end)|data-shell/.test(page(dir)), dir + ': has shell markup but shell:false');
  }
});
