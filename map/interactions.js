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

/* Field values stay in the source model, not as incidental map decoration.
   The card trigger carries its first authored field route for the menu fallback. */
export function cardMenuRows(item, hasFieldRoute = false){
  if(!item) return [];
  const rows = [{label: 'Rename…', opens: 'label'}];
  if(hasFieldRoute)
    rows.push({label: 'Edit field…', opens: 'field'});
  rows.push(
    {label: 'Inspect…', action: true},
    {label: item.x != null ? 'Move…' : 'Place on map…', action: true},
    {label: 'Remove', action: true, danger: true},
  );
  return rows;
}
