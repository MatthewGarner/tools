import test from 'node:test';import assert from 'node:assert/strict';import {identifiers} from './state.js';
test('imported identifiers cannot be ambiguous drag payloads or map coordinates',()=>{identifiers([{id:'m-1'},{id:'m_2'}]);for(const id of ['m:1','n|m','a b',''])assert.throws(()=>identifiers([{id}]));assert.throws(()=>identifiers([{id:'x'},{id:'x'}]));});
