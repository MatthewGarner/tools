import {parse,complete} from '../../energy/cycles/parse.js';
import {simulate} from '../../energy/cycles/engine.js';
import {render} from '../../energy/cycles/render.js';
import {sourceDefinition,context,sourceSummary,boundedModel,choice,select} from './classic-shared.js';
const source='title: Cycle budget\nbattery: 100MW / 200MWh\nspread: 35..85\ncharge: 15..45\nsecond: 35..60%\ndrift: -4..0 %/yr\nrte: 86..90%\nfade: 0.006..0.012 %/cycle\ncalendar: 1.0..1.8 %/yr\ncycles: 6000 over 15yr\naugment: 120..180 £/kWh\ndiscount: 7..10%';
export const definition=sourceDefinition({id:'energy-cycles',title:'Cycle budget',description:'An editable, authored example using the native model and renderer.',source,
  validate(s){const m=boundedModel(parse(s.t));if(!complete(m))throw new Error('Complete battery, spread, efficiency, fade, calendar and cycle assumptions.');if(m.cycles.years>30||m.cycles.years<1)throw new Error('Use a horizon of 1–30 years.');},
  views:{model:{title:'Model',description:'The complete authored model in its native reading view.',controls:['source'],render(s,ctx,projection){const {m,out}=projection||definition.project(s),c=context(ctx);return {svg:render(m,out,c,{edit:false}),summary:sourceSummary('Cycle budget',m,'Battery dispatch threshold and lifetime value under the supplied spread, fade and warranty assumptions; fixed-seed simulation.')} ;}}}
});

// The native 10,000-draw projection costs about a second; the host runs it off-thread.
definition.worker=true;
definition.project=s=>{const m=parse(s.t);return {m,out:simulate(m)};};
