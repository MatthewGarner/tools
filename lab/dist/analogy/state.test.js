import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCES, initialState, createWorkspace, active, targetFor, apply, createHistory, change, undo, validateState, validateWorkspace, serialize, parse, markdown} from './state.js';

test('moving a role replaces pairings, frees displaced roles and invalidates affected judgments', () => {
  let state=initialState(),workspace=active(state);const pool=workspace.source.roles[1],allocator=workspace.source.roles[3],hours=workspace.targets[1],coordinator=workspace.targets[3],checked=workspace.source.links.at(-1),note=workspace.reviews[checked.id].note;
  state=apply(state,{type:'map',targetId:hours.id,sourceId:allocator.id});workspace=active(state);
  assert.equal(targetFor(workspace,pool.id),undefined);
  assert.equal(targetFor(workspace,allocator.id).id,hours.id);
  assert.equal(workspace.reviews[checked.id].fit,'unchecked');assert.equal(workspace.reviews[checked.id].stale,true);assert.equal(workspace.reviews[checked.id].note,note);
  state=apply(state,{type:'map',targetId:coordinator.id,sourceId:allocator.id});workspace=active(state);
  assert.equal(targetFor(workspace,allocator.id).id,coordinator.id);
  assert.equal(workspace.mappings.some(mapping=>mapping.targetId===hours.id),false);
  assert.equal(new Set(workspace.mappings.map(mapping=>mapping.sourceId)).size,workspace.mappings.length);
  assert.equal(new Set(workspace.mappings.map(mapping=>mapping.targetId)).size,workspace.mappings.length);
  assert.throws(()=>apply(state,{type:'review',id:checked.id,field:'fit',value:'fits'}),/Map both/);
});

test('removing source roles cannot leave dangling relationships, checks or mappings; Undo restores all', () => {
  let history=createHistory(initialState());const original=structuredClone(history.present),role=active(history.present).source.roles[0];
  history=change(history,{type:'remove-role',side:'source',id:role.id});const workspace=active(history.present);
  assert.equal(workspace.mappings.some(mapping=>mapping.sourceId===role.id),false);
  assert.equal(workspace.source.links.some(link=>link.from===role.id||link.to===role.id),false);
  assert.deepEqual(Object.keys(workspace.reviews),workspace.source.links.map(link=>link.id));
  assert.deepEqual(validateState(history.present),history.present);
  history=undo(history);assert.deepEqual(history.present,original);
});

test('editing a mapped function keeps earlier reasoning but requests a fresh relationship check', () => {
  let state=initialState();const workspace=active(state),target=workspace.targets[0],link=workspace.source.links.at(-1);
  state=apply(state,{type:'role',side:'target',id:target.id,field:'job',value:'A changed function'});
  assert.equal(active(state).reviews[link.id].fit,'unchecked');assert.equal(active(state).reviews[link.id].stale,true);
  assert.equal(active(state).reviews[link.id].note,workspace.reviews[link.id].note);
  state=apply(state,{type:'review',id:link.id,field:'fit',value:'partial'});
  assert.equal(active(state).reviews[link.id].stale,false);
});

test('forking the source preserves the target and original workspace while clearing dependent mappings', () => {
  let state=initialState();const original=structuredClone(active(state));
  state=apply(state,{type:'fork-source',id:'new-source',source:'rehearsal'});
  assert.deepEqual(state.workspaces[0],original);assert.equal(active(state).problem,original.problem);
  assert.deepEqual(active(state).targets.map(({label,job})=>({label,job})),original.targets.map(({label,job})=>({label,job})));
  assert.equal(active(state).mappings.length,0);assert.equal(active(state).plan.test,'');
  assert.equal(active(state).source.name,'Rehearsal');assert.deepEqual(validateState(state),state);
});

test('JSON imports remap the whole graph and preserve Unicode, judgments, explanations and plans', () => {
  let state=initialState();state=apply(state,{type:'plan',field:'test',value:'Run one trial.\n第二步: compare <observations>.'});
  const original=structuredClone(active(state)),imported=parse(serialize(original));assert.deepEqual(imported,original);
  state=apply(state,{type:'import',id:'copied',workspace:imported});const copied=active(state);
  assert.deepEqual(state.workspaces[0],original);assert.equal(copied.source.links.at(-1).id,'copied-l5');assert.equal(copied.selectedLink,'copied-l5');
  assert.equal(copied.mappings[0].sourceId,'copied-s1');assert.equal(copied.mappings[0].targetId,'copied-t1');
  assert.equal(copied.reviews['copied-l5'].fit,'breaks');assert.equal(copied.plan.test,original.plan.test);
  assert.deepEqual(validateState(JSON.parse(JSON.stringify(state))),state);
  const md=markdown(copied);assert.ok(md.includes(copied.plan.test));assert.ok(md.includes(copied.reviews['copied-l5'].note));assert.ok(md.includes('Unmapped target roles'));
});

test('examples and blank custom mechanisms are valid; malformed graphs are rejected safely', () => {
  for(const key of Object.keys(SOURCES)){const example=createWorkspace(key,key);assert.deepEqual(validateWorkspace(example),example);assert.deepEqual(validateWorkspace(createWorkspace(key,key,true)),createWorkspace(key,key,true));}
  const original=initialState(),before=structuredClone(original),wrapper=JSON.parse(serialize(active(original)));
  for(const mutate of [value=>value.workspace.source.links[0].from='missing',value=>value.workspace.mappings.push({...value.workspace.mappings[0]}),value=>value.workspace.targets[0].id=value.workspace.source.roles[0].id,value=>value.workspace.reviews[value.workspace.selectedLink].fit='certain',value=>value.workspace.plan.test=null]){
    const invalid=structuredClone(wrapper);mutate(invalid);assert.throws(()=>parse(JSON.stringify(invalid)));
  }
  assert.throws(()=>apply(original,{type:'map',sourceId:'missing',targetId:active(original).targets[0].id}),/existing roles/);
  assert.throws(()=>parse('null'),/Workshop export/);assert.deepEqual(original,before);
});

test('typing groups undo together without erasing a subsequent mapping move', () => {
  let history=createHistory(initialState());const original=structuredClone(history.present),workspace=active(original),target=workspace.targets[3],source=workspace.source.roles[3];
  history=change(history,{type:'problem',value:'New'},'problem');history=change(history,{type:'problem',value:'New target'},'problem');
  history=change(history,{type:'map',sourceId:source.id,targetId:target.id});assert.equal(history.past.length,2);
  history=undo(history);assert.equal(active(history.present).problem,'New target');assert.equal(active(history.present).mappings.length,3);
  history=undo(history);assert.deepEqual(history.present,original);
});
