/* #93 promote flow, hop 1: untested ASSUMPTION-map propositions → Gauge.
   A Gauge answer is a room's prior, not a designed test and not fresh evidence.
   Other Map presets flag different work (risk ownership, stakeholder attitudes,
   skills coverage, RAG honesty), which must not be translated into probability
   questions merely because they share the same two-axis renderer. Pure. */

export function gaugeHandoff(model, ro){
  if(!ro || model?.preset !== 'assumptions' || !ro.flagged.length) return null;
  const safe = value => String(value).replace(/[\r\n]+/g, ' ').replace(/::/g, '—').trim();
  const lines = [
    'title: ' + safe(model.title || 'Assumption check') + ' — room prior',
    'names: off',
    '// Generated from Map: collect independent prior judgements; this does not replace a test.',
    '',
  ];
  for(const f of ro.flagged){
    lines.push(safe(f.item.label) + ' :: prob');
  }
  return lines.join('\n');
}
