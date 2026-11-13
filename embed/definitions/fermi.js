import {tokenize,parse,collectVars,parseNum,summariseEstimate,computeSensitivity} from '../../fermi/engine.js';
import {renderDriverTree} from '../../fermi/render-driver.js';
import {base,object,text,tuple,choice,context} from './classic-shared.js';
function model(s){
 let ast;try{const ts=tokenize(s.f);if(ts.length>35)throw new Error('Use at most 35 formula tokens.');ast=parse(ts);}catch(e){throw new Error(e.message||e.msg||'Invalid formula.');}
 const varNames=collectVars(ast,[]);if(!varNames.length||varNames.length>6)throw new Error('Use one to six variables.');
 if(Object.keys(s.v).length!==varNames.length||varNames.some(n=>!Object.hasOwn(s.v,n)))throw new Error('Every formula variable needs exactly one input range.');
 const ranges={},dists={};for(const n of varNames){const [a,b,d]=s.v[n],lo=parseNum(a),hi=parseNum(b);if(!Number.isFinite(lo)||!Number.isFinite(hi)||Math.abs(lo)>1e9||Math.abs(hi)>1e9||lo>hi)throw new Error('Use ordered finite ranges, within ±1 billion.');if(d==='logn'&&lo<=0)throw new Error('Lognormal ranges must be positive.');ranges[n]=[lo,hi];dists[n]=d;}
 return {ast,varNames,ranges,dists};
}
const input=tuple([text(24,1),text(24,1),choice(['auto','norm','logn','uni'])]);
const v1=base('fermi','Fermi','Explore the assumptions that drive a rough estimate.',
 {f:'people * hourly_cost * hours * weeks',v:{people:['6','10','auto'],hourly_cost:['35','65','auto'],hours:['1','2','auto'],weeks:['40','46','auto']},q:'What does a recurring meeting cost each year?',u:'£/year'},
 object({f:text(500,1),v:{type:'object',additionalProperties:input,minProperties:1,maxProperties:6},q:text(180),u:text(48)}),
 {formula:{label:'Formula',type:'text',path:['f'],maxLength:500,commit:true},'people-low':{label:'People, low estimate',type:'text',path:['v','people',0],maxLength:24,commit:true},'people-high':{label:'People, high estimate',type:'text',path:['v','people',1],maxLength:24,commit:true},'cost-high':{label:'Hourly cost, high estimate',type:'text',path:['v','hourly_cost',1],maxLength:24,commit:true}},
 {drivers:{title:'Drivers of uncertainty',description:'Native estimate driver tree and value of information.',controls:['people-low','people-high','cost-high'],render(s,ctx){const m=model(s),r=summariseEstimate(m,{seed:0x5EED,n:20000});if(r.sorted.length<10000)throw new Error('More than half the simulated runs produced invalid arithmetic.');const {p10,p50,p90}=r,sens=computeSensitivity(m,{seed:0x5EED,p10,p90,exact:r.exact});return {svg:renderDriverTree({...m,...sens,p10,p50,p90},context(ctx)),summary:(s.q||'Fermi estimate')+' Median '+p50.toPrecision(3)+' '+s.u+'; '+(r.exact?'':'simulated ')+'10th–90th range '+p10.toPrecision(3)+'–'+p90.toPrecision(3)+'. Illustrative input uncertainty under the authored formula, not empirical confidence.'};}}},s=>model(s));

v1.views['drivers'].defaultControls=['people-low', 'people-high'];
// Version 2: one number reader, ties marked together in the driver tree, spread and shares printed to what they can bear.
// Version 3: exact percentiles where the formula is a product of log-normal ranges, and driver shares as shares of variance. Earlier versions stay frozen as published.
export const definition={...v1,version:3};
