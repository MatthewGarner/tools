import {parse} from '../../why/parse.js';
import {project} from '../../why/project.js';
import {renderCausalField} from '../../why/render-causal-field.js';
import {renderDeliveryLens} from '../../why/render-delivery-lens.js';
import {sourceDefinition,context,sourceSummary,boundedModel,choice,select} from './classic-shared.js';
const source='title: Reading retention\noutcome: Improve retention\n  Losing your place\n    Resume where you left off [delivering]\n      ? resuming helps [holds]\n    Reading reminders [testing]\n      ? readers want interruptions';
export const definition=sourceDefinition({id:'why',title:'Why',description:'An editable, authored example using the native model and renderer.',source,extraState:{v:'ost'},extraSchema:{v:choice(['ost','map'])},controls:{view:{label:'View',type:'select',path:['v'],options:[{value:'ost',label:'Causal field'},{value:'map',label:'Delivery lens'}]}},
  validate(s){const m=boundedModel(parse(s.t));},
  views:{model:{title:'Model',description:'The complete authored model in its native reading view.',controls:['source','view'],render(s,ctx){const m=parse(s.t),c=context(ctx);return {svg:(s.v==='ost'?renderCausalField:renderDeliveryLens)(m,project(m),c),summary:sourceSummary('Why',m,(m.title||'Causal model')+': outcomes, opportunities, solutions and their explicit assumptions.')} ;}}}
});
