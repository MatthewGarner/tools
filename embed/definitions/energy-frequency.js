import {paramsFromControls} from '../../energy/frequency/state.js';
import {simulate,verdict} from '../../energy/frequency/engine.js';
import {renderTrace} from '../../energy/frequency/render.js';
import {base,object,num,range,context} from './classic-shared.js';
export const definition=base('energy-frequency','Frequency & inertia','Explore a loss of generation and the response that arrests it.',
 {i:80,tr:1.8,dr:.5,dm:.5,dc:1.5,g:20},object({i:num(40,300,5),tr:num(.2,1.8,.1),dr:num(0,1.5,.1),dm:num(0,1.5,.1),dc:num(0,4.5,.1),g:num(0,40,2)}),
 {inertia:range('Synchronous inertia, GVA·s',['i'],40,300,5),trip:range('Generation lost, GW',['tr'],.2,1.8,.1),regulation:range('Dynamic regulation, GW',['dr'],0,1.5,.1),moderation:range('Dynamic moderation, GW',['dm'],0,1.5,.1),containment:range('Dynamic containment, GW',['dc'],0,4.5,.1),'grid-forming':range('Grid-forming inertia, GVA·s',['g'],0,40,2)},
 {trace:{title:'Frequency trace',description:'The deterministic frequency response after a generation trip.',controls:['inertia','trip','regulation','moderation','containment','grid-forming'],render(s,ctx){const p=paramsFromControls({inertia:s.i,trip:s.tr,dr:s.dr,dm:s.dm,dc:s.dc,gfm:s.g}),r=simulate(p);return {svg:renderTrace(r,p,context(ctx)),summary:verdict(r,p)+' Illustrative aggregate grid model, not an operational forecast.'};}}});

definition.views['trace'].defaultControls=['inertia', 'containment'];
