/* Narrow-golden corpus gate. Every renderer is classified once: either its real
   width-aware/narrow SVG path has a deterministic golden witness, or it carries
   an explicit reason why a narrow SVG fixture would be dishonest (HTML output,
   fixed presentation/export geometry, or no distinct narrow composition).

   This is intentionally separate from renderer-coverage.test.mjs: that test asks
   whether hostile text reaches every renderer; this one asks whether phone-only
   SVG composition changes are byte-gated. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const GOLDEN = join(ROOT, 'dev/golden');
const EXCLUDE_DIRS = new Set(['node_modules', 'vendor']);

/* Renderer → at least one fixture that enters its distinct narrow composition.
   Facades/delegates are named too: tree/render.js reaches render-density.js and
   public renderer facades are named too, so a later internal swap cannot silently
   drop their phone witness. */
const COVERED = {
  'bets/render-quadrant.js': ['bets-quadrant-narrow'],
  'bets/render.js': ['bets-narrow'],
  'case/render.js': ['case-narrow'],
  'energy/cycles/render.js': ['cycles-full-narrow'],
  'energy/intraday/render-day.js': ['intraday-fleet-narrow'],
  'energy/merit-order/render.js': ['merit-order-typical-narrow'],
  'energy/risk/render.js': ['risk-routes-narrow'],
  'gauge/render-overlay.js': ['gauge-overlay-narrow'],
  'map/render.js': ['map-dense-narrow'],
  'paths/render-conditions.js': ['paths-conditions-narrow'],
  'paths/render-dependencies.js': ['paths-dependencies-narrow'],
  'paths/render-learning-agenda.js': ['paths-agenda-narrow'],
  'paths/render-learning-closeout.js': ['paths-learning-closeout-narrow'],
  'paths/render-overview.js': ['paths-overview-narrow'],
  'paths/render-plans.js': ['paths-plans-narrow'],
  'paths/render-question-lens.js': ['paths-question-narrow'],
  'paths/render-tree.js': ['paths-outline-narrow'],
  'proxy/render-hunt.js': ['proxy-hunt-narrow'],
  'roadmap/render.js': ['roadmap-narrow'],
  'signal-vs-noise/render.js': ['signal-noise-grid-narrow', 'signal-noise-collapse-narrow'],
  'timeline/render.js': ['timeline-narrow'],
  'tree/render-density.js': ['tree-bid-narrow'],
  'tree/render.js': ['tree-bid-narrow'],
  'wardley/render.js': ['wardley-narrow'],
  'why/render-causal-field.js': ['why-ost-narrow'],
  'why/render-delivery-lens.js': ['why-map-narrow'],
};

/* These are exclusions, not missing work. A new renderer must be consciously
   placed here or in COVERED; reasons are assertions about its output contract. */
const EXCLUDED = {
  'alarm/render.js': 'SVG follows caller dimensions continuously; it has no distinct narrow composition.',
  'bets/render-presentation.js': 'Presentation export is intentionally fixed at 1920x1080.',
  'duel/render.js': 'Renderer emits HTML, not SVG.',
  'energy/frequency/render.js': 'SVG export is intentionally fixed wide; the responsive live trace is canvas.',
  'energy/intraday/render-export.js': 'Composite day-and-stack export is intentionally a fixed 1200px artboard.',
  'fermi/render-cashflow.js': 'Calculator SVG is intentionally wide/pannable and has no narrow branch.',
  'fermi/render-driver.js': 'Calculator SVG is intentionally wide/pannable and has no narrow branch.',
  'flow/render.js': 'Readout SVG has one fixed composition and no width-aware narrow branch.',
  'gauge/render-form.js': 'Renderer emits HTML, not SVG.',
  'map/render-presentation.js': 'Presentation export is intentionally fixed at 1920x1080.',
  'premortem/render-board.js': 'Renderer emits HTML, not SVG.',
  'premortem/render-register.js': 'Renderer emits HTML, not SVG.',
  'premortem/render-wizard.js': 'Renderer emits HTML, not SVG.',
  'roadmap/render-board.js': 'Phone preview deliberately falls back to roadmap/render.js; this composition stays wide.',
  'roadmap/render-deck-pages.js': 'Paginated presentation export is intentionally fixed at 1920x1080.',
  'roadmap/render-deck.js': 'Deck export is intentionally fixed at 1920x1080.',
  'roadmap/render-focus.js': 'Phone preview deliberately falls back to roadmap/render.js; this composition stays wide.',
  'roadmap/render-register.js': 'Phone preview deliberately falls back to roadmap/render.js; this composition stays wide.',
};

const isDir = rel => statSync(join(ROOT, rel)).isDirectory();
const renderersIn = dir => readdirSync(join(ROOT, dir))
  .filter(file => /^render.*\.js$/.test(file))
  .map(file => dir + '/' + file);

function discoverRenderers(){
  const out = [];
  for(const top of readdirSync(ROOT)){
    if(EXCLUDE_DIRS.has(top) || top.startsWith('.') || !isDir(top)) continue;
    out.push(...renderersIn(top));
    if(top === 'energy'){
      for(const sub of readdirSync(join(ROOT, top))){
        const rel = top + '/' + sub;
        if(EXCLUDE_DIRS.has(sub) || !isDir(rel)) continue;
        out.push(...renderersIn(rel));
      }
    }
  }
  return out.sort();
}

test('every renderer is classified for narrow golden coverage', () => {
  const renderers = discoverRenderers();
  assert.ok(renderers.length > 0, 'discovery found no renderers');
  const classified = [...Object.keys(COVERED), ...Object.keys(EXCLUDED)].sort();
  assert.deepEqual(classified, renderers,
    'classify each new renderer as narrow-covered or add a reasoned exclusion');
  assert.equal(new Set(classified).size, classified.length,
    'a renderer cannot be both covered and excluded');
});

test('every narrow-covered renderer names a generated, committed fixture', () => {
  const generator = readFileSync(join(ROOT, 'dev/golden.mjs'), 'utf8');
  for(const [renderer, fixtures] of Object.entries(COVERED)){
    assert.ok(fixtures.length > 0, renderer + ' has no narrow fixture names');
    for(const fixture of fixtures){
      assert.match(fixture, /narrow/, renderer + ' fixture is not visibly narrow-scoped: ' + fixture);
      assert.ok(generator.includes("variants['" + fixture + "']"),
        renderer + ' fixture is not generated by dev/golden.mjs: ' + fixture);
      assert.ok(existsSync(join(GOLDEN, fixture + '.svg')),
        renderer + ' fixture is absent from dev/golden: ' + fixture);
    }
  }
});

test('narrow exclusions stay reasoned', () => {
  for(const [renderer, reason] of Object.entries(EXCLUDED)){
    assert.ok(reason.length >= 24, renderer + ' needs a specific exclusion reason');
  }
});
