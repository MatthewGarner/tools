import {parse} from '../../map/parse.js';
import {resolve} from '../../map/zones.js';
import {readout} from '../../map/readout.js';
import {render} from '../../map/render.js';
import {sourceDefinition,context,sourceSummary,boundedModel,choice,select} from './classic-shared.js';
const source='preset: assumptions\ntitle: Reading assumptions\nPeople want reminders @ 25,85 :: test: interview five\nWe can sync reliably @ 70,70\nNotification trust @ 35,90';
export const definition=sourceDefinition({id:'map',title:'Map',description:'An editable, authored example using the native model and renderer.',source,
  validate(s){const m=boundedModel(parse(s.t));if(m.items.length>30)throw new Error('Article maps support at most 30 items.');},
  views:{model:{title:'Model',description:'The complete authored model in its native reading view.',controls:['source'],render(s,ctx){const m=parse(s.t),c=context(ctx);const r=resolve(m);return {svg:render(m,r,readout(m,r),c),summary:sourceSummary('Map',m,m.items.length+' items on the authored axes and zones; positions are authored judgements.')} ;}}}
});
