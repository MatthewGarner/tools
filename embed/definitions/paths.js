import {parse} from '../../paths/parse.js';
import {project} from '../../paths/project.js';
import {overviewProjection} from '../../paths/overview.js';
import {renderOverview,renderOverviewNarrow} from '../../paths/render-overview.js';
import {sourceDefinition,context,sourceSummary,boundedModel,choice,select} from './classic-shared.js';
const source='title: Reading plan\ntoday: 2026-10-03\ndecision reminders:\n  question: Do reminders improve retention?\n  signal: Week-four retention\n  reading: Pilot pending\n  learn: Compare a reminder cohort with a control\n  enough: At least five points improvement\n  owner: Core\n  answer-by: 2026-11-01\nNOW\n  Core: Resume position [doing]\nNEXT\n  Core: Adaptive reminders [if reminders]\n  Core: Weekly digest [unless reminders]';
export const definition=sourceDefinition({id:'paths',title:'Paths',description:'An editable, authored example using the native model and renderer.',source,
  validate(s){const m=boundedModel(parse(s.t));if(m.decisions.length>6)throw new Error('Article plans support at most six decisions.');},
  views:{model:{title:'Model',description:'The complete authored model in its native reading view.',controls:['source'],render(s,ctx){const m=parse(s.t),c=context(ctx);const p=overviewProjection(project(m,c.today));return {svg:(c.width<520?renderOverviewNarrow:renderOverview)(p,c),summary:sourceSummary('Paths',m,(m.title||'Conditional plan')+': work and its decision conditions. Enumerated alternatives are possible worlds, not calibrated probabilities.')} ;}}}
});
