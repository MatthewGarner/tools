import {parse} from '../../case/parse.js';
import {renderReview} from '../../case/render.js';
import {sourceDefinition,context,sourceSummary,boundedModel,choice,select} from './classic-shared.js';
const source='title: Search decision\nquestion: Build or buy search?\nheadline: Buy within a reversible pilot.\nstatus: decided\nverdict: Buy only after security and portability checks.\ndecision: Authorise vendor evaluation\nunresolved: Purchase depends on security and portability checks\nowner: Platform lead\ndate: 2026-10-03\nview: brief\noption buy: Buy managed search\n  value: Faster path to a usable search\n  requires: Vendor security approval\n  downside: External dependency\noption build: Build search\n  value: More control over ranking\n  requires: Dedicated engineering capacity\n  downside: Longer delivery time\nclaim constraint: The launch date is fixed\n  basis: judgement\n  detail: Preserve a usable fallback if the vendor gate fails.\n  qualification: This example is an authored decision, not measured evidence.';
export const definition=sourceDefinition({id:'case',title:'Case',description:'An editable, authored example using the native model and renderer.',source,
  validate(s){const m=boundedModel(parse(s.t));},
  views:{model:{title:'Model',description:'The complete authored model in its native reading view.',controls:['source'],render(s,ctx){const m=parse(s.t),c=context(ctx);return {svg:renderReview(m,c),summary:sourceSummary('Case',m,(m.title||'Decision brief')+': alternatives, constraints and the stated basis for claims.')} ;}}}
});
