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
];

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function parseSelector(sel){
  const tag = sel.match(/^[a-z0-9]+/i)[0];
  const conds = [...sel.matchAll(/\[([a-zA-Z-]+)(?:="([^"]*)")?\]/g)].map(m => [m[1], m[2]]);
  return {tag, conds};
}
function elemsOfTag(svg, tag){ return svg.match(new RegExp('<' + tag + '\\b[^>]*>', 'g')) || []; }
function matchesAttrs(el, conds){
  return conds.every(([k, v]) => v === undefined
    ? new RegExp('\\b' + esc(k) + '=').test(el)                       // attr present
    : new RegExp(esc(k) + '=["\']' + esc(v) + '["\']').test(el));      // attr = value (quote-agnostic)
}

for(const {tool, spec, goldens} of SPECS){
  test(tool + ': REVEAL.draw is valid + hits a non-dashed stroke', async () => {
    const {REVEAL} = await import(spec);
    assert.ok(REVEAL && typeof REVEAL.draw === 'string', tool + ': REVEAL.draw must be a string');
    if(!REVEAL.draw) return;                                          // empty = pure fade, valid
    const {tag, conds} = parseSelector(REVEAL.draw);
    const svg = goldens.map(g => readFileSync(new URL('./golden/' + g + '.svg', import.meta.url), 'utf8')).join('');
    const hits = elemsOfTag(svg, tag).filter(el => matchesAttrs(el, conds));
    assert.ok(hits.length >= 1, tool + ': draw selector "' + REVEAL.draw + '" matched nothing in ' + goldens.join(','));
    assert.ok(hits.every(el => !/stroke-dasharray/.test(el)),
      tool + ': a draw match is dashed — revealIn would fade it, so the selector is wrong');
  });
}
