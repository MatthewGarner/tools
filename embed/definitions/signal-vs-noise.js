import {makeScenario} from '../../signal-vs-noise/engine.js';
import {renderCollapse} from '../../signal-vs-noise/render.js';
import {base,object,int,num,array,choice,range,context} from './classic-shared.js';
export const definition=base('signal-vs-noise','Signal vs noise','Compare variation with the known signal in a synthetic process.',
 {seed:42,params:{noiseSd:3},calls:[],resume:{turn:7,phase:'done'}},object({seed:int(0,4294967295),params:object({noiseSd:num(1,8)}),calls:array(object({person:int(0,5),quarter:int(0,7)}),0,48),resume:object({turn:choice([7]),phase:choice(['done'])})}),
 {noise:range('Routine variation (standard deviation)',['params','noiseSd'],1,8,.5)},
 {reveal:{title:'Signal revealed',description:'Known signal and routine variation after eight synthetic quarters.',controls:['noise'],render(s,ctx){const m=makeScenario(s.seed,s.params),c=context(ctx);return {svg:renderCollapse(m,c.colors,s.calls,{width:c.width}),summary:'Synthetic outputs for six people over eight quarters. '+m.names[m.signalPerson]+' has a sustained signal from quarter '+(m.signalQuarter+1)+'. The routine-variation band comes from the known generating parameters, not an estimate from these points.'};}}});

definition.views['reveal'].defaultControls=['noise'];
