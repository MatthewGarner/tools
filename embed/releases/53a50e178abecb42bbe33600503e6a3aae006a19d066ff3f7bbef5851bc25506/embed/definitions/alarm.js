// Match the full app’s range-input step grid; off-step hashes are rounded by browsers.
import {population,classify,derived,verdicts} from '../../alarm/engine.js';
import {renderArtefact} from '../../alarm/render.js';
import {base,object,num,range} from './classic-shared.js';
export const definition=base('alarm','Alarm','See how base rates change the meaning of an alarm.',
 {b:-1.7,d:2,t:1.2},object({b:num(-3,-.31,.01),d:num(0,4,.05),t:num(-3,6,.05)}),
 {base:{label:'Real issues in the population',type:'select',path:['b'],options:[[-3,'0.1%'],[-2,'1%'],[-1.7,'About 2%'],[-1,'10%'],[-.31,'About 49%']].map(([value,label])=>({value,label}))},separation:range('Separation between real and benign cases',['d'],0,4,.1),threshold:range('Alarm threshold',['t'],-3,6,.1)},
 {alarms:{title:'Alarm outcomes',description:'Seeded natural frequencies and the detection threshold.',controls:['base','separation','threshold'],render(s,ctx){
  const params={baseRate:10**s.b,dprime:s.d,t:s.t}, {counts}=classify(population(),params),reading=verdicts(counts,params);
  return {svg:renderArtefact(params,counts,reading,derived(params),ctx.colors),summary:reading.alarm+' '+reading.miss+' Illustrative seeded population of 1,000 cases, not measured detector performance.'};
 }}});

definition.views['alarms'].defaultControls=['base', 'threshold'];
