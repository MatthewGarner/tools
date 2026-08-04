/* Pure interaction state for roadmap's pointer/menu layer. */

/* A completed in-preview drag is followed by one synthetic click in the same
   browser task. Suppress that click only; a boolean with no expiry can eat an
   unrelated click after an outside release or interrupted gesture. */
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

/* Menu moves and pointer drops are the same model edit, so they should request
   the same keyed FLIP transition. No changed text means no undo step or motion. */
export function moveCommit(currentText, nextText){
  return nextText && nextText !== currentText ? {text: nextText, flip: true} : null;
}
