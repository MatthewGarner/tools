/* Expensive pure model work stays off the article's interaction thread. */
let loadedURL,definition;
self.addEventListener('message',async event=>{
  const {id,moduleURL,state,view}=event.data ?? {};
  try{
    const url=new URL(moduleURL);
    if(url.origin!==location.origin || !url.pathname.includes('/embed/definitions/') || !url.pathname.endsWith('.js') || url.search || url.hash)
      throw Error('Unsupported model module.');
    if(loadedURL && loadedURL!==url.href)throw Error('A worker cannot switch tool models.');
    if(!definition){loadedURL=url.href;({definition}=await import(url.href));}
    if(typeof definition.project!=='function')throw Error('The model has no background calculation.');
    const result=await definition.project(state,{view});
    self.postMessage({id,result});
  }catch(error){self.postMessage({id,error:error instanceof Error?error.message:'The calculation failed.'});}
});
