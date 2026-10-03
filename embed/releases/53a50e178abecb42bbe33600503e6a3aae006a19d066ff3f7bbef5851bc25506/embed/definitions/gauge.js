import {parse} from '../../gauge/parse.js';
import {sampleResponses} from '../../gauge/sample.js';
import {sessionStats} from '../../gauge/engine.js';
import {renderOverlay} from '../../gauge/render-overlay.js';
import {sourceDefinition,context,boundedModel,fullTool} from './classic-shared.js';
export const definition=sourceDefinition({id:'gauge',title:'Gauge',description:'Inspect the shape of disagreement with synthetic responses.',source:'title: Launch confidence\nnames: off\nWe can launch before December :: prob\nRemaining engineering effort :: range person-weeks',
 validate(s){const m=boundedModel(parse(s.t));if(!m.questions.length||m.questions.length>6)throw new Error('Use one to six questions.');},
 views:{sample:{title:'Synthetic sample',description:'Eight deterministic synthetic responses to the authored questions.',controls:['source'],render(s,ctx){const m=parse(s.t),c=context(ctx),responses=sampleResponses(m);return {svg:renderOverlay(m,sessionStats(m,responses),c,{sample:true,width:c.width}),summary:'Gauge: '+m.questions.length+' authored questions with eight synthetic responses. These illustrate disagreement; they are not participant data.'};}}}
});
definition.fullTool=fullTool('gauge',{label:'Open these questions in Gauge',description:'The full tool receives the questions. Synthetic sample responses remain an article illustration; no live room is opened.'});
