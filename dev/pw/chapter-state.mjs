import assert from 'node:assert/strict';
export async function waitChapterSource(page,expected){
  // Playwright's injected polling must receive a synchronous predicate; resolve the
  // async URL codec in Node and compare it alongside the live CodeMirror document.
  const deadline=Date.now()+5000;
  let actual;
  do{
    actual=await page.evaluate(async()=>{
      const {EditorView}=await import('/roadmap/vendor/codemirror.js');
      return {current:EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.toString(),saved:(await(await import('/assets/series.js')).readHashState())?.t};
    });
    if(actual.current===expected && actual.saved===expected)return;
    await page.waitForTimeout(25);
  }while(Date.now()<deadline);
  assert.deepEqual(actual,{current:expected,saved:expected},'editor and URL must agree');
}
