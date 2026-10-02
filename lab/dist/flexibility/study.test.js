import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun,publicView,advance,policyDecision,serialize,restore,schedule,feasibleRange} from './engine.js';
import {diagnose,matchedComparison,promiseLabel} from './study.js';

test('one-hour notice reveals exactly one price, never early offers; legacy runs retain their results',()=>{
  for(const priceNotice of [0,1]){
    let state=createRun(14,{priceNotice});
    for(let t=0;t<6;t++){
      const v=publicView(state);
      assert.equal(v.observedPrices.length,t+1);
      assert.deepEqual(v.announcedPrices,priceNotice&&t<5?[{slot:t+1,price:schedule(14).prices[t+1]}]:[]);
      assert.ok(v.currentOffers.every(o=>o.reveal===t));
      state=advance(state,policyDecision(v));
    }
    assert.deepEqual(restore(serialize(state)),state);
    assert.deepEqual(publicView(state).announcedPrices,[]);
    if(!priceNotice){const old=serialize(state);delete old.conditions;assert.deepEqual(restore(old),state);}
  }
  for(const bad of [null,{priceNotice:2},{priceNotice:'1'},{priceNotice:0,future:true}])assert.throws(()=>createRun(14,bad),/notice/);
});
test('information changes only an exposed preparation rule, identical across commitment policies',()=>{
  const v={...publicView(createRun()),currentOffers:[],currentPrice:60};
  for(const policy of ['firm','open']){
    assert.equal(policyDecision(v,policy).dispatchMW,0);
    assert.equal(policyDecision({...v,announcedPrices:[{slot:1,price:100}]},policy).dispatchMW,-4);
    assert.equal(policyDecision({...v,announcedPrices:[{slot:1,price:70}]},policy).dispatchMW,0);
    assert.equal(policyDecision({...v,announcedPrices:[{slot:2,price:1000}]},policy).dispatchMW,0);
    assert.equal(policyDecision({...v,currentPrice:100,announcedPrices:[{slot:1,price:110}]},policy).dispatchMW,3.6);
  }
  for(let seed=1;seed<=30;seed++){
    const rows=matchedComparison(seed);assert.equal(rows.length,4);
    assert.deepEqual(rows.map(r=>r.state.history.map(h=>h.price)),Array(4).fill(schedule(seed).prices));
    for(const row of rows)assert.equal(feasibleRange(row.state).feasible,true);
  }
});
test('extra notice can change a policy, but does not manufacture a gain on every day',()=>{
  const changed=matchedComparison(2),unchanged=matchedComparison(14);
  assert.ok(changed[3].result.value>changed[1].result.value);
  assert.deepEqual(changed[2].result,changed[0].result);
  assert.deepEqual(unchanged[2].result,unchanged[0].result);
  assert.deepEqual(unchanged[3].result,unchanged[1].result);
});
test('a joint reserve constraint identifies the smallest release set rather than one invented culprit',()=>{
  const contracts=['r1','r2'].map(id=>({id,slot:0,kind:'reserve',mw:1,fee:30}));
  const v={...publicView(createRun()),contracts,energyMWh:8};
  const d=diagnose(v,[],{kind:'dispatch',dispatchMW:4});
  assert.equal(d.allowed,false);assert.equal(d.physical,true);assert.deepEqual(d.releaseSets,[['r1','r2']]);
  assert.equal(d.range.max,2);
  const lifted=diagnose(v,[],{kind:'dispatch',dispatchMW:4,liftedIds:['r1','r2']});
  assert.equal(lifted.allowed,true);assert.equal(lifted.range.max,4);
  assert.equal(v.contracts.length,2);
});
test('earlier promises explain an unavailable offer, including alternative ways to reopen it',()=>{
  const v={...publicView(createRun()),slot:2,energyMWh:8,
    contracts:[{id:'a',kind:'delivery',slot:3,mw:2},{id:'b',kind:'reserve',slot:3,mw:1}],
    currentOffers:[{id:'new',kind:'reserve',slot:3,mw:2}],history:[{slot:0,acceptedIds:['a']},{slot:1,acceptedIds:['b']}]};
  const d=diagnose(v,[],{kind:'offer',offerId:'new'});
  assert.equal(d.allowed,false);assert.deepEqual(d.releaseSets,[['a'],['b']]);
  assert.match(d.reasons[0],/5 MW/);assert.match(promiseLabel(v,v.contracts[0]),/15:00 · accepted 12:00/);
  assert.throws(()=>diagnose(v,[],{kind:'offer',offerId:'new',liftedIds:['new']}),/other active/);
});
test('insufficient physical energy and a candidate’s own charging gap do not blame other promises',()=>{
  const v={...publicView(createRun()),slot:4,energyMWh:0,contracts:[{id:'past',slot:0,kind:'delivery',mw:2}],currentOffers:[{id:'last',slot:5,kind:'delivery',mw:4}]};
  for(const probe of [{kind:'dispatch',dispatchMW:1},{kind:'offer',offerId:'last'}]){
    const d=diagnose(v,[],probe);assert.equal(d.physical,false);assert.deepEqual(d.releaseSets,[]);assert.deepEqual(d.removable,[]);
    assert.ok(d.reasons.length);
  }
});
test('future energy floor and forced delivery expose the physical path behind the limit',()=>{
  const v={...publicView(createRun()),slot:4,energyMWh:4,contracts:[{id:'late',slot:5,kind:'delivery',mw:4}]};
  const d=diagnose(v,[],{kind:'dispatch',dispatchMW:1});
  assert.match(d.reasons.join(' '),/must remain/);assert.deepEqual(d.releaseSets,[['late']]);
  const due={...v,contracts:[{id:'now',slot:4,kind:'delivery',mw:2}]};
  assert.match(diagnose(due,[],{kind:'dispatch',dispatchMW:-1}).reasons.join(' '),/forces at least 2 MW/);
});
