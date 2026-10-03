import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSession,readExperiment,portableExperiment} from './session-state.js';
const definition={stateSchema:{type:'object',properties:{n:{type:'integer',minimum:0,maximum:10}},required:['n'],additionalProperties:false},validate:s=>{if(s.n===7)throw Error('Domain invariant');}};
test('portable comparison round trip retains independent current and pinned states',()=>{
 const source={state:{n:3},pinned:{n:5}},result=readExperiment(definition,'test',portableExperiment('test',source));
 assert.deepEqual(result,source);result.state.n=4;assert.equal(source.state.n,3);assert.equal(result.pinned.n,5);
});
test('import rejects another model, malformed envelopes and invalid pinned domain state without mutation',()=>{
 const source={state:{n:3},pinned:{n:7}},before=structuredClone(source);
 assert.throws(()=>validateSession(definition,source),/Domain invariant/);assert.deepEqual(source,before);
 assert.throws(()=>readExperiment(definition,'other',portableExperiment('test',{state:{n:1},pinned:null})),/different experiment/);
 for(const raw of [{state:{n:2}}, {state:{n:11},pinned:null}, {state:{n:2},pinned:null,unknown:1}])assert.throws(()=>validateSession(definition,raw));
});
