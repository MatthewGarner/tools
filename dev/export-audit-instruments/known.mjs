/* Confirmed findings (ids as in the evidence folder's findings.json), so a re-run tells a known failure
   from a new one. Each rule matches a failing check record {tool, doc, theme, view, export, check, values}. */
const is = (tool, check, extra = () => true) => r => r.tool === tool && r.check === check && extra(r);
const any = (...fs) => r => fs.some(f => f(r));
const PRINT = c => c.startsWith('print:');

export const KNOWN = [
  /* Bets */
  /* a 64-bet Board is a long ledger: printed in rows (never cut mid-row) it takes 5 sheets, the probe allows 2 */
  {id: 'XB-13', match: r => r.tool === 'bets' && PRINT(r.check)},
  /* Tree */
  /* the 81-node Tree's PNG is made at a reduced scale (stated on the page); the reference raster rounds its height 4px differently */
  {id: 'XT-8', match: r => r.tool === 'tree' && /png:scale-2x|png:matches-svg/.test(r.check)},
  /* Paths */
  /* the Question lens keeps a 43px top and 23px bottom margin (limit 14px apart): its layout trailing gaps differ by view, so no single margin fits all */
  {id: 'XP-13', match: r => r.tool === 'paths' && /svg:margins|png:margins-symmetric|png:ink-off-edge/.test(r.check)},
  /* the 48-item Tree PNG is made at a reduced scale; the reference raster differs by 43px in height */
  {id: 'XP-15', match: is('paths', 'png:matches-svg')},
  /* Fermi */
  {id: 'XF-1', match: is('fermi', 'canvas:house-font')},
  {id: 'XF-2', match: is('fermi', 'canvas:no-mid-word-wrap')},
  {id: 'XF-6', match: is('fermi', 'png:margins-symmetric', r => /point/.test(r.doc))},
  {id: 'XF-8', match: is('fermi', 'md:no-raw-html')},
  {id: 'XF-9', match: is('fermi', 'svg:contrast')},
  {id: 'XF-11', match: r => r.tool === 'fermi' && r.view === 'cf' && /overlap:text-shape|svg:margins/.test(r.check)},
  {id: 'XF-12', match: is('fermi', 'svg:self-contained:font-families')},
  {id: 'XF-13', match: r => r.tool === 'fermi' && PRINT(r.check)},
  /* Rank */
  {id: 'XR-1', match: r => r.tool === 'rank' && /md:no-raw-html|md:markdown-specials-escaped/.test(r.check)},
  {id: 'XR-4', match: r => r.tool === 'rank' && PRINT(r.check)},
];
export function knownFor(r){
  for(const k of KNOWN) if(k.match(r)) return k.id;
  return null;
}
