import {parse} from '../../proxy/parse.js';
import {project} from '../../proxy/project.js';
import {renderHunt,renderHuntNarrow} from '../../proxy/render-hunt.js';
import {MONITOR_HUNT} from '../../proxy/example.js';
import {sourceDefinition,context,sourceSummary,boundedModel,choice,select} from './classic-shared.js';
const source=MONITOR_HUNT;
export const definition=sourceDefinition({id:'proxy',title:'Proxy',description:'An editable, authored example using the native model and renderer.',source,
  validate(s){const m=boundedModel(parse(s.t));},
  views:{model:{title:'Model',description:'The complete authored model in its native reading view.',controls:['source'],render(s,ctx){const m=parse(s.t),c=context(ctx);const p=project(m);return {svg:(c.width<520?renderHuntNarrow:renderHunt)(p,c),summary:sourceSummary('Proxy',m,(m.title||'Proxy hunt')+': the proxy, intended outcome and authored failure theories with guardrails. Mechanisms are hypotheses, not causal evidence.')} ;}}}
});
