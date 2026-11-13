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
  /* accepted as is (export contract §7): a glyph outside the embedded Latin faces falls back to the viewer's system font */
  {id: 'accepted-non-latin', match: r => r.check === 'svg:self-contained:glyph-coverage' || (r.check === 'png:matches-svg' && /awkward/.test(r.doc))},
  /* Rank */
];
export function knownFor(r){
  for(const k of KNOWN) if(k.match(r)) return k.id;
  return null;
}
