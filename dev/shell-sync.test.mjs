/* The stamped header (dev/sync-shell.mjs) must be current, and what it stamps must
   be exactly what each manifest entry grants. These read the shipped HTML, not the
   generator's output, so a hand edit or a drifted generator both fail here. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {SHELL_MANIFEST} from './shell-manifest.mjs';
import {TOOL_DIRS, ENERGY_TOOL_DIRS} from './tool-dirs.mjs';

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
    const buttons = stamped.match(/<button\b[^>]*>/g) || [];
    assert.ok(buttons.length >= 3 && buttons.every(tag => /\sdisabled>$/.test(tag)), dir + ': every stamped button ships disabled, so one that is never wired cannot look usable');
    assert.match(stamped, /<p class="tool-stalled">This page did not finish loading\. Reload to save or share\.<\/p>/, dir + ': the stalled line is stamped');
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

test('every registered tool takes the stamped header: a new tool cannot ship without its manifest entry', () => {
  for(const dir of [...TOOL_DIRS, ...ENERGY_TOOL_DIRS]){
    assert.ok(SHELL_MANIFEST[dir]?.shell, dir + ': registered but its manifest entry is missing or shell:false (dev/shell-manifest.mjs, then npm run sync)');
    assert.match(page(dir), /<header data-tool-header data-shell>/, dir + ': the header is not stamped');
  }
});

test('the retired header controls and their producers are gone from every page and module', () => {
  const retired = [
    [/document-start\.js|mountDocumentStart|exampleChips/, 'the chip-row on-ramp'],
    [/class="crumb"|class="tagline"|instrument-actions|document-actions/, 'the old header, crumb or tagline markup'],
    [/recent-save|btn model-link/, 'the injected Save a copy / Copy model link buttons'],
  ];
  for(const dir of [...TOOL_DIRS, ...ENERGY_TOOL_DIRS]){
    const base = TOOL_DIRS.includes(dir) ? dir : 'energy/' + dir;
    for(const file of ['index.html', 'app.js']){
      const text = readFileSync(new URL('../' + base + '/' + file, import.meta.url), 'utf8');
      for(const [pattern, what] of retired) assert.ok(!pattern.test(text), `${base}/${file}: still carries ${what}`);
      /* Share replaced every Copy model link; Gauge's #copylink copies a live room's join link (manifest ownLink) */
      if(!SHELL_MANIFEST[dir].ownLink) assert.ok(!/id="copylink"/.test(text), `${base}/${file}: still carries a Copy model link button`);
    }
  }
  for(const file of ['assets/recent-work.js', 'assets/model-link.js', 'assets/tool-shell.js', 'assets/energy-interaction.js']){
    const text = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
    for(const [pattern, what] of retired) assert.ok(!pattern.test(text.replace(/\/\*[\s\S]*?\*\//g, '')), `${file}: still carries ${what}`);
  }
});

test('an Energy page\'s header is the E1-E5 strip, then the hidden kicker, then the title row', () => {
  const strips = new Set();
  for(const dir of ENERGY_TOOL_DIRS){
    const html = page(dir), header = html.match(/<header data-tool-header data-shell>([\s\S]*?)<\/header>/)[1];
    assert.match(header.trim(), /^<nav class="series"/, dir + ': the strip is not the header\'s first row');
    assert.ok(header.indexOf('class="kicker"') > header.indexOf('</nav>') && header.indexOf('class="kicker"') < header.indexOf('<!-- shell:start -->'), dir + ': the kicker must sit between the strip and the title row');
    strips.add(header.match(/<nav class="series"[\s\S]*?<\/nav>/)[0].replace(/ aria-current="page"/, ''));
  }
  assert.equal(strips.size, 1, 'the five Energy strips differ beyond which item is current');
});
