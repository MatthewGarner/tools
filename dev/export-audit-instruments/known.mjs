/* Confirmed findings (ids as in the evidence folder's findings.json), so a re-run tells a known failure
   from a new one. Each rule matches a failing check record {tool, doc, theme, view, export, check, values}. */
const is = (tool, check, extra = () => true) => r => r.tool === tool && r.check === check && extra(r);
const any = (...fs) => r => fs.some(f => f(r));
const PRINT = c => c.startsWith('print:');

export const KNOWN = [
  /* Bets */
  {id: 'XB-1', match: is('bets', 'png:copy-equals-download')},
  {id: 'XB-4', match: is('bets', 'svg:overlap:text-text', r => r.view === 'board' && !/extreme/.test(r.doc))},
  {id: 'XB-5', match: is('bets', 'svg:overlap:text-shape', r => r.view === 'quadrant')},
  {id: 'XB-6', match: r => r.tool === 'bets' && /extreme/.test(r.doc) && /clipped-text|overlap|ink-off-edge/.test(r.check)},
  {id: 'XB-7', match: any(is('bets', 'svg:authored-present'), is('bets', 'md:authored-present', r => (r.values.lost || []).some(s => /https?:\/\//.test(s))))},
  {id: 'XB-8', match: is('bets', 'md:authored-present')},
  {id: 'XB-9', match: is('bets', 'png:scale-2x')},
  {id: 'XB-10', match: r => r.tool === 'bets' && r.view === 'quadrant' && /many|twelve/.test(r.doc) && /overlap|clipped/.test(r.check)},
  {id: 'XB-12', match: is('bets', 'svg:self-contained:font-families')},
  {id: 'XB-13', match: r => r.tool === 'bets' && PRINT(r.check)},
  {id: 'XB-17', match: r => r.tool === 'bets' && /svg:margins|png:margins-symmetric/.test(r.check)},
  /* Tree */
  {id: 'XT-1', match: r => r.tool === 'tree' && /clipped-text|overlap:text-shape|ink-off-edge/.test(r.check)},
  {id: 'XT-2', match: is('tree', 'png:copy-equals-download')},
  {id: 'XT-3', match: is('tree', 'svg:truncation')},
  {id: 'XT-4', match: r => r.tool === 'tree' && /svg:margins|png:margins-symmetric/.test(r.check)},
  {id: 'XT-6', match: is('tree', 'svg:self-contained:font-families')},
  {id: 'XT-7', match: r => r.tool === 'tree' && PRINT(r.check)},
  {id: 'XT-8', match: r => r.tool === 'tree' && /png:scale-2x|png:matches-svg/.test(r.check)},
  /* Paths */
  {id: 'XP-1', match: r => r.tool === 'paths' && /font-families|generic-fallback/.test(r.check) && JSON.stringify(r.values).includes('"Times"')},
  {id: 'XP-11', match: is('paths', 'svg:self-contained:font-families')},
  {id: 'XP-2', match: is('paths', 'svg:mirrors-live-words', r => r.view === 'agenda')},
  {id: 'XP-3', match: r => r.tool === 'paths' && r.view === 'agenda' && /long/.test(r.doc) && /clipped|overlap|ink-off-edge|truncation/.test(r.check)},
  {id: 'XP-4', match: r => r.tool === 'paths' && r.view === 'tree' && /overlap/.test(r.check)},
  {id: 'XP-8', match: is('paths', 'svg:contrast')},
  {id: 'XP-9', match: is('paths', 'svg:truncation')},
  {id: 'XP-10', match: is('paths', 'png:scale-2x')},
  {id: 'XP-12', match: r => r.tool === 'paths' && PRINT(r.check)},
  {id: 'XP-13', match: r => r.tool === 'paths' && /svg:margins|png:margins-symmetric|png:ink-off-edge/.test(r.check)},
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
