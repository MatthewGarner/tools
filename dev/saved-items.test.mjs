import {test} from 'node:test';
import assert from 'node:assert/strict';
import {storeSaved} from '../assets/saved-items.js';
import {savedSelectionAfterDelete} from '../assets/handoff-ui.js';

test('storeSaved reports success and quota/storage failure', () => {
  const prior = globalThis.localStorage;
  try{
    globalThis.localStorage = {setItem(){}};
    assert.equal(storeSaved('x', [{name:'one'}]), true);
    globalThis.localStorage = {setItem(){ throw new Error('quota'); }};
    assert.equal(storeSaved('x', [{name:'two'}]), false);
  }finally{
    if(prior === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = prior;
  }
});

test('deleting the active saved artefact restores current; earlier deletion shifts selection', () => {
  assert.deepEqual(savedSelectionAfterDelete(2, 2), {activeIndex:null, restoreCurrent:true});
  assert.deepEqual(savedSelectionAfterDelete(2, 0), {activeIndex:1, restoreCurrent:false});
  assert.deepEqual(savedSelectionAfterDelete(null, 0), {activeIndex:null, restoreCurrent:false});
});
