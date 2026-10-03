export const DAYS=28;
export const LANES=[{id:'discovery',name:'Discovery',verb:'observe'},{id:'review',name:'Decision review',verb:'choose'},{id:'funding',name:'Funding',verb:'authorise'},{id:'delivery',name:'Delivery',verb:'act'}];
export const SCENARIOS={
  changing:{name:'Needs change twice',detail:'Need A on day 1, B on day 8, then A again on day 18.',events:[{day:1,need:'A'},{day:8,need:'B'},{day:18,need:'A'}]},
  stable:{name:'The need stays steady',detail:'Need A throughout. Extra reviews can use attention without changing the action.',events:[{day:1,need:'A'}]},
  late:{name:'A change just after review',detail:'Need A on day 1, then B on day 16. A meeting before discovery cannot use the new evidence.',events:[{day:1,need:'A'},{day:16,need:'B'}]},
};
export const INITIAL={version:1,scenario:'changing',clocks:{discovery:{start:2,every:7},review:{start:1,every:7},funding:{start:4,every:14},delivery:{start:5,every:7}},reviewCost:1,attention:8};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k)),integer=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;
export function validate(s){
  if(!exact(s,['version','scenario','clocks','reviewCost','attention'])||s.version!==1||!Object.hasOwn(SCENARIOS,s.scenario))throw Error('Expected a version 1 clocks experiment and a known scenario.');
  if(!exact(s.clocks,LANES.map(l=>l.id))||LANES.some(l=>!exact(s.clocks[l.id],['start','every'])||!integer(s.clocks[l.id].start,1,DAYS)||!integer(s.clocks[l.id].every,1,DAYS)))throw Error('Each clock needs a first day and interval from 1 to 28.');
  if(!Number.isFinite(s.reviewCost)||s.reviewCost<0||s.reviewCost>3||!Number.isInteger(s.reviewCost*4)||!Number.isFinite(s.attention)||s.attention<0||s.attention>30||!Number.isInteger(s.attention*4))throw Error('Attention and review cost must be quarter units within their bounds.');
  return s;
}
export function scheduled(clock){return Array.from({length:DAYS},(_,i)=>i+1).filter(day=>day>=clock.start&&(day-clock.start)%clock.every===0);}
export function needAt(s,day){return SCENARIOS[s.scenario].events.filter(e=>e.day<=day).at(-1).need;}
export function simulate(s){
  validate(s);let evidence=null,decision=null,funded=null,attentionUsed=0;const trace=[],deliveries=[],reviews=[];
  // Same-day order is a model assumption: discovery → review → funding → delivery.
  // Every downstream stage copies its input, so later evidence cannot rewrite it.
  for(let day=1;day<=DAYS;day++)for(const lane of LANES){if(!scheduled(s.clocks[lane.id]).includes(day))continue;let status='done',detail;
    if(lane.id==='discovery'){evidence={need:needAt(s,day),observed:day};detail=`Observed need ${evidence.need}. Available from day ${day}.`;}
    if(lane.id==='review'){
      if(attentionUsed+s.reviewCost>s.attention){status='skipped';detail=`Review skipped: ${s.reviewCost} attention needed, ${s.attention-attentionUsed} left.`;}
      else{attentionUsed+=s.reviewCost;if(evidence){decision={...evidence,reviewed:day};detail=`Chose ${decision.need} from day ${decision.observed} evidence (${day-decision.observed} days waiting).`;}else{status='waiting';detail='No observation available. Attention spent; no choice made.';}}
      reviews.push({day,status,decision:decision?{...decision}:null});
    }
    if(lane.id==='funding'){if(decision){funded={...decision,funded:day};detail=`Authorised ${funded.need}, chosen on day ${funded.reviewed} from day ${funded.observed} evidence.`;}else{status='waiting';detail='No reviewed choice available to authorise.';}}
    if(lane.id==='delivery'){if(funded){const actual=needAt(s,day),delivery={...funded,day,actual,matches:funded.need===actual,age:day-funded.observed,reviewWait:funded.reviewed-funded.observed,fundingWait:funded.funded-funded.reviewed,deliveryWait:day-funded.funded};deliveries.push(delivery);status=delivery.matches?'matched':'outdated';detail=`Acted on ${funded.need}; actual need ${actual}. Evidence ${delivery.age} days old (observed ${funded.observed}, reviewed ${funded.reviewed}, funded ${funded.funded}).`;}else{status='waiting';detail='No funded choice available. Delivery slot passes unused.';}}
    trace.push({day,lane:lane.id,name:lane.name,status,detail});
  }
  const average=(field)=>deliveries.length?deliveries.reduce((n,d)=>n+d[field],0)/deliveries.length:0;
  return{trace,deliveries,reviews,attentionUsed,attentionRemaining:s.attention-attentionUsed,matches:deliveries.filter(d=>d.matches).length,outdated:deliveries.filter(d=>!d.matches).length,unused:trace.filter(t=>t.lane==='delivery'&&t.status==='waiting').length,skipped:reviews.filter(r=>r.status==='skipped').length,averageAge:average('age'),averageReviewWait:average('reviewWait'),averageFundingWait:average('fundingWait'),averageDeliveryWait:average('deliveryWait')};
}
// Replay only timing as the alternative; the event stream and attention rules are
// held at current values. Comparisons never sneak in a different change history.
export function compare(s,pinned){return pinned?simulate({...s,clocks:structuredClone(pinned.clocks)}):null;}
export const format=n=>Number(n.toFixed(1)).toString();
export function describe(s,pinned){const r=simulate(s),b=compare(s,pinned);return `# The organisation’s clocks\n\n${SCENARIOS[s.scenario].name}: ${SCENARIOS[s.scenario].detail}\n\n${LANES.map(l=>`${l.name}: first day ${s.clocks[l.id].start}, every ${s.clocks[l.id].every} days`).join('\n')}\n\n${r.matches} actions match need at action time; ${r.outdated} use an outdated need; ${r.unused} delivery slots unused. Mean evidence age at action: ${format(r.averageAge)} days. Attention used: ${r.attentionUsed} of ${s.attention}; each review costs ${s.reviewCost}. ${r.skipped} reviews skipped.${b?`\n\nPinned timing, same external events and attention rules: ${b.matches} matching actions; ${b.outdated} outdated; ${b.unused} unused slots; ${b.attentionUsed} attention used.`:''}\n\n${r.trace.map(t=>`Day ${t.day} · ${t.name}: ${t.detail}`).join('\n')}\n\nSame-day order: discovery → review → funding → delivery. No initial evidence, choice or funding. Discovery sees the current need perfectly; review selects the latest observation, funding copies the latest reviewed choice, delivery acts on the latest funded choice. Reviews consume attention even without new evidence; exhausted attention skips reviews. Nothing expires. Repeated actions count as action slots, not value delivered. These explicit timing assumptions do not predict organisational performance.\n\nInspired by John Cutler, Questions and Context: https://cutlefish.substack.com/p/tbm-2052-questions-and-context`;}
