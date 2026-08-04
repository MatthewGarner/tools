import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FIT_READABILITY_FLOOR,fitReadabilityDecision} from '../workspace.js';

test('Fit guards automatic shrink below the shared 0.70 floor',()=>{
  assert.equal(FIT_READABILITY_FLOOR,.70);
  assert.equal(fitReadabilityDecision({naturalWidth:1000,fitWidth:699}).guard,true);
  assert.equal(fitReadabilityDecision({naturalWidth:1000,fitWidth:700}).guard,false);
});

test('a declared data floor may raise but never lower the shared floor',()=>{
  assert.deepEqual(fitReadabilityDecision({naturalWidth:1000,fitWidth:760,declaredMinScale:.8}),
    {guard:true,scale:.76,minScale:.8});
  assert.equal(fitReadabilityDecision({naturalWidth:1000,fitWidth:690,declaredMinScale:.5}).minScale,.7);
});

test('invalid geometry and declarations fail open without an advisory loop',()=>{
  assert.equal(fitReadabilityDecision({naturalWidth:0,fitWidth:20,declaredMinScale:'bad'}).guard,false);
  assert.equal(fitReadabilityDecision({naturalWidth:1000,fitWidth:1000,declaredMinScale:null}).guard,false);
});
