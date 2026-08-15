/* Pure interaction/menu state for the map artifact. */

export function createPostDragClickGuard(schedule = fn => setTimeout(fn, 0), cancel = id => clearTimeout(id)){
  let armed = false, expiry = null;
  function clear(){
    if(expiry !== null) cancel(expiry);
    armed = false;
    expiry = null;
  }
  return {
    arm(expectClick){
      clear();
      if(!expectClick) return;
      armed = true;
      expiry = schedule(clear);
    },
    consume(){
      if(!armed) return false;
      clear();
      return true;
    },
    clear,
    isArmed: () => armed,
  };
}

/* The renderer exposes exactly one field target only when fields exist. Keep
   the menu in lockstep so every visible row always has a reachable action. */
export function cardMenuRows(item, hasFieldTarget = false){
  if(!item) return [];
  const rows = [{label: 'Rename…', opens: 'label'}];
  if(hasFieldTarget)
    rows.push({label: 'Edit field…', opens: 'field'});
  rows.push(
    {label: 'Inspect…', action: true},
    {label: item.x != null ? 'Move…' : 'Place on map…', action: true},
    {label: 'Remove', action: true, danger: true},
  );
  return rows;
}
