import test from 'node:test';
import assert from 'node:assert/strict';
import {MODEL,createRun,publicView,preview,projection,advance,feasibleRange,policyDecision,storedAfter,requiredEnergy,envelope,result,serialize,restore,schedule} from './engine.js';
const close=(a,b,msg='')=>assert.ok(Math.abs(a-b)<1e-7,`${msg}: ${a} ≠ ${b}`);
const rng=()=>{let s=98765;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/2**32;};};
test('grid flows apply the correct efficiency direction and do not create round-trip energy',()=>{
  close(storedAfter(4,-1),4.9);close(storedAfter(4,1),4-1/.9);
  close(storedAfter(storedAfter(4,-1),.81),4);
  const v={...publicView(createRun()),currentPrice:50,currentOffers:[]};const charge=projection(v,[],-1);const sell=projection({...v,energyMWh:charge.energyMWh},[],.81);
  close(sell.energyMWh,4);close(charge.cashDelta+sell.cashDelta,-13.12);
});
test('energy contracts replace spot revenue for their MWh, reserve pays once and uses no energy',()=>{
  const contracts=[{id:'x',slot:0,kind:'delivery',mw:1,rate:95,fee:95},{id:'y',slot:0,kind:'reserve',mw:1,rate:38,fee:38}];
  const v={...publicView(createRun()),contracts,currentOffers:[],currentPrice:100};const p=projection(v,[],2);
  close(p.deliveryRevenue,95);close(p.spotRevenue,100);close(p.reserveRevenue,38);close(p.wearCost,4);close(p.cashDelta,229);close(p.energyMWh,4-2/.9);
  assert.throws(()=>projection(v,[],3),/feasible range/);assert.throws(()=>projection(v,[],-1),/feasible range/);
  const reserveOnly={...v,contracts:[contracts[1]]};const held=projection(reserveOnly,[],0);close(held.energyMWh,4);close(held.cashDelta,38);
});
test('reserve must be available from the start and survive planned export for the whole hour',()=>{
  const contracts=[{id:'r',slot:0,kind:'reserve',mw:2,fee:100}];
  const low={...createRun(),energyMWh:2,contracts};assert.equal(feasibleRange(low).feasible,false);
  const v={...publicView(createRun()),contracts,currentOffers:[]};const p=projection(v,[],feasibleRange(v).max);close(p.energyMWh,2/.9);assert.ok(feasibleRange(v).min>=-2);
});
test('a future promise is rejected when the remaining charging time cannot supply its energy',()=>{
  const v={...publicView(createRun()),slot:4,energyMWh:0,currentOffers:[{id:'last',slot:5,kind:'delivery',mw:4,fee:400}]};
  assert.equal(preview(v,['last']).feasible,false);
  const floor=requiredEnergy([{slot:5,kind:'delivery',mw:4}]);close(floor[4],4/.9-4*.9);
});
test('duplicate, expired and over-capacity promises cannot enter a run',()=>{
  const v=publicView(createRun());assert.throws(()=>preview(v,['a','a']),/once/);assert.throws(()=>preview(v,['not-an-offer']),/not available/);
  const past=advance(createRun(),{dispatchMW:0});assert.throws(()=>advance(past,{acceptedIds:['a'],dispatchMW:0}),/not available/);
  assert.equal(preview({...v,currentOffers:[{id:'x',slot:3,kind:'delivery',mw:3},{id:'y',slot:3,kind:'reserve',mw:2}]},['x','y']).feasible,false);
});
test('hundreds of feasible runs conserve energy, settle money and fulfil every accepted promise',()=>{
  const random=rng();
  for(let seed=1;seed<=240;seed++){
    let s=createRun(seed);let imports=0,exports=0,cash=0;
    for(let t=0;t<MODEL.slots;t++){
      const v=publicView(s);const ids=[];for(const o of v.currentOffers)if(random()<.65&&preview(v,[...ids,o.id]).feasible)ids.push(o.id);
      const p=preview(v,ids);assert.ok(p.feasible);const d=p.range.min+(p.range.max-p.range.min)*random();
      const before=s;s=advance(s,{acceptedIds:ids,dispatchMW:d});const h=s.history.at(-1);
      assert.ok(s.energyMWh>=-1e-7&&s.energyMWh<=8+1e-7);assert.ok(Math.abs(d)+h.reserveMW<=4+1e-7);
      assert.ok(d+1e-7>=h.deliveryMW||h.deliveryMW===0);if(h.deliveryMW)assert.ok(d>0);
      assert.ok(before.energyMWh+1e-7>=h.reserveMW/.9);assert.ok(s.energyMWh+1e-7>=h.reserveMW/.9);
      if(d<0)imports-=d;else exports+=d;
      cash+=h.deliveryRevenue+h.reserveRevenue+(d-h.deliveryMW)*h.price-Math.abs(d)*2;close(s.cash,cash);
      close(s.energyMWh,4+imports*.9-exports/.9);assert.ok(feasibleRange(s).feasible);
    }
    const r=result(s);close(r.value,cash+(s.energyMWh-4)*45);close(r.deliveryRevenue,s.contracts.filter(c=>c.kind==='delivery').reduce((a,c)=>a+c.fee,0));close(r.reserveRevenue,s.contracts.filter(c=>c.kind==='reserve').reduce((a,c)=>a+c.fee,0));
    assert.throws(()=>advance(s),/complete/);assert.deepEqual(restore(serialize(s)),s);
  }
});
test('the reachable energy envelope contains valid future paths and has achievable edges',()=>{
  const contracts=publicView(createRun()).currentOffers;const v={...publicView(createRun()),contracts};const band=envelope(v);assert.equal(band.length,7);
  for(const edge of ['min','max']){let s={...createRun(),contracts};for(let t=0;t<6;t++){const r=feasibleRange(s);s=advance(s,{dispatchMW:r[edge]});assert.ok(s.energyMWh>=band[t+1].min-1e-7&&s.energyMWh<=band[t+1].max+1e-7);}}
  // Each extremum can be reached by following minimum/maximum dispatch to it.
  let low={...createRun(),contracts},high={...createRun(),contracts};for(let t=0;t<6;t++){low=advance(low,{dispatchMW:feasibleRange(low).max});high=advance(high,{dispatchMW:feasibleRange(high).min});close(low.energyMWh,band[t+1].min);close(high.energyMWh,band[t+1].max);}
});
test('reveals are progressive, replay preserves the schedule, and policies have no future-price input',()=>{
  let a=createRun(14),b=createRun(14);for(let t=0;t<6;t++){
    const v=publicView(a);assert.equal(v.observedPrices.length,t+1);assert.equal(v.currentPrice,schedule(14).prices[t]);assert.ok(v.currentOffers.every(o=>o.reveal===t));assert.equal(v.prices,undefined);assert.equal(v.schedule,undefined);assert.deepEqual(v,publicView(b));
    const d=policyDecision(v,'firm');assert.deepEqual(d,policyDecision({...v,seed:999999},'firm'));a=advance(a,d);b=advance(b,d);
  }assert.deepEqual(result(a),result(b));
  // Different hidden days begin with exactly the same visible opportunity set.
  assert.deepEqual(policyDecision(publicView(createRun(14)),'firm'),policyDecision(publicView(createRun(15)),'firm'));
});
test('both simple policies can win: optionality is a tradeoff, not a scripted conclusion',()=>{
  let firmWins=0,openWins=0;for(let seed=1;seed<=30;seed++){const scores={};for(const policy of ['firm','open']){let s=createRun(seed);while(s.slot<6)s=advance(s,policyDecision(publicView(s),policy));scores[policy]=result(s).value;}if(scores.firm>scores.open)firmWins++;if(scores.open>scores.firm)openWins++;}
  assert.ok(firmWins>0,`firm wins ${firmWins}`);assert.ok(openWins>0,`open wins ${openWins}`);
});
