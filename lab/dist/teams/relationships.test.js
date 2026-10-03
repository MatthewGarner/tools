import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_LAYOUT} from './definitions.js';
import {DEFAULT_RELATIONSHIPS,validateRelationships,coordinationFor,traceMaps} from './relationships.js';
import {createWorkload} from './engine.js';
test('one liaison budget cannot be counted once per assigned coordination role',()=>{
 const r=structuredClone(DEFAULT_RELATIONSHIPS);for(const key of Object.keys(r.owners))r.owners[key]='ari';r.hours.ari=1;
 const result=coordinationFor(DEFAULT_LAYOUT,'rush',r);
 assert.ok(result.requested>1);assert.ok(Math.abs(result.covered-1)<1e-9);assert.ok(Math.abs(result.gap-(result.requested-1))<1e-9);
});
test('removing an owner uncovers work; abundant capacity and zero-effort boundaries reverse the deficit',()=>{
 const r=structuredClone(DEFAULT_RELATIONSHIPS);for(const key of Object.keys(r.hours))r.hours[key]=120;
 assert.ok(coordinationFor(DEFAULT_LAYOUT,'quiet',r).gap<1e-9);
 r.owners.customer='none';assert.ok(coordinationFor(DEFAULT_LAYOUT,'quiet',r).gap>0);
 r.effort.customer=0;assert.ok(coordinationFor(DEFAULT_LAYOUT,'quiet',r).gap<1e-9);
});
test('maps trace the same ordered work without moving memberships in other views',()=>{
 const r=structuredClone(DEFAULT_RELATIONSHIPS),job=createWorkload('rush')[0],before=traceMaps(job,DEFAULT_LAYOUT,r);
 r.maps.customer.product='c';const after=traceMaps(job,DEFAULT_LAYOUT,r);
 assert.deepEqual(after.filter(x=>x.id!=='customer'),before.filter(x=>x.id!=='customer'));
 for(const row of after)assert.deepEqual(row.steps.map(s=>s.capability),job.stages.map(s=>s.capability));
});
test('coordination imports reject unbounded budgets, unknown groups and missing fields',()=>{
 for(const mutate of [r=>r.hours.ari=-1,r=>r.hours.bea=Infinity,r=>r.maps.funding.test='d',r=>delete r.owners.team]){const r=structuredClone(DEFAULT_RELATIONSHIPS);mutate(r);assert.throws(()=>validateRelationships(r));}
});
