// A fictional operating day. All grid flows are MW for a one-hour slot.
// Stored energy is MWh. Policies only receive the declared public information.
export const MODEL = Object.freeze({powerMW:4, capacityMWh:8, initialMWh:4, chargeEfficiency:.9, dischargeEfficiency:.9, slotHours:1, slots:6, startHour:12, wearPerMWh:2, terminalPerStoredMWh:45});
export const POLICIES = Object.freeze({firm:{name:'Take firm revenue', description:'Accept every feasible offer. Charge at £45/MWh or below; export at £85/MWh or above; otherwise hold.'}, open:{name:'Wait for spot', description:'Decline every offer. Use exactly the same charge / export price rules.'}});
const EPS=1e-7;
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
export function hour(slot){return `${MODEL.startHour+slot}:00`;}
function randomFor(seed){let a=seed>>>0; return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
export function schedule(seed){
  const r=randomFor(seed);const templates=[[32,62,22,68,72,56],[32,54,18,172,112,84],[32,76,36,92,46,188]];
  const prices=templates[Math.abs(seed)%3].map((p,i)=>i?Math.max(5,p+Math.round(r()*20-10)):p);
  const offer=(id,reveal,slot,kind,mw,rate)=>({id,reveal,slot,kind,mw,rate,fee:mw*rate, title:kind==='delivery'?'Energy delivery':'Upward reserve'});
  return {prices,offers:[offer('a',0,3,'delivery',2,95),offer('b',0,2,'reserve',1.5,38),offer('c',1,4,'delivery',2.5,100),offer('d',1,4,'reserve',1,45),offer('e',2,3,'reserve',2,55),offer('f',3,5,'delivery',2,80),offer('g',4,5,'reserve',2,40)]};
}
export function conditions(input={priceNotice:0}){if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>k!=='priceNotice')||![0,1].includes(input.priceNotice))throw Error('Price notice must be zero or one hour.');return {priceNotice:input.priceNotice};}
export function createRun(seed=14,information){if(!Number.isInteger(seed)||seed<1||seed>999999)throw Error('Day number must be between 1 and 999999.');return {version:1,seed,conditions:conditions(information),slot:0,energyMWh:MODEL.initialMWh,cash:0,contracts:[],history:[]};}
export function commitments(contracts,slot){return contracts.filter(c=>c.slot===slot).reduce((a,c)=>{a[c.kind==='delivery'?'deliveryMW':'reserveMW']+=c.mw;return a;},{deliveryMW:0,reserveMW:0});}
// Minimum starting stock for each future slot. Reserve is available at the
// start and held through the whole hour; scheduled delivery cannot be charged.
export function requiredEnergy(contracts){
  const floor=Array(MODEL.slots+1).fill(0);const {powerMW:P,dischargeEfficiency:ed,chargeEfficiency:ec,capacityMWh:C}=MODEL;
  for(let t=MODEL.slots-1;t>=0;t--){const {deliveryMW:D,reserveMW:R}=commitments(contracts,t);if(D+R>P+EPS){floor[t]=Infinity;continue;}const end=Math.max(R/ed,floor[t+1]);floor[t]=Math.max(R/ed,D>0?D/ed+end:end-(P-R)*ec,0);if(floor[t]>C+EPS||end>C+EPS)floor[t]=Infinity;}
  return floor;
}
export function feasibleRange(snapshot,contracts=snapshot.contracts){
  if(snapshot.slot>=MODEL.slots)return {min:0,max:0,minEnd:0,deliveryMW:0,reserveMW:0,feasible:true};
  const {powerMW:P,capacityMWh:C,chargeEfficiency:ec,dischargeEfficiency:ed}=MODEL;
  const {deliveryMW:D,reserveMW:R}=commitments(contracts,snapshot.slot);const floor=requiredEnergy(contracts);const E=snapshot.energyMWh;const minEnd=Math.max(R/ed,floor[snapshot.slot+1]);
  const min=Math.max(D>0?D:-(P-R),-(C-E)/ec);
  const max=Math.min(P-R,E>=minEnd?(E-minEnd)*ed:-(minEnd-E)/ec);
  return {min,max,minEnd,deliveryMW:D,reserveMW:R,feasible:E+EPS>=floor[snapshot.slot]&&min<=max+EPS};
}
export function publicView(state){
  const day=schedule(state.seed);const done=state.slot>=MODEL.slots;
  const information=conditions(state.conditions);
  return {seed:state.seed,slot:state.slot,done,conditions:information,announcedPrices:!done&&information.priceNotice&&state.slot+1<MODEL.slots?[{slot:state.slot+1,price:day.prices[state.slot+1]}]:[],energyMWh:state.energyMWh,cash:state.cash,contracts:structuredClone(state.contracts),history:structuredClone(state.history),currentPrice:done?null:day.prices[state.slot],currentOffers:done?[]:structuredClone(day.offers.filter(o=>o.reveal===state.slot)),observedPrices:done?[...day.prices]:day.prices.slice(0,state.slot+1),model:MODEL};
}
export function preview(view,acceptedIds=[]){
  if(new Set(acceptedIds).size!==acceptedIds.length)throw Error('An offer can only be accepted once.');
  const selected=acceptedIds.map(id=>{const offer=view.currentOffers.find(o=>o.id===id);if(!offer)throw Error('That offer is not available this hour.');return offer;});
  const contracts=[...view.contracts,...selected];const range=feasibleRange(view,contracts);
  return {contracts,range,accepted:selected,feasible:range.feasible};
}
export function storedAfter(energy,dispatchMW){return energy+(dispatchMW<0?-dispatchMW*MODEL.chargeEfficiency:-dispatchMW/MODEL.dischargeEfficiency)*MODEL.slotHours;}
export function projection(view,selected,dispatchMW){
  const p=preview(view,selected);if(!p.feasible)throw Error('Those promises cannot all be honoured.');
  const {min,max,deliveryMW:D,reserveMW:R}=p.range;if(!Number.isFinite(dispatchMW)||dispatchMW<min-EPS||dispatchMW>max+EPS)throw Error('Dispatch must stay inside the feasible range.');
  const energyMWh=clamp(storedAfter(view.energyMWh,dispatchMW),0,MODEL.capacityMWh);
  const deliveryRevenue=p.contracts.filter(c=>c.slot===view.slot&&c.kind==='delivery').reduce((s,c)=>s+c.fee,0);
  const reserveRevenue=p.contracts.filter(c=>c.slot===view.slot&&c.kind==='reserve').reduce((s,c)=>s+c.fee,0);
  const spotMWh=(dispatchMW-D)*MODEL.slotHours;
  const spotRevenue=spotMWh*view.currentPrice;const wearCost=Math.abs(dispatchMW)*MODEL.slotHours*MODEL.wearPerMWh;
  return {energyMWh,deliveryRevenue,reserveRevenue,spotRevenue,wearCost,cashDelta:deliveryRevenue+reserveRevenue+spotRevenue-wearCost,spotMWh,deliveryMW:D,reserveMW:R,contracts:p.contracts};
}
export function advance(state,{acceptedIds=[],dispatchMW=0}={}){
  if(state.slot>=MODEL.slots)throw Error('This day is complete.');const view=publicView(state);const p=projection(view,acceptedIds,dispatchMW);
  const record={slot:state.slot,price:view.currentPrice,energyBefore:state.energyMWh,energyAfter:p.energyMWh,dispatchMW,acceptedIds:[...acceptedIds],declinedIds:view.currentOffers.filter(o=>!acceptedIds.includes(o.id)).map(o=>o.id),deliveryMW:p.deliveryMW,reserveMW:p.reserveMW,deliveryRevenue:p.deliveryRevenue,reserveRevenue:p.reserveRevenue,spotRevenue:p.spotRevenue,wearCost:p.wearCost,cashDelta:p.cashDelta};
  return {...state,slot:state.slot+1,energyMWh:p.energyMWh,cash:state.cash+p.cashDelta,contracts:p.contracts,history:[...state.history,record]};
}
export function policyDecision(view,policy='firm'){
  if(!POLICIES[policy])throw Error('Unknown policy.');if(view.done)throw Error('This day is complete.');const acceptedIds=[];
  if(policy==='firm')for(const o of view.currentOffers)if(preview(view,[...acceptedIds,o.id]).feasible)acceptedIds.push(o.id);
  const {min,max}=preview(view,acceptedIds).range;
  const next=view.announcedPrices?.find(p=>p.slot===view.slot+1)?.price;
  const roundTrip=MODEL.chargeEfficiency*MODEL.dischargeEfficiency;
  // A deliberately simple preparation rule, shared by both commitment policies.
  // Perfect one-hour notice is an experimental condition, not a forecast.
  const prepare=next>=85&&next*roundTrip-view.currentPrice-MODEL.wearPerMWh*(1+roundTrip)>0;
  const dispatchMW=prepare||view.currentPrice<=45?min:view.currentPrice>=85?max:clamp(0,min,max);
  return {acceptedIds,dispatchMW};
}
export function envelope(view,contracts=view.contracts){
  const f=requiredEnergy(contracts);let lo=view.energyMWh,hi=lo;const points=[{slot:view.slot,min:lo,max:hi}];
  for(let t=view.slot;t<MODEL.slots;t++){const {deliveryMW:D,reserveMW:R}=commitments(contracts,t);const floor=Math.max(R/MODEL.dischargeEfficiency,f[t+1]);lo=Math.max(lo,f[t]);if(lo>hi+EPS)return [];
    const nextLo=Math.max(floor,lo-(MODEL.powerMW-R)/MODEL.dischargeEfficiency);const nextHi=Math.min(MODEL.capacityMWh,D>0?hi-D/MODEL.dischargeEfficiency:hi+(MODEL.powerMW-R)*MODEL.chargeEfficiency);lo=nextLo;hi=nextHi;points.push({slot:t+1,min:lo,max:hi});}
  return points;
}
export function result(state){
  const day=schedule(state.seed);const delivered=state.contracts.filter(c=>c.kind==='delivery'&&c.slot<state.slot);
  return {cash:state.cash,energyMWh:state.energyMWh,stockAdjustment:(state.energyMWh-MODEL.initialMWh)*MODEL.terminalPerStoredMWh,value:state.cash+(state.energyMWh-MODEL.initialMWh)*MODEL.terminalPerStoredMWh,contractPriceDifference:delivered.reduce((s,c)=>s+c.fee-c.mw*day.prices[c.slot],0),reserveRevenue:state.history.reduce((s,h)=>s+h.reserveRevenue,0),deliveryRevenue:state.history.reduce((s,h)=>s+h.deliveryRevenue,0),wearCost:state.history.reduce((s,h)=>s+h.wearCost,0),accepted:state.contracts.length};
}
export function serialize(state){return {seed:state.seed,conditions:conditions(state.conditions),decisions:state.history.map(h=>({acceptedIds:[...h.acceptedIds],dispatchMW:h.dispatchMW}))};}
export function restore(data){let state=createRun(data.seed,data.conditions);if(!Array.isArray(data.decisions)||data.decisions.length>MODEL.slots)throw Error('Invalid saved run.');for(const d of data.decisions)state=advance(state,d);return state;}
