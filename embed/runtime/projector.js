/* At most one active calculation and two bounded result snapshots per instance.
   New input cancels obsolete work; theme/size changes reuse identical model results. */
export function createProjector(moduleURL){
  let worker,pending,sequence=0;
  const cache=new Map();
  function cancel(){
    worker?.terminate();worker=undefined;
    pending?.reject(new Error('The calculation was superseded.'));pending=undefined;
  }
  function start(){
    if(typeof Worker!=='function')throw Error('This browser cannot run the interactive example.');
    worker=new Worker(new URL('./project-worker.js',import.meta.url),{type:'module'});
    worker.addEventListener('message',event=>{
      if(!pending || event.data?.id!==pending.id)return;
      const current=pending;pending=undefined;
      if(event.data.error){current.reject(new Error(event.data.error));return;}
      cache.set(current.key,event.data.result);
      if(cache.size>2)cache.delete(cache.keys().next().value);
      current.resolve(event.data.result);
    });
    worker.addEventListener('error',()=>{
      const current=pending;pending=undefined;worker.terminate();worker=undefined;
      current?.reject(new Error('The example calculation could not finish.'));
    });
  }
  return {
    project(state,view){
      const key=JSON.stringify([view,state]);
      if(cache.has(key)){if(pending)cancel();return Promise.resolve(cache.get(key));}
      if(pending?.key===key)return pending.promise;
      if(pending)cancel();
      if(!worker)start();
      let resolve,reject;
      const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
      pending={id:++sequence,key,resolve,reject,promise};
      worker.postMessage({id:pending.id,moduleURL,state,view});
      return promise;
    },
    dispose(){cancel();cache.clear();}
  };
}
