import {MODEL,createRun,publicView,preview,feasibleRange,requiredEnergy,commitments,storedAfter,advance,policyDecision,result,hour} from './engine.js?v=0.21.0';

const EPS=1e-7;
const number=n=>Number(n.toFixed(2));
export const informationName=notice=>notice?'Next price known':'Current price only';
export const preparationRule='With one-hour notice, both policies charge as much as feasible when the next price is at least £85/MWh and its round-trip spread covers conversion losses and both throughput costs. Otherwise they use the same current-price thresholds. This short-sighted rule is not an optimiser.';
export function promiseLabel(view,c){
  const accepted=view.history.find(h=>h.acceptedIds.includes(c.id));
  return `${c.kind==='delivery'?'Delivery':'Reserve'} ${number(c.mw)} MW at ${hour(c.slot)} · ${accepted?`accepted ${hour(accepted.slot)}`:'selected now'}`;
}
function reasons(view,contracts,probe,range){
  const out=[];
  for(let t=view.slot;t<MODEL.slots;t++){
    const c=commitments(contracts,t);
    if(c.deliveryMW+c.reserveMW>MODEL.powerMW+EPS)out.push(`At ${hour(t)}, delivery plus reserve needs ${number(c.deliveryMW+c.reserveMW)} MW, above the 4 MW power limit.`);
  }
  if(out.length)return out;
  const floor=requiredEnergy(contracts)[view.slot];
  if(!Number.isFinite(floor))out.push('The remaining promises require more stored energy than the battery can hold, even with future charging.');
  else if(view.energyMWh+EPS<floor)out.push(`These promises need at least ${number(floor)} MWh now. Only ${number(view.energyMWh)} MWh remains; the intervening charging hours cannot make up the gap.`);
  if(probe.kind==='dispatch'){
    const d=probe.dispatchMW,E=storedAfter(view.energyMWh,d);
    if(Math.abs(d)>MODEL.powerMW+EPS)out.push('This output exceeds the battery’s 4 MW power limit.');
    if(E<-EPS)out.push(`This export needs ${number(d/MODEL.dischargeEfficiency)} MWh from storage; only ${number(view.energyMWh)} MWh remains.`);
    if(E>MODEL.capacityMWh+EPS)out.push(`This charge would leave ${number(E)} MWh, above the 8 MWh storage limit.`);
    if(range.deliveryMW&&d<range.deliveryMW-EPS)out.push(`The delivery due now forces at least ${number(range.deliveryMW)} MW of export; charging cannot happen in the same hour.`);
    if(range.reserveMW&&Math.abs(d)>MODEL.powerMW-range.reserveMW+EPS)out.push(`Reserve due now holds ${number(range.reserveMW)} MW, leaving at most ${number(MODEL.powerMW-range.reserveMW)} MW for import or export.`);
    if(E+EPS<range.minEnd&&E>=-EPS&&Number.isFinite(range.minEnd))out.push(`This action leaves ${number(E)} MWh. At least ${number(range.minEnd)} MWh must remain for reserve now or future promises, allowing for all remaining charging opportunities.`);
  }
  return out;
}

// Diagnose only visible promises at the actual stock and time. Removing a promise
// here does not rewind its past energy/cash consequences or permit cancellation.
export function diagnose(view,selected=[],probe={kind:'dispatch',dispatchMW:4,liftedIds:[]}){
  if(view.done)throw Error('Inspect an unsettled hour.');
  if(!['dispatch','offer'].includes(probe.kind))throw Error('Unknown option to inspect.');
  if(probe.kind==='dispatch'&&!Number.isFinite(probe.dispatchMW))throw Error('Output must be a finite number.');
  const candidate=probe.kind==='offer'?view.currentOffers.find(o=>o.id===probe.offerId):null;
  if(probe.kind==='offer'&&!candidate)throw Error('That offer is not visible now.');
  const ids=candidate&&!selected.includes(candidate.id)?[...selected,candidate.id]:selected;
  const all=preview(view,ids).contracts;
  const removable=all.filter(c=>c.slot>=view.slot&&c.id!==candidate?.id);
  const lifted=probe.liftedIds||[];
  if(!Array.isArray(lifted)||new Set(lifted).size!==lifted.length||lifted.some(id=>!removable.some(c=>c.id===id)))throw Error('Only other active promises can be lifted.');
  const kept=all.filter(c=>!lifted.includes(c.id));
  const fits=contracts=>{const r=feasibleRange(view,contracts);return r.feasible&&(probe.kind==='offer'||probe.dispatchMW>=r.min-EPS&&probe.dispatchMW<=r.max+EPS);};
  const allowed=fits(kept),physical=fits(candidate?[candidate]:[]);
  const remaining=removable.filter(c=>!lifted.includes(c.id));
  // At most seven offers: enumerate all smallest sets, including joint causes.
  let size=Infinity,releaseSets=[];
  if(!allowed&&physical)for(let mask=1;mask<2**remaining.length;mask++){
    const release=remaining.filter((_,i)=>mask&(1<<i)).map(c=>c.id);
    if(release.length>size)continue;
    if(fits(kept.filter(c=>!release.includes(c.id)))){
      if(release.length<size){size=release.length;releaseSets=[];}
      releaseSets.push(release);
    }
  }
  const actualRange=feasibleRange(view,all),range=feasibleRange(view,kept);
  return {candidate,removable,allowed,physical,actualRange,range,releaseSets,reasons:reasons(view,kept,probe,range),liftedIds:[...lifted]};
}

export function runPolicy(seed,policy,priceNotice=0){
  let state=createRun(seed,{priceNotice});
  while(state.slot<MODEL.slots)state=advance(state,policyDecision(publicView(state),policy));
  return state;
}
export function matchedComparison(seed){
  return [0,1].flatMap(priceNotice=>['firm','open'].map(policy=>{
    const state=runPolicy(seed,policy,priceNotice);
    return {policy,priceNotice,state,result:result(state)};
  }));
}
