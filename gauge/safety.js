/* Small, DOM-light safety primitives for facilitator actions. */

export async function tryClipboardWrite(clipboard, text){
  if(!text || !clipboard || typeof clipboard.writeText !== 'function') return false;
  try{
    await clipboard.writeText(text);
    return true;
  }catch(e){
    return false;
  }
}

export function requestLock(buttons){
  let busy = false;
  return {
    get busy(){ return busy; },
    async run(task){
      if(busy) return {started: false};
      busy = true;
      const prior = buttons.map(button => button.disabled);
      buttons.forEach(button => { button.disabled = true; });
      try{
        return {started: true, value: await task()};
      }finally{
        buttons.forEach((button, i) => { button.disabled = prior[i]; });
        busy = false;
      }
    },
  };
}
