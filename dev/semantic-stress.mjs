/* Cross-tool cases that must retain their semantic boundary as they move. Test
 * modules import this rather than growing friendly local fixtures that omit the
 * malformed edge. The source is intentionally raw: parsers must not repair it
 * before the handoff has a chance to refuse. */

export const GAUGE_FERMI_PROVENANCE_STRESS = Object.freeze([
  {
    id:'oversized-question',
    source:'Q'.repeat(181) + ' :: range weeks',
    issue:/question is too long/,
  },
  {
    id:'control-question',
    source:'Weeks\u0000to migrate :: range weeks',
    issue:/question contains control characters/,
  },
  {
    id:'control-unit',
    source:'Weeks to migrate :: range week\u0000s',
    issue:/unit contains control characters/,
  },
]);
