/* A phase transition has one focus destination and one live announcement. The
   app applies this only after user-driven transitions; resize/theme paints do
   not steal focus or repeat announcements. */
export function transitionCue(phase, turn, quarters, callCount){
  if(phase === 'play') return {
    target: 'stage',
    announcement: 'Quarter ' + Math.min(turn + 1, quarters) + ' ready. Choose who needs a conversation.',
  };
  if(phase === 'reveal') return {
    target: 'reveal',
    announcement: 'Quarter ' + Math.min(turn + 2, quarters) + ' results are ready. Review how your conversations landed.',
  };
  if(phase === 'done') return {
    target: 'again',
    announcement: 'Run complete. ' + callCount + ' conversation' + (callCount === 1 ? '' : 's') +
      ' opened. Your verdict is ready.',
  };
  return null;
}
