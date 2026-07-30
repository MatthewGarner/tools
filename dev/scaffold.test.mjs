/* Scaffold-parity gate: every tool page must carry the PWA head block. CLAUDE.md
   states this in prose ("new pages copy the PWA head block") after a tool once
   shipped without it (unstyled, the "wardley shipped unstyled" class of bug) —
   this makes the invariant self-enforcing at node-test time instead of relying
   on a Playwright pass to catch it. Reference shape: timeline/index.html for the
   tools origin, energy/merit-order/index.html for the energy origin (own
   manifest link, apple-touch-icon, ../ prefixed on energy). Kept to what's
   genuinely required of every tool — not over-fit to any one tool's extras. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {TOOL_DIRS, ENERGY_TOOL_DIRS, INSTRUMENTS, ENERGY_INSTRUMENTS} from './tool-dirs.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const read = p => readFileSync(join(ROOT, p), 'utf8');

function assertScaffold(html, who, manifestHref){
  assert.match(html, new RegExp('<link rel="manifest" href="' + manifestHref.replace(/\./g, '\\.') + '"'),
    who + ': missing rel="manifest" href="' + manifestHref + '"');
  assert.match(html, /<link rel="apple-touch-icon" href="[^"]+">/, who + ': missing apple-touch-icon');
  assert.match(html, /<meta name="theme-color"[^>]*>/, who + ': missing at least one theme-color meta');
  assert.match(html, /<meta name="apple-mobile-web-app-capable" content="yes">/,
    who + ': missing apple-mobile-web-app-capable');
  assert.match(html, /<script src="[^"]*\/pwa\.js" defer><\/script>/, who + ': missing the SW registration (pwa.js)');
}

test('every tools-origin page carries the PWA head block', () => {
  for(const dir of TOOL_DIRS)
    assertScaffold(read(dir + '/index.html'), dir, '/manifest.webmanifest');
});

test('every energy-origin page carries the PWA head block', () => {
  for(const dir of ENERGY_TOOL_DIRS)
    assertScaffold(read('energy/' + dir + '/index.html'), 'energy/' + dir, '../manifest.webmanifest');
});

/* Swiss 6b anatomy. The kicker/metrics/verdict treatment is the phase's whole
   point, and "every tool got it" is exactly the kind of claim that decays into
   prose — so it is a gate. The numbering assertion is the sharp one: two tools
   silently sharing an instrument number is invisible on any single page. */
test('every tools-origin page carries the 6b kicker slot and its canonical number', () => {
  assert.deepEqual(Object.keys(INSTRUMENTS).sort(), [...TOOL_DIRS].sort(),
    'INSTRUMENTS must name every tools-origin tool, and only those');
  assert.equal(new Set(Object.values(INSTRUMENTS)).size, TOOL_DIRS.length,
    'instrument numbers must be collision-free');
  for(const dir of TOOL_DIRS){
    const html = read(dir + '/index.html');
    assert.match(html, /<p class="kicker" id="kicker"><\/p>/,
      dir + ': missing the .kicker slot above its h1');
    const js = read(dir + '/app.js');
    const call = new RegExp("paintKicker\\(\\$?\\(?['\"]?kicker['\"]?\\)?,\\s*'(\\d\\d)'");
    const m = call.exec(js);
    assert.ok(m, dir + ': app.js never calls paintKicker with a two-digit number');
    assert.equal(m[1], INSTRUMENTS[dir],
      dir + ': paints instrument ' + m[1] + ', canonically ' + INSTRUMENTS[dir]);
  }
});

test('every tools-origin page carries a metrics row and exactly one primary button', () => {
  for(const dir of TOOL_DIRS){
    const html = read(dir + '/index.html');
    /* Two renditions, one anatomy: tools whose verdict lives in the exported
       artefact carry the metrics row INSIDE the SVG (svgMetrics) instead of in
       page chrome. Either satisfies the gate; neither does not. */
    const inSvg = readdirSync(join(ROOT, dir))
      .filter(f => /^render.*\.js$/.test(f))
      .some(f => read(dir + '/' + f).includes('svgMetrics'));
    assert.ok(/class="metrics"/.test(html) || inSvg,
      dir + ': no metrics row — neither an HTML .metrics row nor an in-SVG svgMetrics');
    /* Red discipline: the brand fill is the page's ONE forward action. Several
       tools are multi-surface (gauge's console, premortem's wizard) and those
       surfaces are mutually exclusive, so the cap is per surface, not per file
       — hence a ceiling rather than an equality. */
    const primaries = (html.match(/class="btn[^"]*\bprimary\b/g) || []).length;
    assert.ok(primaries >= 1, dir + ': no .btn.primary — every page needs one forward action');
    assert.ok(primaries <= 4, dir + ': ' + primaries + ' primary buttons is past any surface count');
  }
});

/* Swiss 6c — the same anatomy on the energy origin, in the ember ink, plus the
   two things that origin adds and the tools origin doesn't have: a masthead and
   a nav that prints the whole series on every page. A nav row is exactly the
   sort of markup that gets hand-copied and quietly drifts (one page missing an
   instrument, or two pages disagreeing about the order), so it is a gate. */
const energyPage = dir => read('energy/' + dir + '/index.html');
const ALL_ENERGY = [...ENERGY_TOOL_DIRS, null];   // null = the energy landing
const anyEnergyPage = dir => dir ? energyPage(dir) : read('energy/index.html');

test('the E-series numbering is contiguous, collision-free and covers the origin', () => {
  assert.deepEqual(Object.keys(ENERGY_INSTRUMENTS).sort(), [...ENERGY_TOOL_DIRS].sort(),
    'ENERGY_INSTRUMENTS must name every energy tool, and only those');
  assert.deepEqual(Object.values(ENERGY_INSTRUMENTS),
    ENERGY_TOOL_DIRS.map((_, i) => 'E' + (i + 1)),
    'the E-numbers must run E1..EN in the order ENERGY_TOOL_DIRS lists them');
});

test('every energy page carries the masthead and the whole series nav, in one order', () => {
  for(const dir of ALL_ENERGY){
    const html = anyEnergyPage(dir);
    const who = 'energy/' + (dir || 'index.html');
    assert.match(html, /<div class="masthead">/, who + ': no masthead bar');
    assert.match(html, /energy\.matthewgarner\.me/, who + ': the masthead never names the origin');
    /* every page lists every instrument, numbered, in the canonical order */
    const nav = (html.match(/<nav class="series"[\s\S]*?<\/nav>/) || [''])[0];
    assert.ok(nav, who + ': no series nav');
    const rows = [...nav.matchAll(/href="[^"]*?([a-z-]+)\/"([^>]*)><span class="enum">(E\d+)<\/span>/g)];
    assert.deepEqual(rows.map(r => r[1]), ENERGY_TOOL_DIRS, who + ': nav order/contents drifted');
    assert.deepEqual(rows.map(r => r[3]), ENERGY_TOOL_DIRS.map(d => ENERGY_INSTRUMENTS[d]),
      who + ': nav numbers drifted from ENERGY_INSTRUMENTS');
    const current = rows.filter(r => r[2].includes('aria-current="page"')).map(r => r[1]);
    assert.deepEqual(current, dir ? [dir] : [],
      who + ': exactly its own row is aria-current (the landing marks none)');
  }
});

test('every energy tool page carries the 6c kicker, metrics row and one verdict', () => {
  for(const dir of ENERGY_TOOL_DIRS){
    const html = energyPage(dir), who = 'energy/' + dir;
    assert.match(html, /<p class="kicker" id="kicker"><\/p>/, who + ': missing the .kicker slot above its h1');
    assert.match(html, /<div class="metrics" id="metrics"/, who + ': missing the metrics row');
    assert.match(html, /<div class="verdict-block" id="verdict"/, who + ': missing the verdict block');
    assert.equal((html.match(/class="verdict-block"/g) || []).length, 1, who + ': more than one verdict block');
    assert.match(html, /<section class="family"/, who + ': missing the ember-series family strip');
    assert.match(html, /<footer class="efoot">/, who + ': footer is not the 6c hairline band');
    const js = read('energy/' + dir + '/app.js');
    const m = /paintKicker\(\$?\(?['"]?kicker['"]?\)?,\s*'(E\d+)'/.exec(js);
    assert.ok(m, who + ": app.js never calls paintKicker with an E-number");
    assert.equal(m[1], ENERGY_INSTRUMENTS[dir],
      who + ': paints instrument ' + m[1] + ', canonically ' + ENERGY_INSTRUMENTS[dir]);
  }
});

test('every energy page links the shared origin chrome', () => {
  for(const dir of ALL_ENERGY){
    const html = anyEnergyPage(dir);
    assert.match(html, /<link rel="stylesheet" href="\.\.\/(\.\.\/)?assets\/energy\.css">/,
      'energy/' + (dir || 'index.html') + ': does not link assets/energy.css');
  }
});
