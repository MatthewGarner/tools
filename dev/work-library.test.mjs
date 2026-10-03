import test from 'node:test';
import assert from 'node:assert/strict';
import {readNativeWork,filterWork} from '../assets/work-store.js';
import {workToken} from '../assets/work-reference.js';
import {resumeWorkspace} from '../lab/dist/shared/work-session.js';

function storage(values){return {getItem(key){return Object.hasOwn(values,key)?values[key]:null;},setItem(){throw Error('Discovery must not write');}};}
test('library distinguishes editable work, copies and baselines without rewriting stores',()=>{
 const baseline={label:'Before review',src:'title: Earlier'};
 const values={'roadmap-src':'title: Current plan','roadmap-saved':JSON.stringify([{name:'Launch copy',src:'title: Launch'}]),'roadmap-snaps':JSON.stringify([baseline]),'thinking-lab:reframe:v1':JSON.stringify({activeId:'first',sessions:[{id:'first',problem:'First'},{id:'second',problem:'Second',updatedAt:'2026-10-02T12:00:00.000Z'}]})};
 const {records,unreadable}=readNativeWork(storage(values));assert.deepEqual(unreadable,[]);
 assert.equal(records.length,5);assert.equal(records[0].name,'Second');
 assert.equal(records.find(r=>r.kind==='draft').href,'/roadmap/');
 assert.deepEqual(records.find(r=>r.kind==='copy').state,{t:'title: Launch'});
 assert.equal(records.find(r=>r.kind==='baseline').href,'/roadmap/?baseline='+workToken(baseline));
 assert.equal(records[0].href,'/lab/reframe/?work=second');
 assert.equal(filterWork(records,'second','workspace').length,1);
 assert.equal(filterWork(records,'launch','draft').length,0);
});
test('origin scopes, corrupt records and register ownership are explicit',()=>{
 const values={'cycles-src':'title: Battery','roadmap-src':'title: Plan','map-saved':'{broken','premortem:index':JSON.stringify([{id:'unrelated'},{id:'example-lantern',title:'Register'}]),'premortem:unrelated':JSON.stringify({id:'unrelated'}),'premortem:example-lantern':JSON.stringify({id:'example-lantern'})};
 const tools=readNativeWork(storage(values)),energy=readNativeWork(storage(values),{scope:'energy',pathname:'/energy/'});
 assert.equal(energy.records.length,1);assert.equal(energy.records[0].href,'/energy/cycles/');
 assert.equal(tools.records.some(r=>r.tool==='cycles'),false);
 assert.equal(tools.records.filter(r=>r.tool==='premortem').length,1);
 assert.ok(tools.unreadable.includes('map-saved'));assert.ok(tools.records.some(r=>r.kind==='draft'));
 assert.throws(()=>readNativeWork({getItem(){throw new DOMException('Blocked','SecurityError');}}),/Blocked/);
});
test('resume selects the exact saved workspace and never silently substitutes a missing ID',()=>{
 const state={activeId:'a',workspaces:[{id:'a'},{id:'b'}]};
 const resumed=resumeWorkspace(state,'workspaces','?work=b');assert.equal(resumed.state.activeId,'b');assert.equal(state.activeId,'a');
 const missing=resumeWorkspace(state,'workspaces','?work=removed');assert.equal(missing.state,state);assert.equal(missing.missing,true);
 assert.equal(resumeWorkspace(state,'workspaces','').state,state);
 assert.notEqual(workToken({label:'One',src:'aaa'}),workToken({label:'One',src:'bbb'}));
});
