/* Meta-test: every tool's REVEAL.draw selector must (a) be a string, and when
   non-empty (b) match ≥1 element in that tool's golden SVG, and (c) never match
   an already-dashed element (revealIn's dash-filter would fade it → the selector
   is wrong). Catches the two blocker classes Fable found: "selector matches
   nothing" (alarm's #distwrap prefix) and "matches a dashed line" (merit-order's
   demand/clearing lines). String-based — node has no DOM. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const SPECS = [
  {tool: 'merit-order', spec: '../energy/merit-order/motion-spec.js', goldens: ['merit-order-typical']},
  {tool: 'timeline', spec: '../timeline/motion-spec.js', goldens: ['timeline-default']},
  {tool: 'alarm', spec: '../alarm/motion-spec.js', goldens: ['alarm-dist']},
  {tool: 'flow', spec: '../flow/motion-spec.js', goldens: ['flow-default', 'flow-overloaded']},
  // rollout: draw tools (selector must hit non-dashed strokes in the golden)
  {tool: 'tree', spec: '../tree/motion-spec.js', goldens: ['tree-bid']},
  {tool: 'why', spec: '../why/motion-spec.js', goldens: ['why-ost']},
  {tool: 'cycles', spec: '../energy/cycles/motion-spec.js', goldens: ['cycles-full']},
  {tool: 'gauge', spec: '../gauge/motion-spec.js', goldens: ['gauge-overlay']},
  {tool: 'wardley', spec: '../wardley/motion-spec.js', goldens: ['wardley-map']},
  // rollout: fade-only tools (draw:'' → the string check + early return)
  {tool: 'roadmap', spec: '../roadmap/motion-spec.js', goldens: ['lanes']},
  {tool: 'map', spec: '../map/motion-spec.js', goldens: ['map-assumptions']},
  {tool: 'risk', spec: '../energy/risk/motion-spec.js', goldens: ['risk-routes']},
  {tool: 'bets', spec: '../bets/motion-spec.js', goldens: ['bets-board']},
  {tool: 'intraday', spec: '../energy/intraday/motion-spec.js', goldens: ['intraday-fleet']},
];

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function parseSelector(sel){
  const tag = (sel.match(/^[a-z0-9]+/i) || [''])[0];                  // '' = any tag (class-only selector)
  const cls = (sel.match(/\.([a-zA-Z0-9_-]+)/) || [])[1];
  const conds = [...sel.matchAll(/\[([a-zA-Z-]+)(?:="([^"]*)")?\]/g)].map(m => [m[1], m[2]]);
  return {tag, cls, conds};
}
function elemsOfTag(svg, tag){ return svg.match(new RegExp('<' + (tag || '[a-zA-Z]+') + '\\b[^>]*>', 'g')) || []; }
function matchesSel(el, cls, conds){
  if(cls && !new RegExp('class=["\'][^"\']*\\b' + esc(cls) + '\\b').test(el)) return false;
  return conds.every(([k, v]) => v === undefined
    ? new RegExp('\\b' + esc(k) + '=').test(el)                       // attr present
    : new RegExp(esc(k) + '=["\']' + esc(v) + '["\']').test(el));      // attr = value (quote-agnostic)
}

for(const {tool, spec, goldens} of SPECS){
  test(tool + ': REVEAL.draw is valid + hits a non-dashed stroke', async () => {
    const {REVEAL} = await import(spec);
    assert.ok(REVEAL && typeof REVEAL.draw === 'string', tool + ': REVEAL.draw must be a string');
    if(!REVEAL.draw) return;                                          // empty = pure fade, valid
    const {tag, cls, conds} = parseSelector(REVEAL.draw);
    const svg = goldens.map(g => readFileSync(new URL('./golden/' + g + '.svg', import.meta.url), 'utf8')).join('');
    const hits = elemsOfTag(svg, tag).filter(el => matchesSel(el, cls, conds));
    // revealIn draws matches that are NOT dashed (dashed ones fall through to fade),
    // so the real requirement is: at least one non-dashed match exists → something draws.
    const undashed = hits.filter(el => !/stroke-dasharray/.test(el));
    assert.ok(undashed.length >= 1,
      tool + ': draw selector "' + REVEAL.draw + '" hits no non-dashed stroke (nothing would draw) in ' + goldens.join(','));
  });
}
