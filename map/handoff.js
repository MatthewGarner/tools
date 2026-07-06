/* #93 promote flow, hop 1: flagged map items → a ready-to-run gauge session.
   Flagged items are propositions the room hasn't tested ("no test designed",
   "reported green — challenge it") — exactly what gauge exists to ask. Pure. */

export function gaugeHandoff(model, ro){
  if(!ro || !ro.flagged.length) return null;
  const lines = ['title: ' + (model.title || 'Assumption check') + ' — assumption check', 'names: off', ''];
  for(const f of ro.flagged){
    lines.push(f.item.label + ' :: prob');
  }
  return lines.join('\n');
}
