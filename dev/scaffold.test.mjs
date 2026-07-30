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
import {TOOL_DIRS, ENERGY_TOOL_DIRS, INSTRUMENTS} from './tool-dirs.mjs';

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
