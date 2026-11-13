/* What the reader sees while a simulation runs off the main thread, shared by Bets and Tree.
   - `data-sim` on the artefact's host reads `pending` the moment a run is asked for and `final` when its figures are on the page.
     It is the page's own signal: a test, an export and a screen reader all wait on it rather than on a clock.
   - `aria-busy` says the same to assistive technology.
   - The figures dim (`data-sim-dim`, styled by each tool) only if the run is still going after `delay` ms: a run that returns
     inside it is never seen to wait.
   - The verdict is announced politely, once, when the final figures arrive after a wait the reader could see.
   - A document the engine cannot solve reads `error`: figures from the last one that worked, nothing exported.
   - Anything that would leave the page (a PNG, a download, Markdown) asks `whenFinal` and runs on the final figures. */
export function createSimPending({host, live, delay = 100, setTimer = globalThis.setTimeout, clearTimer = globalThis.clearTimeout}){
  let pending = false, dimTimer = null, announced = '';
  const waiting = [];
  host.dataset.sim = 'final';
  const clearDim = () => { clearTimer(dimTimer); dimTimer = null; delete host.dataset.simDim; };
  return {
    isFinal: () => !pending,
    /* a run was asked for: the figures on the page are the last result, not this document's */
    begin(){
      if(pending) return;
      pending = true;
      host.dataset.sim = 'pending';
      host.setAttribute('aria-busy', 'true');
      dimTimer = setTimer(() => { dimTimer = null; if(pending) host.dataset.simDim = ''; }, delay);
    },
    /* the figures on the page are final. `verdict` (the line a reader would hear) is announced if it is new. */
    end(verdict = ''){
      const waited = pending;
      pending = false;
      clearDim();
      host.dataset.sim = 'final';
      host.removeAttribute('aria-busy');
      if(live && waited && verdict && verdict !== announced){ live.textContent = verdict; }
      if(verdict) announced = verdict;
      for(const fn of waiting.splice(0)) fn();
    },
    /* the engine could not solve this document: nothing more is coming. The figures are the last that worked, so `data-sim` says
       neither pending nor final, and what was held waits no longer (its action finds nothing to export). */
    fail(){
      pending = false;
      clearDim();
      host.dataset.sim = 'error';
      host.removeAttribute('aria-busy');
      for(const fn of waiting.splice(0)) fn();
    },
    /* `fn` now if the figures are final, else as soon as they are */
    whenFinal(fn){ if(!pending) fn(); else waiting.push(fn); },
  };
}

/* Hold back every action that would put figures outside the page until the figures are final: a press while a run is going shows
   that the control is working, then acts on the final result, exactly as if it had been pressed then. Register BEFORE the page
   wires the buttons' own handlers: this one stops the press, and replays it. */
export function holdWhilePending(buttons, pending, {say} = {}){
  let replaying = false;
  for(const btn of buttons){
    if(!btn) continue;
    btn.addEventListener('click', event => {
      if(replaying || pending.isFinal()) return;
      event.stopImmediatePropagation();
      event.preventDefault();
      if(btn.dataset.working !== undefined) return;   // one press is already waiting
      btn.dataset.working = '';
      btn.setAttribute('aria-busy', 'true');
      if(say) say('Working out the final figures, then this will run.');
      pending.whenFinal(() => {
        delete btn.dataset.working;
        btn.removeAttribute('aria-busy');
        if(say) say('');
        replaying = true;
        try{ btn.click(); }finally{ replaying = false; }
      });
    }, true);
  }
}

/* The figures arriving repaints the artefact, and a repaint drops the focus the reader (or the shared edit-in-place) had put on a
   figure: hand it back to the same item, by what the item is (its kind of edit, its source line, its key), never from a reader who
   has since moved on. `swap` is the synchronous repaint. */
export function keepFocus(host, swap){
  const a = document.activeElement;
  const snap = a && a !== host && host.contains(a) && a.dataset && a.dataset.edit != null && a.dataset.line != null
    ? {edit: a.dataset.edit, line: a.dataset.line, key: a.closest('[data-key]')?.dataset.key} : null;
  swap();
  if(!snap || a.isConnected) return;
  const now = document.activeElement;
  if(now && now !== document.body && now.isConnected) return;
  const same = [...host.querySelectorAll('[data-edit="' + snap.edit + '"]')].filter(e => e.dataset.line === snap.line && e.hasAttribute('tabindex'));
  const byKey = snap.key ? same.filter(e => e.closest('[data-key]')?.dataset.key === snap.key) : same;
  const hit = byKey.length === 1 ? byKey[0] : same.length === 1 ? same[0] : null;
  if(hit) hit.focus({preventScroll: true});
}
