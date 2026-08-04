/* Revision gate for the worker-backed preview. The rendered SVG is deliberately
   retained while a new simulation runs, so it must not remain an editable model
   surface: its source lines belong to the previous document revision. */
export function createPreviewRevisionGuard({onBlockedChange, closeActive}){
  let revision = 0;
  let renderedRevision = 0;
  let isBlocked = false;

  function setBlocked(next, rev){
    if(isBlocked === next && revision === rev) return;
    revision = rev;
    isBlocked = next;
    onBlockedChange(next, rev);
  }

  return {
    get blocked(){ return isBlocked; },
    begin(rev){
      closeActive();
      setBlocked(true, rev);
    },
    settle(rev){
      if(rev !== revision) return false;
      renderedRevision = rev;
      setBlocked(false, rev);
      return true;
    },
    clear(rev){
      revision = renderedRevision = rev;
      closeActive();
      setBlocked(false, rev);
    },
    accepts(rev, entityExists){
      return !isBlocked && rev === revision && rev === renderedRevision && entityExists;
    },
  };
}
