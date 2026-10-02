export const COUNT=24,HORIZON=40;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function create(){return{common:Array(COUNT).fill(true),reaction:.35,noise:4,seed:1,sensitivity:1.7,diversity:5,impact:35,initial:50,scenario:'steady'};}
export function validate(s){
  if(!Array.isArray(s.common)||s.common.length!==COUNT||s.common.some(v=>typeof v!=='boolean'))throw Error('Choose a signal for every participant.');
  for(const[key,a,b]of[['reaction',.05,1],['noise',0,20],['seed',1,9999],['sensitivity',.1,3],['diversity',0,30],['impact',0,50],['initial',0,100]])if(!Number.isFinite(s[key])||s[key]<a||s[key]>b)throw Error(`Invalid ${key}.`);
  if(!Number.isInteger(s.seed))throw Error('Choose a whole-number noise sample.');
  if(!['steady','wave','shift'].includes(s.scenario))throw Error('Unknown underlying pattern.');
  return s;
}
export const basePrice=(scenario,t)=>scenario==='wave'?50+12*Math.sin(t/5):scenario==='shift'?(t<14?45:t<27?65:50):50+2*Math.sin(t/4);
export const threshold=(s,i)=>50+s.diversity*((i/(COUNT-1))*2-1);
// Index noise by time and source, never by assignment or evaluation order. A
// matched replay therefore changes sharing without resampling the environment.
export function noiseAt(seed,tick,channel){let x=(seed^Math.imul(tick+1,374761393)^Math.imul(channel+2,668265263))>>>0;x=Math.imul(x^(x>>>13),1274126177);return((x^(x>>>16))>>>0)/4294967296*2-1;}
export function simulate(s){
  validate(s);let shared=s.initial,privateSignals=Array(COUNT).fill(s.initial);const history=[];
  for(let tick=0;tick<HORIZON;tick++){
    const signals=s.common.map((c,i)=>c?shared:privateSignals[i]);
    const actions=signals.map((signal,i)=>clamp(s.sensitivity*(threshold(s,i)-signal)/20,-1,1));
    const mean=actions.reduce((a,b)=>a+b,0)/COUNT,base=basePrice(s.scenario,tick),price=base+s.impact*mean;
    const meanSignal=signals.reduce((a,b)=>a+b,0)/COUNT;
    history.push({tick,shared,signals,actions,mean,meanSignal,base,price,error:signals.reduce((sum,v)=>sum+Math.abs(price-v),0)/COUNT});
    // All estimates see the realised outcome only after acting, at the same
    // update rate and noise amplitude. Only the noise's sharing differs.
    shared+=s.reaction*(price+s.noise*noiseAt(s.seed,tick,-1)-shared);
    privateSignals=privateSignals.map((signal,i)=>signal+s.reaction*(price+s.noise*noiseAt(s.seed,tick,i)-signal));
  }
  const oscillation=history.slice(1).reduce((sum,r,i)=>sum+Math.abs(r.price-history[i].price),0)/(HORIZON-1);
  const error=history.reduce((sum,r)=>sum+r.error,0)/HORIZON;
  return{history,oscillation,error,range:Math.max(...history.map(r=>r.price))-Math.min(...history.map(r=>r.price))};
}
export function compareSharing(s){return{shared:simulate({...s,common:Array(COUNT).fill(true)}),separate:simulate({...s,common:Array(COUNT).fill(false)})};}
export function upgradeSettings(s){return validate({...s,noise:s.noise??0,seed:s.seed??1});}
