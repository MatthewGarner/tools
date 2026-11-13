/* When the Explore slider commits its value to the source. A pointer release commits at once (now); arrow keys commit once, after
   the last key has been quiet for `delay` ms, or on blur (flush). Pure scheduling: the timer functions are injectable for tests. */
export function createSliderCommit(commit, {delay = 250, setTimeout: st = globalThis.setTimeout, clearTimeout: ct = globalThis.clearTimeout} = {}){
  let timer = null;
  const clear = () => { if(timer !== null){ ct(timer); timer = null; } };
  return {
    key(){ clear(); timer = st(() => { timer = null; commit(); }, delay); },
    now(){ clear(); commit(); },
    flush(){ if(timer !== null){ clear(); commit(); } },
    cancel: clear,
    pending: () => timer !== null,
  };
}
